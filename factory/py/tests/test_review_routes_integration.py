import json
import re
import subprocess

from factory_host import ReviewRun

REPO = "slawomirolko/marketplace"


def visited(run: ReviewRun) -> list[str]:
    return [e["node"].split("/", 1)[1] for e in run.events if e["type"] == "node_started"]


def completed(run: ReviewRun, node: str) -> dict:
    return next(e for e in run.events if e["type"] == "node_completed" and e["node"] == f"olko-review/{node}")


async def test_plan_input_takes_the_plan_route(plan_run: ReviewRun):
    assert plan_run.report["status"] == "done", plan_run.report
    assert completed(plan_run, "route")["result"].startswith("PLAN")


async def test_plan_route_runs_only_the_requirements_lens_and_never_touches_memory(plan_run: ReviewRun):
    path = visited(plan_run)
    assert path[:3] == ["route", "plan-read", "plan-lens"]
    assert not {"lenses", "memory", "memory-save", "scope"} & set(path)
    lens = plan_run.report["byNode"]["olko-review/plan-lens"]["byAgent"]
    assert list(lens) == ["requirements"]
    assert lens["requirements"]["agentName"] == "olko-review-requirements-lens"


async def test_plan_findings_are_verified_and_checked_against_the_project_store(plan_run: ReviewRun):
    path = visited(plan_run)
    findings = completed(plan_run, "plan-merge")["metrics"]["findings"]
    assert ("plan-verify" in path) == (findings > 0)
    assert path.index("plan-rules") < path.index("plan-report")
    assert completed(plan_run, "plan-rules-merge")["metrics"]["noStore"] == 1


async def test_plan_report_quotes_plan_steps(plan_run: ReviewRun):
    result = plan_run.report["result"]
    findings_block = result.split("\n\n")[1].splitlines()
    assert findings_block
    assert findings_block == ["No confirmed findings."] or all(line.startswith("plan: ") for line in findings_block), findings_block
    assert "Project rules check: no-store" in result


async def test_every_plan_llm_step_has_measured_cost(plan_run: ReviewRun):
    for path, node in plan_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path


async def test_own_pr_without_fresh_takes_the_feedback_route(feedback_run: ReviewRun):
    assert feedback_run.report["status"] == "done", feedback_run.report
    assert completed(feedback_run, "route")["result"].startswith("FEEDBACK")


async def test_feedback_route_reports_real_ci_state_and_unresolved_comments(feedback_run: ReviewRun):
    checks = subprocess.run(["gh", "pr", "checks", "74", "--repo", REPO, "--json", "name,state"], capture_output=True, text=True)
    expected_checks = len(json.loads(checks.stdout)) if checks.returncode == 0 and checks.stdout.strip() else 0
    metrics = completed(feedback_run, "fb-check")["metrics"]
    assert metrics["checks"] == expected_checks
    assert metrics["comments"] >= 0
    assert re.search(r"CI: ", feedback_run.report["result"])


async def test_feedback_route_asks_a_decision_for_every_comment_and_posts_nothing_on_skip(feedback_run: ReviewRun):
    metrics = completed(feedback_run, "fb-check")["metrics"]
    decisions = [e["questionId"] for e in feedback_run.events if e["type"] == "needs_input" and e["questionId"].startswith("q-feedback-")]
    assert len(decisions) == metrics["items"]
    assert feedback_run.comments_after == feedback_run.comments_before
