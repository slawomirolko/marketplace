import "./helpers/isolated-home.ts";
import "./helpers/no-turn-delay.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tempDir } from "./helpers/temp.ts";

const AGENTS = ["olko-review-bugs-lens", "olko-review-dotnet-lens", "olko-review-python-lens", "olko-review-react-lens", "olko-review-verifier"];
const IDS = ["first", "second", "third", "fourth", "optional"];

function node(id: string, agent: string): string {
  return [
    `  - id: ${id}`,
    `    kind: llm`,
    `    agent: ${agent}`,
    `    role: wiring`,
    `    prompt: |`,
    `      This is a factory wiring test. Do not review anything and do not use tools. Reply with exactly one word: OK`,
  ].join("\n");
}

const YAML = [
  "name: yaml-only-agents",
  "version: 1.0.0",
  "roles: { wiring: low }",
  "entry: first",
  "nodes:",
  ...IDS.map((id, index) => node(id, AGENTS[index]!)),
  "edges:",
  "  - { from: first, to: second }",
  "  - { from: second, to: third }",
  "  - { from: third, to: fourth }",
  "  - { from: fourth, to: optional, when: 'switches.optional == true' }",
  "  - { from: fourth, to: END }",
  "  - { from: optional, to: END }",
  "",
].join("\n");

const workflowsDir = tempDir("yaml-only-workflows-");
fs.writeFileSync(path.join(workflowsDir, "yaml-only-agents.yaml"), YAML);
process.env.FACTORY_WORKFLOWS_DIR = workflowsDir;
const { Factory } = await import("../src/engine.ts");
const { cliExecutor } = await import("../src/cli-backend.ts");

test("a YAML of five marketplace agents runs its four mandatory agents and skips the switched-off one, with no workflow code", { timeout: 900_000 }, async () => {
  const model = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
  const dataDir = tempDir("yaml-only-data-");
  fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
  const factory = new Factory(dataDir, { executors: { claude: cliExecutor("claude") }, backend: "cli", cli: "claude" });

  const { run } = factory.start("prove that YAML alone drives the agents", undefined, { workflow: "yaml-only-agents", input: { switches: { optional: false } } });
  factory.confirm(run.runId, { backend: { kind: "cli", cli: "claude" }, tierModels: { low: model, medium: model, high: model }, budget: { maxCostUsd: 2 } });

  let current = factory.get(run.runId);
  const deadline = Date.now() + 840_000;
  while (current.status === "running" && Date.now() < deadline) current = (await factory.waitForChange(run.runId, 30_000)).run;
  await factory.supervising.get(run.runId);

  assert.equal(current.status, "done", JSON.stringify(current.events.filter((e) => /failed/.test(e.type))));
  const called = current.ledger.filter((r) => r.kind === "llm" && r.nodePath.startsWith("yaml-only-agents/"));
  const calledNodes = [...new Set(called.map((r) => r.nodePath))];
  assert.deepEqual(calledNodes, ["yaml-only-agents/first", "yaml-only-agents/second", "yaml-only-agents/third", "yaml-only-agents/fourth"]);
  assert.deepEqual([...new Set(called.map((r) => r.agentName))], AGENTS.slice(0, 4));
  for (const record of called) {
    assert.equal(record.backend, "cli:claude");
    assert.ok((record.outputTokens ?? 0) > 0, `${record.nodePath} produced no output tokens`);
  }
  assert.equal(current.events.some((e) => e.node === "yaml-only-agents/optional" && e.type === "node_started"), false);
});
