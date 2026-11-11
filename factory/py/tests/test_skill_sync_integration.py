import re
from pathlib import Path

from factory_host import ReviewRun

ROW = re.compile(r"^(?P<type>skill|agent) (?P<name>[a-z0-9-]+): (?P<classification>[a-z-]+) -> (?P<decision>[a-z-]+)$", re.MULTILINE)
SEMVER = re.compile(r"^version:\s*\d+\.\d+\.\d+\s*$", re.MULTILINE)
OPTIONS = {
    "local-only": ["create", "reject", "leave"],
    "adapter-candidate": ["move-to-adapter", "adopt-patch", "adopt-minor", "adopt-major", "revert-local", "leave"],
}
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
    assert path.index("safe-source") < path.index("discover") < path.index("compare")
    assert completed(sync_run, "safe-source")["metrics"]["clean"] == 1


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
