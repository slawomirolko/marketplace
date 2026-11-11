import urllib.request

import pytest

from factory_host import ReviewRun

REVIEW_PREFIX = ["olko-review/scope", "olko-review/detect", "olko-review/memory", "olko-review/lenses", "olko-review/merge"]


def visited(run: ReviewRun) -> list[str]:
    return [e["node"] for e in run.events if e["type"] == "node_started"]


def llm_nodes(run: ReviewRun) -> dict:
    return {path: node for path, node in run.report["byNode"].items() if node["tier"] is not None}


async def test_review_workflow_defined_in_yaml_runs_to_done(review_run: ReviewRun):
    assert review_run.report["status"] == "done", review_run.report
    assert review_run.report["workflow"].startswith("olko-review@")
    assert review_run.report["synthetic"] is False


async def test_run_follows_the_yaml_edges(review_run: ReviewRun):
    path = visited(review_run)
    assert path[: len(REVIEW_PREFIX)] == REVIEW_PREFIX
    assert "olko-review/rank" in path
    assert ("olko-review/verify" in path) == review_run.lens_findings_found


async def test_langgraph_maps_the_proposal_to_an_interrupt_before_the_run_starts(review_run: ReviewRun):
    assert review_run.interrupts[0]["kind"] == "confirm"
    assert set(review_run.interrupts[0]["proposal"]["roles"]) >= {"lens", "verifier"}


async def test_every_factory_question_becomes_an_interrupt_and_the_answer_reaches_the_run(review_run: ReviewRun):
    asked = [e["questionId"] for e in review_run.events if e["type"] == "needs_input"]
    interrupted = [i["question"]["id"] for i in review_run.interrupts if i["kind"] == "question"]
    assert interrupted == asked
    resumed = {e["questionId"]: e["answer"] for e in review_run.events if e["type"] == "run_resumed"}
    assert resumed == {question_id: "skip" for question_id in asked}


async def test_skip_answer_posts_no_pr_comment(review_run: ReviewRun):
    assert "olko-review/post" not in visited(review_run)
    assert review_run.comments_after == review_run.comments_before


async def test_lens_agents_are_chosen_from_the_pr_diff(review_run: ReviewRun):
    lenses = review_run.report["byNode"]["olko-review/lenses"]["byAgent"]
    assert "bugs" in lenses
    assert all(agent["agentName"].startswith("olko-review-") for agent in lenses.values())


async def test_every_llm_agent_has_measured_cost_from_real_tokens(review_run: ReviewRun):
    nodes = llm_nodes(review_run)
    assert nodes
    for path, node in nodes.items():
        assert node["unknownSteps"] == 0, path
        assert node["tokens"] > 0, path
        for agent_id, agent in node["byAgent"].items():
            assert agent["costSource"] == "measured", f"{path}/{agent_id}"
            assert agent["costUsd"] > 0, f"{path}/{agent_id}"
            assert agent["model"], f"{path}/{agent_id}"


async def test_run_cost_covers_every_llm_step(review_run: ReviewRun):
    assert review_run.report["coverage"]["run"]["unknownSteps"] == 0
    assert review_run.report["cost"]["costUsd"] == pytest.approx(sum(n["costUsd"] for n in review_run.report["byNode"].values()), abs=1e-6)


async def test_viewer_url_serves_the_run_page(review_run: ReviewRun):
    with urllib.request.urlopen(review_run.viewer_url, timeout=5) as response:
        assert response.status == 200
        assert "script-src 'self' 'nonce-" in response.headers["content-security-policy"]
