from factory_host import ReviewRun

WF = "olko-plan-documentation"
FEATURE = "plans/features/e7-approval-gates"


def visited(run: ReviewRun) -> list[str]:
    return [e["node"].split("/", 1)[1] for e in run.events if e["type"] == "node_started"]


def completed_all(run: ReviewRun, node: str) -> list[dict]:
    return [e for e in run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/{node}"]


def asked(run: ReviewRun, prefix: str) -> list[dict]:
    return [i["question"] for i in run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith(prefix)]


async def test_plan_documentation_run_finishes(plan_doc_run: ReviewRun):
    assert plan_doc_run.report["status"] == "done", plan_doc_run.report


async def test_tracker_steps_are_skipped_by_the_switch(plan_doc_run: ReviewRun):
    gates = [e for e in plan_doc_run.events if e["type"] == "node_completed" and e["node"].startswith(f"{WF}/tracker-")]
    assert gates and all("skipped: switch off" in g["result"] for g in gates), gates


async def test_discovery_draft_is_reviewed_once_before_planning(plan_doc_run: ReviewRun):
    drafts = plan_doc_run.report["byNode"][f"{WF}/draft"]["byAgent"]
    assert {a["agentName"] for a in drafts.values()} == {"olko-feature-backlog-writer"}
    assert len(asked(plan_doc_run, "q-plan-draft-review")) == 1
    path = visited(plan_doc_run)
    assert path.index("ask-draft") < path.index("investigate")


async def test_investigation_runs_the_knowledge_manager_and_four_workers_together(plan_doc_run: ReviewRun):
    agents = {a["agentName"] for a in plan_doc_run.report["byNode"][f"{WF}/investigate"]["byAgent"].values()}
    assert agents == {"olko-obsidian-knowledge-manager", "olko-investigation-flow-worker", "olko-investigation-runtime-worker", "olko-investigation-test-worker", "olko-investigation-readiness-worker"}


async def test_the_full_feature_package_and_one_plan_per_task_exist(plan_doc_run: ReviewRun):
    feature = plan_doc_run.stores["project"] / FEATURE
    for name in ("business.md", "implementation.md", "stack.md", "tracker.md"):
        assert (feature / name).is_file(), name
    tasks = list((feature / "tasks").glob("*-implementation.md"))
    assert tasks, "no Task implementation file"
    assert "Ready for implementation:" in (feature / "implementation.md").read_text(encoding="utf-8")
    assert all("Ready for implementation:" in t.read_text(encoding="utf-8") for t in tasks)


async def test_consistency_gate_passes_before_the_grill(plan_doc_run: ReviewRun):
    gates = completed_all(plan_doc_run, "consistency")
    assert gates and gates[-1]["metrics"]["pass"] == 1
    path = visited(plan_doc_run)
    assert path.index("consistency") < path.index("grill")


async def test_every_plan_file_is_reviewed_by_the_review_plan_route(plan_doc_run: ReviewRun):
    files = completed_all(plan_doc_run, "plan-files")[0]["metrics"]["files"]
    calls = [e for e in plan_doc_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/plan-review"]
    assert len(calls) >= files > 1
    routes = [e for e in plan_doc_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/plan-review/route"]
    assert routes and all(r["result"].startswith("PLAN") for r in routes)


async def test_grill_questions_offer_three_options_with_the_recommendation_first(plan_doc_run: ReviewRun):
    grill = asked(plan_doc_run, "q-plan-grill-")
    assert grill
    assert all(q["allowed"] == ["1", "2", "3"] and "recommended" in q["text"].lower() for q in grill)


async def test_planning_writes_only_plan_files_and_its_memory_block(plan_doc_run: ReviewRun):
    assert plan_doc_run.stores_after == plan_doc_run.stores_before
    assert plan_doc_run.changed_files
    for changed in plan_doc_run.changed_files:
        assert changed.startswith(f"{FEATURE}/") or changed == ".opencode/memory/olko-plan-documentation-orchestrator.md", changed


async def test_the_editor_is_not_opened_when_its_switch_is_off(plan_doc_run: ReviewRun):
    gate = completed_all(plan_doc_run, "editor")
    assert gate and "skipped: switch off" in gate[0]["result"]


async def test_every_plan_llm_step_has_measured_cost(plan_doc_run: ReviewRun):
    for path, node in plan_doc_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
