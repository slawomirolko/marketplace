import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PRICE_PER_MTOK = {
  low: { input: 0.8, output: 4 },
  medium: { input: 3, output: 15 },
  high: { input: 15, output: 75 },
};

const DEFAULT_CONFIG = {
  roles: { planner: "high", implementer: "medium", accountant: "low" },
  tiers: { low: "fake-low", medium: "fake-medium", high: "fake-high" },
  budget: { maxCostUsd: 1.5, infoRatio: 0.5, pauseRatio: 0.8 },
};

const WORKFLOW = {
  name: "hello",
  version: "0.1.0",
  nodes: [
    { id: "plan", path: "hello/plan", kind: "llm", role: "planner", turns: 3 },
    {
      id: "implement",
      path: "hello/build/implement",
      kind: "llm",
      role: "implementer",
      turns: 4,
      askAfterTurn: 2,
      question: { id: "q-endpoint", text: "New endpoint or extend the existing one?", allowed: ["new", "extend"] },
    },
    { id: "verify", path: "hello/build/verify", kind: "script" },
    { id: "accountant", path: "hello/accountant", kind: "llm", role: "accountant", turns: 1 },
  ],
};

const TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);

function fakeModelTurn(tier, turn) {
  const inputTokens = 3000 + turn * 1500;
  const outputTokens = 300 + turn * 50;
  const price = PRICE_PER_MTOK[tier];
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { inputTokens, outputTokens, costUsd };
}

export class Factory {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.runs = new Map();
    this.idempotency = new Map();
    this.timers = new Map();
    this.waiters = new Map();
    fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
    this.restore();
  }

  restore() {
    const dir = path.join(this.dataDir, "runs");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      this.runs.set(run.runId, run);
      if (run.idempotencyKey) this.idempotency.set(run.idempotencyKey, run.runId);
      if (run.status === "running") this.schedule(run);
    }
  }

  checkpoint(run) {
    fs.writeFileSync(path.join(this.dataDir, "runs", `${run.runId}.json`), JSON.stringify(run, null, 2));
    if (run.status !== "running") this.notify(run);
  }

  notify(run) {
    const waiting = this.waiters.get(run.runId);
    if (!waiting) return;
    this.waiters.delete(run.runId);
    for (const resolve of waiting) resolve(run);
  }

  waitForChange(runId, timeoutMs) {
    const run = this.get(runId);
    if (run.status !== "running") return Promise.resolve({ run, timedOut: false });
    return new Promise((resolve) => {
      const done = (r) => {
        clearTimeout(timer);
        resolve({ run: r, timedOut: false });
      };
      const timer = setTimeout(() => {
        this.waiters.get(runId)?.delete(done);
        resolve({ run, timedOut: true });
      }, timeoutMs);
      if (!this.waiters.has(runId)) this.waiters.set(runId, new Set());
      this.waiters.get(runId).add(done);
    });
  }

  appendLedger(run, record) {
    const entry = { runId: run.runId, workflow: `${WORKFLOW.name}@${WORKFLOW.version}`, at: new Date().toISOString(), ...record };
    run.ledger.push(entry);
    fs.appendFileSync(path.join(this.dataDir, "ledger.jsonl"), JSON.stringify(entry) + "\n");
    this.event(run, "ledger_record", { node: record.nodePath, costUsd: record.costUsd });
  }

  event(run, type, data = {}) {
    run.events.push({ at: new Date().toISOString(), type, ...data });
  }

  get(runId) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown runId ${runId}`);
    return run;
  }

  start(goal, idempotencyKey) {
    if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
      return { run: this.get(this.idempotency.get(idempotencyKey)), reused: true };
    }
    const run = {
      runId: `r-${crypto.randomUUID().slice(0, 8)}`,
      idempotencyKey: idempotencyKey ?? null,
      goal,
      status: "needs_confirmation",
      proposal: structuredClone(DEFAULT_CONFIG),
      config: null,
      cursor: 0,
      nodeTurn: 0,
      steps: 0,
      pendingQuestion: null,
      answers: {},
      ledger: [],
      events: [],
      thresholdsHit: [],
    };
    this.runs.set(run.runId, run);
    if (idempotencyKey) this.idempotency.set(idempotencyKey, run.runId);
    this.event(run, "run_created", { goal });
    this.checkpoint(run);
    return { run, reused: false };
  }

  confirm(runId, overrides = {}) {
    const run = this.get(runId);
    if (run.status !== "needs_confirmation") return run;
    run.config = {
      ...run.proposal,
      roles: { ...run.proposal.roles, ...(overrides.roles ?? {}) },
      budget: { ...run.proposal.budget, ...(overrides.budget ?? {}) },
    };
    run.status = "running";
    this.event(run, "run_confirmed", { config: run.config });
    this.checkpoint(run);
    this.schedule(run);
    return run;
  }

  answer(runId, questionId, answer) {
    const run = this.get(runId);
    if (run.answers[questionId] !== undefined) {
      if (run.answers[questionId] === answer) return { run, duplicate: true };
      throw new Error(`question ${questionId} already answered with a different value`);
    }
    const pending = run.pendingQuestion;
    if (!pending || pending.id !== questionId) throw new Error(`no pending question ${questionId}`);
    if (pending.allowed && !pending.allowed.includes(answer)) {
      throw new Error(`invalid answer '${answer}', allowed: ${pending.allowed.join(", ")}`);
    }
    run.answers[questionId] = answer;
    run.pendingQuestion = null;
    run.status = "running";
    this.event(run, "run_resumed", { questionId });
    this.checkpoint(run);
    this.schedule(run);
    return { run, duplicate: false };
  }

  cancel(runId) {
    const run = this.get(runId);
    if (!["done", "stopped"].includes(run.status)) {
      run.status = "cancelled";
      this.event(run, "run_cancelled");
      this.checkpoint(run);
    }
    return run;
  }

  schedule(run) {
    if (this.timers.has(run.runId)) return;
    const tick = () => {
      this.timers.delete(run.runId);
      if (run.status !== "running") return;
      this.step(run);
      this.checkpoint(run);
      if (run.status === "running") this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
    };
    this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
  }

  totals(run) {
    const costUsd = run.ledger.reduce((s, r) => s + r.costUsd, 0);
    const tokens = run.ledger.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
    return { costUsd, tokens, steps: run.steps };
  }

  checkBudget(run) {
    const { maxCostUsd, infoRatio, pauseRatio } = run.config.budget;
    const ratio = this.totals(run).costUsd / maxCostUsd;
    if (ratio >= 1) {
      run.status = "stopped";
      this.event(run, "budget_exceeded", { ratio });
      return false;
    }
    if (ratio >= infoRatio && !run.thresholdsHit.includes("info")) {
      run.thresholdsHit.push("info");
      this.event(run, "budget_threshold", { level: "info", ratio });
    }
    if (ratio >= pauseRatio && !run.thresholdsHit.includes("pause")) {
      run.thresholdsHit.push("pause");
      run.status = "waiting_for_user";
      run.pendingQuestion = { id: "q-budget-pause", text: `Budget at ${Math.round(ratio * 100)}%. Continue?`, allowed: ["continue", "stop"] };
      this.event(run, "budget_threshold", { level: "pause", ratio });
      return false;
    }
    return true;
  }

  step(run) {
    if (run.answers["q-budget-pause"] === "stop") {
      run.status = "stopped";
      return;
    }
    if (!this.checkBudget(run)) return;
    const node = WORKFLOW.nodes[run.cursor];
    if (!node) {
      run.status = "done";
      this.event(run, "run_completed", this.totals(run));
      return;
    }
    if (run.nodeTurn === 0) this.event(run, "node_started", { node: node.path });

    if (node.kind === "script") {
      run.steps += 1;
      this.appendLedger(run, { nodePath: node.path, kind: "script", tier: null, model: null, turn: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "measured" });
      this.event(run, "node_completed", { node: node.path, result: "verify passed" });
      run.cursor += 1;
      run.nodeTurn = 0;
      return;
    }

    if (node.question && run.nodeTurn === node.askAfterTurn && run.answers[node.question.id] === undefined) {
      run.status = "waiting_for_user";
      run.pendingQuestion = { ...node.question, node: node.path };
      this.event(run, "needs_input", { node: node.path, questionId: node.question.id });
      return;
    }

    const tier = run.config.roles[node.role];
    const turn = run.nodeTurn + 1;
    const usage = fakeModelTurn(tier, turn);
    run.steps += 1;
    run.nodeTurn = turn;
    this.appendLedger(run, { nodePath: node.path, kind: "llm", tier, model: run.config.tiers[tier], turn, ...usage, costSource: "measured" });
    if (turn >= node.turns) {
      this.event(run, "node_completed", { node: node.path, turns: turn });
      run.cursor += 1;
      run.nodeTurn = 0;
    }
  }

  footer(run) {
    const t = this.totals(run);
    const max = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
    const perNode = {};
    for (const r of run.ledger) perNode[r.nodePath] = round((perNode[r.nodePath] ?? 0) + r.costUsd);
    return {
      costUsd: round(t.costUsd),
      budgetUsd: max,
      budgetRatio: round(t.costUsd / max),
      tokens: t.tokens,
      steps: t.steps,
      perNode,
      source: "measured",
      warnings: run.thresholdsHit.map((h) => `budget threshold: ${h}`),
    };
  }

  status(run) {
    const node = WORKFLOW.nodes[run.cursor];
    return {
      runId: run.runId,
      status: run.status,
      currentNode: node?.path ?? null,
      pendingQuestion: run.pendingQuestion,
      retryAfterMs: run.status === "running" ? 2000 : null,
      next: nextHint(run),
      proposal: run.status === "needs_confirmation" ? run.proposal : undefined,
      cost: this.footer(run),
    };
  }

  report(run) {
    const byNode = {};
    const byTier = {};
    for (const r of run.ledger) {
      byNode[r.nodePath] ??= { steps: 0, tokens: 0, costUsd: 0, tier: r.tier };
      byNode[r.nodePath].steps += 1;
      byNode[r.nodePath].tokens += r.inputTokens + r.outputTokens;
      byNode[r.nodePath].costUsd = round(byNode[r.nodePath].costUsd + r.costUsd);
      const tierKey = r.tier ?? "script";
      byTier[tierKey] = round((byTier[tierKey] ?? 0) + r.costUsd);
    }
    return { runId: run.runId, status: run.status, workflow: `${WORKFLOW.name}@${WORKFLOW.version}`, byNode, byTier, cost: this.footer(run) };
  }

  trace(run) {
    const lines = [`run ${run.runId} [${run.status}] ${WORKFLOW.name}@${WORKFLOW.version}  $${round(this.totals(run).costUsd)}`];
    let lastNode = null;
    for (const r of run.ledger) {
      if (r.nodePath !== lastNode) {
        lines.push(`  ${r.nodePath} (${r.tier ?? "script"})`);
        lastNode = r.nodePath;
      }
      lines.push(`    turn ${r.turn}: in=${r.inputTokens} out=${r.outputTokens} $${round(r.costUsd)}`);
    }
    for (const e of run.events.filter((e) => ["needs_input", "run_resumed", "budget_threshold"].includes(e.type))) {
      lines.push(`  event ${e.type} ${e.node ?? e.questionId ?? e.level ?? ""}`);
    }
    return lines.join("\n");
  }
}

function nextHint(run) {
  switch (run.status) {
    case "needs_confirmation":
      return "Show the proposal to the user, then call factory_confirm.";
    case "running":
      return "Call factory_wait; it returns when the run needs the user or finishes. Do not poll factory_status in a loop.";
    case "waiting_for_user":
      return "Ask the user pendingQuestion.text and send the answer with factory_answer.";
    default:
      return "Run finished. Call factory_report.";
  }
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}
