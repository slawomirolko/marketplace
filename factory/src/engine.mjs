import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { priceUsage } from "./prices.mjs";
import { REVIEW_WORKFLOW } from "./workflows/olko-review.mjs";

const FAKE_PRICE_PER_MTOK = {
  low: { input: 0.8, output: 4 },
  medium: { input: 3, output: 15 },
  high: { input: 15, output: 75 },
};

const DEFAULT_CONFIG = {
  roles: { planner: "high", implementer: "medium", reviewer: "medium", accountant: "low" },
  tiers: { low: "fake-low", medium: "fake-medium", high: "fake-high" },
  backend: { kind: "fake" },
  budget: { maxCostUsd: 1.5, infoRatio: 0.5, pauseRatio: 0.8 },
};

export const WORKFLOW = {
  name: "hello",
  version: "0.1.0",
  nodes: [
    {
      id: "plan",
      path: "hello/plan",
      kind: "llm",
      role: "planner",
      turns: 3,
      prompt: "You are the planner node of a test workflow. Goal: {goal}. Reply with a 3-step plan in at most 50 words. Do not use any tools.",
    },
    {
      id: "implement",
      path: "hello/build/implement",
      kind: "llm",
      role: "implementer",
      turns: 4,
      askAfterTurn: 2,
      question: { id: "q-endpoint", text: "New endpoint or extend the existing one?", allowed: ["new", "extend"] },
      prompt: "You are the implementer node of a test workflow. Goal: {goal}. The user chose: {answer}. Reply with a JavaScript function of at most 8 lines that returns a greeting. Do not use any tools.",
    },
    { id: "verify", path: "hello/build/verify", kind: "script" },
    {
      id: "review",
      path: "hello/review",
      kind: "llm",
      role: "reviewer",
      turns: 1,
      agents: [{ id: "security" }, { id: "style" }, { id: "tests" }, { id: "docs", role: "accountant" }],
      prompt: "You are the {agent} reviewer of a test workflow. Goal: {goal}. In one sentence, name one {agent} risk of a greeting function. Do not use any tools.",
    },
    {
      id: "accountant",
      path: "hello/accountant",
      kind: "llm",
      role: "accountant",
      turns: 1,
      prompt: "You are the accountant node of a test workflow. In one sentence, report that the run has used {steps} steps so far. Do not use any tools.",
    },
  ],
};

const WORKFLOWS = { hello: WORKFLOW, [REVIEW_WORKFLOW.name]: REVIEW_WORKFLOW };

export function workflowOf(run) {
  const workflow = WORKFLOWS[run.workflow ?? "hello"];
  if (!workflow) throw new Error(`unknown workflow ${run.workflow}`);
  return workflow;
}

function workflowLabel(run) {
  const workflow = workflowOf(run);
  return `${workflow.name}@${workflow.version}`;
}

const TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);

function fakeModelTurn(tier, turn, agentIndex = 0) {
  const inputTokens = 3000 + turn * 1500 + agentIndex * 700;
  const outputTokens = 300 + turn * 50;
  const price = FAKE_PRICE_PER_MTOK[tier];
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { inputTokens, outputTokens, costUsd };
}

export class Factory {
  constructor(dataDir, { executors = {} } = {}) {
    this.dataDir = dataDir;
    this.executors = executors;
    this.runs = new Map();
    this.idempotency = new Map();
    this.timers = new Map();
    this.busy = new Set();
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
    const entry = { runId: run.runId, workflow: workflowLabel(run), at: new Date().toISOString(), ...record };
    run.ledger.push(entry);
    fs.appendFileSync(path.join(this.dataDir, "ledger.jsonl"), JSON.stringify(entry) + "\n");
    this.event(run, "ledger_record", { node: record.nodePath, costUsd: record.costUsd, costSource: record.costSource });
  }

  event(run, type, data = {}) {
    run.events.push({ at: new Date().toISOString(), type, ...data });
  }

  get(runId) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown runId ${runId}`);
    return run;
  }

  start(goal, idempotencyKey, { workflow = "hello", input = {} } = {}) {
    if (!WORKFLOWS[workflow]) throw new Error(`unknown workflow ${workflow}`);
    if (idempotencyKey && this.idempotency.has(idempotencyKey)) {
      return { run: this.get(this.idempotency.get(idempotencyKey)), reused: true };
    }
    const run = {
      runId: `r-${crypto.randomUUID().slice(0, 8)}`,
      idempotencyKey: idempotencyKey ?? null,
      goal,
      workflow,
      input,
      state: {},
      nodeAgents: {},
      status: "needs_confirmation",
      proposal: { ...structuredClone(DEFAULT_CONFIG), roles: { ...DEFAULT_CONFIG.roles, ...(WORKFLOWS[workflow].roles ?? {}) } },
      config: null,
      cursor: 0,
      nodeTurn: 0,
      steps: 0,
      pendingQuestion: null,
      pendingWork: null,
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
    const backend = { ...run.proposal.backend, ...(overrides.backend ?? {}) };
    if (backend.kind === "cli" && !this.executors[backend.cli]) throw new Error(`no executor for cli backend '${backend.cli}' in this factory process`);
    run.config = {
      ...run.proposal,
      backend,
      roles: { ...run.proposal.roles, ...(overrides.roles ?? {}) },
      tiers: { ...run.proposal.tiers, ...(overrides.tierModels ?? {}) },
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

  next(runId) {
    const run = this.get(runId);
    return run.status === "waiting_for_client" ? run.pendingWork : null;
  }

  submit(runId, nodePath, output, usage = {}, agentId = undefined) {
    const run = this.get(runId);
    const work = run.pendingWork;
    if (run.status !== "waiting_for_client" || !work || work.nodePath !== nodePath) {
      const done = run.ledger.find((r) => r.nodePath === nodePath && r.backend === "delegate" && (!agentId || r.agentId === agentId));
      if (done) return { run, duplicate: true };
      throw new Error(`no pending work for node ${nodePath}`);
    }
    const hasSplit = Number.isInteger(usage.inputTokens) && Number.isInteger(usage.outputTokens);
    const tokens = {
      input: hasSplit ? usage.inputTokens : null,
      output: hasSplit ? usage.outputTokens : null,
      cacheRead: usage.cacheReadTokens ?? 0,
      cacheWrite5m: usage.cacheWriteTokens ?? 0,
      cacheWrite1h: 0,
    };
    const priced = hasSplit ? priceUsage(usage.model ?? work.model, tokens, false) : { costUsd: null, costSource: "unknown" };
    run.steps += 1;
    this.appendLedger(run, {
      nodePath,
      agentId: work.agentId,
      kind: "llm",
      tier: work.tier,
      model: usage.model ?? work.model,
      backend: "delegate",
      turn: 1,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheReadTokens: tokens.cacheRead,
      cacheWrite5mTokens: tokens.cacheWrite5m,
      cacheWrite1hTokens: 0,
      totalTokens: usage.totalTokens ?? null,
      childSessionId: usage.childSessionId ?? null,
      costUsd: priced.costUsd,
      costSource: hasSplit ? "reported" : "unknown",
      outputPreview: String(output ?? "").slice(0, 200),
    });
    run.pendingWork = null;
    run.status = "running";
    this.finishAgent(run, workflowOf(run).nodes[run.cursor], { backend: "delegate" });
    this.checkpoint(run);
    this.schedule(run);
    return { run, duplicate: false };
  }

  enrichLedger(runId, index, usage) {
    const run = this.get(runId);
    const record = run.ledger[index];
    const priced = priceUsage(record.model, usage.tokens, usage.cacheWriteTtlKnown);
    Object.assign(record, {
      inputTokens: usage.tokens.input,
      outputTokens: usage.tokens.output,
      cacheReadTokens: usage.tokens.cacheRead,
      cacheWrite5mTokens: usage.tokens.cacheWrite5m,
      costUsd: priced.costUsd,
      costSource: priced.costSource,
      enrichedFrom: "child-session",
    });
    this.checkpoint(run);
  }

  cancel(runId) {
    const run = this.get(runId);
    if (!["done", "stopped", "failed"].includes(run.status)) {
      run.status = "cancelled";
      this.event(run, "run_cancelled");
      this.checkpoint(run);
    }
    return run;
  }

  schedule(run) {
    if (this.timers.has(run.runId) || this.busy.has(run.runId)) return;
    const tick = async () => {
      this.timers.delete(run.runId);
      if (run.status !== "running") return;
      this.busy.add(run.runId);
      try {
        await this.step(run);
      } catch (error) {
        run.status = "failed";
        this.event(run, "run_failed", { error: error.message });
      } finally {
        this.busy.delete(run.runId);
      }
      this.checkpoint(run);
      if (run.status === "running") this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
    };
    this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
  }

  totals(run) {
    const costUsd = run.ledger.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const tokens = run.ledger.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.inputTokens == null ? (r.totalTokens ?? 0) : 0), 0);
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
      run.pendingQuestion = { id: "q-budget-pause", text: `The factory run has used ${Math.round(ratio * 100)}% of its budget. Continue or stop?`, allowed: ["continue", "stop"] };
      this.event(run, "budget_threshold", { level: "pause", ratio });
      return false;
    }
    return true;
  }

  prompt(run, node) {
    if (typeof node.prompt === "function") return node.prompt({ goal: run.goal, input: run.input, state: run.state, agent: currentAgent(run, node) });
    return node.prompt
      .replace("{goal}", run.goal)
      .replace("{answer}", run.answers[node.question?.id] ?? "")
      .replace("{steps}", String(run.steps))
      .replaceAll("{agent}", currentAgent(run, node).id);
  }

  async step(run) {
    if (run.answers["q-budget-pause"] === "stop") {
      run.status = "stopped";
      return;
    }
    if (!this.checkBudget(run)) return;
    const node = workflowOf(run).nodes[run.cursor];
    if (!node) {
      run.status = "done";
      this.event(run, "run_completed", this.totals(run));
      return;
    }
    if (run.nodeTurn === 0 && !run.events.some((e) => e.type === "node_started" && e.node === node.path && e.cursor === run.cursor)) {
      this.event(run, "node_started", { node: node.path, cursor: run.cursor });
    }

    if (node.kind === "script") {
      run.steps += 1;
      const started = Date.now();
      const result = node.script ? await node.script({ input: run.input ?? {}, state: run.state ?? {}, exec: this.executors.exec }) : { state: { passed: true }, output: "verify passed" };
      if (run.state) run.state[node.id] = result.state;
      this.appendLedger(run, { nodePath: node.path, agentId: node.id, kind: "script", tier: null, model: null, backend: "script", turn: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "measured", durationMs: Date.now() - started, output: result.output ?? null });
      this.event(run, "node_completed", { node: node.path, result: String(result.output ?? "").split(/\r?\n/)[0].slice(0, 200) });
      run.cursor += 1;
      run.nodeTurn = 0;
      return;
    }

    const backend = run.config.backend.kind;
    const askNow = backend === "fake" ? run.nodeTurn === node.askAfterTurn : true;
    if (node.question && askNow && run.answers[node.question.id] === undefined) {
      run.status = "waiting_for_user";
      run.pendingQuestion = { ...node.question, node: node.path };
      this.event(run, "needs_input", { node: node.path, questionId: node.question.id });
      return;
    }

    if (node.agentsFrom && run.nodeAgents?.[node.id] === undefined) {
      run.nodeAgents ??= {};
      run.nodeAgents[node.id] = node.agentsFrom(run.state);
      this.event(run, "agents_selected", { node: node.path, agents: run.nodeAgents[node.id].map((a) => a.id) });
    }
    if (agentsOf(run, node)?.length === 0 || node.skipIf?.(run.state)) {
      this.event(run, "node_skipped", { node: node.path, reason: node.skipReason ?? "no work" });
      run.cursor += 1;
      run.nodeTurn = 0;
      run.agentIndex = 0;
      return;
    }
    const agent = currentAgent(run, node);
    const tier = run.config.roles[agent.role];
    if (backend === "cli") return this.runCliNode(run, node, tier);
    if (backend === "delegate") {
      run.pendingWork = { nodePath: node.path, agentId: agent.id, tier, model: run.config.tiers[tier], prompt: this.prompt(run, node) };
      run.status = "waiting_for_client";
      this.event(run, "work_offered", { node: node.path, agentId: agent.id, tier });
      return;
    }

    const turn = run.nodeTurn + 1;
    const usage = fakeModelTurn(tier, turn, run.agentIndex ?? 0);
    run.steps += 1;
    run.nodeTurn = turn;
    this.appendLedger(run, { nodePath: node.path, agentId: agent.id, kind: "llm", tier, model: run.config.tiers[tier], backend: "fake", turn, ...usage, costSource: "measured" });
    if (turn >= node.turns) this.finishAgent(run, node, { turns: turn });
  }

  finishAgent(run, node, details) {
    const agent = currentAgent(run, node);
    const agents = agentsOf(run, node);
    if (agents) this.event(run, "agent_completed", { node: node.path, agentId: agent.id, ...details });
    run.nodeTurn = 0;
    if (agents && (run.agentIndex ?? 0) + 1 < agents.length) {
      run.agentIndex = (run.agentIndex ?? 0) + 1;
      return;
    }
    run.agentIndex = 0;
    run.cursor += 1;
    this.event(run, "node_completed", { node: node.path, ...details });
  }

  async runCliNode(run, node, tier) {
    const { cli } = run.config.backend;
    const model = run.config.tiers[tier];
    const agent = currentAgent(run, node);
    const agentId = agent.id;
    const result = await this.executors[cli]({ model, prompt: this.prompt(run, node), agent: agent.agentName, cwd: run.input?.cwd, configDir: run.input?.agentConfigDir });
    run.steps += 1;
    if (!result.ok) {
      run.status = "failed";
      this.event(run, "node_failed", { node: node.path, error: result.error });
      return;
    }
    for (const u of result.usageByModel) {
      const priced = priceUsage(u.model, u.tokens, u.cacheWriteTtlKnown);
      this.appendLedger(run, {
        nodePath: node.path,
        agentId,
        kind: "llm",
        tier,
        model: u.model,
        requestedModel: model,
        backend: `cli:${cli}`,
        turn: 1,
        harnessTurns: result.turns,
        inputTokens: u.tokens.input,
        outputTokens: u.tokens.output,
        cacheReadTokens: u.tokens.cacheRead,
        cacheWrite5mTokens: u.tokens.cacheWrite5m,
        cacheWrite1hTokens: u.tokens.cacheWrite1h,
        costUsd: priced.costUsd,
        costSource: priced.costSource,
        harnessCostUsd: u.harnessCostUsd,
        durationMs: result.durationMs,
        outputPreview: String(result.text ?? "").slice(0, 200),
        output: result.text ?? null,
        agentName: agent.agentName ?? null,
      });
    }
    if (node.parse && run.state) run.state[node.id] = { ...(run.state[node.id] ?? {}), [agentId]: node.parse(result.text ?? "") };
    this.finishAgent(run, node, { backend: `cli:${cli}` });
  }

  footer(run) {
    const t = this.totals(run);
    const max = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
    const perNode = {};
    for (const r of run.ledger) perNode[r.nodePath] = round((perNode[r.nodePath] ?? 0) + (r.costUsd ?? 0));
    return {
      costUsd: round(t.costUsd),
      budgetUsd: max,
      budgetRatio: round(t.costUsd / max),
      tokens: t.tokens,
      steps: t.steps,
      perNode,
      source: costSourceSummary(run.ledger),
      warnings: run.thresholdsHit.map((h) => `budget threshold: ${h}`),
    };
  }

  status(run) {
    const node = workflowOf(run).nodes[run.cursor];
    return {
      runId: run.runId,
      status: run.status,
      currentNode: node?.path ?? null,
      pendingQuestion: run.pendingQuestion,
      pendingWork: run.status === "waiting_for_client" ? run.pendingWork : undefined,
      retryAfterMs: run.status === "running" ? 2000 : null,
      next: nextHint(run),
      proposal: run.status === "needs_confirmation" ? run.proposal : undefined,
      cost: this.footer(run),
    };
  }

  report(run) {
    const byNode = {};
    const byTier = {};
    const byModel = {};
    const byCostSource = {};
    let harnessCostUsd = 0;
    let cacheTokens = 0;
    const coverage = { run: { llmSteps: 0, unknownSteps: 0 }, byTier: {}, byModel: {} };
    const count = (target) => {
      target.llmSteps = (target.llmSteps ?? 0) + 1;
      target.unknownSteps = target.unknownSteps ?? 0;
    };
    const countUnknown = (target) => (target.unknownSteps = (target.unknownSteps ?? 0) + 1);
    for (const r of run.ledger) {
      const cache = (r.cacheReadTokens ?? 0) + (r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0);
      cacheTokens += cache;
      byNode[r.nodePath] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: r.tier, model: r.model ?? null, byAgent: {} };
      byNode[r.nodePath].cacheTokens += cache;
      const agentKey = r.agentId ?? r.nodePath.split("/").at(-1);
      const agentEntry = (byNode[r.nodePath].byAgent[agentKey] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: r.tier, model: r.model ?? null, agentName: r.agentName ?? null, sources: [] });
      agentEntry.cacheTokens += cache;
      agentEntry.steps += 1;
      agentEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
      agentEntry.costUsd += r.costUsd ?? 0;
      agentEntry.sources.push(r.costSource);
      byNode[r.nodePath].steps += 1;
      byNode[r.nodePath].tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
      byNode[r.nodePath].costUsd += r.costUsd ?? 0;
      const tierKey = r.tier ?? "script";
      byTier[tierKey] = (byTier[tierKey] ?? 0) + (r.costUsd ?? 0);
      if (r.kind === "llm") {
        byModel[r.model ?? "unknown"] = (byModel[r.model ?? "unknown"] ?? 0) + (r.costUsd ?? 0);
        byCostSource[r.costSource] = (byCostSource[r.costSource] ?? 0) + 1;
        const targets = [coverage.run, (coverage.byTier[tierKey] ??= {}), (coverage.byModel[r.model ?? "unknown"] ??= {}), byNode[r.nodePath], agentEntry];
        targets.forEach(count);
        if (r.costSource === "unknown") targets.forEach(countUnknown);
      }
      harnessCostUsd += r.harnessCostUsd ?? 0;
    }
    for (const [nodePath, entry] of Object.entries(byNode)) {
      entry.costUsd = round(entry.costUsd);
      const agentTiers = new Set(Object.values(entry.byAgent).map((x) => x.tier));
      if (agentTiers.size > 1) Object.assign(entry, { tier: "mixed", model: "mixed" });
      for (const agentEntry of Object.values(entry.byAgent)) {
        agentEntry.costUsd = round(agentEntry.costUsd);
        const sources = new Set(agentEntry.sources);
        agentEntry.costSource = sources.size === 1 ? [...sources][0] : "mixed";
        delete agentEntry.sources;
      }
      const nodeSources = new Set(run.ledger.filter((r) => r.nodePath === nodePath).map((r) => r.costSource));
      entry.costSource = nodeSources.size === 1 ? [...nodeSources][0] : "mixed";
    }
    for (const totals of [byTier, byModel]) for (const key of Object.keys(totals)) totals[key] = round(totals[key]);
    return { runId: run.runId, status: run.status, workflow: workflowLabel(run), backend: run.config?.backend, tierModels: run.config?.tiers, byNode, byTier, byModel, byCostSource, coverage, cacheTokens, harnessCostUsd: round(harnessCostUsd), cost: this.footer(run) };
  }

  trace(run) {
    const lines = [`run ${run.runId} [${run.status}] ${workflowLabel(run)}  $${round(this.totals(run).costUsd)}`];
    let lastNode = null;
    for (const r of run.ledger) {
      if (r.nodePath !== lastNode) {
        lines.push(`  ${r.nodePath} (${r.tier ?? "script"})`);
        lastNode = r.nodePath;
      }
      lines.push(`    turn ${r.turn}: in=${r.inputTokens} out=${r.outputTokens} $${r.costUsd == null ? "?" : round(r.costUsd)} ${r.costSource}`);
    }
    for (const e of run.events.filter((e) => ["needs_input", "run_resumed", "budget_threshold"].includes(e.type))) {
      lines.push(`  event ${e.type} ${e.node ?? e.questionId ?? e.level ?? ""}`);
    }
    return lines.join("\n");
  }
}

function agentsOf(run, node) {
  return run.nodeAgents?.[node.id] ?? node.agents ?? null;
}

function currentAgent(run, node) {
  const agents = agentsOf(run, node);
  if (!agents) return { id: node.id, role: node.role, agentName: node.agent };
  const agent = agents[run.agentIndex ?? 0];
  return { ...agent, role: agent.role ?? node.role, agentName: agent.agentName ?? node.agent };
}

function costSourceSummary(ledger) {
  const sources = new Set(ledger.filter((r) => r.kind === "llm").map((r) => r.costSource));
  if (sources.size === 0) return "none";
  return sources.size === 1 ? [...sources][0] : "mixed";
}

function nextHint(run) {
  switch (run.status) {
    case "needs_confirmation":
      return "Show the proposal to the user. After the user replies, call factory_confirm.";
    case "running":
      return "Call factory_wait. factory_wait returns when the run needs the user, needs your node work in delegate mode, or ends. Do not call factory_status in a loop.";
    case "waiting_for_user":
      return "Ask the user pendingQuestion.text. Then send the user's answer with factory_answer.";
    case "waiting_for_client":
      return "Run pendingWork.prompt in a subagent. Use the model in pendingWork.model. Then call factory_submit with the subagent output. If pendingWork has an agentId, pass the same agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), pass it as usage.childSessionId.";
    default:
      return "The run has ended (done, stopped, cancelled or failed). Call factory_report. Show the user viewerUrl: it shows the whole flow and the cost of each agent. Do not call factory_wait or factory_status again.";
  }
}

function round(v) {
  return Math.round(v * 1e6) / 1e6;
}

export function runReport(run) {
  return Factory.prototype.report.call(Factory.prototype, run);
}
