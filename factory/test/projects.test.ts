import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "factory-projects-home-"));
process.env.FACTORY_HOME_DIR = home;

const { addProject, addRoot, discoverProjects, listProjects, projectById, projectInput, projectScopedInput, projectsAction, projectsCli, projectsFile, readRegistry, removeProject, removeRoot, suggestId } = await import("../src/projects.ts");
const { apiMiddleware, createDataApi, parseProjectsAction, statusFileOf } = await import("../app/data.ts");
const { loadFactoryConfig, projectsOf, DEFAULT_PROJECTS } = await import("../src/config.ts");
const { validate } = await import("../src/spec.ts");
const { loadedWorkflows } = await import("../src/engine.ts");

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = { markers: [".agents/skills", ".opencode/agents"], maxDepth: 3 };

function reset(): void {
  fs.rmSync(projectsFile(), { force: true });
}

function folder(...parts: string[]): string {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-projects-ws-"));
}

test("the registry lives in the factory home and starts empty", () => {
  reset();
  assert.equal(projectsFile(), path.join(home, "projects.json"));
  assert.deepEqual(readRegistry(), { schemaVersion: 1, roots: [], projects: [] });
  fs.writeFileSync(projectsFile(), "not json");
  assert.deepEqual(listProjects(), []);
  fs.writeFileSync(projectsFile(), JSON.stringify({ projects: [{ id: "Bad Id", path: "x" }, { id: "ok", path: "y" }, null], roots: ["r", 3] }));
  assert.deepEqual(readRegistry(), { schemaVersion: 1, roots: ["r"], projects: [{ id: "ok", path: "y" }] });
});

test("add, find and remove projects; ids are unique kebab-case and folders are registered once", () => {
  reset();
  const ws = workspace();
  const app = folder(ws, "Sample App");
  const other = folder(ws, "x", "sample-app");
  const first = addProject({ path: app });
  assert.deepEqual(first, { id: "sample-app", path: app });
  assert.equal(addProject({ path: other }).id, "sample-app-2");
  assert.throws(() => addProject({ path: app }), /already registered as sample-app/);
  assert.throws(() => addProject({ path: folder(ws, "y"), id: "sample-app" }), /id sample-app is taken/);
  assert.throws(() => addProject({ path: folder(ws, "z"), id: "Bad" }), /kebab-case/);
  assert.throws(() => addProject({ path: path.join(ws, "missing") }), /is not a folder/);
  assert.throws(() => addProject({ path: "" }), /must be a folder path/);
  const market = folder(ws, "market");
  assert.equal(addProject({ path: folder(ws, "w"), id: "sample-web", marketplace: market }).marketplace, market);
  assert.equal(projectById("sample-web").path, path.join(ws, "w"));
  assert.throws(() => projectById("nope"), /unknown project nope/);
  assert.equal(removeProject("sample-app-2").path, other);
  assert.throws(() => removeProject("sample-app-2"), /unknown project/);
  assert.deepEqual(listProjects().map((p) => p.id), ["sample-app", "sample-web"]);
});

test("suggested ids come from the folder name", () => {
  assert.equal(suggestId("/x/My Repo!", []), "my-repo");
  assert.equal(suggestId("/x/___", []), "project");
  assert.equal(suggestId("/x/app", ["app", "app-2"]), "app-3");
});

test("discovery proposes marked folders under the roots, skips registered ones, worktrees, hidden and skipped folders", () => {
  reset();
  const ws = workspace();
  const one = folder(ws, "one");
  folder(one, ".agents", "skills");
  folder(one, "nested", ".opencode", "agents");
  const two = folder(ws, "group", "two");
  folder(two, ".opencode", "agents");
  const linked = folder(ws, "group", "two-wt");
  folder(linked, ".agents", "skills");
  fs.writeFileSync(path.join(linked, ".git"), "gitdir: /x/two/.git/worktrees/two-wt\n");
  folder(ws, "node_modules", "pkg", ".agents", "skills");
  folder(ws, ".hidden", "p", ".agents", "skills");
  folder(ws, "a", "b", "c", "too-deep", ".agents", "skills");
  const registered = folder(ws, "registered");
  folder(registered, ".agents", "skills");
  addProject({ path: registered });
  assert.deepEqual(addRoot(ws), [ws]);
  assert.deepEqual(addRoot(ws), [ws], "a root is added once");
  const found = discoverProjects(settings);
  assert.deepEqual(found.map((c) => [path.relative(ws, c.path), c.suggestedId, c.markers]), [
    [path.join("group", "two"), "two", [".opencode/agents"]],
    ["one", "one", [".agents/skills"]],
  ].sort((a, b) => path.join(ws, String(a[0])).localeCompare(path.join(ws, String(b[0])))));
  assert.equal(listProjects().length, 1, "discovery registers nothing");
  assert.deepEqual(discoverProjects(settings, [path.join(ws, "group")]).map((c) => c.suggestedId), ["two"]);
  assert.deepEqual(discoverProjects({ ...settings, maxDepth: 4 }).map((c) => c.suggestedId).sort(), ["one", "too-deep", "two"]);
  assert.deepEqual(removeRoot(ws), []);
  assert.deepEqual(discoverProjects(settings), []);
});

test("a run started for a project gets its folder, id and marketplace", () => {
  reset();
  const ws = workspace();
  const app = folder(ws, "app");
  const market = folder(ws, "market");
  addProject({ path: app, id: "sample-app", marketplace: market });
  assert.deepEqual(projectScopedInput(undefined, { repo: "o/r" }), { repo: "o/r" });
  assert.deepEqual(projectScopedInput("sample-app", { artifacts: ["a"] }), { marketplace: market, artifacts: ["a"], project: app, projectId: "sample-app" });
  assert.equal(projectScopedInput("sample-app", { project: app, marketplace: ws }).marketplace, ws, "an explicit marketplace wins");
  assert.throws(() => projectScopedInput("sample-app", { project: ws }), /not the folder of project sample-app/);
  assert.throws(() => projectScopedInput("nope", {}), /unknown project nope/);
  fs.rmSync(app, { recursive: true });
  assert.throws(() => projectInput("sample-app"), /does not exist/);
});

test("the shared projects action and the command line", () => {
  reset();
  const ws = workspace();
  const app = folder(ws, "app");
  folder(app, ".agents", "skills");
  assert.deepEqual(projectsAction({ action: "add_root", path: ws }), { roots: [ws] });
  assert.equal((projectsAction({ action: "discover" }) as { candidates: unknown[] }).candidates.length, 1);
  assert.equal((projectsAction({ action: "add", path: app, id: "sample-app" }) as { project: { id: string } }).project.id, "sample-app");
  assert.equal((projectsAction({ action: "list" }) as { projects: unknown[] }).projects.length, 1);
  assert.equal((projectsAction({ action: "remove", id: "sample-app" }) as { project: { id: string } }).project.id, "sample-app");
  assert.deepEqual(projectsAction({ action: "remove_root", path: ws }), { roots: [] });
  assert.throws(() => projectsAction({ action: "nope" as "list" }), /unknown projects action/);
  assert.deepEqual((projectsCli(["add", app, "--id", "sample-cli"]) as { id: string }).id, "sample-cli");
  assert.deepEqual(projectsCli(["roots", "add", ws]), [ws]);
  assert.deepEqual(projectsCli(["roots"]), [ws]);
  assert.equal((projectsCli(["discover", "--root", ws]) as unknown[]).length, 0, "the only marked folder is registered");
  assert.deepEqual(projectsCli(["roots", "remove", ws]), []);
  assert.equal((projectsCli(["list"]) as { projects: unknown[] }).projects.length, 1);
  assert.equal((projectsCli(["remove", "sample-cli"]) as { id: string }).id, "sample-cli");
  assert.throws(() => projectsCli(["nope"]), /usage: projects.ts/);
});

test("project settings come from the factory config with defaults, and the schema accepts them", () => {
  assert.deepEqual(projectsOf(null), DEFAULT_PROJECTS);
  assert.equal(projectsOf({ projects: { maxDepth: 5 } }).maxDepth, 5);
  assert.equal(loadFactoryConfig().projects.statusWorkflow, "olko-project-status");
  const config = JSON.parse(fs.readFileSync(path.join(factoryDir, "spec", "examples", "valid", "factory-config.json"), "utf8"));
  assert.equal(validate("factory-config", { ...config, projects: { markers: [".agents"], maxDepth: 2, statusWorkflow: "olko-project-status" } }).valid, true);
  assert.equal(validate("factory-config", { ...config, projects: { maxDepth: 99 } }).valid, false);
});

test("the project status workflow is one script-runner step that reads the project only", () => {
  const spec = loadedWorkflows().get("olko-project-status");
  assert.ok(spec, "olko-project-status loads");
  assert.deepEqual(spec.nodes.map((n) => n.id), ["scan"]);
  const yaml = fs.readFileSync(path.join(factoryDir, "workflows", "olko-project-status.yaml"), "utf8");
  assert.match(yaml, /skill: olko-factory-project/);
  assert.match(yaml, /--id \{\{input\.projectId\}\}/);
  assert.match(fs.readFileSync(path.join(factoryDir, "workflows", "olko-workflow-sync.yaml"), "utf8"), /\{\{#input\.artifacts\}\} `--only \{\{\.\}\}`\{\{\/input\.artifacts\}\}/);
});

type ApiCallResult = { status: number | "next"; body?: unknown };

function apiCall(data: ReturnType<typeof createDataApi>) {
  const middleware = apiMiddleware(data);
  return (method: string, url: string, options: { headers?: Record<string, string>; body?: unknown } = {}) =>
    new Promise<ApiCallResult>((resolve) => {
      const res = { writeHead: (status: number) => ({ end: (body: string) => resolve({ status, body: JSON.parse(body) }) }) };
      const listeners: Record<string, ((chunk?: unknown) => void)[]> = {};
      const req = {
        method,
        url,
        headers: options.headers ?? {},
        on(event: string, listener: (chunk?: unknown) => void) {
          (listeners[event] ??= []).push(listener);
          if (event === "end") {
            queueMicrotask(() => {
              if (options.body !== undefined) for (const l of listeners.data ?? []) l(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
              for (const l of listeners.end ?? []) l();
            });
          }
          return req;
        },
      };
      middleware(req, res, () => resolve({ status: "next" }));
    });
}

function writeRun(dataDir: string, runId: string, run: Record<string, unknown>): void {
  folder(dataDir, "runs");
  fs.writeFileSync(path.join(dataDir, "runs", `${runId}.json`), JSON.stringify({ runId, goal: "g", status: "done", config: null, answers: {}, ledger: [], events: [{ type: "run_created", at: "2026-11-20T10:00:00.000Z" }], thresholdsHit: [], cursor: 0, nodeTurn: 0, steps: 0, pendingQuestion: null, pendingWork: null, proposal: { roles: {}, budget: { maxCostUsd: 1, infoRatio: 0.5, pauseRatio: 0.8 } }, idempotencyKey: null, ...run }));
}

test("the viewer lists projects with their latest status, shows the status file and changes the registry on its own request", async () => {
  reset();
  const ws = workspace();
  const app = folder(ws, "app");
  folder(app, ".agents", "skills");
  addProject({ path: app, id: "sample-app" });
  const dataDir = workspace();
  const statusDir = folder(home, "project-status");
  const statusFile = path.join(statusDir, "sample-app-1.json");
  fs.writeFileSync(statusFile, JSON.stringify({ summary: "1 current", counts: { current: 1 }, artifacts: [{ id: "skill:sample-skill", state: "current" }] }));
  writeRun(dataDir, "r-0000000a", { workflow: "olko-project-status", input: { project: app, projectId: "sample-app" }, state: { scan: { scan: { file: statusFile } } } });
  writeRun(dataDir, "r-0000000b", { workflow: "olko-project-status", status: "failed", input: { projectId: "sample-app" }, events: [{ type: "run_created", at: "2026-11-21T10:00:00.000Z" }] });
  writeRun(dataDir, "r-0000000c", { workflow: "hello", input: {} });
  const data = createDataApi({ factoryDir, dataDir, configFile: path.join(factoryDir, "config", "factory.yaml"), demo: false });
  const call = apiCall(data);

  const listed = (await call("GET", "/api/projects")).body as { projects: { id: string; exists: boolean; runs: number; status: { runId: string; summary: string } }[]; statusWorkflow: string };
  assert.equal(listed.statusWorkflow, "olko-project-status");
  assert.deepEqual(listed.projects.map((p) => [p.id, p.exists, p.runs, p.status.runId, p.status.summary]), [["sample-app", true, 2, "r-0000000a", "1 current"]]);
  const status = await call("GET", "/api/projects/sample-app/status");
  assert.equal(status.status, 200);
  assert.equal((status.body as { data: { artifacts: unknown[] } }).data.artifacts.length, 1);
  assert.equal((await call("GET", "/api/projects/other/status")).status, 404);
  const runs = data.runs();
  assert.equal(runs.find((r) => r.runId === "r-0000000a")?.projectId, "sample-app");
  assert.equal(runs.find((r) => r.runId === "r-0000000c")?.projectId, null);

  const headers = { "x-factory-action": "projects", origin: "http://127.0.0.1:7340" };
  assert.equal((await call("POST", "/api/projects", { body: { action: "discover", path: ws } })).status, 403, "needs the viewer header");
  assert.equal((await call("POST", "/api/projects", { headers: { ...headers, origin: "https://example.com" }, body: { action: "discover" } })).status, 403);
  const added = await call("POST", "/api/projects", { headers, body: { action: "add", path: folder(ws, "web"), id: "sample-web" } });
  assert.equal(added.status, 200);
  assert.equal((added.body as { project: { id: string } }).project.id, "sample-web");
  assert.equal((await call("POST", "/api/projects", { headers, body: { action: "list" } })).status, 400, "list is a GET");
  assert.equal((await call("POST", "/api/projects", { headers, body: "not json" })).status, 400);
  assert.equal((await call("POST", "/api/projects", { headers, body: { action: "add", path: 3 } })).status, 400);
  assert.equal((await call("POST", "/api/projects", { headers, body: { action: "remove", id: "sample-web" } })).status, 200);
});

test("project action bodies and status files are checked", () => {
  assert.deepEqual(parseProjectsAction({ action: "add", path: "/x", id: "", extra: 1 }), { action: "add", path: "/x" });
  assert.throws(() => parseProjectsAction([]), /JSON object/);
  assert.throws(() => parseProjectsAction({ action: "drop" }), /action must be/);
  assert.throws(() => parseProjectsAction({ action: "add", path: "x".repeat(1001) }), /path must be a string/);
  const dir = folder(workspace(), "project-status");
  const inside = path.join(dir, "a.json");
  fs.writeFileSync(inside, "{}");
  const outside = path.join(path.dirname(dir), "b.json");
  fs.writeFileSync(outside, "{}");
  assert.equal(statusFileOf({ scan: { scan: { file: inside } } }, dir), inside);
  assert.equal(statusFileOf({ scan: { scan: { file: outside } } }, dir), null, "only files in the status folder");
  assert.equal(statusFileOf({ scan: { file: path.join(dir, "missing.json") } }, dir), null);
  assert.equal(statusFileOf(null, dir), null);
});
