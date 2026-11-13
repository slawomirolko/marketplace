import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import { marketplaceDir } from "../src/marketplace-agents.ts";
import { standaloneNames, workflowsThatRan } from "../src/standalone.ts";

const workflows = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows");

test("standalone workflows are the entry workflows of agents a user can start", () => {
  const names = [...standaloneNames(loadWorkflowSpecs(workflows), marketplaceDir())].sort();
  assert.deepEqual(names, ["olko-claude-sync", "olko-implementation", "olko-marketplace-skill-sync", "olko-plan-documentation", "olko-review", "olko-workflow-sync"]);
});

test("only the workflows whose steps started count as run", () => {
  const specs = loadWorkflowSpecs(workflows);
  const started = ["olko-implementation/task", "olko-implementation/workers", "olko-implementation/checks/style", "olko-implementation/review/route", "olko-implementation/review/lenses"];
  const ran = workflowsThatRan(specs, "olko-implementation", started);
  assert.deepEqual(ran, ["olko-impl-checks", "olko-impl-entry", "olko-impl-preflight", "olko-review", "olko-review-findings"]);
  assert.equal(ran.includes("olko-plan-documentation"), false);
});

test("a source change reaches every file of the workflows that contain it", async () => {
  const { workflowFamily } = await import("../src/wfsync-ops.ts");
  const family = workflowFamily(loadWorkflowSpecs(workflows), ["olko-plan-tracker-publish"]);
  for (const name of ["olko-plan-tracker-publish", "olko-plan-discovery", "olko-plan-documentation", "olko-implementation"]) assert.ok(family.includes(name), name);
  assert.equal(family.includes("olko-claude-sync"), false);
});
