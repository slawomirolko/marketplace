import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflowSpecs } from "../src/workflow-yaml.ts";
import { marketplaceDir } from "../src/marketplace-agents.ts";
import { standaloneNames } from "../src/standalone.ts";

const workflows = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows");

test("standalone workflows are the entry workflows of agents a user can start", () => {
  const names = [...standaloneNames(loadWorkflowSpecs(workflows), marketplaceDir())].sort();
  assert.deepEqual(names, ["olko-claude-sync", "olko-implementation", "olko-marketplace-skill-sync", "olko-plan-documentation", "olko-review"]);
});
