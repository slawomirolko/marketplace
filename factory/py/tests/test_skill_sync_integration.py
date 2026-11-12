import re
from pathlib import Path

from factory_host import ReviewRun

ROW = re.compile(r"^(?P<type>skill|agent) (?P<name>[a-z0-9-]+): (?P<classification>[a-z-]+) -> (?P<decision>[a-z-]+)$", re.MULTILINE)
SEMVER = re.compile(r"^version:\s*\d+\.\d+\.\d+\s*$", re.MULTILINE)
OPTIONS = {
    "local-only": ["create", "reject", "leave"],
    "adapter-candidate": ["move-to-adapter", "adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"],
}
DERIVED = {"registry.json", "search-index.json", "capability-graph.json", "agents/opencode/index.json", "README.md"}
DEFAULT_OPTIONS = ["adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"]


def visited(run: ReviewRun) -> list[str]:
    return [e["node"].split("/", 1)[1] for e in run.events if e["type"] == "node_started"]


def completed(run: ReviewRun, node: str) -> dict:
    return next(e for e in run.events if e["type"] == "node_completed" and e["node"] == f"olko-marketplace-skill-sync/{node}")


async def test_sync_run_finishes(sync_run: ReviewRun):
    assert sync_run.report["status"] == "done", sync_run.report


async def test_marketplace_is_safe_before_anything_is_compared(sync_run: ReviewRun):
    path = visited(sync_run)
    assert path[0] == "resolve-path"
    assert completed(sync_run, "resolve-path")["result"].endswith(str(sync_run.marketplace))
    assert path.index("safe/safe-source") < path.index("discover") < path.index("compare")
    assert completed(sync_run, "safe/safe-source")["metrics"]["clean"] == 1


async def test_discovery_finds_exactly_the_requested_artifacts(sync_run: ReviewRun):
    items = completed(sync_run, "discover")["metrics"]
    assert items["artifacts"] == len(sync_run.artifacts)
    compared = sync_run.report["byNode"]["olko-marketplace-skill-sync/compare"]["byAgent"]
    assert sorted(compared) == sorted(sync_run.artifacts)
    assert {agent["agentName"] for agent in compared.values()} == {"olko-marketplace-skill-sync-comparator"}


async def test_every_local_skill_is_adapted_local_only_before_comparison_and_carries_semver(sync_run: ReviewRun):
    path = visited(sync_run)
    skills = completed(sync_run, "discover")["metrics"]["skills"]
    assert path.count("adapt") == skills
    if skills:
        assert max(i for i, node in enumerate(path) if node == "adapt") < path.index("compare")
    for skill in sync_run.skill_files:
        assert SEMVER.search(skill.read_text(encoding="utf-8")), skill


async def test_one_decision_per_non_identical_artifact_with_options_from_its_classification(sync_run: ReviewRun):
    rows = [m.groupdict() for m in ROW.finditer(sync_run.report["result"])]
    assert sorted(row["name"] for row in rows) == sorted(sync_run.artifacts)
    asked = [i["question"] for i in sync_run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith("q-sync-")]
    non_identical = [row for row in rows if row["classification"] != "identical"]
    assert len(asked) == len(non_identical)
    for question, row in zip(asked, non_identical):
        assert row["name"] in question["text"]
        assert question["allowed"] == OPTIONS.get(row["classification"], DEFAULT_OPTIONS), (row, question)
        assert row["decision"] == "leave"


async def test_leave_on_every_decision_changes_nothing_in_the_marketplace(sync_run: ReviewRun):
    assert not {"apply", "publish", "install"} & set(visited(sync_run))
    assert sync_run.marketplace_after == sync_run.marketplace_before


async def test_every_sync_llm_step_has_measured_cost(sync_run: ReviewRun):
    for path, node in sync_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path


def accepted_name(run: ReviewRun) -> str:
    question_id = run.accepted[0]
    question = next(i["question"] for i in run.interrupts if i["kind"] == "question" and i["question"]["id"] == question_id)
    decided = question["text"].split("\n\nAll artifacts:")[0]
    return next(name for name in run.artifacts if f" {name}:" in decided)


async def test_apply_run_finishes_after_publish_is_declined(sync_apply_run: ReviewRun):
    assert sync_apply_run.report["status"] == "done", sync_apply_run.report
    assert sync_apply_run.accepted, "no artifact offered create or adopt; the run had nothing to apply"


async def test_only_the_accepted_artifact_is_applied_then_validated(sync_apply_run: ReviewRun):
    path = visited(sync_apply_run)
    assert path.count("apply") == 1
    assert path.index("apply") < path.index("validate") < path.index("ask-publish")
    assert completed(sync_apply_run, "validate")["metrics"]["failed"] == 0


async def test_marketplace_changes_stay_inside_the_accepted_artifact_and_derived_files(sync_apply_run: ReviewRun):
    name = accepted_name(sync_apply_run)
    assert sync_apply_run.changed_files
    for changed in sync_apply_run.changed_files:
        assert name in changed or changed in DERIVED or re.fullmatch(r"skills/[^/]+/index\.json", changed), changed


async def test_publish_question_shows_the_diff_and_versions(sync_apply_run: ReviewRun):
    question = next(i["question"] for i in sync_apply_run.interrupts if i["kind"] == "question" and i["question"]["id"] == "q-sync-publish")
    assert accepted_name(sync_apply_run) in question["text"]
    assert "Validation:" in question["text"]
    assert question["allowed"] == ["publish", "stop"]


async def test_declined_publish_commits_pushes_and_installs_nothing(sync_apply_run: ReviewRun):
    assert not {"publish", "pr/merge", "install"} & set(visited(sync_apply_run))
    assert sync_apply_run.marketplace_after == sync_apply_run.marketplace_before
    assert "not published" in sync_apply_run.report["result"]


async def test_every_apply_llm_step_has_measured_cost(sync_apply_run: ReviewRun):
    for path, node in sync_apply_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
