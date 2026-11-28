import { costOf, buildRunIndex, failureOf, ledgerOf, runCount, tierOf, timeSpent } from "../src/run-facts.ts";
import { supervisorRing } from "../src/supervisor.ts";
import { humanIcons } from "../src/human.ts";
import { allItems, ancestorKeys, buildLevel, END_KEY, findItem, START_KEY } from "../src/tree.ts";
import type { Item, Level } from "../src/types.ts";
import { assertRunDetail, servedDemo } from "./testUtils/served-api.ts";

/**
 * The API contract between the backend data API and the viewer: the JSON apiMiddleware serves is checked against
 * the viewer types once, and the viewer functions then run on that parsed JSON without any cast. The demo run
 * comes from the fake model backend, so a cold start takes a few seconds.
 */
const DEMO_TIMEOUT_MS = 30_000;

type Demo = Awaited<ReturnType<typeof servedDemo>>;

let demo: Demo;

beforeAll(async () => {
  demo = await servedDemo();
}, DEMO_TIMEOUT_MS);

function itemAt(level: Level, key: string): Item {
  const item = level.items.find((candidate) => candidate.key === key);
  if (!item) {
    throw new Error(`no item ${key}`);
  }
  return item;
}

function demoLevel(): Level {
  return buildLevel(demo.workflows, "hello", "hello", ["hello"], demo.detail.report);
}

function docsAgent(): Item {
  const review = itemAt(buildLevel(demo.workflows, "hello"), "hello/review");
  if (review.kind !== "team") {
    throw new Error("hello/review is not a team");
  }
  const docs = review.inner.items.find((agent) => agent.agent.id === "docs");
  if (!docs) {
    throw new Error("the review team has no docs agent");
  }
  return docs;
}

test("the served run list, run detail, workflows, agents and config have the fields the viewer types declare", () => {
  expect(demo.runs).toHaveLength(1);
  expect(demo.detail.run.runId).toBe(demo.runs[0]?.runId);
  expect(demo.workflows.map((workflow) => workflow.name)).toContain("hello");
  expect(Object.keys(demo.agents).length).toBeGreaterThan(0);
});

test("graph tree: subgraph and team are groups, terminals wrap the root level", () => {
  const level = buildLevel(demo.workflows, "hello");
  expect(level.items.map((item) => item.key)).toEqual([START_KEY, "hello/plan", "hello/build", "hello/review", "hello/accountant", END_KEY]);
  const build = itemAt(level, "hello/build");
  expect(itemAt(level, "hello/review").kind).toBe("team");
  if (build.kind !== "subgraph") {
    throw new Error("hello/build is not a subgraph");
  }
  expect(build.inner.items.map((item) => item.key)).toEqual(["hello/build/implement", "hello/build/verify"]);
  expect(level.edges.some((edge) => edge.from === "hello/accountant" && edge.to === END_KEY), "accountant leads to END").toBe(true);
  expect(build.inner.edges.some((edge) => edge.to === END_KEY), "inner END is not drawn").toBe(false);
});

test("a group's cost is the sum of its child nodes", () => {
  const { report } = demo.detail;
  const build = itemAt(buildLevel(demo.workflows, "hello"), "hello/build");
  const childSum = (report.byNode["hello/build/implement"]?.costUsd ?? 0) + (report.byNode["hello/build/verify"]?.costUsd ?? 0);
  expect(costOf(build, report)?.costUsd).toBe(Math.round(childSum * 1e6) / 1e6);
});

test("an agent's cost comes from its own entry in the node report", () => {
  expect(costOf(docsAgent(), demo.detail.report)).toEqual(demo.detail.report.byNode["hello/review"]?.byAgent.docs);
});

test("an agent's ledger records are only its own", () => {
  expect(ledgerOf(docsAgent(), demo.detail.run)).toHaveLength(1);
});

test("a group's ledger records include its child nodes' records", () => {
  expect(ledgerOf(itemAt(buildLevel(demo.workflows, "hello"), "hello/build"), demo.detail.run)).toHaveLength(5);
});

test("run index gives the same cost, tier and failure as the per-node lookups", () => {
  const { report } = demo.detail;
  const run = { ...demo.detail.run, events: [...demo.detail.run.events, { at: "", type: "node_failed", node: "hello/build/implement", error: "boom" }] };
  const level = demoLevel();
  const index = buildRunIndex(level, demo.config, report, run);
  const items = allItems(level);
  expect(index.size, "one entry per drawn item, including agents and subgraph children").toBe(items.length);
  for (const item of items) {
    const entry = index.get(item.key);
    expect(entry?.cost, `cost of ${item.key}`).toEqual(costOf(item, report));
    expect(entry?.tier, `tier of ${item.key}`).toBe(tierOf(item, demo.config, report));
    expect(entry?.failure, `failure of ${item.key}`).toBe(failureOf(item, run));
  }
  expect(index.get("hello/build")?.failure, "a failure inside a subgraph marks the subgraph").toBe("boom");
  expect(index.get("hello/review#docs")?.tier).toBe("low");
});

test("the run index carries every item's run count and time of the demo run", () => {
  const level = demoLevel();
  const index = buildRunIndex(level, demo.config, demo.detail.report, demo.detail.run);
  for (const item of allItems(level)) {
    expect(index.get(item.key)?.runs, `run count of ${item.key}`).toBe(runCount(item, demo.detail.run, demo.detail.report));
    expect(index.get(item.key)?.timeMs, `time of ${item.key}`).toBe(timeSpent(item, demo.detail.report));
  }
  expect(index.get("hello/plan")?.runs).toBe(1);
  expect(index.get("hello/review#docs")?.runs, "an agent with ledger records but no agent_started event still counts its visit").toBe(1);
});

test("an agent, a subgraph child and a root step are found with their ancestors in the demo graph", () => {
  const level = demoLevel();
  expect(findItem(level, "hello/review#docs")?.kind).toBe("agent");
  expect(ancestorKeys(level, "hello/review#docs")).toEqual(["hello/review"]);
  expect(ancestorKeys(level, "hello/build/verify")).toEqual(["hello/build"]);
  expect(ancestorKeys(level, "hello/plan")).toEqual([]);
});

test("the supervisor ring shows the served verdict, cost and full text", () => {
  const ring = supervisorRing(demo.detail.report.supervisor ?? null);
  expect([ring.tone, ring.status]).toEqual(["ok", "ok"]);
  expect(ring.cost).toMatch(/^\$0\.\d{6}$/);
  expect(ring.headline).toMatch(/^bottleneck: hello\/\S+ · idea: none$/);
  expect(ring.text).toMatch(/^FACTS: /);
});

test("every askedBy in the shipped workflows reaches a drawn llm step", () => {
  const { workflows, agents } = demo;
  let checked = 0;
  for (const workflow of workflows) {
    const level = buildLevel(workflows, workflow.name);
    const items = new Map(allItems(level).map((item) => [item.key, item]));
    for (const [key, icon] of humanIcons(level, agents)) {
      if (icon.role !== "relays" || items.get(key)?.kind !== "step") {
        continue;
      }
      expect(icon.sources.length + icon.external.length, `${workflow.name}: ${key} names no step`).toBeGreaterThan(0);
      for (const sourcePath of icon.sources) {
        const source = items.get(sourcePath);
        expect(source && source.kind !== "terminal" && source.node.kind === "llm", `${workflow.name}: ${key} -> ${sourcePath}`).toBe(true);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThanOrEqual(45);
});

test("a run detail without a part the viewer reads fails the contract check with the field named", () => {
  const { passes: _passes, ...report } = demo.detail.report;
  expect(() => assertRunDetail({ ...demo.detail, report })).toThrow(/report\.passes is undefined, the viewer expects array/);
});
