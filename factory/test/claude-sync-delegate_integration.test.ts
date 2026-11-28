// Sends repository content and the user store below to the model provider. The user store comes from
// test/fixtures/user-store; FACTORY_CLAUDE_SYNC_REAL_STORE=1 copies the real ~/.claude skills and agents instead,
// and then needs leak terms (targets.json leakTerms or FACTORY_LEAK_TERMS) or the test fails before it copies anything.
import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runSubagent, type SubagentResult } from "./delegate-subagent.ts";
import { callTool, startStdio, type Payload, type StdioSession } from "./helpers/mcp.ts";
import { git } from "./helpers/processes.ts";
import { removeDir, tempDir } from "./helpers/temp.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = process.env.FACTORY_CLAUDE_SYNC_TARGET ?? "anthropics/claude-plugins-official";
const ARTIFACTS = (process.env.FACTORY_CLAUDE_SYNC_ARTIFACTS ?? "olko-design-rules,olko-review-verifier,frontend-design").split(",");
const MARKETPLACE = process.env.FACTORY_SYNC_MARKETPLACE ?? "slawomirolko/marketplace";
const REAL_SYNC_HOME = process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync");
const FIXTURE_STORE = path.join(factoryDir, "test", "fixtures", "user-store");
const REAL_STORE = process.env.FACTORY_CLAUDE_SYNC_REAL_STORE === "1";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const TOOL_TIMEOUT = { timeoutMs: 120000 };

function leakTerms(): string[] {
  const file = path.join(REAL_SYNC_HOME, "targets.json");
  const terms = fs.existsSync(file) ? ((JSON.parse(fs.readFileSync(file, "utf8")).leakTerms ?? []) as string[]) : [];
  return [...terms, ...(process.env.FACTORY_LEAK_TERMS ?? "").split(",").filter(Boolean)].map((t) => t.toLowerCase());
}

function filesOf(entry: string): string[] {
  return fs.statSync(entry).isFile() ? [entry] : (fs.readdirSync(entry, { recursive: true }) as string[]).map((f) => path.join(entry, f)).filter((f) => fs.statSync(f).isFile());
}

/** Copies the real ~/.claude skills and agents without any entry that mentions a leak term. Refuses to run without leak terms. */
function copyRealUserStore(destination: string, terms: string[]): void {
  assert.ok(terms.length > 0, "FACTORY_CLAUDE_SYNC_REAL_STORE=1 needs leak terms in targets.json leakTerms or FACTORY_LEAK_TERMS");
  for (const kind of ["skills", "agents"]) {
    const source = path.join(os.homedir(), ".claude", kind);
    fs.mkdirSync(path.join(destination, kind), { recursive: true });
    for (const name of fs.existsSync(source) ? fs.readdirSync(source) : []) {
      const entry = path.join(source, name);
      const mentions = (text: string) => terms.some((t) => text.toLowerCase().includes(t));
      if (mentions(name) || filesOf(entry).some((f) => mentions(fs.readFileSync(f, "utf8")))) continue;
      fs.cpSync(entry, path.join(destination, kind, name), { recursive: true, dereference: true });
    }
  }
}

/** The user store the sync reads: the checked-in fixture, or the filtered real store when FACTORY_CLAUDE_SYNC_REAL_STORE=1. */
function userStore(destination: string): void {
  if (REAL_STORE) {
    copyRealUserStore(destination, leakTerms());
    return;
  }
  fs.cpSync(FIXTURE_STORE, destination, { recursive: true });
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  for (const f of filesOf(root).sort()) hash.update(path.relative(root, f)).update(fs.readFileSync(f));
  return hash.digest("hex");
}

function snapshot(dir: string): Record<string, string> {
  return { branch: git(dir, "branch", "--show-current"), head: git(dir, "rev-parse", "HEAD"), status: git(dir, "status", "--porcelain"), branches: git(dir, "branch", "--list", "--format=%(refname:short)") };
}

test("a harness drives the YAML claude sync over stdio in delegate mode on marketplace agents only: three inventories at once, only requested capabilities compared, leave changes no store and no real sync state", async () => {
  const root = tempDir("factory-claude-sync-ts-", { real: true });
  const [target, olko, user, state] = ["target", "olko", "user", "state"].map((d) => path.join(root, d)) as [string, string, string, string];
  let session: StdioSession | undefined;
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const batches: Payload[][] = [];
  const asked: Payload[] = [];
  try {
    execFileSync("gh", ["repo", "clone", TARGET, target, "--", "--depth", "50"]);
    execFileSync("gh", ["repo", "clone", MARKETPLACE, olko, "--", "--depth", "50"]);
    userStore(user);
    const realState = () => (fs.existsSync(REAL_SYNC_HOME) ? treeHash(REAL_SYNC_HOME) : "absent");
    const before = { target: snapshot(target), olko: snapshot(olko), user: treeHash(user), realState: realState() };
    session = await startStdio({ entry: path.join(factoryDir, "src", "stdio.ts") });
    const { client } = session;
    const call = (name: string, args: Record<string, unknown>) => callTool(client, name, args, TOOL_TIMEOUT);
    const started = await call("factory_start", { goal: "Sync skills and agents between a Claude marketplace, Olko and the user scope", workflow: "olko-claude-sync", input: { target, targetName: "public-plugins", olko, user, stateDir: state, artifacts: ARTIFACTS } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call("factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call("factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions && Array.isArray(work.tools) && Array.isArray(work.dirs), `pendingWork for ${work.nodePath} carries agent, tools and dirs`);
        batches.push(items);
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: (w.cwd as string | undefined) ?? olko })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call("factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const question = status.pendingQuestion as Payload;
        asked.push(question);
        const answer = question.id === "q-claude-sync-leak" ? "none" : question.id === "q-claude-sync-consolidate" ? "skip" : question.id.startsWith("q-claude-sync-probable-") ? "confirm" : question.allowed?.includes("leave") ? "leave" : "stop";
        status = await call("factory_answer", { runId, questionId: question.id, answer });
      }
    }
    const report = await call("factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    const inventory = batches.find((b) => b.some((w) => w.agentName === "olko-claude-sync-inventory"));
    assert.deepEqual(inventory?.map((w) => w.agentId).sort(), ["olko", "target", "user"]);
    assert.ok(inventory?.every((w) => w.agentInstructions.includes("olko-sync-state")), "plugin agents carry their preloaded skill from the marketplace");
    const compared = batches.flat().filter((w) => w.agentName === "olko-claude-sync-comparator");
    assert.ok(compared.length <= ARTIFACTS.length, JSON.stringify(compared.map((w) => w.agentId)));
    assert.ok(asked.filter((q) => q.id.startsWith("q-claude-sync-row-")).every((q) => q.allowed.includes("leave")));
    const manager = batches.flat().filter((w) => w.agentName === "olko-claude-sync-manager");
    assert.ok(manager.some((w) => w.prompt.includes("Phase 0")) && manager.some((w) => w.prompt.includes("Phase 6")), "the sync manager runs the state setup and the report");
    for (const work of batches.flat().filter((w) => (w.tools as string[]).includes("bash"))) assert.ok(work.prompt.includes(state) || work.prompt.includes("Do not run the state script"), `${work.nodePath} runs the state script only against the test state directory`);
    assert.ok(fs.existsSync(path.join(state, "targets.json")), "the sync state is written into the test state directory");
    assert.deepEqual({ target: snapshot(target), olko: snapshot(olko), user: treeHash(user), realState: realState() }, before);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) assert.equal(agent.costSource, "reported", JSON.stringify(agent));
    console.log(JSON.stringify({ runId, batches: batches.map((b) => b.map((w) => w.agentId)), asked: asked.map((q) => q.id), costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await session?.close();
    removeDir(root);
  }
});
