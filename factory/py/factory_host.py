import json
from dataclasses import dataclass, field
from typing import Any, TypedDict

from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

ENDED = {"done", "stopped", "cancelled", "failed"}


@dataclass
class ReviewRun:
    run_id: str
    report: dict
    events: list[dict]
    interrupts: list[dict]
    viewer_url: str
    lens_findings_found: bool
    comments_before: int = 0
    comments_after: int = 0


class HostState(TypedDict, total=False):
    run_id: str
    proposal: dict
    status: dict
    report: dict


def payload(result: Any) -> dict:
    if isinstance(result, list):
        text = "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in result)
    else:
        text = str(result)
    data = json.loads(text)
    if "error" in data and "runId" not in data:
        raise RuntimeError(data["error"])
    return data


def build_graph(tools: dict, workflow: str, goal: str, workflow_input: dict):
    async def call(name: str, **args) -> dict:
        return payload(await tools[name].ainvoke(args))

    async def start(state: HostState) -> HostState:
        started = await call("factory_start", goal=goal, workflow=workflow, input=workflow_input)
        return {"run_id": started["runId"], "proposal": started["proposal"]}

    def ask_confirm(state: HostState) -> HostState:
        decision = interrupt({"kind": "confirm", "proposal": state["proposal"]})
        if decision != "yes":
            raise RuntimeError(f"proposal not approved: {decision}")
        return {}

    async def confirm(state: HostState) -> HostState:
        return {"status": await call("factory_confirm", runId=state["run_id"])}

    async def wait(state: HostState) -> HostState:
        return {"status": await call("factory_wait", runId=state["run_id"], timeoutSec=50)}

    async def ask_user(state: HostState) -> HostState:
        question = state["status"]["pendingQuestion"]
        answer = interrupt({"kind": "question", "question": question})
        return {"status": await call("factory_answer", runId=state["run_id"], questionId=question["id"], answer=answer)}

    async def report(state: HostState) -> HostState:
        return {"report": await call("factory_report", runId=state["run_id"])}

    def after_wait(state: HostState) -> str:
        status = state["status"]["status"]
        if status == "waiting_for_user":
            return "ask_user"
        if status in ENDED:
            return "report"
        return "wait"

    graph = StateGraph(HostState)
    for name, node in [("start", start), ("ask_confirm", ask_confirm), ("confirm", confirm), ("wait", wait), ("ask_user", ask_user), ("report", report)]:
        graph.add_node(name, node)
    graph.add_edge(START, "start")
    graph.add_edge("start", "ask_confirm")
    graph.add_edge("ask_confirm", "confirm")
    graph.add_edge("confirm", "wait")
    graph.add_conditional_edges("wait", after_wait, ["ask_user", "report", "wait"])
    graph.add_edge("ask_user", "wait")
    graph.add_edge("report", END)
    return graph.compile(checkpointer=InMemorySaver())


async def run_workflow(url: str, token: str, workflow: str, goal: str, workflow_input: dict, answers: dict[str, str]) -> ReviewRun:
    client = MultiServerMCPClient({"factory": {"transport": "streamable_http", "url": url, "headers": {"Authorization": f"Bearer {token}"}}})
    tools = {tool.name: tool for tool in await client.get_tools()}
    app = build_graph(tools, workflow, goal, workflow_input)
    config = {"configurable": {"thread_id": goal}, "recursion_limit": 500}
    interrupts: list[dict] = []
    result = await app.ainvoke({}, config)
    while "__interrupt__" in result:
        value = result["__interrupt__"][0].value
        interrupts.append(value)
        resume = "yes" if value["kind"] == "confirm" else answers[value["question"]["id"]]
        result = await app.ainvoke(Command(resume=resume), config)
    run_id = result["run_id"]
    trace = payload(await tools["factory_trace"].ainvoke({"runId": run_id}))
    events = trace["events"]
    merged = next(e for e in events if e["type"] == "node_completed" and e["node"].endswith("/merge"))
    return ReviewRun(
        run_id=run_id,
        report=result["report"],
        events=events,
        interrupts=interrupts,
        viewer_url=result["report"]["viewerUrl"],
        lens_findings_found=merged["metrics"]["findings"] > 0,
    )
