import json

from factory_host import ReviewRun

WF = "olko-claude-sync"
ACTIONS = {
    "target-only": ["port-to-olko", "exclude", "leave"],
    "olko-only": ["install-user", "reject", "exclude", "leave"],
    "user-only": ["publish-to-olko", "exclude", "leave"],
    "target-ahead": ["port-to-olko-patch", "port-to-olko-minor", "port-to-olko-major", "exclude", "leave"],
    "olko-ahead": ["update-user", "exclude", "leave"],
    "user-ahead": ["publish-to-olko-patch", "publish-to-olko-minor", "publish-to-olko-major", "revert-user", "exclude", "leave"],
    "diverged": ["take-target", "take-olko", "exclude", "leave"],
    "platform-delta-only": ["leave", "exclude"],
}


def visited(run: ReviewRun) -> list[str]:
    return [e["node"].split("/", 1)[1] for e in run.events if e["type"] == "node_started"]


def completed(run: ReviewRun, node: str) -> dict:
    return next(e for e in run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/{node}")


async def test_claude_sync_run_finishes(claude_sync_run: ReviewRun):
    assert claude_sync_run.report["status"] == "done", claude_sync_run.report


async def test_state_lives_in_the_given_state_dir_and_the_real_user_scope_is_untouched(claude_sync_run: ReviewRun):
    targets = json.loads((claude_sync_run.stores["state"] / "targets.json").read_text(encoding="utf-8"))
    assert targets["olko"]["path"] == str(claude_sync_run.stores["olko"])
    assert targets["targets"]["public-plugins"]["path"] == str(claude_sync_run.stores["target"])
    assert claude_sync_run.real_unchanged


async def test_both_marketplaces_are_safe_before_the_inventory(claude_sync_run: ReviewRun):
    path = visited(claude_sync_run)
    assert path.index("safe-olko") < path.index("inventory")
    assert path.index("safe-target") < path.index("inventory")
    assert completed(claude_sync_run, "safe-olko")["metrics"]["ok"] == 1
    assert completed(claude_sync_run, "safe-target")["metrics"]["ok"] == 1


async def test_one_inventory_worker_per_store_then_one_matcher(claude_sync_run: ReviewRun):
    inventory = claude_sync_run.report["byNode"][f"{WF}/inventory"]["byAgent"]
    assert sorted(inventory) == ["olko", "target", "user"]
    assert {a["agentName"] for a in inventory.values()} == {"olko-claude-sync-inventory"}
    matcher = claude_sync_run.report["byNode"][f"{WF}/match"]["byAgent"]
    assert [a["agentName"] for a in matcher.values()] == ["olko-claude-sync-matcher"]
    assert completed(claude_sync_run, "capabilities")["metrics"]["capabilities"] > len(claude_sync_run.artifacts)


async def test_only_the_requested_capabilities_are_compared(claude_sync_run: ReviewRun):
    selected = completed(claude_sync_run, "select")["metrics"]["selected"]
    assert selected == len(claude_sync_run.artifacts)
    compared = claude_sync_run.report["byNode"][f"{WF}/compare"]["byAgent"]
    assert len(compared) + completed(claude_sync_run, "exclusions")["metrics"]["excluded"] == selected
    assert {a["agentName"] for a in compared.values()} == {"olko-claude-sync-comparator"}


async def test_one_decision_per_non_identical_row_with_the_actions_of_its_verdict(claude_sync_run: ReviewRun):
    rows = [line.split(" | ") for line in claude_sync_run.report["result"].splitlines() if line.startswith("row | ")]
    assert len(rows) == completed(claude_sync_run, "select")["metrics"]["selected"]
    asked = [i["question"] for i in claude_sync_run.interrupts if i["kind"] == "question" and i["question"]["id"][len("q-claude-sync-"):].isdigit()]
    deciding = [r for r in rows if r[2] not in ("identical", "excluded")]
    assert len(asked) == len(deciding)
    for question, row in zip(asked, deciding):
        assert row[1] in question["text"]
        assert question["allowed"] == ACTIONS[row[2]], (row, question)
        assert row[3] == "leave"


async def test_leave_on_every_row_changes_no_store(claude_sync_run: ReviewRun):
    assert not {"stage", "apply", "publish", "install"} & set(visited(claude_sync_run))
    assert claude_sync_run.stores_after == claude_sync_run.stores_before


async def test_agent_definition_folders_are_removed_after_each_step(claude_sync_run: ReviewRun):
    assert claude_sync_run.new_temp_dirs == []


async def test_every_claude_sync_llm_step_has_measured_cost(claude_sync_run: ReviewRun):
    for path, node in claude_sync_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
