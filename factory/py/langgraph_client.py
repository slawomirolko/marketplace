"""Container check: a LangGraph host drives the sample factory run over MCP.

run-tests.sh runs it in the Docker image against the fake backend, once per venv:
`langgraph_client.py legacy` loads the tools with langchain-mcp-adapters, `langgraph_client.py new`
with the MCP adapter of LangChain 1.x. It checks direct tool calls and the mapping of the confirm
and question steps to LangGraph interrupts, and exits 0 on PASS, 1 on FAIL.
"""

import asyncio
import json
import os
import sys
from typing import Any, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from factory_host import ENDED, RECURSION_LIMIT, resume_until_done

DEFAULT_URL = "http://127.0.0.1:7340/mcp"
LEGACY_API = "legacy"
NEW_API = "new"
POLL_INTERVAL_SEC = 0.05
QUESTION_ANSWER = "extend"
"""The answer to the one question of the sample run."""
EXPECTED_INTERRUPTS = ["confirm", "question"]
EXPECTED_STEPS = 13
"""Steps of the sample run on the fake backend."""


class State(TypedDict, total=False):
    run_id: str
    status: str
    proposal: dict
    question: dict
    answer: str
    report: dict
    polls: int


def parse(result: Any) -> Any:
    """The JSON a tool returned, from either API's result shape (content parts, a tuple or a string)."""
    if hasattr(result, "content") and not isinstance(result, (dict, str, list)):
        result = result.content
    if isinstance(result, tuple):
        result = result[0]
    if isinstance(result, list):
        texts = [part.get("text") if isinstance(part, dict) else getattr(part, "text", None) for part in result]
        result = next(text for text in texts if text)
    if isinstance(result, str):
        return json.loads(result)
    return result


async def load_tools(api: str, url: str, token: str) -> list:
    """The factory tools through the chosen LangChain MCP API."""
    headers = {"Authorization": f"Bearer {token}"}
    if api == NEW_API:
        from fastmcp import Client
        from fastmcp.client.transports import StreamableHttpTransport
        from langchain.mcp import MCPAdapter

        adapter = MCPAdapter(Client(StreamableHttpTransport(url, headers=headers)))
        return await adapter.list_tools()
    from langchain_mcp_adapters.client import MultiServerMCPClient

    client = MultiServerMCPClient({"factory": {"transport": "streamable_http", "url": url, "headers": headers}})
    return await client.get_tools()


def build_graph(tools: dict, api: str) -> Any:
    """The compiled graph: start, ask_confirm, confirm, poll (loop), ask_user, send_answer, report."""

    async def call(name: str, **args) -> Any:
        return parse(await tools[name].ainvoke(args))

    async def start(state: State) -> State:
        started = await call("factory_start", goal="langgraph hello", idempotencyKey=f"lg-{api}")
        return {"run_id": started["runId"], "status": started["status"], "proposal": started["proposal"], "polls": 0}

    def ask_confirm(state: State) -> State:
        decision = interrupt({"kind": "confirm", "proposal": state["proposal"]})
        return {"answer": decision}

    async def confirm(state: State) -> State:
        if state["answer"] != "yes":
            await call("factory_cancel", runId=state["run_id"])
            return {"status": "cancelled"}
        confirmed = await call("factory_confirm", runId=state["run_id"])
        return {"status": confirmed["status"]}

    async def poll(state: State) -> State:
        await asyncio.sleep(POLL_INTERVAL_SEC)
        status = await call("factory_status", runId=state["run_id"])
        assert "cost" in status, "cost footer missing"
        return {"status": status["status"], "question": status.get("pendingQuestion"), "polls": state.get("polls", 0) + 1}

    def ask_user(state: State) -> State:
        answer = interrupt({"kind": "question", "question": state["question"]})
        return {"answer": answer}

    async def send_answer(state: State) -> State:
        await call("factory_answer", runId=state["run_id"], questionId=state["question"]["id"], answer=state["answer"])
        return {"question": None}

    async def report(state: State) -> State:
        return {"report": await call("factory_report", runId=state["run_id"])}

    def route_after_poll(state: State) -> str:
        if state["status"] == "waiting_for_user":
            return "ask_user"
        if state["status"] in ENDED:
            return "report"
        return "poll"

    graph = StateGraph(State)
    for name, node in [("start", start), ("ask_confirm", ask_confirm), ("confirm", confirm), ("poll", poll),
                       ("ask_user", ask_user), ("send_answer", send_answer), ("report", report)]:
        graph.add_node(name, node)
    graph.add_edge(START, "start")
    graph.add_edge("start", "ask_confirm")
    graph.add_edge("ask_confirm", "confirm")
    graph.add_edge("confirm", "poll")
    graph.add_conditional_edges("poll", route_after_poll, ["ask_user", "report", "poll"])
    graph.add_edge("ask_user", "send_answer")
    graph.add_edge("send_answer", "poll")
    graph.add_edge("report", END)
    return graph.compile(checkpointer=InMemorySaver())


def resume_value(value: dict) -> str:
    """Approves the proposal and gives the fixed answer to the question, and prints each step."""
    resume = "yes" if value["kind"] == "confirm" else QUESTION_ANSWER
    print(f"interrupt: {value['kind']} -> resume with '{resume}'")
    return resume


async def main(api: str) -> int:
    """Runs the sample workflow through the host graph; 0 when the report matches the expected run."""
    url = os.environ.get("FACTORY_URL", DEFAULT_URL)
    token = os.environ["FACTORY_TOKEN"]
    tools = {tool.name: tool for tool in await load_tools(api, url, token)}
    print(f"api={api} tools:", sorted(tools))
    app = build_graph(tools, api)
    config = {"configurable": {"thread_id": f"lg-thread-{api}"}, "recursion_limit": RECURSION_LIMIT}
    result, interrupts = await resume_until_done(app, config, resume_value)

    report = result["report"]
    print(json.dumps({"status": report["status"], "cost": report["cost"], "byTier": report["byTier"]}, indent=2))
    ok = (
        report["status"] == "done"
        and [value["kind"] for value in interrupts] == EXPECTED_INTERRUPTS
        and report["cost"]["steps"] == EXPECTED_STEPS
        and report["cost"]["costUsd"] > 0
    )
    print(f"PASS  langgraph host ({api} MCP API): direct tool calls + interrupt mapping" if ok else f"FAIL  langgraph host ({api})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else LEGACY_API)))
