import subprocess

from factory_host import ReviewRun

WF = "olko-workflow-sync"


def completed(run: ReviewRun, node: str) -> list[dict]:
    return [e for e in run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/{node}"]


async def test_workflow_sync_run_finishes(wfsync_run: ReviewRun):
    assert wfsync_run.report["status"] == "done", wfsync_run.report


async def test_the_scan_finds_changed_sources_and_new_main_agents(wfsync_run: ReviewRun):
    scan = completed(wfsync_run, "scan")[0]["metrics"]
    assert scan["changed"] >= 1, scan
    assert scan["broken"] == 0, scan
    new = [i["question"]["id"] for i in wfsync_run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith("q-wfsync-new-")]
    assert len(new) == scan["new"]


async def test_every_changed_source_goes_through_mapper_validation_and_verifier(wfsync_run: ReviewRun):
    changed = completed(wfsync_run, "scan")[0]["metrics"]["changed"] + completed(wfsync_run, "scan")[0]["metrics"]["missing"]
    checks = completed(wfsync_run, "check")
    assert len({e["result"].split(":")[0].split(" round")[0] for e in checks}) == changed
    assert len(completed(wfsync_run, "validate")) == len(completed(wfsync_run, "verify")) == len(checks)
    mapper = wfsync_run.report["byNode"][f"{WF}/map"]["byAgent"]
    assert [a["agentName"] for a in mapper.values()] == ["olko-workflow-mapper"]


async def test_skipped_new_agents_get_no_workflow(wfsync_run: ReviewRun):
    added = set(wfsync_run.stores_after["yaml"]) - set(wfsync_run.stores_before["yaml"])
    assert not added, added


async def test_the_workflows_folder_is_valid_after_the_run(wfsync_run: ReviewRun):
    result = subprocess.run(["node", "src/validate-workflows.ts", str(wfsync_run.stores["work"] / "workflows")], cwd=str(__import__("pathlib").Path(__file__).resolve().parents[2]), capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr


async def test_the_lock_moves_to_the_marketplace_head_only_for_verified_sources(wfsync_run: ReviewRun):
    head = wfsync_run.stores_after["head"]
    after, before = wfsync_run.stores_after["lock"], wfsync_run.stores_before["lock"]
    unlocked = [w for w in after if w not in before]
    moved = [w for w in after if after[w]["commit"] == head and w in before and before[w]["commit"] != head]
    passed = [e for e in completed(wfsync_run, "check") if "mapped and verified" in e["result"]]
    assert bool(moved) == bool(passed), (moved, passed)
    assert all(after[w]["commit"] == head for w in unlocked), unlocked
    for w in after:
        if w in before and after[w]["commit"] != head:
            assert after[w] == before[w], w


async def test_the_real_factory_workflows_are_untouched(wfsync_run: ReviewRun):
    assert wfsync_run.stores_after["real"] == wfsync_run.stores_before["real"]


async def test_every_workflow_sync_llm_step_has_measured_cost(wfsync_run: ReviewRun):
    for path, node in wfsync_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
