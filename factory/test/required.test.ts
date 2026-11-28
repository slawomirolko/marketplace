import test from "node:test";
import assert from "node:assert/strict";
import { operationNamed } from "../src/ops.ts";

test("a required step that a switch turns off is reported as a warning", async () => {
  const gate = operationNamed("builtin.gate")!;
  const off = await gate({ state: {}, input: { switches: { obsidian: false } }, args: { subgraph: "olko-impl-obsidian", when: "switches.obsidian == true", required: true } } as never);
  assert.equal(off.metrics?.requiredOff, 1);
  assert.match(String(off.output), /required step switched off/);
  const on = await gate({ state: {}, input: { switches: { obsidian: true } }, args: { subgraph: "olko-impl-obsidian", when: "switches.obsidian == true", required: true } } as never);
  assert.equal(on.metrics?.requiredOff, 0);
  const plain = await gate({ state: {}, input: { switches: { tracker: false } }, args: { subgraph: "olko-impl-tracker-task", when: "switches.tracker == true" } } as never);
  assert.doesNotMatch(String(plain.output), /required/);
});
