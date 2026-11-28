import "./helpers/isolated-home.ts";
import "./helpers/no-turn-delay.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { POLL_INTERVAL_MS, sleep } from "./helpers/poll.ts";
import { removeDir, tempDir } from "./helpers/temp.ts";
import { runSubagent } from "./delegate-subagent.ts";

const { Factory } = await import("../src/engine.ts");

const MODEL = process.env.FACTORY_TEST_MODEL ?? "claude-haiku-5-5";
/**
 * The local smoke budget: a one-Task idea on the low-cost test model normally ends well inside 40 minutes and $2, so
 * a run past either limit means a loop or a stuck step, not a slow model. Override them with FACTORY_SMOKE_LIMIT_MIN
 * and FACTORY_SMOKE_BUDGET_USD for a slower machine or a larger model.
 */
const LIMIT_MIN = Number(process.env.FACTORY_SMOKE_LIMIT_MIN ?? 40);
const BUDGET_USD = Number(process.env.FACTORY_SMOKE_BUDGET_USD ?? 2);
const MAX_DRAFTS = 3;
const FEATURE = "shout-flag";
const IDEA = "Add a --shout flag to the greet CLI in src/greet.js: `greet --shout Ada` prints `HELLO, ADA!`. The flag may come before or after the name, other arguments that start with - are ignored, greet() itself does not change, the CLI test runs src/greet.js as a child process, and README.md gets one usage line. One Feature with one Task; nothing else is in scope.";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

type Payload = Record<string, any>;

const PROJECT_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "greet", version: "1.0.0", type: "module", bin: { greet: "src/greet.js" }, scripts: { test: "node --test" } }, null, 2),
  "src/greet.js": "#!/usr/bin/env node\nimport { pathToFileURL } from \"node:url\";\n\nexport function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nif (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(greet(process.argv[2] ?? \"world\"));\n",
  "test/greet.test.js": "import assert from \"node:assert/strict\";\nimport test from \"node:test\";\nimport { greet } from \"../src/greet.js\";\n\ntest(\"greet names the person\", () => assert.equal(greet(\"Ada\"), \"Hello, Ada!\"));\n",
  "README.md": "# greet\n\nA command line tool that prints a greeting: `greet Ada` prints `Hello, Ada!`.\n",
  "AGENTS.md": "# greet\n\n- Plain Node.js ES modules, no dependencies.\n- Tests: `npm test` (node:test).\n",
};

function tinyProject(): string {
  const dir = tempDir("factory-plan-smoke-", { real: true });
  for (const [file, body] of Object.entries(PROJECT_FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=smoke", "-c", "user.email=smoke@example.invalid", "-c", "core.autocrlf=false", ...args]);
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "greet");
  return dir;
}

function answerOf(question: Payload): string {
  const allowed: string[] = question.allowed ?? [];
  if (String(question.id).startsWith("q-plan-draft-review")) return "approve";
  if (!allowed.length) return "Use your recommended answer for every question.";
  if (allowed.join() === "1,2,3") return "1";
  for (const answer of ["continue", "accept", "finding", "skip"]) if (allowed.includes(answer)) return answer;
  return allowed[0]!;
}

function overLimit(startedAt: number, where: string): never {
  throw new Error(`the smoke run passed its ${LIMIT_MIN} min limit after ${((Date.now() - startedAt) / 60000).toFixed(1)} min, ${where}`);
}

test(`the plan documentation of a one-Task idea ends done within ${LIMIT_MIN} min and $${BUDGET_USD}`, { timeout: (LIMIT_MIN + 1) * 60000 }, async () => {
  const project = tinyProject();
  const factory = new Factory(tempDir("factory-plan-smoke-data-"), { backend: "delegate" });
  const { run } = factory.start("Draft the Feature and plan it with an implementation plan for every Task", undefined, { workflow: "olko-plan-documentation", input: { project, idea: IDEA, route: "both", featureId: FEATURE, switches: { tracker: false, editor: false } } });
  factory.confirm(run.runId, { tierModels: { low: MODEL, medium: MODEL, high: MODEL }, budget: { maxCostUsd: BUDGET_USD } });
  const startedAt = Date.now();
  const deadline = startedAt + LIMIT_MIN * 60000;
  const offered: string[] = [];
  const subagents = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      subagents.abort();
      reject(new Error(`the smoke run passed its ${LIMIT_MIN} min limit while subagents were running`));
    }, deadline - startedAt);
  });
  expired.catch(() => undefined);
  try {
    let view = factory.status(factory.get(run.runId));
    while (!ENDED.has(view.status)) {
      if (Date.now() > deadline) overLimit(startedAt, `at status ${view.status}`);
      if (view.status === "waiting_for_client") {
        const items = (view.pendingWorkItems ?? []) as Payload[];
        offered.push(...items.map((w) => String(w.nodePath)));
        const results = await Promise.race([Promise.all(items.map((w) => runSubagent(w, { cwd: (w.cwd as string | undefined) ?? project, signal: subagents.signal }))), expired]);
        for (const [i, work] of items.entries()) factory.submit(run.runId, work.nodePath, results[i]!.output, results[i]!.usage, work.agentId);
      } else if (view.status === "waiting_for_user") {
        const question = view.pendingQuestion as Payload;
        factory.answer(run.runId, question.id, answerOf(question));
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
      view = factory.status(factory.get(run.runId));
    }
    const ended = factory.get(run.runId);
    const minutes = (Date.now() - startedAt) / 60000;
    const costUsd = factory.totals(ended).costUsd;
    console.log(JSON.stringify({ runId: run.runId, status: ended.status, minutes: Number(minutes.toFixed(1)), calls: offered.length, costUsd: Number(costUsd.toFixed(3)) }));

    assert.equal(ended.status, "done", JSON.stringify(ended.events.at(-1)));
    assert.ok(minutes <= LIMIT_MIN, `${minutes.toFixed(1)} min is over the ${LIMIT_MIN} min limit`);
    assert.ok(costUsd <= BUDGET_USD, `$${costUsd.toFixed(2)} is over the $${BUDGET_USD} budget`);
    const drafts = offered.filter((p) => p.split("/").pop() === "draft").length;
    assert.ok(drafts <= MAX_DRAFTS, `draft ran ${drafts} times, at most ${MAX_DRAFTS} expected`);
    const feature = path.join(project, "plans", "features", FEATURE);
    for (const name of ["business.md", "implementation.md"]) assert.ok(fs.existsSync(path.join(feature, name)), `${name} is written`);
    assert.ok(fs.readdirSync(path.join(feature, "tasks")).some((f) => f.endsWith("-implementation.md")), "the Task has an implementation plan");
  } finally {
    clearTimeout(timer);
    subagents.abort();
    if (!ENDED.has(factory.get(run.runId).status)) factory.cancel(run.runId);
    removeDir(project);
  }
});
