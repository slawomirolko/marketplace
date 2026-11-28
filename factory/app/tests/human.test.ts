import { agentsOnly } from "../src/agents-only.ts";
import { humanIcons, humanLabel, questionsFor } from "../src/human.ts";
import type { HumanIcon } from "../src/human.ts";
import { allItems, buildLevel } from "../src/tree.ts";
import type { AskedQuestion, Workflow } from "../src/types.ts";
import { agentInfo } from "./testUtils/data.ts";

const CLICK_HINT = "Click to see the questions and your answers in this run";

/** A root that inlines a gate with an interrupt askedBy the gate, a team whose interrupt names it, and a step that asks after a turn. */
const askingWorkflows: Workflow[] = [
  { name: "main", version: "1", entry: "inner", nodes: [{ id: "inner", kind: "subgraph", workflow: "check" }, { id: "shared", kind: "group", workflow: "pick" }, { id: "hello", kind: "llm", maxTurns: 3, askAfterTurn: 2, question: { id: "q-hello", text: "Go on?" } }], edges: [{ from: "inner", to: "shared" }, { from: "shared", to: "hello" }, { from: "hello", to: "END" }] },
  { name: "check", version: "1", entry: "gate", nodes: [{ id: "gate", kind: "llm", skill: "olko-task-scope-gates" }, { id: "ask-scope", kind: "interrupt", askedBy: "gate", question: { id: "q-scope", text: "Extend?" } }, { id: "plain", kind: "interrupt", question: { id: "q-plain", text: "Merge?" } }], edges: [{ from: "gate", to: "ask-scope" }, { from: "ask-scope", to: "plain" }, { from: "plain", to: "END" }] },
  { name: "pick", version: "1", entry: "team", nodes: [{ id: "team", kind: "llm", agents: [{ id: "a", agent: "asker" }, { id: "b" }] }, { id: "ask-team", kind: "interrupt", askedBy: "team", question: { id: "q-team", text: "Which?" } }], edges: [{ from: "team", to: "ask-team" }, { from: "ask-team", to: "END" }] },
];

const askingAgents = { asker: agentInfo("asker", { asks: "question: allow" }) };

function askingIcons(): Map<string, HumanIcon> {
  return humanIcons(buildLevel(askingWorkflows, "main"), askingAgents);
}

function labelOf(icons: Map<string, HumanIcon>, key: string): string {
  const icon = icons.get(key);
  if (!icon) {
    throw new Error(`no icon on ${key}`);
  }
  return humanLabel(icon);
}

test("the step an interrupt names in askedBy asks you; the interrupt and every group around the step pass the question on", () => {
  const icons = askingIcons();
  expect(Object.fromEntries([...icons].map(([key, icon]) => [key, icon.role]))).toEqual({
    "main/inner/gate": "asks",
    "main/inner/ask-scope": "relays",
    "main/inner": "relays",
    "main/team": "asks",
    "main/ask-team": "relays",
    "main/shared": "relays",
    "main/team#a": "asks",
    "main/hello": "asks",
  });
  expect(icons.has("main/inner/plain"), "an interrupt without askedBy is the engine's own question").toBe(false);
});

test.each([
  { key: "main/inner/gate", label: `Asks you: q-scope (through ask-scope). ${CLICK_HINT}` },
  { key: "main/inner/ask-scope", label: `Passes on a question to you from: gate. ${CLICK_HINT}` },
  { key: "main/team#a", label: `May ask you itself (question: allow). ${CLICK_HINT}` },
  { key: "main/hello", label: `Asks you: q-hello (through hello). ${CLICK_HINT}` },
  { key: "main/shared", label: `Passes on a question to you from: team. ${CLICK_HINT}` },
])("the icon on $key says who asks", ({ key, label }) => {
  expect(labelOf(askingIcons(), key)).toBe(label);
});

test("the agents-only view keeps every icon except the hidden interrupts", () => {
  const level = buildLevel(askingWorkflows, "main");
  const shown = new Set(allItems(agentsOnly(level)).map((item) => item.key));
  expect([...humanIcons(level, askingAgents).keys()].filter((key) => shown.has(key)).sort()).toEqual(["main/hello", "main/inner", "main/inner/gate", "main/shared", "main/team", "main/team#a"]);
});

function question(questionId: string, node: string, askedBy: string[]): AskedQuestion {
  return { runId: "r-00000001", questionId, node, askedBy, text: "?", allowed: null, askedAt: "2026-11-17T10:00:00.000Z", answer: null, answeredAt: null };
}

const askedQuestions = [question("q-scope", "main/inner/ask-scope", ["main/inner/gate"]), question("q-hello", "main/hello", ["main/hello"]), question("q-plain", "main/inner/plain", []), question("q-other", "main/inner/gate-2/ask", ["main/inner/gate-2/x"]), question("q-two", "main/rules/ask", ["main/rules/violations", "main/rules/merge"])];

test.each([
  { key: "main/inner/gate", ids: ["q-scope"] },
  { key: "main/inner/ask-scope", ids: ["q-scope"] },
  { key: "main/hello", ids: ["q-hello"] },
  { key: "main/inner", ids: ["q-scope", "q-plain", "q-other"] },
  { key: "main/team#a", ids: [] },
  { key: "main/rules/violations", ids: ["q-two"] },
  { key: "main/rules/merge", ids: ["q-two"] },
])("a step's questions are the ones it asked or passed on; a group shows every question inside it: $key", ({ key, ids }) => {
  expect(questionsFor(key, askedQuestions).map((asked) => asked.questionId)).toEqual(ids);
});

/** A sync root calling compare and decide, where decide's interrupt names its own step and a step of compare. */
const crossWorkflows: Workflow[] = [
  { name: "sync", version: "1", entry: "cmp", nodes: [{ id: "cmp", kind: "subgraph", workflow: "compare" }, { id: "dec", kind: "subgraph", workflow: "decide" }], edges: [{ from: "cmp", to: "dec" }, { from: "dec", to: "END" }] },
  { name: "compare", version: "1", entry: "rows", nodes: [{ id: "rows", kind: "llm" }, { id: "merge", kind: "llm" }], edges: [{ from: "rows", to: "merge" }, { from: "merge", to: "END" }] },
  { name: "decide", version: "1", entry: "decide", nodes: [{ id: "own", kind: "llm" }, { id: "decide", kind: "interrupt", askedBy: ["own", { workflow: "compare", step: "rows" }], question: { id: "q-decide", text: "Which row?" } }], edges: [{ from: "own", to: "decide" }, { from: "decide", to: "END" }] },
];

test("an interrupt naming several steps makes each of them ask, and the group holding the other workflow's step passes it on", () => {
  const icons = humanIcons(buildLevel(crossWorkflows, "sync"), {});
  expect(icons.get("sync/dec/own")?.role).toBe("asks");
  expect(icons.get("sync/cmp/rows")?.role).toBe("asks");
  expect(icons.has("sync/cmp/merge")).toBe(false);
  expect(icons.get("sync/dec/decide")?.sources).toEqual(["sync/dec/own", "sync/cmp/rows"]);
  expect(icons.get("sync/cmp")?.role, "the group holding the other workflow's step passes the question on").toBe("relays");
  expect(labelOf(icons, "sync/cmp/rows")).toBe(`Asks you: q-decide (through decide). ${CLICK_HINT}`);
});

test("a step of another workflow that the diagram does not draw is named as outside it", () => {
  const alone = humanIcons(buildLevel(crossWorkflows, "decide"), {});
  expect(alone.get("decide/decide")?.sources).toEqual(["decide/own"]);
  expect(alone.get("decide/decide")?.external).toEqual(["compare/rows"]);
  expect(labelOf(alone, "decide/decide")).toBe(`Passes on a question to you from: own, compare/rows (not in this diagram). ${CLICK_HINT}`);
});
