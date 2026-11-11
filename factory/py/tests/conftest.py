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
