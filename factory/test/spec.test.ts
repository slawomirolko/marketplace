import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { tempDir } from "./helpers/temp.ts";
import { validate } from "../src/spec.ts";
import { DEFAULT_MEMORY_LAYER, loadFactoryConfig } from "../src/config.ts";

const examplesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec", "examples");
const read = (kind: string, file: string) => JSON.parse(fs.readFileSync(path.join(examplesDir, kind, file), "utf8"));
const schemaFor = (file: string) => ["factory-config", "workflow", "usage-record", "cost-footer"].find((s) => file.startsWith(s)) ?? "";

for (const file of fs.readdirSync(path.join(examplesDir, "valid"))) {
  test(`valid example passes: ${file}`, () => {
    const result = validate(schemaFor(file), read("valid", file));
    assert.deepEqual(result.errors, []);
  });
}

for (const file of fs.readdirSync(path.join(examplesDir, "invalid"))) {
  test(`invalid example is rejected: ${file}`, () => {
    assert.equal(validate(schemaFor(file), read("invalid", file)).valid, false);
  });
}

test("config rejects a role mapped to a tier that is not declared", () => {
  const config = read("valid", "factory-config.json");
  config.roles.planner = "premium";
  assert.match(validate("factory-config", config).errors.join(), /unknown tier 'premium'/);
});

test("config rejects an api backend that would hold a literal key", () => {
  const config = read("valid", "factory-config.json");
  config.backends = [{ id: "direct-api", kind: "api", protocol: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY", apiKey: "literal" }];
  assert.equal(validate("factory-config", config).valid, false);
});

test("config names the memory-layer skill, olko-memory-layer when it is left out", () => {
  const dir = tempDir("factory-config-");
  const write = (name: string, config: object) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(config));
    return file;
  };
  const config = read("valid", "factory-config.json");
  assert.equal(DEFAULT_MEMORY_LAYER, "olko-memory-layer");
  assert.equal(loadFactoryConfig(write("default.json", config)).memoryLayer, "olko-memory-layer");
  assert.equal(loadFactoryConfig(write("custom.json", { ...config, memoryLayer: "team-memory" })).memoryLayer, "team-memory");
  assert.equal(validate("factory-config", { ...config, memoryLayer: "olko-sync:olko-sync-state" }).valid, true, "a plugin skill name is allowed");
  assert.throws(() => loadFactoryConfig(write("bad.json", { ...config, memoryLayer: "Memory Layer" })), /memoryLayer/);
});

test("the shipped factory config attaches the marketplace memory skill", () => {
  assert.equal(loadFactoryConfig().memoryLayer, "olko-memory-layer");
});

test("workflow rejects edges to unknown nodes and a missing END", () => {
  const workflow = read("valid", "workflow-feature.json");
  workflow.edges = [{ from: "plan", to: "nowhere" }];
  const { errors } = validate("workflow", workflow);
  assert.ok(errors.some((e) => e.includes("unknown node 'nowhere'")));
  assert.ok(errors.some((e) => e.includes("no edge reaches END")));
});

test("workflow rejects two edges between the same nodes", () => {
  const workflow = read("valid", "workflow-feature.json");
  workflow.edges.push({ from: "review", to: "build", when: "review.blocking > 0" });
  const { valid, errors } = validate("workflow", workflow);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("more than one edge review->build")), errors.join("; "));
});

test("workflow accepts isolate only on an llm node that lists its own dirs", () => {
  const workflow = read("valid", "workflow-feature.json");
  const plan = workflow.nodes.find((node: { id: string }) => node.id === "plan");
  Object.assign(plan, { isolate: true, dirs: ["/work"] });
  assert.deepEqual(validate("workflow", workflow).errors, []);
  delete plan.dirs;
  assert.ok(validate("workflow", workflow).errors.some((e) => e.includes("node 'plan' sets isolate without dirs")));
  const approve = workflow.nodes.find((node: { id: string }) => node.id === "approve-plan");
  Object.assign(plan, { dirs: ["/work"] });
  Object.assign(approve, { isolate: true });
  assert.ok(validate("workflow", workflow).errors.some((e) => e.includes("node 'approve-plan' sets isolate but is not an llm node")));
});

test("usage record for a script step must cost exactly 0 and be measured", () => {
  const record = { ...read("valid", "usage-record-delegate.json"), kind: "script", tier: null, model: null, costUsd: 0.01, costSource: "measured", tokens: { input: 0, output: 0 } };
  assert.equal(validate("usage-record", record).valid, false);
  assert.equal(validate("usage-record", { ...record, costUsd: 0 }).valid, true);
});

test("cost footer always declares it covers only the factory run", () => {
  const footer = read("valid", "cost-footer.json");
  assert.equal(validate("cost-footer", { ...footer, scope: "session" }).valid, false);
});
