import asyncio
import json
import os
import sys
from typing import TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

URL = os.environ.get("FACTORY_URL", "http://127.0.0.1:7340/mcp")
TOKEN = os.environ["FACTORY_TOKEN"]
API = sys.argv[1] if len(sys.argv) > 1 else "legacy"


class State(TypedDict, total=False):
    run_id: str
    status: str
    proposal: dict
    question: dict
    answer: str
    report: dict
    polls: int


def parse(result):
    if hasattr(result, "content") and not isinstance(result, (dict, str, list)):
        result = result.content
    if isinstance(result, tuple):
        result = result[0]
    if isinstance(result, list):
        texts = [part.get("text") if isinstance(part, dict) else getattr(part, "text", None) for part in result]
        result = next(t for t in texts if t)
    if isinstance(result, str):
        return json.loads(result)
    return result


async def load_tools():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if API == "new":
        from fastmcp import Client
        from fastmcp.client.transports import StreamableHttpTransport
        from langchain.mcp import MCPAdapter

        adapter = MCPAdapter(Client(StreamableHttpTransport(URL, headers=headers)))
        return await adapter.list_tools()
    from langchain_mcp_adapters.client import MultiServerMCPClient

    client = MultiServerMCPClient({"factory": {"transport": "streamable_http", "url": URL, "headers": headers}})
    return await client.get_tools()


async def main():
    tools = {tool.name: tool for tool in await load_tools()}
    print(f"api={API} tools:", sorted(tools))

    async def call(name, **args):
        return parse(await tools[name].ainvoke(args))

    async def start(state: State):
        payload = await call("factory_start", goal="langgraph hello", idempotencyKey=f"lg-{API}")
        return {"run_id": payload["runId"], "status": payload["status"], "proposal": payload["proposal"], "polls": 0}

    def ask_confirm(state: State):
        decision = interrupt({"kind": "confirm", "proposal": state["proposal"]})
        return {"answer": decision}

    async def confirm(state: State):
        if state["answer"] != "yes":
            await call("factory_cancel", runId=state["run_id"])
            return {"status": "cancelled"}
        payload = await call("factory_confirm", runId=state["run_id"])
        return {"status": payload["status"]}

    async def poll(state: State):
        await asyncio.sleep(0.05)
        payload = await call("factory_status", runId=state["run_id"])
        assert "cost" in payload, "cost footer missing"
        return {"status": payload["status"], "question": payload.get("pendingQuestion"), "polls": state.get("polls", 0) + 1}

    def ask_user(state: State):
        answer = interrupt({"kind": "question", "question": state["question"]})
        return {"answer": answer}

    async def send_answer(state: State):
        await call("factory_answer", runId=state["run_id"], questionId=state["question"]["id"], answer=state["answer"])
        return {"question": None}

    async def report(state: State):
        return {"report": await call("factory_report", runId=state["run_id"])}

    def route_after_poll(state: State):
        if state["status"] == "waiting_for_user":
            return "ask_user"
        if state["status"] in ("done", "stopped", "cancelled"):
            return "report"
        return "poll"

    graph = StateGraph(State)
    for name, fn in [("start", start), ("ask_confirm", ask_confirm), ("confirm", confirm), ("poll", poll),
                     ("ask_user", ask_user), ("send_answer", send_answer), ("report", report)]:
        graph.add_node(name, fn)
    graph.add_edge(START, "start")
    graph.add_edge("start", "ask_confirm")
    graph.add_edge("ask_confirm", "confirm")
    graph.add_edge("confirm", "poll")
    graph.add_conditional_edges("poll", route_after_poll, ["ask_user", "report", "poll"])
    graph.add_edge("ask_user", "send_answer")
    graph.add_edge("send_answer", "poll")
    graph.add_edge("report", END)
    app = graph.compile(checkpointer=InMemorySaver())

    config = {"configurable": {"thread_id": f"lg-thread-{API}"}, "recursion_limit": 500}
    result = await app.ainvoke({}, config)
    interrupts_seen = []
    while "__interrupt__" in result:
        value = result["__interrupt__"][0].value
        interrupts_seen.append(value["kind"])
        resume = "yes" if value["kind"] == "confirm" else "extend"
        print(f"interrupt: {value['kind']} -> resume with '{resume}'")
        result = await app.ainvoke(Command(resume=resume), config)

    rep = result["report"]
    print(json.dumps({"status": rep["status"], "cost": rep["cost"], "byTier": rep["byTier"]}, indent=2))
    ok = (
        rep["status"] == "done"
        and interrupts_seen == ["confirm", "question"]
        and rep["cost"]["steps"] == 9
        and rep["cost"]["costUsd"] > 0
    )
    print(f"PASS  langgraph host ({API} MCP API): direct tool calls + interrupt mapping" if ok else f"FAIL  langgraph host ({API})")
    sys.exit(0 if ok else 1)


asyncio.run(main())
