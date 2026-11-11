import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { priceUsage } from "./prices.ts";
import { evaluateWhen, loadWorkflowDir } from "./workflow-yaml.ts";
import { FACTORY_DIR } from "./paths.ts";
import { loadFactoryConfig } from "./config.ts";
import { readMarketplaceAgent } from "./marketplace-agents.ts";
import Mustache from "mustache";
import type {
  Agent,
  CliName,
  ConfirmOverrides,
  CostFooter,
  CostSource,
  Coverage,
  Executors,
  LedgerEntry,
  LedgerRecord,
  ModelUsage,
  NodeCost,
  PendingWork,
  Report,
  Run,
  RunConfig,
  RunEvent,
  RunInput,
  RunStatusView,
  SubmitUsage,
  Tier,
  TokenCounts,
  Workflow,
  WorkflowNode,
} from "./types.ts";

const FAKE_PRICE_PER_MTOK: Record<Tier, { input: number; output: number }> = {
  low: { input: 0.8, output: 4 },
  medium: { input: 3, output: 15 },
  high: { input: 15, output: 75 },
};

const PARALLEL_AGENTS = 10;

function workspace(run: Run): string {
  return run.input?.cwd ?? process.env.FACTORY_WORKSPACE ?? process.cwd();
}

function defaultConfig(kind: "fake" | "delegate" | "cli", cli?: CliName): RunConfig {
  const file = loadFactoryConfig();
  const tiers = kind === "fake" ? { low: "fake-low", medium: "fake-medium", high: "fake-high" } : { low: "claude-haiku-5-5", medium: "claude-sonnet-5-5", high: "claude-opus-5-5" };
  const backend = kind === "cli" ? { kind: "cli" as const, cli: cli as CliName } : { kind };
  return { roles: file.roles, tiers, backend, budget: file.budget };
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function ownedByOtherProcess(run: Run): boolean {
  return run.ownerPid !== undefined && run.ownerPid !== process.pid && processAlive(run.ownerPid);
}

export function parseBackend(value: string | undefined): DefaultBackend {
  const backend = value ?? "delegate";
  if (backend !== "fake" && backend !== "delegate" && backend !== "cli") throw new Error("FACTORY_BACKEND must be fake, delegate or cli");
  return backend;
}

export function parseCli(value: string | undefined): CliName {
  if (value !== "claude" && value !== "opencode") throw new Error("FACTORY_CLI must be claude or opencode");
  return value;
}

export type DefaultBackend = "fake" | "delegate" | "cli";

export interface FactoryOptions {
  executors?: Executors;
  backend?: DefaultBackend;
  cli?: CliName;
}

let workflows: Map<string, Workflow> | undefined;

export function workflowsDir(): string {
  return process.env.FACTORY_WORKFLOWS_DIR ?? path.join(FACTORY_DIR, "workflows");
}

export function loadedWorkflows(): Map<string, Workflow> {
  workflows ??= loadWorkflowDir(workflowsDir());
  return workflows;
}

export function workflowOf(run: Pick<Run, "workflow">): Workflow {
  const workflow = loadedWorkflows().get(run.workflow ?? "hello");
  if (!workflow) throw new Error(`unknown workflow ${run.workflow}`);
  return workflow;
}

function workflowLabel(run: Pick<Run, "workflow">): string {
  const workflow = workflowOf(run);
  return `${workflow.name}@${workflow.version}`;
}

const TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);

function fakeModelTurn(tier: Tier, turn: number, agentIndex = 0) {
  const inputTokens = 3000 + turn * 1500 + agentIndex * 700;
  const outputTokens = 300 + turn * 50;
  const price = FAKE_PRICE_PER_MTOK[tier];
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { inputTokens, outputTokens, costUsd };
}

interface WaitResult {
  run: Run;
  timedOut: boolean;
}

interface CurrentAgent {
  id: string;
  role: string | undefined;
  agentName: string | undefined;
  paths?: string[];
}

export class Factory {
  dataDir: string;
  executors: Executors;
  defaultConfig: RunConfig;
  runs = new Map<string, Run>();
  idempotency = new Map<string, string>();
  timers = new Map<string, NodeJS.Timeout>();
  busy = new Set<string>();
  waiters = new Map<string, Set<(run: Run) => void>>();

  constructor(dataDir: string, { executors = {}, backend = "delegate", cli }: FactoryOptions = {}) {
    this.dataDir = dataDir;
    this.executors = executors;
    if (backend === "cli" && !(cli && executors[cli])) throw new Error("the cli backend needs a cli name and its executor");
    this.defaultConfig = defaultConfig(backend, cli);
    fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
    this.restore();
  }

  restore(): void {
    const dir = path.join(this.dataDir, "runs");
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Run;
      this.runs.set(run.runId, run);
      if (run.idempotencyKey) this.idempotency.set(run.idempotencyKey, run.runId);
      if (run.status === "running" && !ownedByOtherProcess(run)) this.schedule(run);
    }
  }

  checkpoint(run: Run): void {
    fs.writeFileSync(path.join(this.dataDir, "runs", `${run.runId}.json`), JSON.stringify(run, null, 2));
    if (run.status !== "running") this.notify(run);
  }

  notify(run: Run): void {
    const waiting = this.waiters.get(run.runId);
    if (!waiting) return;
    this.waiters.delete(run.runId);
    for (const resolve of waiting) resolve(run);
  }

  waitForChange(runId: string, timeoutMs: number): Promise<WaitResult> {
    const run = this.get(runId);
    if (run.status !== "running") return Promise.resolve({ run, timedOut: false });
    return new Promise((resolve) => {
      const done = (r: Run) => {
        clearTimeout(timer);
        resolve({ run: r, timedOut: false });
      };
      const timer = setTimeout(() => {
        this.waiters.get(runId)?.delete(done);
        resolve({ run, timedOut: true });
      }, timeoutMs);
      let waiting = this.waiters.get(runId);
      if (!waiting) {
        waiting = new Set();
        this.waiters.set(runId, waiting);
      }
      waiting.add(done);
    });
  }

  appendLedger(run: Run, record: LedgerEntry): void {
    const entry: LedgerRecord = { runId: run.runId, workflow: workflowLabel(run), at: new Date().toISOString(), ...record };
    run.ledger.push(entry);
    fs.appendFileSync(path.join(this.dataDir, "ledger.jsonl"), JSON.stringify(entry) + "\n");
    this.event(run, "ledger_record", { node: record.nodePath, costUsd: record.costUsd, costSource: record.costSource });
  }

  event(run: Run, type: string, data: Omit<RunEvent, "at" | "type"> = {}): void {
    run.events.push({ at: new Date().toISOString(), type, ...data });
  }

  get(runId: string): Run {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown runId ${runId}`);
    return run;
  }

  start(goal: string, idempotencyKey?: string, { workflow = "hello", input = {} }: { workflow?: string; input?: RunInput } = {}): { run: Run; reused: boolean } {
    const definition = loadedWorkflows().get(workflow);
    if (!definition) throw new Error(`unknown workflow ${workflow}`);
    const existing = idempotencyKey ? this.idempotency.get(idempotencyKey) : undefined;
    if (existing) return { run: this.get(existing), reused: true };
    const defaults = structuredClone(this.defaultConfig);
    const run: Run = {
      runId: `r-${crypto.randomUUID().slice(0, 8)}`,
      idempotencyKey: idempotencyKey ?? null,
      goal,
      workflow,
      input,
      state: {},
      nodeAgents: {},
      status: "needs_confirmation",
      proposal: { ...defaults, roles: Object.fromEntries(Object.entries(definition.roles ?? {}).map(([role, tier]) => [role, defaults.roles[role] ?? tier])) },
      config: null,
      cursor: definition.nodes.findIndex((n) => n.id === definition.entry),
      visits: { [definition.entry]: 1 },
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

  confirm(runId: string, overrides: ConfirmOverrides = {}): Run {
    const run = this.get(runId);
    if (run.status !== "needs_confirmation") return run;
    const backend = { ...run.proposal.backend, ...(overrides.backend ?? {}) };
    if (backend.kind === "cli" && !(backend.cli && this.executors[backend.cli])) throw new Error(`no executor for cli backend '${backend.cli}' in this factory process`);
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

  answer(runId: string, questionId: string, answer: string): { run: Run; duplicate: boolean } {
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
    this.event(run, "run_resumed", { questionId, answer });
    this.checkpoint(run);
    this.schedule(run);
    return { run, duplicate: false };
  }

  next(runId: string): PendingWork | null {
    const run = this.get(runId);
    return run.status === "waiting_for_client" ? run.pendingWork : null;
  }

  submit(runId: string, nodePath: string, output: string, usage: SubmitUsage = {}, agentId: string | undefined = undefined): { run: Run; duplicate: boolean } {
    const run = this.get(runId);
    const items = run.pendingWorkItems ?? (run.pendingWork ? [run.pendingWork] : []);
    const work = items.find((w) => w.nodePath === nodePath && (!agentId || w.agentId === agentId));
    if (run.status !== "waiting_for_client" || !work) {
      const done = run.ledger.find((r) => r.nodePath === nodePath && r.backend === "delegate" && (!agentId || r.agentId === agentId));
      if (done) return { run, duplicate: true };
      throw new Error(`no pending work for node ${nodePath}`);
    }
    const inputTokens = Number.isInteger(usage.inputTokens) ? usage.inputTokens : undefined;
    const outputTokens = Number.isInteger(usage.outputTokens) ? usage.outputTokens : undefined;
    const hasSplit = inputTokens !== undefined && outputTokens !== undefined;
    const tokens: TokenCounts = {
      input: hasSplit ? inputTokens : null,
      output: hasSplit ? outputTokens : null,
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
      agentName: work.agentName ?? null,
    });
    const node = nodeAt(run);
    this.storeParsed(run, node, work.agentId, output);
    this.event(run, "agent_completed", { node: node.path, agentId: work.agentId, backend: "delegate" });
    const left = items.filter((w) => w !== work);
    run.pendingWorkItems = left;
    run.pendingWork = left[0] ?? null;
    if (left.length === 0) {
      run.status = "running";
      this.event(run, "node_completed", { node: node.path, backend: "delegate" });
      this.advance(run, node);
    }
    this.checkpoint(run);
    this.schedule(run);
    return { run, duplicate: false };
  }

  enrichLedger(runId: string, index: number, usage: Pick<ModelUsage, "tokens" | "cacheWriteTtlKnown">): void {
    const run = this.get(runId);
    const record = run.ledger[index];
    if (!record) throw new Error(`no ledger record ${index} in run ${runId}`);
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

  cancel(runId: string): Run {
    const run = this.get(runId);
    if (!["done", "stopped", "failed"].includes(run.status)) {
      run.status = "cancelled";
      this.event(run, "run_cancelled");
      this.checkpoint(run);
    }
    return run;
  }

  schedule(run: Run): void {
    if (this.timers.has(run.runId) || this.busy.has(run.runId)) return;
    run.ownerPid = process.pid;
    const tick = async () => {
      this.timers.delete(run.runId);
      if (run.status !== "running") return;
      this.busy.add(run.runId);
      try {
        await this.step(run);
      } catch (error) {
        run.status = "failed";
        this.event(run, "run_failed", { error: errorMessage(error) });
      } finally {
        this.busy.delete(run.runId);
      }
      this.checkpoint(run);
      if (run.status === "running") this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
    };
    this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
  }

  totals(run: Pick<Run, "ledger" | "steps">) {
    const costUsd = run.ledger.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const tokens = run.ledger.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.inputTokens == null ? (r.totalTokens ?? 0) : 0), 0);
    return { costUsd, tokens, steps: run.steps };
  }

  checkBudget(run: Run): boolean {
    const { maxCostUsd, infoRatio, pauseRatio } = configOf(run).budget;
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

  nodeAgents(run: Run, node: WorkflowNode): CurrentAgent[] {
    const agents = agentsOf(run, node);
    if (!agents) return [{ id: node.id, role: node.role, agentName: node.agent }];
    return agents.map((a) => ({ ...a, role: a.role ?? node.role, agentName: a.agentName ?? node.agent }));
  }

  prompt(run: Run, node: WorkflowNode, agent: CurrentAgent = currentAgent(run, node)): string {
    if (!node.prompt) throw new Error(`node ${node.path} has no prompt`);
    return node.prompt({
      goal: run.goal,
      input: run.input,
      state: run.state,
      agent,
      answer: (node.question && run.answers[node.question.id]) ?? "",
      steps: run.steps,
    });
  }

  storeParsed(run: Run, node: WorkflowNode, agentId: string, output: string): void {
    if (!node.parse || !run.state) return;
    const previous = run.state[node.id];
    const byAgent = typeof previous === "object" && previous !== null ? previous : {};
    run.state[node.id] = { ...byAgent, [agentId]: node.parse(output ?? "") };
  }

  advance(run: Run, node: WorkflowNode): void {
    const workflow = workflowOf(run);
    const context = { ...(run.state ?? {}), answers: run.answers };
    const edge = workflow.edges.filter((e) => e.from === node.id).find((e) => e.when === undefined || evaluateWhen(e.when, context));
    if (!edge) throw new Error(`no edge from ${node.id} matches the run state`);
    run.nodeTurn = 0;
    run.agentIndex = 0;
    this.event(run, "edge_taken", { from: node.id, to: edge.to, ...(edge.when ? { when: edge.when } : {}) });
    if (edge.to === "END") {
      run.cursor = -1;
      return;
    }
    run.visits ??= {};
    const visits = (run.visits[edge.to] ?? 0) + 1;
    const limit = workflow.nodes.find((n) => n.id === edge.to)?.maxVisits ?? workflow.maxCycleIterations;
    if (visits > limit) throw new Error(`node ${edge.to} would run ${visits} times; the workflow allows ${limit}`);
    run.visits[edge.to] = visits;
    if (run.nodeAgents) delete run.nodeAgents[edge.to];
    run.cursor = workflow.nodes.findIndex((n) => n.id === edge.to);
  }

  async step(run: Run): Promise<void> {
    if (run.answers["q-budget-pause"] === "stop") {
      run.status = "stopped";
      return;
    }
    if (!this.checkBudget(run)) return;
    const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
    if (!node) {
      run.status = "done";
      this.event(run, "run_completed", this.totals(run));
      return;
    }
    const visit = run.visits?.[node.id] ?? 1;
    if (run.nodeTurn === 0 && !run.events.some((e) => e.type === "node_started" && e.node === node.path && e.visit === visit)) {
      this.event(run, "node_started", { node: node.path, visit });
    }

    if (node.kind === "interrupt") {
      if (!node.question) throw new Error(`interrupt node ${node.path} has no question`);
      const context = { goal: run.goal, input: run.input, state: run.state };
      const question = { ...node.question, id: Mustache.render(node.question.id, context), text: Mustache.render(node.question.text, context) };
      const answer = run.answers[question.id];
      if (answer === undefined) {
        run.status = "waiting_for_user";
        run.pendingQuestion = { ...question, node: node.path };
        this.event(run, "needs_input", { node: node.path, questionId: question.id });
        return;
      }
      if (run.state) run.state[node.id] = { answer };
      this.event(run, "node_completed", { node: node.path, answer });
      this.advance(run, node);
      return;
    }

    if (node.kind === "script") {
      run.steps += 1;
      const started = Date.now();
      if (!node.script) throw new Error(`script node ${node.path} has no operation`);
      const result = await node.script({ input: run.input ?? {}, state: run.state ?? {}, exec: this.executors.exec, goal: run.goal, answers: run.answers, cwd: workspace(run), nodeId: node.id });
      if (run.state) run.state[node.id] = result.state;
      this.appendLedger(run, { nodePath: node.path, agentId: node.id, kind: "script", tier: null, model: null, backend: "script", turn: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "measured", durationMs: Date.now() - started, output: result.output ?? null });
      this.event(run, "node_completed", { node: node.path, result: (String(result.output ?? "").split(/\r?\n/)[0] ?? "").slice(0, 200), ...(result.metrics ? { metrics: result.metrics } : {}) });
      this.advance(run, node);
      return;
    }

    const config = configOf(run);
    const backend = config.backend.kind;
    const askNow = backend === "fake" ? run.nodeTurn === node.askAfterTurn : true;
    if (node.question && askNow && run.answers[node.question.id] === undefined) {
      run.status = "waiting_for_user";
      run.pendingQuestion = { ...node.question, node: node.path };
      this.event(run, "needs_input", { node: node.path, questionId: node.question.id });
      return;
    }

    if (node.agentsFrom && run.nodeAgents?.[node.id] === undefined) {
      run.nodeAgents ??= {};
      const selected = node.agentsFrom(run.state);
      run.nodeAgents[node.id] = selected;
      this.event(run, "agents_selected", { node: node.path, agents: selected.map((a) => a.id) });
    }
    if (agentsOf(run, node)?.length === 0 || node.skipIf?.(run.state)) {
      this.event(run, "node_skipped", { node: node.path, reason: node.skipReason ?? "no work" });
      this.advance(run, node);
      return;
    }
    if (backend === "cli") return this.runCliNode(run, node);
    if (backend === "delegate") {
      const items = this.nodeAgents(run, node).map((agent) => {
        const tier = tierOf(config, agent);
        const definition = agent.agentName ? readMarketplaceAgent(agent.agentName) : undefined;
        return {
          nodePath: node.path,
          agentId: agent.id,
          tier,
          model: config.tiers[tier],
          prompt: this.prompt(run, node, agent),
          ...(definition ? { agentName: definition.name, agentDescription: definition.description, agentInstructions: definition.prompt } : {}),
        };
      });
      run.pendingWorkItems = items;
      run.pendingWork = items[0] ?? null;
      run.status = "waiting_for_client";
      for (const item of items) this.event(run, "work_offered", { node: node.path, agentId: item.agentId, tier: item.tier });
      return;
    }
    const agent = currentAgent(run, node);
    const tier = tierOf(config, agent);

    const turn = run.nodeTurn + 1;
    const usage = fakeModelTurn(tier, turn, run.agentIndex ?? 0);
    run.steps += 1;
    run.nodeTurn = turn;
    this.appendLedger(run, { nodePath: node.path, agentId: agent.id, kind: "llm", tier, model: config.tiers[tier], backend: "fake", turn, ...usage, costSource: "measured" });
    if (node.turns !== undefined && turn >= node.turns) this.finishAgent(run, node, { turns: turn });
  }

  finishAgent(run: Run, node: WorkflowNode, details: Record<string, unknown>): void {
    const agent = currentAgent(run, node);
    const agents = agentsOf(run, node);
    if (agents) this.event(run, "agent_completed", { node: node.path, agentId: agent.id, ...details });
    run.nodeTurn = 0;
    if (agents && (run.agentIndex ?? 0) + 1 < agents.length) {
      run.agentIndex = (run.agentIndex ?? 0) + 1;
      return;
    }
    this.event(run, "node_completed", { node: node.path, ...details });
    this.advance(run, node);
  }

  async runCliNode(run: Run, node: WorkflowNode): Promise<void> {
    const config = configOf(run);
    const { cli } = config.backend;
    const executor = cli ? this.executors[cli] : undefined;
    if (!executor) throw new Error(`no executor for cli backend '${cli}' in this factory process`);
    const agents = this.nodeAgents(run, node);
    const limit = node.parallel ?? PARALLEL_AGENTS;
    const failures: string[] = [];
    for (let i = 0; i < agents.length; i += limit) {
      await Promise.all(agents.slice(i, i + limit).map(async (agent) => {
        const tier = tierOf(config, agent);
        const model = config.tiers[tier];
        this.event(run, "agent_started", { node: node.path, agentId: agent.id, tier });
        const result = await executor({ model, prompt: this.prompt(run, node, agent), agent: agent.agentName, cwd: workspace(run), configDir: run.input?.agentConfigDir });
        run.steps += 1;
        if (!result.ok) {
          failures.push(`${agent.id}: ${result.error}`);
          this.event(run, "agent_failed", { node: node.path, agentId: agent.id, error: result.error });
          return;
        }
        for (const u of result.usageByModel ?? []) {
          const priced = priceUsage(u.model, u.tokens, u.cacheWriteTtlKnown);
          this.appendLedger(run, {
            nodePath: node.path,
            agentId: agent.id,
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
        this.storeParsed(run, node, agent.id, result.text ?? "");
        this.event(run, "agent_completed", { node: node.path, agentId: agent.id, backend: `cli:${cli}` });
      }));
    }
    if (failures.length) {
      run.status = "failed";
      this.event(run, "node_failed", { node: node.path, error: failures.join("; ") });
      return;
    }
    this.event(run, "node_completed", { node: node.path, backend: `cli:${cli}` });
    this.advance(run, node);
  }

  footer(run: Pick<Run, "config" | "proposal" | "ledger" | "steps" | "thresholdsHit">): CostFooter {
    const t = this.totals(run);
    const max = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
    const perNode: Record<string, number> = {};
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

  status(run: Run): RunStatusView {
    const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
    return {
      runId: run.runId,
      status: run.status,
      currentNode: node?.path ?? null,
      pendingQuestion: run.pendingQuestion,
      pendingWork: run.status === "waiting_for_client" ? run.pendingWork : undefined,
      pendingWorkItems: run.status === "waiting_for_client" ? (run.pendingWorkItems ?? (run.pendingWork ? [run.pendingWork] : [])) : undefined,
      retryAfterMs: run.status === "running" ? 2000 : null,
      next: nextHint(run),
      proposal: run.status === "needs_confirmation" ? run.proposal : undefined,
      cost: this.footer(run),
    };
  }

  report(run: Run): Report {
    const byNode: Record<string, NodeCost> = {};
    const byTier: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byCostSource: Record<string, number> = {};
    let harnessCostUsd = 0;
    let cacheTokens = 0;
    const coverage: Report["coverage"] = { run: { llmSteps: 0, unknownSteps: 0 }, byTier: {}, byModel: {} };
    const count = (target: Coverage) => {
      target.llmSteps += 1;
    };
    const countUnknown = (target: Coverage) => {
      target.unknownSteps += 1;
    };
    for (const r of run.ledger) {
      const cache = (r.cacheReadTokens ?? 0) + (r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0);
      cacheTokens += cache;
      const nodeEntry = (byNode[r.nodePath] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: r.tier, model: r.model ?? null, byAgent: {}, costSource: "" });
      nodeEntry.cacheTokens += cache;
      const agentKey = r.agentId ?? r.nodePath.split("/").at(-1) ?? r.nodePath;
      const agentEntry = (nodeEntry.byAgent[agentKey] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: r.tier, model: r.model ?? null, agentName: r.agentName ?? null, costSource: "", sources: [] });
      agentEntry.cacheTokens += cache;
      agentEntry.steps += 1;
      agentEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
      agentEntry.costUsd += r.costUsd ?? 0;
      agentEntry.sources?.push(r.costSource);
      nodeEntry.steps += 1;
      nodeEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
      nodeEntry.costUsd += r.costUsd ?? 0;
      const tierKey = r.tier ?? "script";
      byTier[tierKey] = (byTier[tierKey] ?? 0) + (r.costUsd ?? 0);
      if (r.kind === "llm") {
        const modelKey = r.model ?? "unknown";
        byModel[modelKey] = (byModel[modelKey] ?? 0) + (r.costUsd ?? 0);
        byCostSource[r.costSource] = (byCostSource[r.costSource] ?? 0) + 1;
        const targets = [
          coverage.run,
          (coverage.byTier[tierKey] ??= { llmSteps: 0, unknownSteps: 0 }),
          (coverage.byModel[modelKey] ??= { llmSteps: 0, unknownSteps: 0 }),
          nodeEntry,
          agentEntry,
        ];
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
        agentEntry.costSource = singleOrMixed(new Set(agentEntry.sources));
        delete agentEntry.sources;
      }
      entry.costSource = singleOrMixed(new Set(run.ledger.filter((r) => r.nodePath === nodePath).map((r) => r.costSource)));
    }
    for (const totals of [byTier, byModel]) for (const [key, value] of Object.entries(totals)) totals[key] = round(value);
    return {
      runId: run.runId,
      status: run.status,
      workflow: workflowLabel(run),
      backend: run.config?.backend,
      tierModels: run.config?.tiers,
      synthetic: (run.config ?? run.proposal).backend?.kind === "fake",
      byNode,
      byTier,
      byModel,
      byCostSource,
      coverage,
      cacheTokens,
      harnessCostUsd: round(harnessCostUsd),
      result: [...run.ledger].reverse().find((r) => typeof r.output === "string")?.output ?? null,
      cost: this.footer(run),
    };
  }

  trace(run: Run): string {
    const lines = [`run ${run.runId} [${run.status}] ${workflowLabel(run)}  $${round(this.totals(run).costUsd)}`];
    let lastNode: string | null = null;
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

function configOf(run: Run): RunConfig {
  if (!run.config) throw new Error(`run ${run.runId} is not confirmed`);
  return run.config;
}

function nodeAt(run: Run): WorkflowNode {
  const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
  if (!node) throw new Error(`run ${run.runId} has no node at cursor ${run.cursor}`);
  return node;
}

function tierOf(config: RunConfig, agent: CurrentAgent): Tier {
  const tier = agent.role === undefined ? undefined : config.roles[agent.role];
  if (!tier) throw new Error(`no tier for role '${agent.role}'`);
  return tier;
}

function agentsOf(run: Run, node: WorkflowNode): Agent[] | null {
  return run.nodeAgents?.[node.id] ?? node.agents ?? null;
}

function currentAgent(run: Run, node: WorkflowNode): CurrentAgent {
  const agents = agentsOf(run, node);
  if (!agents) return { id: node.id, role: node.role, agentName: node.agent };
  const agent = agents[run.agentIndex ?? 0];
  if (!agent) throw new Error(`node ${node.path} has no agent ${run.agentIndex ?? 0}`);
  return { ...agent, role: agent.role ?? node.role, agentName: agent.agentName ?? node.agent };
}

function singleOrMixed(sources: Set<string>): string {
  const [first] = sources;
  return sources.size === 1 && first !== undefined ? first : "mixed";
}

function costSourceSummary(ledger: LedgerRecord[]): string {
  const sources = new Set<CostSource>(ledger.filter((r) => r.kind === "llm").map((r) => r.costSource));
  if (sources.size === 0) return "none";
  return singleOrMixed(sources);
}

function nextHint(run: Run): string {
  switch (run.status) {
    case "needs_confirmation":
      return "Show the proposal to the user. After the user replies, call factory_confirm.";
    case "running":
      return "Call factory_wait. factory_wait returns when the run needs the user, needs your node work in delegate mode, or ends. Do not call factory_status in a loop.";
    case "waiting_for_user":
      return "Ask the user pendingQuestion.text. Then send the user's answer with factory_answer.";
    case "waiting_for_client":
      return "Run every item of pendingWorkItems at the same time, each in its own subagent: use item.prompt, the model in item.model, and, when item.agentName is set, a subagent with that name whose instructions are item.agentInstructions (use your installed agent of that name if you have one). Call factory_submit once per item with its output, nodePath and agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), pass it as usage.childSessionId.";
    default:
      return "The run has ended (done, stopped, cancelled or failed). Call factory_report. Show the user viewerUrl: it shows the whole flow and the cost of each agent. Do not call factory_wait or factory_status again.";
  }
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runReport(run: Run): Report {
  return Factory.prototype.report.call(Factory.prototype, run);
}
