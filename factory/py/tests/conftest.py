import hashlib
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


CLAUDE_SYNC_TARGET = os.environ.get("FACTORY_CLAUDE_SYNC_TARGET", "anthropics/claude-plugins-official")
CLAUDE_SYNC_ARTIFACTS = os.environ.get("FACTORY_CLAUDE_SYNC_ARTIFACTS", "olko-design-rules,olko-review-verifier,frontend-design").split(",")
REAL_SYNC_HOME = Path(os.environ.get("OLKO_SYNC_HOME", Path.home() / ".olko-sync"))


def leak_terms() -> list[str]:
    targets = REAL_SYNC_HOME / "targets.json"
    terms = json.loads(targets.read_text(encoding="utf-8")).get("leakTerms", []) if targets.exists() else []
    return [t.lower() for t in terms + [t for t in os.environ.get("FACTORY_LEAK_TERMS", "").split(",") if t]]


def tree_hash(root: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(p for p in root.rglob("*") if p.is_file()):
        digest.update(str(file.relative_to(root)).encode())
        digest.update(file.read_bytes())
    return digest.hexdigest()


def copy_user_store(destination: Path, terms: list[str]) -> list[str]:
    skipped = []
    for kind in ("skills", "agents"):
        source = Path.home() / ".claude" / kind
        (destination / kind).mkdir(parents=True, exist_ok=True)
        for entry in source.iterdir() if source.exists() else []:
            files = [entry] if entry.is_file() else [p for p in entry.rglob("*") if p.is_file()]
            text = "\n".join(f.read_text(encoding="utf-8", errors="ignore").lower() for f in files) + entry.name.lower()
            if any(term in text for term in terms):
                skipped.append(f"{kind}/{entry.name}")
                continue
            if entry.is_dir():
                shutil.copytree(entry, destination / kind / entry.name)
            else:
                shutil.copy2(entry, destination / kind / entry.name)
    return skipped


def agent_temp_dirs() -> set[str]:
    return {p.name for p in Path(tempfile.gettempdir()).iterdir() if p.name.startswith(("factory-agent-", "factory-opencode-"))}


@pytest.fixture(scope="session")
async def claude_sync_run(factory_server) -> ReviewRun:
    root = Path(os.path.realpath(tempfile.mkdtemp(prefix="factory-claude-sync-")))
    target, olko, user, state = root / "target", root / "olko", root / "user", root / "state"
    subprocess.run(["gh", "repo", "clone", CLAUDE_SYNC_TARGET, str(target), "--", "--depth", "50"], check=True, capture_output=True)
    subprocess.run(["gh", "repo", "clone", MARKETPLACE_REMOTE, str(olko), "--", "--depth", "50"], check=True, capture_output=True)
    skipped = copy_user_store(user, leak_terms())
    real_claude = {kind: tree_hash(Path.home() / ".claude" / kind) for kind in ("skills", "agents")}
    real_state = tree_hash(REAL_SYNC_HOME) if REAL_SYNC_HOME.exists() else ""
    before = {"target": marketplace_snapshot(target), "olko": marketplace_snapshot(olko), "user": tree_hash(user)}
    temp_before = agent_temp_dirs()
    run = await run_workflow(
        url=f"{factory_server['url']}/mcp",
        token=factory_server["token"],
        workflow="olko-claude-sync",
        goal="Sync skills and agents between a Claude marketplace, Olko and the user scope",
        workflow_input={"target": str(target), "targetName": "public-plugins", "olko": str(olko), "user": str(user), "stateDir": str(state), "artifacts": CLAUDE_SYNC_ARTIFACTS},
        answer=lambda q: "none" if q["id"] == "q-claude-sync-leak" else "confirm" if q["id"].startswith("q-claude-sync-probable-") else "leave" if "leave" in (q.get("allowed") or []) else "stop",
    )
    run.stores = {"target": target, "olko": olko, "user": user, "state": state}
    run.stores_before = before
    run.stores_after = {"target": marketplace_snapshot(target), "olko": marketplace_snapshot(olko), "user": tree_hash(user)}
    run.real_unchanged = real_claude == {kind: tree_hash(Path.home() / ".claude" / kind) for kind in ("skills", "agents")} and real_state == (tree_hash(REAL_SYNC_HOME) if REAL_SYNC_HOME.exists() else "")
    run.new_temp_dirs = sorted(agent_temp_dirs() - temp_before)
    run.artifacts = CLAUDE_SYNC_ARTIFACTS
    run.skipped_user = skipped
    print(json.dumps({"runId": run.run_id, "skippedUser": len(skipped), "costUsd": run.report["cost"]["costUsd"], "viewerUrl": run.viewer_url}))
    return run
