import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { z } from "zod";
import { expandWorkflowDir, loadWorkflowDir } from "../src/workflow-yaml.ts";
import { stateReferenceErrors } from "../src/state-refs.ts";
import { contractJson, missingField, OPERATION_CONTRACTS } from "../src/contract.ts";

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
  - { id: check, kind: llm, role: writer, parse: { line: [marker, url, branch, commit] }, prompt: "Draft {{state.draft.text}}, ok {{state.check.check.url}}, wrong {{state.check.consistency.url}}, field {{state.check.check.verdict}}" }
  - { id: ask, kind: interrupt, question: { id: q-a, text: "{{state.ask.answer}} {{state.ask.reason}} {{state.gone.text}} {{#each.state.lost}}{{key}}{{/each.state.lost}}" } }
edges:
  - { from: draft, to: check }
  - { from: check, to: ask, when: 'check.check.url == "u" || gone.text == null' }
  - { from: check, to: END }
  - { from: ask, to: END }
`,
  });
  const errors = stateReferenceErrors(expandWorkflowDir(dir).get("main")!);
  assert.deepEqual(errors, [
    "main: check prompt reads state.draft.text: draft has no parse:, so it stores nothing in state",
    "main: check prompt reads state.check.consistency.url: check stores results by agent id (check), not consistency",
    'main: check prompt reads state.check.check.verdict: parser {"line":["marker","url","branch","commit"]} does not set verdict',
    "main: ask question reads state.ask.reason: ask is a question; it sets only answer",
    "main: ask question reads state.gone.text: no step gone in this scope sets state",
    "main: ask question reads state.lost: no step lost in this scope sets state",
    "main: check edge to ask (when) reads gone.text: no step gone in this scope sets state",
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

test("a stop reason and a workspace template are checked like prompts", () => {
  const dir = workflowDir({
    "main.yaml": `
name: main
version: 1.0.0
entry: create
roles: { worker: low }
nodes:
  - { id: create, kind: llm, role: worker, prompt: "Create.", parse: { json: [path] }, workspace: "{{state.create.create.dir}}" }
  - { id: stop, kind: script, op: builtin.stop, with: { reason: "stopped in {{state.create.create.path}} and {{state.gone.x}}" } }
edges:
  - { from: create, to: stop }
  - { from: stop, to: END }
`,
  });
  assert.deepEqual(stateReferenceErrors(expandWorkflowDir(dir).get("main")!), [
    'main: create workspace reads state.create.create.dir: parser {"json":["path"]} does not set dir',
    "main: stop with.reason reads state.gone.x: no step gone in this scope sets state",
  ]);
});

test("the contract describes every operation that declares fields and walks object, array and string fields", () => {
  const chunks = z.object({ chunks: z.array(z.object({ title: z.string(), files: z.array(z.string()) })) });
  assert.equal(missingField(chunks, ["chunks", "0", "files", "length"]), null);
  assert.equal(missingField(chunks, ["chunks", "0", "title", "length"]), null);
  assert.equal(missingField(chunks, ["chunks", "0", "owner"]), "chunks.0.owner");
  assert.equal(missingField(chunks, ["chunks", "first"]), "chunks.first");
  const json = contractJson();
  assert.deepEqual(Object.keys(json.operations).sort(), Object.keys(OPERATION_CONTRACTS).sort());
  assert.equal((json.operations["builtin.gate"] as { type: string }).type, "object");
});
