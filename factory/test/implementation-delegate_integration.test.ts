import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runSubagent, type SubagentResult } from "./delegate-subagent.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.join(factoryDir, "..");
const FEATURE = "slugify";
const TASK = "t1-slugify";
const TEST_COMMAND = ["-m", "unittest", "discover", "-s", "tests", "-t", ".", "-v"];
const PYTHON = process.env.FACTORY_TEST_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const REAL_CLAUDE = path.join(os.homedir(), ".claude");
const REAL_SYNC_HOME = process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync");

type Payload = Record<string, any>;

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Payload> {
  const res = (await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })) as CallToolResult;
  assert.ok(!res.isError, JSON.stringify(res.content));
  return res.structuredContent as Payload;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function filesOf(entry: string): string[] {
  if (!fs.existsSync(entry)) return [];
  return fs.statSync(entry).isFile() ? [entry] : (fs.readdirSync(entry, { recursive: true }) as string[]).map((f) => path.join(entry, f)).filter((f) => fs.statSync(f).isFile());
}

function treeHash(entries: string[]): string {
  const hash = createHash("sha256");
  for (const entry of entries) for (const f of filesOf(entry).sort()) hash.update(f).update(fs.readFileSync(f));
  return hash.digest("hex");
}

function outsideTmp(): Record<string, string> {
  return {
    repo: git(repoDir, "status", "--porcelain", "--untracked-files=all"),
    repoHead: git(repoDir, "rev-parse", "HEAD"),
    claude: treeHash(["skills", "agents", "settings.json", "CLAUDE.md"].map((p) => path.join(REAL_CLAUDE, p))),
    sync: treeHash([REAL_SYNC_HOME]),
  };
}

function write(root: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
}

function throwawayProject(root: string): { project: string; origin: string } {
  const origin = path.join(root, "origin.git");
  const project = path.join(root, "project");
  execFileSync("git", ["init", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-b", "main", project]);
  write(project, {
    "AGENTS.md": ["# textkit", "", "Python 3 library, standard library only.", "", "- Tests: `python -m unittest discover -s tests -t . -v` from the repository root.", "- No explanatory comments in code or tests.", ""].join("\n"),
    "textkit/__init__.py": "",
    "textkit/slug.py": "def slugify(text: str) -> str:\n    return text\n",
    "tests/__init__.py": "",
    [`plans/features/${FEATURE}/implementation.md`]: ["# Feature slugify: technical plan", "", "Stack: Army Python (Python 3, standard library unittest). One Task: t1-slugify.", "No services, no Docker, no database: the library has no runtime outside its tests.", ""].join("\n"),
    [`plans/features/${FEATURE}/tasks/${TASK}-implementation.md`]: [
      "# Task t1-slugify: slugify turns text into a URL slug",
      "",
      "Ready for implementation: yes",
      "",
      "## Scope",
      "",
      "Stack: Army Python (Python 3, standard library unittest).",
      "Production path: `textkit/slug.py` (function `slugify`). Test path: `tests/test_slug.py`.",
      "",
      "## Acceptance criteria",
      "",
      "1. `slugify(\"Hello World\")` returns `\"hello-world\"`.",
      "2. `slugify(\"  Many   spaces  \")` returns `\"many-spaces\"`.",
      "",
      "## Acceptance-to-E2E matrix",
      "",
      "| Criterion | Check | Why not E2E |",
      "| --- | --- | --- |",
      "| 1 | non-E2E: `python -m unittest discover -s tests -t . -v` | a library function without UI, service or database |",
      "| 2 | non-E2E: `python -m unittest discover -s tests -t . -v` | a library function without UI, service or database |",
      "",
      "Manifest: every criterion is a non-E2E unit check; no Compose project is started.",
      "",
      "## Verification contract",
      "",
      "The unit tests of `tests/test_slug.py` pass. There is no runtime log, trace or database to check.",
      "",
    ].join("\n"),
  });
  git(project, "add", "-A");
  git(project, "-c", "user.name=factory-test", "-c", "user.email=factory-test@example.invalid", "commit", "-m", "textkit with an unfinished slugify");
  git(project, "remote", "add", "origin", origin);
  git(project, "push", "-u", "origin", "main");
  return { project, origin };
}

function claudeConfigDir(root: string): string | undefined {
  const credentials = path.join(REAL_CLAUDE, ".credentials.json");
  if (!fs.existsSync(credentials)) return undefined;
  const dir = path.join(root, "claude-config");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(credentials, path.join(dir, ".credentials.json"));
  return dir;
}

const ANSWERS: [RegExp, string][] = [
  [/^q-impl-commit$/, "no"],
  [/^q-impl-scope$/, "extend"],
  [/^q-impl-context$/, "skip"],
  [/^q-impl-blocked-/, "1"],
  [/^q-impl-dispute-/, "test-holds"],
  [/^q-memory-missing$/, "continue"],
  [/^q-budget-pause$/, "continue"],
];

function answerOf(question: Payload): string {
  const fixed = ANSWERS.find(([id]) => id.test(String(question.id).replace(/^.*:/, "")));
  if (fixed) return fixed[1];
  const allowed: string[] = question.allowed ?? [];
  if (!allowed.length) return "Use your recommended answer for every open point.";
  return allowed[0]!;
}

function worktreeOf(project: string): string {
  const paths = git(project, "worktree", "list", "--porcelain").split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => path.resolve(l.slice("worktree ".length)));
  const others = paths.filter((p) => path.resolve(p) !== path.resolve(project));
  assert.equal(others.length, 1, `one Task worktree: ${paths.join(", ")}`);
  return others[0]!;
}

test("a harness drives the YAML implementation over stdio in delegate mode on a throwaway Python repo: the Task test passes in the worktree and nothing is published", async () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-impl-ts-")));
  const { project, origin } = throwawayProject(root);
  const configDir = claudeConfigDir(root);
  const before = outsideTmp();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-delegate-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(await freePort()) } as Record<string, string>;
  const agentEnv = { ...process.env, GH_HOST: "github.invalid", GIT_TERMINAL_PROMPT: "0", OLKO_SYNC_HOME: path.join(root, "olko-sync"), ...(configDir ? { CLAUDE_CONFIG_DIR: configDir } : {}) } as Record<string, string>;
  const client = new Client({ name: "claude-code", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(factoryDir, "src", "stdio.ts")], env, stderr: "pipe" }));
  const batches: Payload[][] = [];
  const asked: Payload[] = [];
  try {
    const switches = { tracker: false, editor: false, docker: false, obsidian: false, adopt: false };
    const started = await call(client, "factory_start", { goal: "Implement Task t1-slugify of Feature slugify", workflow: "olko-implementation", input: { project, featureId: FEATURE, taskId: TASK, switches } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call(client, "factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call(client, "factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        batches.push(items);
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: (w.cwd as string | undefined) ?? project, env: agentEnv })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          status = await call(client, "factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        status = await call(client, "factory_answer", { runId, questionId: question.id, answer: answerOf(question) });
      }
    }
    const report = await call(client, "factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    const work = batches.flat();
    const ran = (agent: string | RegExp) => work.some((w) => (typeof agent === "string" ? w.agentName === agent : agent.test(w.agentName)));
    for (const agent of ["olko-implementation-orchestrator", "olko-worktree-lifecycle-manager", "olko-e2e-acceptance-runner", "olko-investigation-flow-worker", "olko-investigation-runtime-worker", "olko-investigation-test-worker", "olko-investigation-readiness-worker", "olko-test-first-author", "olko-review-orchestrator"]) assert.ok(ran(agent), `${agent} ran`);
    assert.ok(ran(/^olko-[a-z-]+-implementer$/), "a stack implementer ran");
    assert.ok(ran(/^olko-[a-z-]+-test-runner$/), "a stack test runner ran");
    const orchestratorRan = (step: string) => work.some((w) => w.nodePath === `olko-implementation/${step}` && w.agentName === "olko-implementation-orchestrator");
    for (const step of ["task", "journal", "preflight", "stacks", "tests-check", "chunker", "child-check", "review-gate", "report"]) assert.ok(orchestratorRan(step), `the orchestrator ran ${step}`);
    assert.ok(work.some((w) => w.nodePath.startsWith("olko-implementation/checks/") && w.nodePath.endsWith("/check")), "the checks call ran");
    assert.ok(!ran("olko-git-delivery-manager"), "nothing was committed, rebuilt or published");
    assert.ok(!work.some((w) => /\/(editor|docker|obsidian|tracker-task|adopt)\//.test(w.nodePath)), "the switched-off steps did not run");
    assert.ok(asked.some((q) => String(q.id).endsWith("q-impl-commit")), "delivery asked before any commit");

    const worktree = worktreeOf(project);
    assert.ok(worktree.startsWith(root), `the worktree ${worktree} is inside the throwaway root`);
    assert.ok(work.some((w) => w.cwd && path.resolve(w.cwd) === path.resolve(worktree)), "later agents ran in the worktree");
    const tests = execFileSync(PYTHON, TEST_COMMAND, { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.ok(fs.existsSync(path.join(worktree, "tests", "test_slug.py")) || fs.readdirSync(path.join(worktree, "tests")).some((f) => /^test_.*\.py$/.test(f)), "the test-first author wrote a test file");
    const slug = execFileSync(PYTHON, ["-c", "from textkit.slug import slugify; print(slugify('Hello World')); print(slugify('  Many   spaces  '))"], { cwd: worktree, encoding: "utf8" }).trim().split(/\r?\n/);
    assert.deepEqual(slug, ["hello-world", "many-spaces"], tests);
    assert.match(fs.readFileSync(path.join(project, "plans", "features", FEATURE, "tasks", `${TASK}-implementation.md`), "utf8"), /^## Implementation/m, "the orchestrator keeps the journal in the Task plan");

    assert.deepEqual(execFileSync("git", ["--git-dir", origin, "for-each-ref", "--format=%(refname)"], { encoding: "utf8" }).trim().split(/\r?\n/), ["refs/heads/main"], "nothing was pushed to the local origin");
    assert.deepEqual(outsideTmp(), before, "nothing outside the throwaway root changed");

    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.ok(agents.length > 0);
    for (const agent of agents) assert.equal(agent.costSource, "reported", JSON.stringify(agent));
    const pricedNodes = new Set(Object.entries(report.byNode).filter(([, node]: [string, any]) => node.tier !== null).map(([nodePath]) => nodePath));
    for (const item of work) assert.ok(pricedNodes.has(item.nodePath), `${item.nodePath} is priced`);
    console.log(JSON.stringify({ runId, steps: work.length, asked: asked.map((q) => q.id), costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
  }
});
