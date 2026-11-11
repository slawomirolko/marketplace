import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import pytest

from factory_host import ReviewRun, run_workflow

FACTORY_DIR = Path(__file__).resolve().parents[2]
REVIEW_REPO = os.environ.get("FACTORY_REVIEW_REPO", "slawomirolko/marketplace")
REVIEW_PR = int(os.environ.get("FACTORY_REVIEW_PR", "69"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_health(url: str, process: subprocess.Popen, timeout_s: float = 30) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        assert process.poll() is None, f"factory server exited with {process.returncode}"
        try:
            with urllib.request.urlopen(f"{url}/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.2)
    raise AssertionError("factory server did not answer /health")


def pr_body() -> str:
    out = subprocess.run(
        ["gh", "pr", "view", str(REVIEW_PR), "--repo", REVIEW_REPO, "--json", "body"],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)["body"]


def pr_comment_count() -> int:
    out = subprocess.run(
        ["gh", "pr", "view", str(REVIEW_PR), "--repo", REVIEW_REPO, "--json", "comments"],
        check=True, capture_output=True, text=True,
    ).stdout
    return len(json.loads(out)["comments"])


@pytest.fixture(scope="session")
def factory_server():
    port = free_port()
    data_dir = tempfile.mkdtemp(prefix="factory-py-")
    token = secrets.token_hex(24)
    env = {
        **os.environ,
        "FACTORY_TOKEN": token,
        "FACTORY_PORT": str(port),
        "FACTORY_DATA_DIR": data_dir,
        "FACTORY_BACKEND": "cli",
        "FACTORY_CLI": os.environ.get("FACTORY_CLI", "claude"),
    }
    node = os.environ.get("FACTORY_NODE", shutil.which("node") or "node")
    process = subprocess.Popen([node, "src/server.ts"], cwd=FACTORY_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    url = f"http://127.0.0.1:{port}"
    try:
        wait_for_health(url, process)
        yield {"url": url, "token": token}
    finally:
        process.terminate()
        process.wait(timeout=10)
        if os.environ.get("FACTORY_KEEP_DATA"):
            print(f"factory data kept in {data_dir}")
        else:
            shutil.rmtree(data_dir, ignore_errors=True)


@pytest.fixture(scope="session")
async def review_run(factory_server) -> ReviewRun:
    comments_before = pr_comment_count()
    run = await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-review",
        goal=f"Review PR #{REVIEW_PR} in {REVIEW_REPO}",
        workflow_input={"repo": REVIEW_REPO, "pr": REVIEW_PR, "fresh": True},
        answer=lambda question: "continue" if question["id"] == "q-memory-missing" else "skip",
    )
    run.pr_body = pr_body()
    run.comments_before = comments_before
    run.comments_after = pr_comment_count()
    print(json.dumps({"runId": run.run_id, "path": [e["node"] for e in run.events if e["type"] == "node_started"], "interrupts": [i["kind"] for i in run.interrupts], "costUsd": run.report["cost"]["costUsd"]}))
    return run


PLAN_FILE = "docs/yaml-migration-plan.md"
FEEDBACK_PR = int(os.environ.get("FACTORY_FEEDBACK_PR", "74"))


def gh_json(args: list[str]):
    return json.loads(subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout)


@pytest.fixture(scope="session")
async def plan_run(factory_server) -> ReviewRun:
    return await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-review",
        goal=f"Review the plan {PLAN_FILE}",
        workflow_input={"plan": PLAN_FILE},
        answer=lambda question: "skip",
    )


@pytest.fixture(scope="session")
async def feedback_run(factory_server) -> ReviewRun:
    comments_before = len(gh_json(["pr", "view", str(FEEDBACK_PR), "--repo", REVIEW_REPO, "--json", "comments"])["comments"])
    run = await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-review",
        goal=f"Work through feedback on PR #{FEEDBACK_PR}",
        workflow_input={"repo": REVIEW_REPO, "pr": FEEDBACK_PR},
        answer=lambda question: "skip",
    )
    run.comments_before = comments_before
    run.comments_after = len(gh_json(["pr", "view", str(FEEDBACK_PR), "--repo", REVIEW_REPO, "--json", "comments"])["comments"])
    return run


SYNC_PROJECT = os.environ.get("FACTORY_SYNC_PROJECT")
SYNC_ARTIFACTS = os.environ.get("FACTORY_SYNC_ARTIFACTS", "olko-design-rules,olko-review-verifier,olko-e2e-acceptance-runner").split(",")
MARKETPLACE_REMOTE = os.environ.get("FACTORY_SYNC_MARKETPLACE", "slawomirolko/marketplace")


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True, text=True).stdout.strip()


def marketplace_snapshot(path: Path) -> dict:
    return {
        "branch": git(path, "branch", "--show-current"),
        "head": git(path, "rev-parse", "HEAD"),
        "status": git(path, "status", "--porcelain"),
        "branches": git(path, "branch", "--list", "--format=%(refname:short)"),
    }


@pytest.fixture(scope="session")
async def sync_run(factory_server) -> ReviewRun:
    assert SYNC_PROJECT, "set FACTORY_SYNC_PROJECT to the owner/name of a real project with .agents/skills and .opencode/agents"
    root = Path(os.path.realpath(tempfile.mkdtemp(prefix="factory-sync-")))
    project, marketplace = root / "project", root / "marketplace"
    subprocess.run(["gh", "repo", "clone", SYNC_PROJECT, str(project), "--", "--depth", "1"], check=True, capture_output=True)
    subprocess.run(["gh", "repo", "clone", MARKETPLACE_REMOTE, str(marketplace), "--", "--depth", "50"], check=True, capture_output=True)
    before = marketplace_snapshot(marketplace)
    run = await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-marketplace-skill-sync",
        goal="Sync project-local skills and agents to the marketplace",
        workflow_input={"project": str(project), "marketplace": str(marketplace), "artifacts": SYNC_ARTIFACTS},
        answer=lambda question: "leave" if "leave" in (question.get("allowed") or []) else "stop",
    )
    run.marketplace = marketplace
    run.marketplace_before = before
    run.marketplace_after = marketplace_snapshot(marketplace)
    run.artifacts = SYNC_ARTIFACTS
    run.skill_files = [project / ".agents" / "skills" / name / "SKILL.md" for name in SYNC_ARTIFACTS if (project / ".agents" / "skills" / name / "SKILL.md").exists()]
    print(json.dumps({"runId": run.run_id, "path": [e["node"] for e in run.events if e["type"] == "node_started"], "costUsd": run.report["cost"]["costUsd"], "viewerUrl": run.viewer_url}))
    return run


def remote_heads(path: Path) -> str:
    return git(path, "ls-remote", "--heads", "origin")


def accept_first_decision(question: dict, accepted: list[str]) -> str:
    allowed = question.get("allowed") or []
    if question["id"].startswith("q-sync-") and question["id"][7:].isdigit() and not accepted:
        choice = next((a for a in ("create", "adopt-patch") if a in allowed), "leave")
        if choice != "leave":
            accepted.append(question["id"])
        return choice
    if question["id"] == "q-sync-publish":
        return "stop"
    return "leave" if "leave" in allowed else "stop"


@pytest.fixture(scope="session")
async def sync_apply_run(factory_server) -> ReviewRun:
    assert SYNC_PROJECT, "set FACTORY_SYNC_PROJECT to the owner/name of a real project with .agents/skills and .opencode/agents"
    root = Path(os.path.realpath(tempfile.mkdtemp(prefix="factory-sync-apply-")))
    project, marketplace = root / "project", root / "marketplace"
    subprocess.run(["gh", "repo", "clone", SYNC_PROJECT, str(project), "--", "--depth", "1"], check=True, capture_output=True)
    subprocess.run(["gh", "repo", "clone", MARKETPLACE_REMOTE, str(marketplace), "--", "--depth", "50"], check=True, capture_output=True)
    before = {**marketplace_snapshot(marketplace), "remote": remote_heads(marketplace)}
    accepted: list[str] = []
    run = await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-marketplace-skill-sync",
        goal="Sync project-local skills and agents to the marketplace and apply one decision",
        workflow_input={"project": str(project), "marketplace": str(marketplace), "artifacts": SYNC_ARTIFACTS},
        answer=lambda question: accept_first_decision(question, accepted),
    )
    after = marketplace_snapshot(marketplace)
    run.marketplace = marketplace
    run.marketplace_before = before
    run.marketplace_after = {**after, "status": before["status"], "remote": remote_heads(marketplace)}
    run.changed_files = [line.split(maxsplit=1)[1] for line in after["status"].splitlines()]
    run.accepted = accepted
    run.artifacts = SYNC_ARTIFACTS
    print(json.dumps({"runId": run.run_id, "accepted": accepted, "changed": run.changed_files, "costUsd": run.report["cost"]["costUsd"], "viewerUrl": run.viewer_url}))
    return run
