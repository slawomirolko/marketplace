import re
import urllib.request
from pathlib import Path

import pytest
import yaml

from factory_host import ReviewRun

FACTORY_DIR = Path(__file__).resolve().parents[2]


def visited(run: ReviewRun) -> list[str]:
    return [e["node"] for e in run.events if e["type"] == "node_started"]


def completed(run: ReviewRun, node: str) -> dict:
    return next(e for e in run.events if e["type"] == "node_completed" and e["node"] == f"olko-review/{node}")


def llm_nodes(run: ReviewRun) -> dict:
    return {path: node for path, node in run.report["byNode"].items() if node["tier"] is not None}


def asked_questions(run: ReviewRun) -> list[str]:
    return [e["questionId"] for e in run.events if e["type"] == "needs_input"]


async def test_review_workflow_defined_in_yaml_runs_to_done(review_run: ReviewRun):
    assert review_run.report["status"] == "done", review_run.report
    assert review_run.report["workflow"].startswith("olko-review@")
    assert review_run.report["synthetic"] is False


async def test_proposal_takes_roles_and_budget_from_the_factory_config_file(review_run: ReviewRun):
    config = yaml.safe_load((FACTORY_DIR / "config" / "factory.yaml").read_text(encoding="utf-8"))
    proposal = review_run.interrupts[0]["proposal"]
    assert review_run.interrupts[0]["kind"] == "confirm"
    assert proposal["budget"]["maxCostUsd"] == config["budget"]["maxCostUsd"]
    assert set(proposal["roles"]) == {"lens", "verifier", "rules"}
    for role, tier in proposal["roles"].items():
        assert tier == config["roles"][role]


async def test_own_pr_gets_the_review_route_only_because_a_fresh_review_was_asked(review_run: ReviewRun):
    assert completed(review_run, "route")["result"].startswith("REVIEW")


async def test_run_follows_the_review_route_order(review_run: ReviewRun):
    path = visited(review_run)
    order = ["route", "scope", "detect", "memory", "lenses", "merge", "rules-check", "rank"]
    positions = [path.index(f"olko-review/{node}") for node in order]
    assert positions == sorted(positions)
    assert ("olko-review/verify" in path) == review_run.lens_findings_found


async def test_missing_memory_block_stops_the_run_and_asks_before_the_lenses(review_run: ReviewRun):
    asked = [e for e in review_run.events if e["type"] == "needs_input" and e["questionId"] == "q-memory-missing"]
    assert len(asked) == 1
    lenses_started = next(i for i, e in enumerate(review_run.events) if e["type"] == "node_started" and e["node"] == "olko-review/lenses")
    assert review_run.events.index(asked[0]) < lenses_started


async def test_requirements_lens_runs_exactly_when_the_pr_description_gives_criteria(review_run: ReviewRun):
    lenses = review_run.report["byNode"]["olko-review/lenses"]["byAgent"]
    assert "bugs" in lenses
    assert ("requirements" in lenses) == bool(review_run.pr_body.strip())


async def test_lens_agents_run_in_parallel(review_run: ReviewRun):
    starts = {e["agentId"]: e["at"] for e in review_run.events if e["type"] == "agent_started" and e["node"] == "olko-review/lenses"}
    ends = {e["agentId"]: e["at"] for e in review_run.events if e["type"] == "agent_completed" and e["node"] == "olko-review/lenses"}
    assert len(starts) >= 2
    assert max(starts.values()) < min(ends.values())


async def test_project_rules_check_runs_and_reports_that_this_repository_has_no_rule_store(review_run: ReviewRun):
    assert review_run.report["byNode"]["olko-review/rules-check"]["costUsd"] > 0
    assert completed(review_run, "rules-merge")["metrics"]["noStore"] == 1


async def test_each_confirmed_finding_gets_its_own_post_question(review_run: ReviewRun):
    kept = completed(review_run, "rank")["metrics"]["kept"]
    post_questions = [q for q in asked_questions(review_run) if re.fullmatch(r"q-post-\d+", q)]
    assert len(post_questions) == kept
    assert len(set(post_questions)) == kept


async def test_every_factory_question_becomes_an_interrupt_and_the_answer_reaches_the_run(review_run: ReviewRun):
    interrupted = [i["question"]["id"] for i in review_run.interrupts if i["kind"] == "question"]
    assert interrupted == asked_questions(review_run)
    resumed = {e["questionId"]: e["answer"] for e in review_run.events if e["type"] == "run_resumed"}
    assert resumed == {q: ("continue" if q == "q-memory-missing" else "skip") for q in asked_questions(review_run)}


async def test_skipped_findings_post_no_pr_comment(review_run: ReviewRun):
    assert "olko-review/post-one" not in visited(review_run)
    assert review_run.comments_after == review_run.comments_before


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
    assert review_run.report["cost"]["costUsd"] == pytest.approx(sum(n["costUsd"] for n in review_run.report["byNode"].values()), abs=1e-6 * len(review_run.report["byNode"]))


async def test_viewer_url_serves_the_run_page(review_run: ReviewRun):
    with urllib.request.urlopen(review_run.viewer_url, timeout=5) as response:
        assert response.status == 200
        assert "script-src 'self' 'nonce-" in response.headers["content-security-policy"]
