import type { AgentInfo, AskedQuestion, FactoryConfig, NodeCost, RunData, RunDetail, RunListItem, RunReport, Workflow } from "../../src/types.ts";

export const SYNC_SCRIPTS: AgentInfo["scripts"] = [
  { skill: "sync", name: "sync.mjs", file: "skills/demo/sync/scripts/sync.mjs" },
  { skill: "sync", name: "watch.mjs", file: "skills/demo/sync/scripts/watch.mjs" },
];

export function agentInfo(name: string, extra: Partial<AgentInfo> = {}): AgentInfo {
  return { name, kind: "agent", description: `${name} description`, file: `agents/opencode/${name}.md`, skills: [], scripts: [], missing: [], ...extra };
}

export const agents: Record<string, AgentInfo> = {
  syncer: agentInfo("syncer", { skills: [{ name: "sync", description: "keeps sources in sync", file: "skills/demo/sync/SKILL.md" }], scripts: SYNC_SCRIPTS }),
  reviewer: agentInfo("reviewer"),
  asker: agentInfo("asker", { asks: "question: allow" }),
};

export const mainWorkflow: Workflow = {
  name: "main",
  version: "1.0.0",
  description: "sample workflow for render tests",
  standalone: true,
  entry: "run",
  roles: { worker: "low" },
  nodes: [
    { id: "run", kind: "llm", role: "worker", agent: "syncer", description: "syncs the sources" },
    { id: "team", kind: "llm", role: "worker", agents: [{ id: "one", agent: "syncer" }, { id: "two", agent: "reviewer" }] },
    { id: "ask", kind: "interrupt", askedBy: "run", question: { id: "ask", text: "Continue?", allowed: ["yes", "no"] } },
    { id: "stop", kind: "script", op: "builtin.stop", with: { reason: "stopped" } },
  ],
  edges: [
    { from: "run", to: "team" },
    { from: "team", to: "ask" },
    { from: "ask", to: "stop" },
    { from: "stop", to: "END" },
  ],
};

export const askingWorkflow: Workflow = {
  name: "asking",
  version: "1.0.0",
  standalone: true,
  entry: "plan",
  nodes: [
    { id: "plan", kind: "llm", agent: "syncer", askAfterTurn: 1, question: { id: "q-plan", text: "Is the plan right?" } },
    { id: "team", kind: "llm", agents: [{ id: "one", agent: "asker" }, { id: "two", agent: "syncer" }] },
    { id: "confirm", kind: "interrupt", askedBy: "plan", question: { id: "q-confirm", text: "Apply the plan?" } },
    { id: "note", kind: "interrupt", question: { id: "q-note", text: "Anything else?" } },
    { id: "done", kind: "script", op: "builtin.stop" },
  ],
  edges: [
    { from: "plan", to: "team" },
    { from: "team", to: "confirm" },
    { from: "confirm", to: "note" },
    { from: "note", to: "done" },
    { from: "done", to: "END" },
  ],
};

export const config: FactoryConfig = { roles: { worker: "low" } };

export const RUN_ID = "r-0000aaaa";
const T0 = "2026-11-17T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function cost(costUsd: number, tier = "low"): NodeCost {
  return { costUsd, tokens: 1200, cacheTokens: 0, steps: 1, llmSteps: 1, unknownSteps: 0, costSource: "harness", tier, model: "small-model", byAgent: {} };
}

export const run: RunData = {
  runId: RUN_ID,
  goal: "sync the sources",
  status: "done",
  answers: { ask: "yes" },
  events: [
    { at: at(0), type: "node_started", node: "main/run", visit: 1 },
    { at: at(30), type: "node_completed", node: "main/run" },
    { at: at(31), type: "node_started", node: "main/team", visit: 1 },
    { at: at(31), type: "agent_started", node: "main/team", agentId: "one" },
    { at: at(31), type: "agent_started", node: "main/team", agentId: "two" },
    { at: at(50), type: "agent_completed", node: "main/team", agentId: "one" },
    { at: at(60), type: "agent_completed", node: "main/team", agentId: "two" },
    { at: at(60), type: "node_completed", node: "main/team" },
    { at: at(61), type: "node_started", node: "main/ask", visit: 1 },
    { at: at(61), type: "needs_input", node: "main/ask", questionId: "ask" },
    { at: at(121), type: "run_resumed" },
    { at: at(122), type: "node_completed", node: "main/ask" },
    { at: at(123), type: "node_started", node: "main/stop", visit: 1 },
    { at: at(123), type: "node_completed", node: "main/stop", result: "stopped" },
  ],
  ledger: [
    { runId: RUN_ID, workflow: "main", at: at(29), nodePath: "main/run", agentName: "syncer", kind: "llm", tier: "low", model: "small-model", backend: "fake", turn: 1, inputTokens: 1000, outputTokens: 200, costUsd: 0.25, costSource: "harness", durationMs: 29000, output: "synced 3 sources" },
    { runId: RUN_ID, workflow: "main", at: at(49), nodePath: "main/team", agentId: "one", agentName: "syncer", kind: "llm", tier: "low", model: "small-model", backend: "fake", turn: 1, inputTokens: 500, outputTokens: 100, costUsd: 0.1, costSource: "harness", durationMs: 18000 },
    { runId: RUN_ID, workflow: "main", at: at(59), nodePath: "main/team", agentId: "two", agentName: "reviewer", kind: "llm", tier: "low", model: "small-model", backend: "fake", turn: 1, inputTokens: 500, outputTokens: 100, costUsd: null, costSource: "unknown", durationMs: 28000 },
  ],
};

export const report: RunReport = {
  runId: RUN_ID,
  status: "done",
  workflow: "main@1.0.0",
  tierModels: { low: "small-model" },
  byNode: {
    "main/run": cost(0.25),
    "main/team": { ...cost(0.1), byAgent: { one: { ...cost(0.1), agentName: "syncer" }, two: { ...cost(0), costSource: "unknown", agentName: "reviewer" } } },
    "main/stop": { ...cost(0), llmSteps: 0, costSource: "none" },
  },
  byTier: { low: 0.35 },
  byModel: { "small-model": 0.35 },
  byCostSource: { harness: 2, unknown: 1 },
  coverage: { run: { llmSteps: 3, unknownSteps: 1 }, byTier: { low: { llmSteps: 3, unknownSteps: 1 } }, byModel: { "small-model": { llmSteps: 3, unknownSteps: 1 } } },
  cacheTokens: 0,
  harnessCostUsd: 0.35,
  cost: { costUsd: 0.35, budgetUsd: 1, budgetRatio: 0.35, tokens: 2400, steps: 4, perNode: {}, source: "harness", warnings: [] },
  synthetic: true,
};

export const questions: AskedQuestion[] = [
  { runId: RUN_ID, questionId: "ask", node: "main/ask", askedBy: "main/run", text: "Continue?", allowed: ["yes", "no"], askedAt: at(61), answer: "yes", answeredAt: at(121) },
];

export const runDetail: RunDetail = { run, report, questions };

export const runListItem: RunListItem = {
  runId: RUN_ID,
  goal: run.goal,
  status: "done",
  createdAt: T0,
  costUsd: 0.35,
  coverage: report.coverage.run,
  harness: "fake",
  requestedModels: ["small-model"],
  usedModels: ["small-model"],
  synthetic: true,
  workflow: "main",
  ran: ["main"],
};
