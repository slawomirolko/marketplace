// Interval watches, the builtin.exec operation and answering a run from the viewer.
// Hermetic: temp data dirs, a temp workflow, `node -e` as the watched command, and a
// stub cli executor. No network, no real model, no real GitHub.
import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ALLOWED_HOSTS, callerFor } from "./helpers/data-api.ts";
import { runReaches } from "./helpers/poll.ts";
import { tempDir } from "./helpers/temp.ts";
import { Factory } from "../src/engine.ts";
import { hostExec } from "../src/cli-backend.ts";
import { checkWatch, knownProjects, knownProjectsFile, startWatches } from "../src/watch.ts";
import { addProject, projectsFile } from "../src/projects.ts";
import type { WatchSpec } from "../src/types.ts";
import { apiMiddleware, createDataApi } from "../src/viewer-data.ts";

const workflows = tempDir("factory-watch-workflows-");
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
process.env.FACTORY_PROJECTS_FILE = path.join(tempDir("factory-watch-registry-"), "projects.json");

const stubCli = async () => ({ ok: true, text: "", turns: 1 });

function setup() {
  const dataDir = tempDir("factory-watch-data-");
  const project = tempDir("factory-watch-project-");
  fs.writeFileSync(path.join(project, "marker"), "");
  fs.writeFileSync(path.join(project, "items.json"), JSON.stringify({ changed: [{ artifact: "skill:sample", hash: "aaa" }] }));
  fs.writeFileSync(knownProjectsFile(dataDir), JSON.stringify({ dirs: [project] }));
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

function items(project: string, changed: unknown[]) {
  fs.writeFileSync(path.join(project, "items.json"), JSON.stringify({ changed }));
}

test("a watch starts one run only after the item stayed the same for stableChecks checks, and never twice", async () => {
  const { dataDir, project, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  assert.deepEqual(await checkWatch(watch, context), [], "first sight is not stable yet");
  const started = await checkWatch(watch, context);
  assert.equal(started.length, 1);
  const run = await runReaches(factory, started[0]!, ["waiting_for_user"]);
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

/** Folders compared by their resolved path, in sorted order, whichever side produced them. */
function resolvedDirs(dirs: string[]): string[] {
  return dirs.map((dir) => path.resolve(dir)).sort();
}

test("known projects come from projects.json and from every run's input.project", () => {
  const { dataDir, project, factory } = setup();
  const other = tempDir("factory-watch-other-");
  const { run } = factory.start("goal", undefined, { workflow: "watched", input: { project: other } });
  assert.ok(run.runId);
  assert.deepEqual(resolvedDirs(knownProjects(dataDir)), resolvedDirs([other, project]));
});

test("known projects also come from the project registry, wherever it lives", () => {
  const { dataDir, project } = setup();
  fs.rmSync(knownProjectsFile(dataDir));
  const registered = tempDir("factory-watch-registered-");
  addProject({ path: registered });
  try {
    assert.notEqual(path.dirname(projectsFile()), dataDir, "the registry is not in the data directory");
    assert.deepEqual(resolvedDirs(knownProjects(dataDir)), resolvedDirs([registered]));
  } finally {
    fs.rmSync(projectsFile(), { force: true });
  }
});

test("a run the watch cannot confirm is cancelled, the other items still start and the counts are kept", async () => {
  const { dataDir, project } = setup();
  items(project, [{ artifact: "skill:first", hash: "aaa" }, { artifact: "skill:second", hash: "bbb" }]);
  const noOpencode = new Factory(dataDir, { backend: "delegate", executors: { exec: hostExec } });
  const logs: string[] = [];
  const context = { factory: noOpencode, dataDir, marketplace: dataDir, exec: hostExec, log: (message: string) => logs.push(message) };
  await checkWatch(watch, context);
  assert.deepEqual(await checkWatch(watch, context), [], "no run could be confirmed");
  const runs = [...noOpencode.runs.values()];
  assert.equal(runs.length, 2, "the first failure does not stop the loop");
  assert.deepEqual(runs.map((run) => run.status), ["cancelled", "cancelled"]);
  assert.match(logs.join(" "), /could not confirm run .*no executor for cli backend 'opencode'/);
  const state = JSON.parse(fs.readFileSync(path.join(dataDir, "watches", `${watch.id}.json`), "utf8")) as { seen: Record<string, number> };
  assert.deepEqual(Object.values(state.seen), [2, 2], "the counts of this check are saved");
});

test("starting the watches logs which watches run, or that none do", () => {
  const { dataDir, factory } = setup();
  const logs: string[] = [];
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec, log: (message: string) => logs.push(message) };
  startWatches([], context)();
  startWatches([{ ...watch, projectsWhen: "no-such-marker" }], context)();
  assert.deepEqual(logs.slice(0, 2), ["watches: none started", "watches: sample every 10 min"]);
});

/**
 * Calls the data API through the shared request double, which delivers request events like the HTTP server and
 * rejects when the middleware throws, so a failing middleware fails the test instead of leaving it waiting.
 */
function call(api: ReturnType<typeof createDataApi>, method: string, url: string, headers: Record<string, string> = {}) {
  return callerFor(apiMiddleware(api, ALLOWED_HOSTS))(method, url, { headers });
}

test("the viewer lists and answers only runs of its own process, and only with its own request", async () => {
  const { dataDir, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  const [runId] = await checkWatch(watch, context);
  await runReaches(factory, runId!, ["waiting_for_user"]);
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
  const done = await runReaches(factory, runId!, ["done", "failed"]);
  assert.equal(done.status, "done");
  assert.deepEqual((done.state?.["run-it"] as { json: unknown }).json, { artifact: "skill:sample" }, "builtin.exec parsed the command's JSON");

  const foreign = new Factory(tempDir("factory-watch-foreign-"), { backend: "delegate" });
  const noFactory = createDataApi({ factoryDir: path.join(import.meta.dirname, ".."), dataDir, configFile: path.join(import.meta.dirname, "..", "config", "factory.yaml"), demo: false, factory: foreign });
  assert.equal((await call(noFactory, "POST", url, { "x-factory-action": "answer" })).status, 409, "a run of another process cannot be answered here");
});

test("builtin.exec fails the run on an exit code outside okCodes", async () => {
  const { dataDir, factory } = setup();
  const context = { factory, dataDir, marketplace: dataDir, exec: hostExec };
  await checkWatch(watch, context);
  const [runId] = await checkWatch(watch, context);
  await runReaches(factory, runId!, ["waiting_for_user"]);
  factory.answer(runId!, "q-watched", "no");
  const run = await runReaches(factory, runId!, ["done", "failed"]);
  assert.equal(run.status, "failed");
});
