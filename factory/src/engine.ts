import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { loadFactoryConfig } from "./config.ts";
import { errorMessage } from "./errors.ts";
import { OUTPUT_PREVIEW_CHARS, cliEntries, delegateEntry, fakeModelTurn } from "./ledger-entries.ts";
import { readMarketplaceAgent } from "./marketplace-agents.ts";
import { DEFAULT_TIER_MODELS, FAKE_TIER_MODELS } from "./models.ts";
import { writeFileAtomic } from "./paths.ts";
import { priceUsage } from "./prices.ts";
import { recordAnswer, recordQuestion } from "./questions.ts";
import { configOf } from "./run-config.ts";
import { costFooter, runReport, runTotals, runTrace } from "./run-report.ts";
import { SUPERVISOR_PATH } from "./run-summary.ts";
import { RunSupervisor } from "./supervisor.ts";
import { evaluateWhen, readPath, withEach } from "./when.ts";
import { loadedWorkflows, workflowLabel, workflowOf } from "./workflows.ts";
export { loadedWorkflows, workflowOf, workflowsDir } from "./workflows.ts";
import type {
  Agent,
  CliExecutor,
  CliName,
  ConfirmOverrides,
  CostFooter,
  Executors,
  LedgerEntry,
  LedgerRecord,
  ModelUsage,
  PendingQuestion,
  PendingWork,
  QuestionItem,
  Report,
  Run,
  RunConfig,
  RunEvent,
  RunInput,
  RunStatusView,
  SubmitUsage,
  Tier,
  WorkflowNode,
  WorkflowState,
} from "./types.ts";

const PARALLEL_AGENTS = 10;

/** The question a run asks when its cost reaches the pause ratio of its budget. */
const BUDGET_PAUSE_QUESTION = "q-budget-pause";
const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);

/** The folders an agent with its own permissions may leave its workspace for: set only for an isolated step that lists its own directories. */
function limitDirs(node: WorkflowNode, listed: string[], dirs: string[]): { limitDirs?: string[] } {
  return node.isolate && listed.length > 0 ? { limitDirs: dirs } : {};
}

function workspace(run: Run): string {
  return run.workspace ?? run.input?.project ?? run.input?.cwd ?? process.env.FACTORY_WORKSPACE ?? process.cwd();
}

function defaultConfig(kind: "fake" | "delegate" | "cli", cli?: CliName): RunConfig {
  const file = loadFactoryConfig();
  const tiers = { ...(kind === "fake" ? FAKE_TIER_MODELS : DEFAULT_TIER_MODELS) };
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
  if (backend !== "fake" && backend !== "delegate" && backend !== "cli") {
    throw new Error("FACTORY_BACKEND must be fake, delegate or cli");
  }
  return backend;
}

export function parseCli(value: string | undefined): CliName {
  if (value !== "claude" && value !== "opencode") {
    throw new Error("FACTORY_CLI must be claude or opencode");
  }
  return value;
}

export type DefaultBackend = "fake" | "delegate" | "cli";

export interface FactoryOptions {
  executors?: Executors;
  backend?: DefaultBackend;
  cli?: CliName;
}

const TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);

interface WaitResult {
  run: Run;
  timedOut: boolean;
}

interface CurrentAgent {
  id: string;
  role: string | undefined;
  agentName: string | undefined;
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
  supervisor = new RunSupervisor(this);

  constructor(dataDir: string, { executors = {}, backend = "delegate", cli }: FactoryOptions = {}) {
    this.dataDir = dataDir;
    this.executors = executors;
    if (backend === "cli" && !(cli && executors[cli])) {
      throw new Error("the cli backend needs a cli name and its executor");
    }
    this.defaultConfig = defaultConfig(backend, cli);
    fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
    this.restore();
  }

  /** The CLI supervisor jobs still running, by run id. */
  get supervising(): Map<string, Promise<void>> {
    return this.supervisor.supervising;
  }

  restore(): void {
    const dir = path.join(this.dataDir, "runs");
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Run;
      this.runs.set(run.runId, run);
      if (run.idempotencyKey) {
        this.idempotency.set(run.idempotencyKey, run.runId);
      }
      const previousOwnerPid = run.ownerPid ?? null;
      if (run.status === "running" && !ownedByOtherProcess(run)) {
        this.event(run, "run_recovered", { previousOwnerPid });
        this.checkpoint(run);
        this.schedule(run);
      }
      if (run.supervisor?.status === "running" && !ownedByOtherProcess(run)) {
        run.supervisor.status = "pending";
        this.event(run, "run_recovered", { node: SUPERVISOR_PATH, previousOwnerPid });
        this.checkpoint(run);
      }
    }
  }

  checkpoint(run: Run): void {
    if (ENDED.has(run.status) && run.supervisor?.status === "pending") {
      this.supervisor.start(run);
    }
    writeFileAtomic(path.join(this.dataDir, "runs", `${run.runId}.json`), JSON.stringify(run, null, 2));
    if (run.status !== "running") {
      this.notify(run);
    }
  }

  notify(run: Run): void {
    const waiting = this.waiters.get(run.runId);
    if (!waiting) {
      return;
    }
    this.waiters.delete(run.runId);
    for (const resolve of waiting) {
      resolve(run);
    }
  }

  waitForChange(runId: string, timeoutMs: number): Promise<WaitResult> {
    const run = this.get(runId);
    if (run.status !== "running") {
      return Promise.resolve({ run, timedOut: false });
    }
    return new Promise((resolve) => {
      const done = (changed: Run) => {
        clearTimeout(timer);
        resolve({ run: changed, timedOut: false });
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

  /** Puts a question to the user: the run waits for it, and the question store keeps its text for the viewer. */
  askUser(run: Run, question: PendingQuestion, askedBy: string[]): void {
    run.status = "waiting_for_user";
    run.pendingQuestion = question;
    recordQuestion(this.dataDir, { runId: run.runId, questionId: question.id, node: question.node ?? null, askedBy, text: question.text, allowed: question.allowed ?? null, askedAt: new Date().toISOString() });
  }

  event(run: Run, type: string, data: Omit<RunEvent, "at" | "type"> = {}): void {
    run.events.push({ at: new Date().toISOString(), type, ...data });
  }

  get(runId: string): Run {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`unknown runId ${runId}`);
    }
    return run;
  }

  start(goal: string, idempotencyKey?: string, { workflow = "hello", input = {} }: { workflow?: string; input?: RunInput } = {}): { run: Run; reused: boolean } {
    const definition = loadedWorkflows().get(workflow);
    if (!definition) {
      throw new Error(`unknown workflow ${workflow}`);
    }
    const existing = idempotencyKey ? this.idempotency.get(idempotencyKey) : undefined;
    if (existing) {
      return { run: this.get(existing), reused: true };
    }
    const defaults = structuredClone(this.defaultConfig);
    const run: Run = {
      runId: `r-${crypto.randomUUID().slice(0, 8)}`,
      idempotencyKey: idempotencyKey ?? null,
      goal,
      workflow,
      input: { ...input, switches: { ...loadFactoryConfig().switches, ...(input.switches ?? {}) } },
      state: {},
      nodeAgents: {},
      status: "needs_confirmation",
      proposal: { ...defaults, roles: Object.fromEntries(Object.entries(definition.roles ?? {}).map(([role, tier]) => [role, defaults.roles[role] ?? tier])) },
      config: null,
      cursor: definition.nodes.findIndex((candidate) => candidate.id === definition.entry),
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
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, run.runId);
    }
    this.event(run, "run_created", { goal });
    this.checkpoint(run);
    return { run, reused: false };
  }

  confirm(runId: string, overrides: ConfirmOverrides = {}): Run {
    const run = this.get(runId);
    if (run.status !== "needs_confirmation") {
      return run;
    }
    const backend = { ...run.proposal.backend, ...(overrides.backend ?? {}) };
    if (backend.kind === "cli" && !(backend.cli && this.executors[backend.cli])) {
      throw new Error(`no executor for cli backend '${backend.cli}' in this factory process`);
    }
    run.config = {
      ...run.proposal,
      backend,
      roles: { ...run.proposal.roles, ...(overrides.roles ?? {}) },
      tiers: { ...run.proposal.tiers, ...(overrides.tierModels ?? {}) },
      budget: { ...run.proposal.budget, ...(overrides.budget ?? {}) },
    };
    run.status = "running";
    const supervisor = loadFactoryConfig().supervisor;
    if (supervisor) {
      run.supervisor = { status: "pending", agent: supervisor.agent };
    }
    this.event(run, "run_confirmed", { config: run.config });
    this.checkpoint(run);
    this.schedule(run);
    return run;
  }

  answer(runId: string, questionId: string, answer: string): { run: Run; duplicate: boolean } {
    const run = this.get(runId);
    if (run.answers[questionId] !== undefined) {
      if (run.answers[questionId] === answer) {
        return { run, duplicate: true };
      }
      throw new Error(`question ${questionId} already answered with a different value`);
    }
    const pending = run.pendingQuestion;
    if (!pending || pending.id !== questionId) {
      throw new Error(`no pending question ${questionId}`);
    }
    if (pending.allowed && !isAllowedAnswer(pending, answer)) {
      throw new Error(`invalid answer '${answer}', allowed: ${pending.allowed.join(", ")}${pending.multiple ? ", none, or several joined by ','" : ""}`);
    }
    run.answers[questionId] = answer;
    run.pendingQuestion = null;
    run.status = "running";
    this.event(run, "run_resumed", { questionId, answer });
    recordAnswer(this.dataDir, run.runId, questionId, answer, run.events.at(-1)!.at);
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
    if (nodePath === SUPERVISOR_PATH) {
      return this.supervisor.submit(run, output, usage);
    }
    const work = findPendingWork(run, nodePath, agentId);
    if (run.status !== "waiting_for_client" || !work) {
      const done = run.ledger.find((record) => record.nodePath === nodePath && record.backend === "delegate" && (!agentId || record.agentId === agentId));
      if (done) {
        return { run, duplicate: true };
      }
      throw new Error(`no pending work for node ${nodePath}`);
    }
    run.steps += 1;
    this.appendLedger(run, delegateEntry(work, output, usage));
    const node = nodeAt(run);
    try {
      this.storeParsed(run, node, work.agentId, output);
    } catch (error) {
      return this.rejectOutput(run, node, work, error);
    }
    this.completeWorkItem(run, node, work);
    this.checkpoint(run);
    this.schedule(run);
    return { run, duplicate: false };
  }

  /** Offers the work once more with the parse error in its prompt; a second unparsable reply fails the run. */
  rejectOutput(run: Run, node: WorkflowNode, work: PendingWork, error: unknown): { run: Run; duplicate: boolean } {
    const reason = errorMessage(error);
    if (work.retried) {
      run.status = "failed";
      this.event(run, "node_failed", { node: node.path, agentId: work.agentId, error: reason });
      this.checkpoint(run);
      throw error;
    }
    work.retried = true;
    work.prompt = `${work.prompt}

Your previous reply was rejected: ${reason}. Reply again in full and follow the required output format exactly.`;
    this.event(run, "work_offered", { node: node.path, agentId: work.agentId, tier: work.tier, retry: true, reason });
    this.checkpoint(run);
    return { run, duplicate: false };
  }

  enrichLedger(runId: string, index: number, usage: Pick<ModelUsage, "tokens" | "cacheWriteTtlKnown">): void {
    const run = this.get(runId);
    const record = run.ledger[index];
    if (!record) {
      throw new Error(`no ledger record ${index} in run ${runId}`);
    }
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
    if (!ENDED.has(run.status)) {
      run.status = "cancelled";
      this.event(run, "run_cancelled");
      this.checkpoint(run);
    }
    return run;
  }

  schedule(run: Run): void {
    if (this.timers.has(run.runId) || this.busy.has(run.runId)) {
      return;
    }
    run.ownerPid = process.pid;
    const tick = async () => {
      this.timers.delete(run.runId);
      if (run.status !== "running") {
        return;
      }
      this.busy.add(run.runId);
      try {
        await this.step(run);
      } catch (error) {
        run.status = "failed";
        this.event(run, "run_failed", { error: errorMessage(error) });
        console.error(`run ${run.runId} failed: ${errorMessage(error)}`);
      } finally {
        this.busy.delete(run.runId);
      }
      this.checkpoint(run);
      if (run.status === "running") {
        this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
      }
    };
    this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
  }

  totals(run: Pick<Run, "ledger" | "steps">) {
    return runTotals(run);
  }

  checkBudget(run: Run): boolean {
    const { maxCostUsd, infoRatio, pauseRatio } = configOf(run).budget;
    const ratio = runTotals(run).costUsd / maxCostUsd;
    if (ratio >= 1) {
      run.status = "stopped";
      this.event(run, "budget_exceeded", { ratio });
      return false;
    }
    if (hitThreshold(run, "info", ratio, infoRatio)) {
      this.event(run, "budget_threshold", { level: "info", ratio });
    }
    if (hitThreshold(run, "pause", ratio, pauseRatio)) {
      this.askUser(run, { id: BUDGET_PAUSE_QUESTION, text: `The factory run has used ${Math.round(ratio * 100)}% of its budget. Continue or stop?`, allowed: ["continue", "stop"] }, []);
      this.event(run, "budget_threshold", { level: "pause", ratio });
      return false;
    }
    return true;
  }

  nodeAgents(run: Run, node: WorkflowNode): CurrentAgent[] {
    const agents = agentsOf(run, node);
    if (!agents) {
      return [{ id: node.localId ?? node.id, role: node.role, agentName: node.agent }];
    }
    return agents.map((agent) => ({ ...agent, role: agent.role ?? node.role, agentName: agent.agentName ?? node.agent }));
  }

  view(run: Run, node: WorkflowNode): { state: WorkflowState; input: RunInput; answers: Record<string, string>; prefix: string; key: string } {
    if (!node.scope) {
      return { state: (run.state ??= {}), input: run.input ?? {}, answers: run.answers, prefix: "", key: node.localId ?? node.id };
    }
    const scope = run.scopes?.[node.scope];
    if (!scope) {
      throw new Error(`node ${node.path} runs before its call ${node.scope} entered`);
    }
    const prefix = `${node.scope}#${scope.iteration}:`;
    const answers = Object.fromEntries(Object.entries(run.answers).filter(([questionId]) => questionId.startsWith(prefix)).map(([questionId, answer]) => [questionId.slice(prefix.length), answer]));
    run.state ??= {};
    const state = ((run.state[node.scope] as WorkflowState | undefined) ?? (run.state[node.scope] = {})) as WorkflowState;
    return { state, input: scope.input, answers, prefix, key: node.localId ?? node.id };
  }

  enterScope(run: Run, node: WorkflowNode): void {
    const spec = node.enterScope!;
    const parent = this.view(run, { ...node, scope: undefined } as WorkflowNode);
    const context = { goal: run.goal, input: run.input, state: parent.state };
    const input = { ...(run.input ?? {}), ...Object.fromEntries(Object.entries(spec.input).map(([key, template]) => [key, Mustache.render(template, context)])) } as RunInput;
    run.scopes ??= {};
    const iteration = (run.scopes[node.id]?.iteration ?? 0) + 1;
    run.scopes[node.id] = { iteration, input };
    run.state ??= {};
    run.state[node.id] = {};
    const inner = `${node.id}/`;
    for (const key of Object.keys(run.visits ?? {})) {
      if (key.startsWith(inner)) {
        delete run.visits![key];
      }
    }
    for (const key of Object.keys(run.nodeAgents ?? {})) {
      if (key.startsWith(inner)) {
        delete run.nodeAgents![key];
      }
    }
    this.event(run, "node_completed", { node: node.path, result: `call ${spec.workflow} #${iteration}`, input: Object.keys(spec.input) });
  }

  prompt(run: Run, node: WorkflowNode, agent: CurrentAgent = currentAgent(run, node)): string {
    if (!node.prompt) {
      throw new Error(`node ${node.path} has no prompt`);
    }
    const view = this.view(run, node);
    return node.prompt({
      goal: run.goal,
      input: view.input,
      state: view.state,
      agent,
      answer: (node.question && view.answers[node.question.id]) ?? "",
      answers: view.answers,
      steps: run.steps,
    });
  }

  dirs(run: Run, node: WorkflowNode, agent: CurrentAgent): string[] {
    const marketplace = agent.agentName ? readMarketplaceAgent(agent.agentName).dirs : [];
    return [...new Set([...this.listedDirs(run, node, agent), ...marketplace])];
  }

  /** The directories the step itself lists, without the folders of the skills its agent loads. */
  listedDirs(run: Run, node: WorkflowNode, agent: CurrentAgent): string[] {
    const view = this.view(run, node);
    return node.dirs?.({ goal: run.goal, input: view.input, state: view.state, agent }) ?? [];
  }

  storeParsed(run: Run, node: WorkflowNode, agentId: string, output: string): void {
    if (!node.parse) {
      return;
    }
    const { state, key } = this.view(run, node);
    const previous = state[key];
    const byAgent = typeof previous === "object" && previous !== null ? previous : {};
    state[key] = { ...byAgent, [agentId]: node.parse(output ?? "") };
  }

  advance(run: Run, node: WorkflowNode): void {
    const workflow = workflowOf(run);
    const view = this.view(run, node);
    if (node.workspace) {
      this.moveWorkspace(run, node, node.workspace({ goal: run.goal, input: view.input, state: view.state, agent: { id: node.localId ?? node.id }, answers: view.answers, steps: run.steps }).trim());
    }
    const context = { ...view.state, answers: view.answers, input: view.input, switches: run.input?.switches ?? {} };
    const edge = workflow.edges.filter((candidate) => candidate.from === node.id).find((candidate) => candidate.when === undefined || evaluateWhen(candidate.when, context));
    if (!edge) {
      throw new Error(`no edge from ${node.id} matches the run state`);
    }
    run.nodeTurn = 0;
    run.agentIndex = 0;
    this.event(run, "edge_taken", { from: node.id, to: edge.to, ...(edge.when ? { when: edge.when } : {}) });
    if (edge.to === "END") {
      run.cursor = -1;
      return;
    }
    run.visits ??= {};
    const visits = (run.visits[edge.to] ?? 0) + 1;
    const limit = workflow.nodes.find((candidate) => candidate.id === edge.to)?.maxVisits ?? workflow.maxCycleIterations;
    if (visits > limit) {
      throw new Error(`node ${edge.to} would run ${visits} times; the workflow allows ${limit}`);
    }
    run.visits[edge.to] = visits;
    if (run.nodeAgents) {
      delete run.nodeAgents[edge.to];
    }
    run.cursor = workflow.nodes.findIndex((candidate) => candidate.id === edge.to);
  }

  moveWorkspace(run: Run, node: WorkflowNode, target: string): void {
    if (!target || target === run.workspace) {
      return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      throw new Error(`node ${node.path}: workspace ${target} is not a directory`);
    }
    run.workspace = target;
    this.event(run, "workspace_changed", { node: node.path, workspace: target });
  }

  async step(run: Run): Promise<void> {
    if (run.answers[BUDGET_PAUSE_QUESTION] === "stop") {
      run.status = "stopped";
      return;
    }
    if (!this.checkBudget(run)) {
      return;
    }
    const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
    if (!node) {
      run.status = "done";
      this.event(run, "run_completed", runTotals(run));
      return;
    }
    const visit = run.visits?.[node.id] ?? 1;
    if (run.nodeTurn === 0 && !run.events.some((event) => event.type === "node_started" && event.node === node.path && event.visit === visit)) {
      this.event(run, "node_started", { node: node.path, visit });
    }
    switch (node.kind) {
      case "interrupt":
        return this.stepInterrupt(run, node);
      case "script":
        return this.stepScript(run, node);
      default:
        return this.stepAgents(run, node);
    }
  }

  finishAgent(run: Run, node: WorkflowNode, details: Record<string, unknown>): void {
    const agent = currentAgent(run, node);
    const agents = agentsOf(run, node);
    if (agents) {
      this.event(run, "agent_completed", { node: node.path, agentId: agent.id, ...details });
    }
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
    if (!executor) {
      throw new Error(`no executor for cli backend '${cli}' in this factory process`);
    }
    const agents = this.nodeAgents(run, node);
    const limit = node.parallel ?? PARALLEL_AGENTS;
    const failures: string[] = [];
    for (let i = 0; i < agents.length && run.status === "running"; i += limit) {
      const batch = agents.slice(i, i + limit);
      const outcomes = await Promise.allSettled(batch.map((agent) => this.runCliAgent(run, node, agent, executor, failures)));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          const agentId = batch[index]?.id;
          failures.push(`${agentId}: ${errorMessage(outcome.reason)}`);
          this.event(run, "agent_failed", { node: node.path, agentId, error: errorMessage(outcome.reason) });
        }
      });
    }
    if (run.status !== "running") {
      return;
    }
    if (failures.length) {
      run.status = "failed";
      this.event(run, "node_failed", { node: node.path, error: failures.join("; ") });
      return;
    }
    this.event(run, "node_completed", { node: node.path, backend: `cli:${cli}` });
    this.advance(run, node);
  }

  footer(run: Pick<Run, "config" | "proposal" | "ledger" | "steps" | "thresholdsHit"> & { events?: Run["events"] }): CostFooter {
    return costFooter(run);
  }

  status(run: Run): RunStatusView {
    const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
    const supervisorWork = run.supervisor?.status === "waiting_for_client" ? (run.supervisor.work ?? undefined) : undefined;
    return {
      runId: run.runId,
      status: run.status,
      currentNode: node?.path ?? null,
      pendingQuestion: run.pendingQuestion,
      pendingWork: run.status === "waiting_for_client" ? run.pendingWork : undefined,
      pendingWorkItems: run.status === "waiting_for_client" ? pendingItems(run) : undefined,
      retryAfterMs: run.status === "running" ? 2000 : null,
      next: supervisorWork ? (loadFactoryConfig().supervisor?.hostHint ?? nextHint(run)) : nextHint(run),
      proposal: run.status === "needs_confirmation" ? run.proposal : undefined,
      cost: this.footer(run),
      ...(run.supervisor ? { supervisor: { status: run.supervisor.status, verdict: run.supervisor.verdict ?? null, bottleneck: run.supervisor.bottleneck ?? null, idea: run.supervisor.idea ?? null, costUsd: run.supervisor.costUsd ?? null } } : {}),
      ...(supervisorWork ? { supervisorWork } : {}),
    };
  }

  report(run: Run): Report {
    return runReport(run);
  }

  trace(run: Run): string {
    return runTrace(run);
  }

  /** An interrupt step asks its question once and, when the answer is in, stores it and moves on. */
  private stepInterrupt(run: Run, node: WorkflowNode): void {
    if (!node.question) {
      throw new Error(`interrupt node ${node.path} has no question`);
    }
    const view = this.view(run, node);
    const context = withEach({ goal: run.goal, input: view.input, state: view.state, answers: view.answers });
    const { allowedFrom, itemsFrom, ...fixed } = node.question;
    const items = itemsFrom ? itemsOf(view.state, itemsFrom) : undefined;
    const allowed = allowedFrom ? allowedOf(view.state, allowedFrom) : items?.map((item) => item.id);
    const question = { ...fixed, id: view.prefix + Mustache.render(node.question.id, context), text: Mustache.render(node.question.text, context), ...(allowed ? { allowed } : {}), ...(items ? { items } : {}) };
    const answer = run.answers[question.id];
    if (answer === undefined) {
      this.askUser(run, { ...question, node: node.path }, node.askedBy ?? []);
      this.event(run, "needs_input", { node: node.path, questionId: question.id });
      return;
    }
    view.state[view.key] = { answer };
    this.event(run, "node_completed", { node: node.path, answer });
    this.advance(run, node);
  }

  /** A script step either enters a call scope or runs its operation and records it in the ledger at no cost. */
  private async stepScript(run: Run, node: WorkflowNode): Promise<void> {
    run.steps += 1;
    const started = Date.now();
    if (node.enterScope) {
      this.enterScope(run, node);
      this.advance(run, node);
      return;
    }
    if (!node.script) {
      throw new Error(`script node ${node.path} has no operation`);
    }
    const view = this.view(run, node);
    const result = await node.script({ input: view.input, state: view.state, exec: this.executors.exec, goal: run.goal, answers: view.answers, cwd: workspace(run), nodeId: view.key, runId: run.runId });
    view.state[view.key] = result.state;
    if (result.workspace) {
      this.moveWorkspace(run, node, result.workspace);
    }
    this.appendLedger(run, { nodePath: node.path, agentId: node.id, kind: "script", tier: null, model: null, backend: "script", turn: 1, inputTokens: 0, outputTokens: 0, costUsd: 0, costSource: "measured", durationMs: Date.now() - started, output: result.output ?? null });
    this.event(run, "node_completed", { node: node.path, result: (String(result.output ?? "").split(/\r?\n/)[0] ?? "").slice(0, OUTPUT_PREVIEW_CHARS), ...(result.metrics ? { metrics: result.metrics } : {}) });
    this.advance(run, node);
  }

  /** An llm step asks its question first, selects its agents, skips when there is no work, then hands the agents to the run's backend. */
  private async stepAgents(run: Run, node: WorkflowNode): Promise<void> {
    const config = configOf(run);
    const backend = config.backend.kind;
    const askNow = backend === "fake" ? run.nodeTurn === node.askAfterTurn : true;
    if (node.question && askNow && run.answers[node.question.id] === undefined) {
      this.askUser(run, { ...node.question, node: node.path }, [node.path]);
      this.event(run, "needs_input", { node: node.path, questionId: node.question.id });
      return;
    }
    if (node.agentsFrom && run.nodeAgents?.[node.id] === undefined) {
      run.nodeAgents ??= {};
      const selected = node.agentsFrom(this.view(run, node).state);
      run.nodeAgents[node.id] = selected;
      if (node.freshResults) {
        const view = this.view(run, node);
        delete view.state[view.key];
      }
      this.event(run, "agents_selected", { node: node.path, agents: selected.map((agent) => agent.id) });
    }
    if (agentsOf(run, node)?.length === 0 || node.skipIf?.(this.view(run, node).state)) {
      this.event(run, "node_skipped", { node: node.path, reason: node.skipReason ?? "no work" });
      this.advance(run, node);
      return;
    }
    if (backend === "cli") {
      return this.runCliNode(run, node);
    }
    if (backend === "delegate") {
      this.offerDelegateWork(run, node, config);
      return;
    }
    this.stepFake(run, node, config);
  }

  /** In delegate mode the run waits while the client runs one work item per agent of the step. */
  private offerDelegateWork(run: Run, node: WorkflowNode, config: RunConfig): void {
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
        tools: node.tools ?? ["read"],
        dirs: this.dirs(run, node, agent),
        ...(run.workspace ? { cwd: run.workspace } : {}),
      };
    });
    run.pendingWorkItems = items;
    run.pendingWork = items[0] ?? null;
    run.status = "waiting_for_client";
    for (const item of items) {
      this.event(run, "work_offered", { node: node.path, agentId: item.agentId, tier: item.tier });
    }
  }

  /** The fake backend takes one turn per tick and finishes the agent after the step's turns. */
  private stepFake(run: Run, node: WorkflowNode, config: RunConfig): void {
    const agent = currentAgent(run, node);
    const tier = tierOf(config, agent);
    const turn = run.nodeTurn + 1;
    const usage = fakeModelTurn(tier, turn, run.agentIndex ?? 0);
    run.steps += 1;
    run.nodeTurn = turn;
    this.appendLedger(run, { nodePath: node.path, agentId: agent.id, kind: "llm", tier, model: config.tiers[tier], backend: "fake", turn, ...usage, costSource: "measured" });
    if (node.turns !== undefined && turn >= node.turns) {
      this.finishAgent(run, node, { turns: turn });
    }
  }

  /** Records a delegate agent's work as done; when it was the step's last item the run moves on. */
  private completeWorkItem(run: Run, node: WorkflowNode, work: PendingWork): void {
    this.event(run, "agent_completed", { node: node.path, agentId: work.agentId, backend: "delegate" });
    const left = pendingItems(run).filter((item) => item !== work);
    run.pendingWorkItems = left;
    run.pendingWork = left[0] ?? null;
    if (left.length === 0) {
      run.status = "running";
      this.event(run, "node_completed", { node: node.path, backend: "delegate" });
      this.advance(run, node);
    }
  }

  /** Runs one agent of a CLI step; a failed result is added to failures, not thrown. */
  private async runCliAgent(run: Run, node: WorkflowNode, agent: CurrentAgent, executor: CliExecutor, failures: string[]): Promise<void> {
    const config = configOf(run);
    const cli = config.backend.cli as CliName;
    const tier = tierOf(config, agent);
    const model = config.tiers[tier];
    this.event(run, "agent_started", { node: node.path, agentId: agent.id, tier });
    this.checkpoint(run);
    const result = await executor({ model, prompt: this.prompt(run, node, agent), agent: agent.agentName, cwd: workspace(run), configDir: run.input?.agentConfigDir, tools: node.tools ?? ["read"], dirs: this.dirs(run, node, agent), ...limitDirs(node, this.listedDirs(run, node, agent), this.dirs(run, node, agent)) });
    run.steps += 1;
    if (!result.ok) {
      failures.push(`${agent.id}: ${result.error}`);
      this.event(run, "agent_failed", { node: node.path, agentId: agent.id, error: result.error, ...(result.malformedLines ? { malformedLines: result.malformedLines } : {}) });
      return;
    }
    for (const entry of cliEntries(result, { nodePath: node.path, agentId: agent.id, agentName: agent.agentName ?? null, tier, requestedModel: model, cli, keepOutput: true })) {
      this.appendLedger(run, entry);
    }
    this.storeParsed(run, node, agent.id, result.text ?? "");
    this.event(run, "agent_completed", { node: node.path, agentId: agent.id, backend: `cli:${cli}`, ...(result.malformedLines ? { malformedLines: result.malformedLines } : {}) });
    this.checkpoint(run);
  }
}

/** The work items a run waits for: pendingWorkItems, or the single pendingWork when no list is set. */
function pendingItems(run: Run): PendingWork[] {
  return run.pendingWorkItems ?? (run.pendingWork ? [run.pendingWork] : []);
}

function findPendingWork(run: Run, nodePath: string, agentId: string | undefined): PendingWork | undefined {
  return pendingItems(run).find((item) => item.nodePath === nodePath && (!agentId || item.agentId === agentId));
}

/** True the first time the cost ratio reaches a budget threshold; the threshold is then recorded as hit. */
function hitThreshold(run: Run, level: string, ratio: number, thresholdRatio: number): boolean {
  if (!(ratio >= thresholdRatio) || run.thresholdsHit.includes(level)) {
    return false;
  }
  run.thresholdsHit.push(level);
  return true;
}

function nodeAt(run: Run): WorkflowNode {
  const node = run.cursor < 0 ? undefined : workflowOf(run).nodes[run.cursor];
  if (!node) {
    throw new Error(`run ${run.runId} has no node at cursor ${run.cursor}`);
  }
  return node;
}

function tierOf(config: RunConfig, agent: CurrentAgent): Tier {
  const tier = agent.role === undefined ? undefined : config.roles[agent.role];
  if (!tier) {
    throw new Error(`no tier for role '${agent.role}'`);
  }
  return tier;
}

function isAllowedAnswer(pending: PendingQuestion, answer: string): boolean {
  const allowed = pending.allowed ?? [];
  if (!pending.multiple) {
    return allowed.includes(answer);
  }
  if (answer === "none") {
    return true;
  }
  const ids = answer.split(",");
  if (new Set(ids).size !== ids.length) {
    throw new Error(`duplicate id in answer '${answer}'`);
  }
  return ids.every((id) => allowed.includes(id));
}

function itemsOf(state: WorkflowState, dotted: string): QuestionItem[] {
  const items = readPath(state, dotted.replace(/^state\./, ""));
  const valid = Array.isArray(items) && items.length > 0 && items.every((item) => item && typeof item.id === "string" && typeof item.label === "string" && typeof item.detail === "string" && typeof item.checked === "boolean");
  if (!valid) {
    throw new Error(`itemsFrom ${dotted} is not a list of items with id, label, detail and checked`);
  }
  return (items as QuestionItem[]).map(({ id, label, detail, checked }) => ({ id, label, detail, checked }));
}

function allowedOf(state: WorkflowState, dotted: string): string[] {
  const allowed = readPath(state, dotted.replace(/^state\./, ""));
  if (!Array.isArray(allowed) || allowed.length === 0 || !allowed.every((answer) => typeof answer === "string")) {
    throw new Error(`allowedFrom ${dotted} is not a list of answers`);
  }
  return allowed;
}

function agentsOf(run: Run, node: WorkflowNode): Agent[] | null {
  return run.nodeAgents?.[node.id] ?? node.agents ?? null;
}

function currentAgent(run: Run, node: WorkflowNode): CurrentAgent {
  const agents = agentsOf(run, node);
  if (!agents) {
    return { id: node.localId ?? node.id, role: node.role, agentName: node.agent };
  }
  const agent = agents[run.agentIndex ?? 0];
  if (!agent) {
    throw new Error(`node ${node.path} has no agent ${run.agentIndex ?? 0}`);
  }
  return { ...agent, role: agent.role ?? node.role, agentName: agent.agentName ?? node.agent };
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
