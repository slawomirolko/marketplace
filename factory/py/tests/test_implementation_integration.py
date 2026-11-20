from factory_host import ReviewRun

WF = "olko-implementation"


def visited(run: ReviewRun) -> list[str]:
    return [e["node"].split("/", 1)[1] for e in run.events if e["type"] == "node_started"]


def completed(run: ReviewRun, node: str) -> dict:
    return next(e for e in run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/{node}")


def asked(run: ReviewRun, prefix: str) -> list[dict]:
    return [i["question"] for i in run.interrupts if i["kind"] == "question" and i["question"]["id"].startswith(prefix)]


async def test_implementation_run_finishes(impl_run: ReviewRun):
    assert impl_run.report["status"] == "done", impl_run.report


async def test_the_entry_gate_accepts_the_approved_task_without_planning(impl_run: ReviewRun):
    assert completed(impl_run, "task")["metrics"]["ok"] == 1
    assert not [n for n in visited(impl_run) if n.startswith("plan/")]


async def test_every_step_after_the_worktree_runs_in_the_worktree(impl_run: ReviewRun):
    moved = [e for e in impl_run.events if e["type"] == "workspace_changed"]
    assert len(moved) == 1 and moved[0]["workspace"].lower() == str(impl_run.stores["worktree"].resolve()).lower()
    assert impl_run.stores_after == impl_run.stores_before


async def test_four_preflight_workers_report_before_any_test_or_code(impl_run: ReviewRun):
    workers = impl_run.report["byNode"][f"{WF}/workers"]["byAgent"]
    assert sorted(workers) == ["flow", "readiness", "runtime", "test"]
    path = visited(impl_run)
    assert [e for e in impl_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/preflight"][-1]["metrics"]["pass"] == 1
    assert max(i for i, n in enumerate(path) if n == "preflight") < path.index("write-tests") < path.index("implement")


async def test_failing_tests_are_written_first_and_never_changed_by_the_implementer(impl_run: ReviewRun):
    tests = completed(impl_run, "tests-check")["metrics"]
    assert tests["tests"] >= 1 and tests["files"] >= 1
    assert [f for f in impl_run.changed_files if f.startswith("tests/") and f.endswith("Tests.cs")], impl_run.changed_files
    checks = [e for e in impl_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/child-check"]
    assert checks and checks[-1]["metrics"]["violations"] == 0


async def test_production_change_stays_in_the_task_scope(impl_run: ReviewRun):
    code = [f for f in impl_run.changed_files if not f.startswith("plans/")]
    assert "src/HealthCasePlatform.Api/Program.cs" in code, code
    assert completed(impl_run, "scope-gate")["metrics"]["code"] <= 15
    assert not [f for f in code if f.startswith(".github/")]


async def test_style_and_tests_pass_through_the_checks_call(impl_run: ReviewRun):
    checks = [e for e in impl_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/checks/check"]
    assert checks and checks[-1]["metrics"]["failures"] == 0


async def test_the_task_review_runs_on_the_local_diff_and_posts_nothing(impl_run: ReviewRun):
    route = [e for e in impl_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/review/route"]
    assert route and route[0]["result"].startswith("LOCAL")
    assert not [n for n in visited(impl_run) if n.startswith("review/") and "post" in n]
    gates = [e for e in impl_run.events if e["type"] == "node_completed" and e["node"] == f"{WF}/review-gate"]
    assert gates and gates[-1]["metrics"]["blocking"] == 0


async def test_switched_off_phases_do_not_run(impl_run: ReviewRun):
    path = visited(impl_run)
    for prefix in ("tracker-task/read-task", "docker/docker-rebuild", "adopt/adopt-code", "obsidian/propose", "editor/open"):
        assert prefix not in path, prefix


async def test_declined_commit_leaves_no_commit_and_records_the_journal(impl_run: ReviewRun):
    assert [q["id"] for q in asked(impl_run, "q-impl-commit")] == ["q-impl-commit"]
    assert "commit" not in visited(impl_run)
    journal = impl_run.stores["task"].read_text(encoding="utf-8")
    assert "## Implementation" in journal and "run report" in journal
    assert "not committed" in impl_run.report["result"]


async def test_every_implementation_llm_step_has_measured_cost(impl_run: ReviewRun):
    for path, node in impl_run.report["byNode"].items():
        if node["tier"] is None:
            continue
        assert node["unknownSteps"] == 0, path
        assert all(agent["costSource"] == "measured" for agent in node["byAgent"].values()), path
