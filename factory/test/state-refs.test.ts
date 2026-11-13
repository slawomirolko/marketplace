import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { expandWorkflowDir, loadWorkflowDir } from "../src/workflow-yaml.ts";
import { stateReferenceErrors } from "../src/state-refs.ts";
import { contractJson, missingField, PARSER_CONTRACTS } from "../src/contract.ts";
import { PARSERS } from "../src/ops.ts";
import { WFSYNC_PARSERS } from "../src/wfsync-ops.ts";

function workflowDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "state-refs-"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test("a reference to a field no step sets is reported with the reason", () => {
  const dir = workflowDir({
    "main.yaml": `
name: main
version: 1.0.0
entry: draft
roles: { writer: low }
nodes:
  - { id: draft, kind: llm, role: writer, prompt: "Write." }
  - { id: check, kind: llm, role: writer, parse: plan.consistency, prompt: "Draft {{state.draft.text}}, ok {{state.check.check.pass}}, wrong {{state.check.consistency.pass}}, field {{state.check.check.verdict}}" }
  - { id: ask, kind: interrupt, question: { id: q-a, text: "{{state.ask.answer}} {{state.ask.reason}} {{state.gone.text}}" } }
edges:
  - { from: draft, to: check }
  - { from: check, to: ask, when: "check.check.pass == true" }
  - { from: check, to: END }
  - { from: ask, to: END }
`,
  });
  const errors = stateReferenceErrors(expandWorkflowDir(dir).get("main")!);
  assert.deepEqual(errors, [
    "main: check prompt reads state.draft.text: draft has no parse:, so it stores nothing in state",
    "main: check prompt reads state.check.consistency.pass: check stores results by agent id (check), not consistency",
    "main: check prompt reads state.check.check.verdict: parser plan.consistency does not set verdict",
    "main: ask question reads state.ask.reason: ask is a question; it sets only answer",
    "main: ask question reads state.gone.text: no step gone in this scope sets state",
  ]);
});

test("a step inside a switched subgraph reads its own state by its unprefixed id", () => {
  const files = {
    "editor.yaml": `
name: editor-steps
version: 1.0.0
entry: ask-editor
nodes:
  - { id: ask-editor, kind: interrupt, question: { id: q-editor, text: "Open?", allowed: [yes, no] } }
  - { id: open, kind: script, op: builtin.pass }
edges:
  - { from: ask-editor, to: open, when: 'ask-editor.answer == "yes"' }
  - { from: ask-editor, to: END }
  - { from: open, to: END }
`,
    "main.yaml": `
name: main
version: 1.0.0
entry: editor
nodes:
  - { id: editor, kind: subgraph, workflow: editor-steps, enabledWhen: "switches.editor == true" }
  - { id: done, kind: script, op: builtin.pass }
edges:
  - { from: editor, to: done }
  - { from: done, to: END }
`,
  };
  const dir = workflowDir(files);
  const main = loadWorkflowDir(dir).get("main")!;
  assert.equal(main.nodes.find((n) => n.id === "editor/ask-editor")!.localId, "ask-editor");
  assert.deepEqual(stateReferenceErrors(expandWorkflowDir(dir).get("main")!), []);
  const clash = workflowDir({ ...files, "main.yaml": files["main.yaml"].replace("{ id: done,", "{ id: open,").replace(/to: done/g, "to: open").replace("from: done", "from: open") });
  assert.throws(() => loadWorkflowDir(clash), /step open is used twice/);
});

test("the contract describes every parser and walks object, array and string fields", () => {
  assert.equal(missingField(PARSER_CONTRACTS["plan.draft"]!, ["feature", "criteria", "length"]), null);
  assert.equal(missingField(PARSER_CONTRACTS["plan.draft"]!, ["questions", "0", "length"]), null);
  assert.equal(missingField(PARSER_CONTRACTS["plan.draft"]!, ["feature", "owner"]), "feature.owner");
  assert.equal(missingField(PARSER_CONTRACTS["impl.chunks"]!, ["chunks", "first"]), "chunks.first");
  assert.deepEqual(Object.keys(PARSER_CONTRACTS).sort(), [...Object.keys(PARSERS), ...Object.keys(WFSYNC_PARSERS)].sort());
  const json = contractJson();
  assert.deepEqual(Object.keys(json.parsers).sort(), Object.keys(PARSER_CONTRACTS).sort());
  assert.equal((json.parsers["sync.prLine"] as { type: string }).type, "object");
});
