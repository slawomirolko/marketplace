// Interval watches, the builtin.exec operation and answering a run from the viewer.
// Hermetic: temp data dirs, a temp workflow, `node -e` as the watched command, and a
// stub cli executor. No network, no real model, no real GitHub.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Factory } from "../src/engine.ts";
import { hostExec } from "../src/cli-backend.ts";
import { checkWatch, knownProjects, projectsFile } from "../src/watch.ts";
import type { WatchSpec } from "../src/watch.ts";
import { apiMiddleware, createDataApi } from "../app/data.ts";

const workflows = fs.mkdtempSync(path.join(os.tmpdir(), "factory-watch-workflows-"));
fs.writeFileSync(path.join(workflows, "watched.yaml"), `
name: watched
version: 1.0.0
entry: ask
nodes:
  - id: ask
    kind: interrupt
    question: { id: q-watched, text: "Send {{input.artifact}}?", allowed: [ok, no] }
  - id: run-it
    kind: script
    op: builtin.exec
    with:
      command: ["{{node}}", "-e", "console.log(JSON.stringify({artifact: process.argv[1]}))", "{{input.artifact}}"]
      parse: json
  - id: fail-it
    kind: script
    op: builtin.exec
    with:
      command: ["{{node}}", "-e", "process.exit(3)"]
edges:
  - { from: ask, to: fail-it, when: 'ask.answer == "no"' }
  - { from: ask, to: run-it }
  - { from: run-it, to: END }
  - { from: fail-it, to: END }
`);
process.env.FACTORY_WORKFLOWS_DIR = workflows;

const stubCli = async () => ({ ok: true, text: "", turns: 1 });

function setup() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-watch-data-"));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "factory-watch-project-"));
  fs.writeFileSync(path.join(project, "marker"), "");
  fs.writeFileSync(path.join(project, "items.json"), JSON.stringify({ changed: [{ artifact: "skill:sample", hash: "aaa" }] }));
  fs.writeFileSync(projectsFile(dataDir), JSON.stringify({ dirs: [project] }));
  const factory = new Factory(dataDir, { backend: "delegate", executors: { exec: hostExec, opencode: stubCli as never } });
  return { dataDir, project, factory };
}

const watch: WatchSpec = {
  id: "sample",
  everyMinutes: 10,
  stableChecks: 2,
  command: ["{{node}}", "-e", "process.stdout.write(require('fs').readFileSync('items.json','utf8'))"],
  projectsWhen: "marker",
  items: "changed",
  skipWhen: ["rejected", "pending"],
  key: "{{item.artifact}}@{{item.hash}}",
  workflow: "watched",
  goal: "Send {{item.artifact}}",
  input: { project: "{{project}}", artifact: "{{item.artifact}}" },
  backend: { kind: "cli", cli: "opencode" },
};

async function until(factory: Factory, runId: string, statuses: string[]) {
  for (let i = 0; i < 500; i++) {
    const run = factory.get(runId);
    if (statuses.includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`run did not reach ${statuses.join("|")}: ${factory.get(runId).status}`);
}

function items(project: string, changed: unknown[]) {
  fs.writeFileSync(path.join(project, "items.json"), JSON.stringify({ changed }));
}

test("a watch starts one run only after the item stayed the same for stableChecks checks, and never twice", async () => {
  const { dataDir, project, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  assert.deepEqual(await checkWatch(watch, context), [], "first sight is not stable yet");
  const started = await checkWatch(watch, context);
  assert.equal(started.length, 1);
  const run = await until(factory, started[0]!, ["waiting_for_user"]);
  assert.equal(run.pendingQuestion?.id, "q-watched");
  assert.deepEqual(run.pendingQuestion?.allowed, ["ok", "no"]);
  assert.equal(run.input?.project, project);
  assert.equal(run.config?.backend.kind, "cli");
  assert.deepEqual(await checkWatch(watch, context), [], "the same item never starts a second run");
});

test("a watch resets the count when the item changes, and skips items marked by skipWhen", async () => {
  const { dataDir, project, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  items(project, [{ artifact: "skill:sample", hash: "bbb" }]);
  assert.deepEqual(await checkWatch(watch, context), [], "a changed hash is a new item: not stable yet");
  assert.equal((await checkWatch(watch, context)).length, 1);

  items(project, [{ artifact: "skill:other", hash: "ccc", rejected: true }, { artifact: "skill:third", hash: "ddd", pending: { pr: 7 } }]);
  await checkWatch(watch, context);
  assert.deepEqual(await checkWatch(watch, context), [], "rejected and pending items never start a run");
});

test("a watch ignores projects without the marker file and survives a failing command", async () => {
  const { dataDir, project, factory } = setup();
  fs.rmSync(path.join(project, "marker"));
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  assert.deepEqual(await checkWatch(watch, context), []);

  fs.writeFileSync(path.join(project, "marker"), "");
  const logs: string[] = [];
  const failing = { ...watch, command: ["{{node}}", "-e", "process.exit(4)"] };
  assert.deepEqual(await checkWatch(failing, { ...context, log: (m: string) => logs.push(m) }), []);
  assert.match(logs.join("\n"), /exit 4/);
  assert.equal(logs.join("\n").includes(project), false, "the log never names the project path");
});

test("known projects come from projects.json and from every run's input.project", () => {
  const { dataDir, project, factory } = setup();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "factory-watch-other-"));
  const { run } = factory.start("goal", undefined, { workflow: "watched", input: { project: other } });
  assert.ok(run.runId);
  assert.deepEqual(knownProjects(dataDir), [path.resolve(other), project].sort());
});

function call(api: ReturnType<typeof createDataApi>, method: string, url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    void apiMiddleware(api)({ method, url, headers }, { writeHead: (status) => ({ end: (body: string) => resolve({ status, body: JSON.parse(body) }) }) }, () => resolve({ status: 404, body: null }));
  });
}

test("the viewer lists and answers only runs of its own process, and only with its own request", async () => {
  const { dataDir, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  const [runId] = await checkWatch(watch, context);
  await until(factory, runId!, ["waiting_for_user"]);
  const api = createDataApi({ factoryDir: path.join(import.meta.dirname, ".."), dataDir, configFile: path.join(import.meta.dirname, "..", "config", "factory.yaml"), demo: false, factory });

  const pending = await call(api, "GET", "/api/pending");
  assert.equal(pending.status, 200);
  assert.deepEqual((pending.body as { runId: string; allowed: string[] }[]).map((p) => [p.runId, p.allowed]), [[runId, ["ok", "no"]]]);

  const url = `/api/runs/${runId}/answer?question=q-watched&answer=ok`;
  assert.equal((await call(api, "POST", url)).status, 403, "no action header: rejected");
  assert.equal((await call(api, "POST", url, { "x-factory-action": "answer", origin: "https://evil.example" })).status, 403, "foreign origin: rejected");
  assert.equal((await call(api, "POST", `/api/runs/${runId}/answer?question=q-watched&answer=maybe`, { "x-factory-action": "answer" })).status, 409, "an answer outside allowed is refused");
  const answered = await call(api, "POST", url, { "x-factory-action": "answer", origin: "http://127.0.0.1:7340" });
  assert.equal(answered.status, 200);
  assert.deepEqual(answered.body, []);
  const done = await until(factory, runId!, ["done", "failed"]);
  assert.equal(done.status, "done");
  assert.deepEqual((done.state?.["run-it"] as { json: unknown }).json, { artifact: "skill:sample" }, "builtin.exec parsed the command's JSON");

  const foreign = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-watch-foreign-")), { backend: "delegate" });
  const noFactory = createDataApi({ factoryDir: path.join(import.meta.dirname, ".."), dataDir, configFile: path.join(import.meta.dirname, "..", "config", "factory.yaml"), demo: false, factory: foreign });
  assert.equal((await call(noFactory, "POST", url, { "x-factory-action": "answer" })).status, 409, "a run of another process cannot be answered here");
});

test("builtin.exec fails the run on an exit code outside okCodes", async () => {
  const { dataDir, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  const [runId] = await checkWatch(watch, context);
  await until(factory, runId!, ["waiting_for_user"]);
  factory.answer(runId!, "q-watched", "no");
  const run = await until(factory, runId!, ["done", "failed"]);
  assert.equal(run.status, "failed");
});
