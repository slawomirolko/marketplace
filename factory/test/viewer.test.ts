import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../src/spec.ts";
import { WORKFLOW } from "../src/engine.ts";
import type { WorkflowSpec } from "../src/types.ts";
import { toMermaid, escapeLabel } from "../viewer/mermaid.ts";
import type { DiagramConfig } from "../viewer/mermaid.ts";
import { loadWorkflows, toHtml } from "../viewer/render.ts";
import { fakeRunReport } from "../viewer/demo-report.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflows = loadWorkflows(path.join(factoryDir, "workflows"));
const config = JSON.parse(fs.readFileSync(path.join(factoryDir, "spec", "examples", "valid", "factory-config.json"), "utf8")) as DiagramConfig;

function leafPaths(name: string, prefix = name): string[] {
  const workflow = workflows.find((w) => w.name === name);
  if (!workflow) throw new Error(`workflow ${name} not found`);
  return workflow.nodes.flatMap((n) => (n.kind === "subgraph" && n.workflow ? leafPaths(n.workflow, `${prefix}/${n.id}`) : [`${prefix}/${n.id}`]));
}

test("workflow files are valid against the workflow schema", () => {
  for (const workflow of workflows) assert.deepEqual(validate("workflow", workflow), { valid: true, errors: [] }, workflow.name);
});

test("hello workflow file matches the node paths the engine runs", () => {
  assert.deepEqual(leafPaths("hello"), WORKFLOW.nodes.map((n) => n.path));
});

test("node costs in the report add up to the run cost", async () => {
  const report = await fakeRunReport();
  const close = (values: number[], label: string) => {
    const sum = values.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - report.cost.costUsd) <= values.length * 1e-6, `${label}: ${sum} vs ${report.cost.costUsd}`);
  };
  close(Object.values(report.byNode).map((n) => n.costUsd), "nodes");
  close(Object.values(report.byTier), "tiers");
  for (const node of Object.values(report.byNode)) assert.ok(node.costSource, "every node has a cost source");
});

test("diagram of a run shows cost, tier and model on every node", async () => {
  const report = await fakeRunReport();
  const diagram = toMermaid({ workflows, root: "hello", config, report });
  for (const [nodePath, cost] of Object.entries(report.byNode)) {
    const id = `n_${nodePath.split("/").slice(1).join("__")}`;
    const line = diagram.split("\n").find((l) => l.trim().startsWith(id));
    assert.ok(line, `node ${nodePath} drawn`);
    assert.match(line, new RegExp(`\\$${cost.costUsd.toFixed(6).replace(".", "\\.")} · ${cost.tokens} tok`));
  }
  assert.match(diagram, /planner → high · fake-high/);
  assert.match(diagram, /subgraph n_build\["build · subgraph hello-build · \$/);
  assert.doesNotMatch(diagram, /not run/);
});

test("unknown cost is shown as unknown, not as zero", () => {
  const report = { runId: "r-1", status: "done", cost: { costUsd: 0, budgetUsd: 1 }, tierModels: {}, byNode: { "hello/plan": { steps: 1, tokens: 900, costUsd: 0, tier: "high", model: "m", costSource: "unknown" } } };
  const diagram = toMermaid({ workflows, root: "hello", config, report });
  assert.match(diagram, /\$ unknown · 900 tok/);
  assert.match(diagram, /class n_plan costUnknown/);
  assert.match(diagram, /hello-build · not run/);
});

test("structure-only diagram of the spec example marks missing subgraphs and escapes conditions", () => {
  const examples = loadWorkflows(path.join(factoryDir, "spec", "examples", "valid")).filter((w) => w.nodes);
  const diagram = toMermaid({ workflows: examples, root: "feature", config });
  assert.match(diagram, /n_build\[\["build · subgraph test-fix-loop \(not found\)"\]\]/);
  assert.match(diagram, /n_approve_plan\{\{/);
  assert.match(diagram, /-->\|"review\.findings #gt; 0"\| n_build/);
  assert.doesNotMatch(diagram, /\$/);
});

test("a subgraph that includes itself is drawn once and marked as a cycle", () => {
  const loop: WorkflowSpec = { name: "loop", version: "0.1.0", entry: "again", nodes: [{ id: "again", kind: "subgraph", workflow: "loop" }], edges: [{ from: "again", to: "END" }] };
  assert.match(toMermaid({ workflows: [loop], root: "loop" }), /again · subgraph loop \(cycle\)/);
});

test("labels and the embedded diagram cannot break out of their context", () => {
  assert.equal(escapeLabel('a "b" <c> & d'), "a #quot;b#quot; #lt;c#gt; #amp; d");
  const html = toHtml("graph </script><script>alert(1)</script>", "t", null);
  assert.doesNotMatch(html, /<\/script><script>alert/);
});
