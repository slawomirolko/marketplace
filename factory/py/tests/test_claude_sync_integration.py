import json
import re

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
    assert completed(claude_sync_run, "safe-olko/safe-source")["metrics"]["ok"] == 1
    assert completed(claude_sync_run, "safe-target/safe-source")["metrics"]["ok"] == 1


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


OLKO_DERIVED = {"registry.json", "search-index.json", "capability-graph.json", "README.md", "agents/opencode/index.json"}


async def test_apply_run_finishes_after_publish_is_declined(claude_sync_apply_run: ReviewRun):
    assert claude_sync_apply_run.report["status"] == "done", claude_sync_apply_run.report
    assert claude_sync_apply_run.chosen, "no row offered a port or an install; the run had nothing to apply"


async def test_every_approved_row_is_staged_by_one_porter_first(claude_sync_apply_run: ReviewRun):
    porters = claude_sync_apply_run.report["byNode"][f"{WF}/stage"]["byAgent"]
    assert len(porters) == len(claude_sync_apply_run.chosen)
    assert {a["agentName"] for a in porters.values()} == {"olko-claude-sync-porter"}
    path = visited(claude_sync_apply_run)
    assert path.index("stage") < path.index("apply-next")


async def test_every_sanitize_finding_is_asked_one_at_a_time(claude_sync_apply_run: ReviewRun):
    findings = completed(claude_sync_apply_run, "findings")["metrics"]["findings"]
    asked = [i for i in claude_sync_apply_run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith("q-claude-sync-finding-")]
    assert len(asked) == findings


async def test_olko_changes_stay_inside_the_ported_artifact_and_its_registry_entries(claude_sync_apply_run: ReviewRun):
    if "olko" not in claude_sync_apply_run.chosen:
        assert claude_sync_apply_run.changed_files == []
        return
    applied = completed(claude_sync_apply_run, "olko-tests")["metrics"]
    assert applied["failed"] == 0
    assert claude_sync_apply_run.changed_files
    paths = [c for c in claude_sync_apply_run.changed_files if c not in OLKO_DERIVED and not re.fullmatch(r"skills/[^/]+/index\.json", c)]
    assert paths and len({p.split("/")[2] if p.startswith("skills/") else p for p in paths}) == 1, paths


async def test_no_leak_term_or_target_name_reaches_olko(claude_sync_apply_run: ReviewRun):
    assert completed(claude_sync_apply_run, "leak-check")["metrics"]["leaks"] == 0
    olko = claude_sync_apply_run.stores["olko"]
    text = "".join((olko / c).read_text(encoding="utf-8", errors="ignore") for c in claude_sync_apply_run.changed_files if (olko / c).is_file()).lower()
    assert "public-plugins" not in text and str(claude_sync_apply_run.stores["target"]).lower() not in text


async def test_user_scope_writes_only_after_a_yes_and_only_the_approved_artifact(claude_sync_apply_run: ReviewRun):
    writes = [i["question"]["id"] for i in claude_sync_apply_run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith("q-claude-sync-write-")]
    if "user" not in claude_sync_apply_run.chosen:
        assert claude_sync_apply_run.user_changed == [] and writes == []
        return
    assert writes
    written = completed(claude_sync_apply_run, "apply-user")["result"]
    assert "-> user scope" in written, written
    assert len({c.split("/")[1].removesuffix(".md") for c in claude_sync_apply_run.user_changed}) <= 1, claude_sync_apply_run.user_changed
    assert all(c.split("/")[1].removesuffix(".md") in written for c in claude_sync_apply_run.user_changed)


async def test_lineage_is_recorded_for_every_applied_row(claude_sync_apply_run: ReviewRun):
    lineage = json.loads((claude_sync_apply_run.stores["state"] / "lineage.json").read_text(encoding="utf-8"))
    assert len(lineage.get("capabilities", lineage)) >= completed(claude_sync_apply_run, "apply-record")["metrics"]["applied"] > 0


async def test_declined_publish_leaves_branches_commits_and_the_target_unchanged(claude_sync_apply_run: ReviewRun):
    assert not {"publish-pr", "pr/merge"} & set(visited(claude_sync_apply_run))
    assert claude_sync_apply_run.stores_after == claude_sync_apply_run.stores_before
    assert "consolidat" in claude_sync_apply_run.report["result"].lower()


async def test_every_claude_sync_apply_llm_step_has_measured_cost(claude_sync_apply_run: ReviewRun):
    for path, node in claude_sync_apply_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
