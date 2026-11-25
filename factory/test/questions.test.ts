import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { questionsFile, readQuestions, recordAnswer, recordQuestion } from "../src/questions.ts";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-yaml-"));
fs.writeFileSync(path.join(dir, "check.yaml"), `
name: check
version: 1.0.0
entry: gate
roles: { worker: low }
nodes:
  - id: gate
    kind: llm
    role: worker
    turns: 1
    prompt: "Count the paths for {{goal}}"
  - id: ask-scope
    kind: interrupt
    askedBy: gate
    question: { id: q-scope, text: "Extend the budget for {{goal}}?", allowed: [extend, stop] }
edges:
  - { from: gate, to: ask-scope }
  - { from: ask-scope, to: END }
`);
fs.writeFileSync(path.join(dir, "main.yaml"), `
name: main
version: 1.0.0
entry: scope
nodes:
  - { id: scope, kind: subgraph, workflow: check }
  - { id: confirm, kind: interrupt, question: { id: q-confirm, text: "Merge it?" } }
edges:
  - { from: scope, to: confirm }
  - { from: confirm, to: END }
`);
process.env.FACTORY_WORKFLOWS_DIR = dir;

async function until(factory: any, runId: string, status: string) {
  for (let i = 0; i < 500; i++) {
    const run = factory.get(runId);
    if (run.status === status) return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`run did not reach ${status}: ${factory.get(runId).status}`);
}

test("the question store keeps the first ask of a question and its answer, and reads nothing before the first question", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-questions-"));
  assert.deepEqual(readQuestions(dataDir, "r-00000001"), []);
  assert.equal(fs.existsSync(questionsFile(dataDir)), false, "reading does not create the store");
  const asked = { runId: "r-00000001", questionId: "q-a", node: "main/ask", askedBy: ["main/gate"], text: "First text", allowed: ["yes", "no"], askedAt: "2026-11-17T10:00:00.000Z" };
  recordQuestion(dataDir, asked);
  recordQuestion(dataDir, { ...asked, text: "Asked again after a restart", askedAt: "2026-11-17T10:05:00.000Z" });
  recordQuestion(dataDir, { ...asked, runId: "r-00000002", text: "Other run" });
  recordAnswer(dataDir, "r-00000001", "q-a", "yes", "2026-11-17T10:06:00.000Z");
  recordAnswer(dataDir, "r-00000001", "q-a", "no", "2026-11-17T10:07:00.000Z");
  assert.deepEqual(readQuestions(dataDir, "r-00000001"), [{ ...asked, answer: "yes", answeredAt: "2026-11-17T10:06:00.000Z" }]);
  assert.equal(readQuestions(dataDir, "r-00000002")[0]?.answer, null);
});

test("a question passed on from several steps keeps all of them; one step stays a plain path, none stays empty", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-questions-"));
  const base = { runId: "r-00000001", node: "main/ask", text: "?", allowed: null, askedAt: "2026-11-17T10:00:00.000Z" };
  recordQuestion(dataDir, { ...base, questionId: "q-two", askedBy: ["main/violations", "main/merge"] });
  recordQuestion(dataDir, { ...base, questionId: "q-one", askedBy: ["main/gate"] });
  recordQuestion(dataDir, { ...base, questionId: "q-none", askedBy: [] });
  assert.deepEqual(readQuestions(dataDir, "r-00000001").map((q) => [q.questionId, q.askedBy]), [["q-two", ["main/violations", "main/merge"]], ["q-one", ["main/gate"]], ["q-none", []]]);
  const db = new DatabaseSync(questionsFile(dataDir), { readOnly: true });
  try {
    const raw = db.prepare("select question_id, asked_by from questions order by rowid").all() as { question_id: string; asked_by: string | null }[];
    assert.deepEqual(raw.map((r) => [r.question_id, r.asked_by]), [["q-two", '["main/violations","main/merge"]'], ["q-one", "main/gate"], ["q-none", null]], "a store written before lists reads the same");
  } finally {
    db.close();
  }
});

test("a run stores every question with its rendered text, the step that asks it, and the answer", async () => {
  process.env.FACTORY_TURN_DELAY_MS = "0";
  const { Factory } = await import("../src/engine.ts");
  const { createDataApi } = await import("../app/data.ts");
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-questions-"));
  const factory = new Factory(dataDir, { backend: "fake" });
  const { run } = factory.start("the login task", undefined, { workflow: "main" });
  factory.confirm(run.runId, { backend: { kind: "fake" } });
  await until(factory, run.runId, "waiting_for_user");
  const [first] = readQuestions(dataDir, run.runId);
  assert.deepEqual({ ...first, askedAt: typeof first?.askedAt }, { runId: run.runId, questionId: "q-scope", node: "main/scope/ask-scope", askedBy: ["main/scope/gate"], text: "Extend the budget for the login task?", allowed: ["extend", "stop"], askedAt: "string", answer: null, answeredAt: null });
  factory.answer(run.runId, "q-scope", "extend");
  await until(factory, run.runId, "waiting_for_user");
  factory.answer(run.runId, "q-confirm", "yes");
  await until(factory, run.runId, "done");
  const stored = readQuestions(dataDir, run.runId);
  assert.deepEqual(stored.map((q) => [q.questionId, q.node, q.askedBy, q.answer]), [
    ["q-scope", "main/scope/ask-scope", ["main/scope/gate"], "extend"],
    ["q-confirm", "main/confirm", [], "yes"],
  ]);
  assert.ok(stored.every((q) => q.answeredAt && q.answeredAt >= q.askedAt));
  const api = createDataApi({ factoryDir: path.join(import.meta.dirname, ".."), dataDir, configFile: path.join(import.meta.dirname, "..", "spec", "examples", "valid", "factory-config.json"), demo: false });
  assert.deepEqual(api.run(run.runId)?.questions, stored, "the viewer gets the questions with the run");

  const { viewerHandler } = await import("../src/viewer-routes.ts");
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const handle = viewerHandler({ viewerDir: dataDir, dataDir, factoryDir: path.join(import.meta.dirname, ".."), configFile: path.join(import.meta.dirname, "..", "spec", "examples", "valid", "factory-config.json"), allowedHosts: new Set([`127.0.0.1:${port}`]) });
  server.on("request", (req, res) => {
    if (!handle(req, res)) res.writeHead(404).end();
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/viewer/api/runs/${run.runId}`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { questions: unknown };
    assert.deepEqual(body.questions, stored, "the viewer server sends the stored questions over HTTP");
    const projects = await fetch(`http://127.0.0.1:${port}/viewer/api/projects`, { method: "POST", headers: { "content-type": "application/json", "x-factory-action": "projects" }, body: JSON.stringify({ action: "drop" }) });
    assert.equal(projects.status, 400, "the served viewer passes project actions to the API");
    assert.equal((await fetch(`http://127.0.0.1:${port}/viewer/api/workflows`, { method: "POST" })).status, 405, "other POSTs stay refused");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
