import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GH_READ_TOKEN_VARIABLE, runSubagent, type SubagentResult } from "./delegate-subagent.ts";
import { callTool, startStdio, type Payload } from "./helpers/mcp.ts";
import { removeDir, tempDir } from "./helpers/temp.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
const TOOL_TIMEOUT = { timeoutMs: 120000 };

/**
 * Reviews a real pull request with real agents. FACTORY_REVIEW_REPO (owner/name) and FACTORY_REVIEW_PR name it; there is
 * no default. The agents run in a throwaway clone under the temp folder, never in this checkout, and read GitHub only
 * with the read-only token in FACTORY_TEST_GH_READ_TOKEN, so an unexpected "post" answer cannot write a comment.
 */
function reviewTarget(): { repo: string; pr: number } {
  const repo = process.env.FACTORY_REVIEW_REPO;
  const pr = Number(process.env.FACTORY_REVIEW_PR);
  assert.ok(repo && /^[\w.-]+\/[\w.-]+$/.test(repo), "set FACTORY_REVIEW_REPO to the owner/name of the repository to review");
  assert.ok(Number.isInteger(pr) && pr > 0, "set FACTORY_REVIEW_PR to the number of the pull request to review");
  assert.ok(process.env[GH_READ_TOKEN_VARIABLE], `set ${GH_READ_TOKEN_VARIABLE} to a read-only GitHub token for the review agents`);
  return { repo, pr };
}

test("a harness drives the YAML olko-review workflow over stdio in delegate mode, runs offered agents in parallel and every agent step is priced", async () => {
  const { repo: REPO, pr: PR } = reviewTarget();
  const root = tempDir("factory-review-ts-", { real: true });
  const clone = path.join(root, "repo");
  execFileSync("gh", ["repo", "clone", REPO, clone, "--", "--depth", "50"]);
  const session = await startStdio({ entry: path.join(factoryDir, "src", "stdio.ts") });
  const { client } = session;
  const call = (name: string, args: Record<string, unknown>) => callTool(client, name, args, TOOL_TIMEOUT);
  const submitted: { agentName: string; usage: SubagentResult["usage"] }[] = [];
  const asked: string[] = [];
  const batches: string[][] = [];
  const bashNodes = new Set<string>();
  try {
    const started = await call("factory_start", { goal: `Review PR #${PR} in ${REPO}`, workflow: "olko-review", input: { repo: REPO, pr: PR, fresh: true } });
    const runId = started.runId as string;
    const testModel = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
    let status = await call("factory_confirm", { runId, overrides: { tierModels: { low: testModel, medium: testModel, high: testModel } } });
    while (!ENDED.has(status.status)) {
      status = await call("factory_wait", { runId, timeoutSec: 50 });
      if (status.status === "waiting_for_client") {
        const items = status.pendingWorkItems as Payload[];
        for (const work of items) assert.ok(work.agentName && work.agentInstructions, `pendingWork for ${work.nodePath} carries the marketplace agent to run`);
        batches.push(items.map((w) => w.agentName));
        for (const work of items) if ((work.tools as string[]).includes("bash")) bashNodes.add(work.nodePath.split("/").at(-1));
        const results = await Promise.all(items.map((w) => runSubagent(w, { cwd: clone, network: "github-read" })));
        for (const [i, work] of items.entries()) {
          const result = results[i]!;
          submitted.push({ agentName: work.agentName, usage: result.usage });
          status = await call("factory_submit", { runId, nodePath: work.nodePath, agentId: work.agentId, output: result.output, usage: result.usage });
        }
      } else if (status.status === "waiting_for_user") {
        const id = status.pendingQuestion.id as string;
        asked.push(id);
        status = await call("factory_answer", { runId, questionId: id, answer: id === "q-memory-missing" ? "continue" : "skip" });
      }
    }
    const report = await call("factory_report", { runId });

    assert.equal(report.status, "done", JSON.stringify(report));
    assert.ok(report.workflow.startsWith("olko-review@"));
    assert.ok(submitted.some((s) => s.agentName === "olko-review-bugs-lens"));
    assert.ok(submitted.some((s) => s.agentName === "olko-review-orchestrator"), "the orchestrator agent runs the route, scope, merge and rank steps");
    for (const node of ["route", "scope", "diff"]) assert.ok(bashNodes.has(node), `${node} runs gh and git through the agent: ${[...bashNodes].join(",")}`);
    assert.equal(asked[0], "q-memory-missing");
    assert.ok(asked.slice(1).every((id) => /^q-post-\d+$/.test(id)), asked.join(","));
    const lensBatch = batches.find((b) => b.includes("olko-review-bugs-lens"));
    assert.ok(lensBatch && lensBatch.length >= 2, `lens agents offered together: ${JSON.stringify(batches)}`);
    const agents = Object.values(report.byNode).flatMap((node: any) => Object.values(node.byAgent)).filter((a: any) => a.tier !== null) as any[];
    assert.equal(agents.length, submitted.length);
    for (const agent of agents) {
      assert.equal(agent.costSource, "reported", JSON.stringify(agent));
      assert.ok(agent.costUsd > 0);
    }
    assert.equal(report.coverage.run.unknownSteps, 0);
    assert.equal(report.cost.tokens, submitted.reduce((sum, s) => sum + s.usage.inputTokens + s.usage.outputTokens, 0));
    assert.equal(report.cacheTokens, submitted.reduce((sum, s) => sum + s.usage.cacheReadTokens + s.usage.cacheWriteTokens, 0));
    console.log(JSON.stringify({ runId, batches, asked, costUsd: report.cost.costUsd, viewerUrl: report.viewerUrl }));
  } finally {
    await session.close();
    removeDir(root);
  }
});
