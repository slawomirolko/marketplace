import Mustache from "mustache";
import { loadFactoryConfig } from "./config.ts";
import { errorMessage } from "./errors.ts";
import { cliEntries, delegateEntry, fakeModelTurn } from "./ledger-entries.ts";
import { readMarketplaceAgent } from "./marketplace-agents.ts";
import { configOf } from "./run-config.ts";
import { supervisorCost } from "./run-report.ts";
import { SUPERVISOR_PATH, parseSupervisorLine, summarizeRun } from "./run-summary.ts";
import type { RunSummary } from "./run-summary.ts";
import type { Executors, LedgerEntry, Run, RunEvent, SubmitUsage, SupervisorRecord, SupervisorSettings, Tier, VerdictLineFormat } from "./types.ts";

const SUPERVISOR_ID = "supervisor";

/** What the supervisor needs from the factory that owns the run: its executors, its ledger, its events and its checkpoints. */
export interface SupervisorHost {
  executors: Executors;
  appendLedger(run: Run, record: LedgerEntry): void;
  event(run: Run, type: string, data?: Omit<RunEvent, "at" | "type">): void;
  checkpoint(run: Run): void;
}

/** The post-run supervisor of a factory: it starts when a run ends, runs on the run's backend and records its verdict on the run. */
export class RunSupervisor {
  /** The CLI supervisor jobs still running, by run id. */
  readonly supervising = new Map<string, Promise<void>>();
  private readonly host: SupervisorHost;

  constructor(host: SupervisorHost) {
    this.host = host;
  }

  start(run: Run): void {
    const record = run.supervisor;
    if (!record) {
      return;
    }
    const config = configOf(run);
    const tier: Tier = config.roles.supervisor ?? "low";
    const model = config.tiers[tier];
    const summary = summarizeRun(run);
    Object.assign(record, { status: "running", tier, model, startedAt: new Date().toISOString(), summary, error: null });
    this.host.event(run, "supervisor_started", { node: SUPERVISOR_PATH, tier, model });
    try {
      const settings = supervisorSettings();
      switch (config.backend.kind) {
        case "fake":
          this.superviseFake(run, record, summary, settings);
          return;
        case "delegate":
          this.superviseDelegate(run, record, summary, settings);
          return;
        default:
          this.superviseCli(run, record, summary, settings);
      }
    } catch (error) {
      this.fail(run, error);
    }
  }

  /** Takes the client's reply to the supervisor work; a second reply after the supervisor is done is a duplicate. */
  submit(run: Run, output: string, usage: SubmitUsage): { run: Run; duplicate: boolean } {
    const record = run.supervisor;
    const work = record?.work;
    if (record?.status !== "waiting_for_client" || !work) {
      if (record?.status === "done") {
        return { run, duplicate: true };
      }
      throw new Error(`no pending work for node ${SUPERVISOR_PATH}`);
    }
    run.steps += 1;
    this.host.appendLedger(run, { ...delegateEntry(work, output, usage), agentName: record.agent });
    record.work = null;
    this.finish(run, output, loadFactoryConfig().supervisor?.verdictLine);
    this.host.checkpoint(run);
    return { run, duplicate: false };
  }

  private superviseFake(run: Run, record: SupervisorRecord, summary: RunSummary, settings: SupervisorSettings): void {
    const tier = record.tier as Tier;
    run.steps += 1;
    this.host.appendLedger(run, { nodePath: SUPERVISOR_PATH, agentId: SUPERVISOR_ID, kind: "llm", tier, model: record.model as string, backend: "fake", turn: 1, ...fakeModelTurn(tier, 1), costSource: "measured", agentName: record.agent });
    this.finish(run, fakeSupervisorText(summary, settings.verdictLine), settings.verdictLine);
  }

  private superviseDelegate(run: Run, record: SupervisorRecord, summary: RunSummary, settings: SupervisorSettings): void {
    const definition = readMarketplaceAgent(record.agent);
    const prompt = supervisorPrompt(settings, summary);
    const tier = record.tier as Tier;
    record.status = "waiting_for_client";
    record.work = { nodePath: SUPERVISOR_PATH, agentId: SUPERVISOR_ID, tier, model: record.model as string, prompt, agentName: definition.name, agentDescription: definition.description, agentInstructions: definition.prompt, tools: ["read"], dirs: definition.dirs };
    this.host.event(run, "work_offered", { node: SUPERVISOR_PATH, agentId: SUPERVISOR_ID, tier });
  }

  private superviseCli(run: Run, record: SupervisorRecord, summary: RunSummary, settings: SupervisorSettings): void {
    const definition = readMarketplaceAgent(record.agent);
    const prompt = supervisorPrompt(settings, summary);
    const job = this.runCli(run, prompt, definition.dirs, settings.verdictLine).finally(() => this.supervising.delete(run.runId));
    this.supervising.set(run.runId, job);
  }

  private async runCli(run: Run, prompt: string, dirs: string[], verdictLine: VerdictLineFormat): Promise<void> {
    const record = run.supervisor as SupervisorRecord;
    const cli = configOf(run).backend.cli;
    try {
      const executor = cli ? this.host.executors[cli] : undefined;
      if (!cli || !executor) {
        throw new Error(`no executor for cli backend '${cli}' in this factory process`);
      }
      const result = await executor({ model: record.model as string, prompt, agent: record.agent, tools: ["read"], dirs });
      run.steps += 1;
      if (!result.ok) {
        throw new Error(result.error ?? "the supervisor agent failed");
      }
      for (const entry of cliEntries(result, { nodePath: SUPERVISOR_PATH, agentId: SUPERVISOR_ID, agentName: record.agent, tier: record.tier as Tier, requestedModel: record.model as string, cli, keepOutput: false })) {
        this.host.appendLedger(run, entry);
      }
      this.finish(run, result.text ?? "", verdictLine);
    } catch (error) {
      this.fail(run, error);
    }
    this.host.checkpoint(run);
  }

  private finish(run: Run, output: string, verdictLine: VerdictLineFormat | undefined): void {
    const record = run.supervisor as SupervisorRecord;
    const parsed = verdictLine ? parseSupervisorLine(output, verdictLine) : null;
    Object.assign(record, { status: "done", finishedAt: new Date().toISOString(), output, verdict: parsed?.verdict ?? null, bottleneck: parsed?.bottleneck ?? null, idea: parsed?.idea ?? null, costUsd: supervisorCost(run) });
    this.host.event(run, "supervisor_completed", { node: SUPERVISOR_PATH, verdict: record.verdict, costUsd: record.costUsd });
  }

  private fail(run: Run, error: unknown): void {
    const record = run.supervisor as SupervisorRecord;
    Object.assign(record, { status: "failed", finishedAt: new Date().toISOString(), error: errorMessage(error), work: null, costUsd: supervisorCost(run) });
    this.host.event(run, "supervisor_failed", { node: SUPERVISOR_PATH, error: record.error });
  }
}

/** The post-run agent settings from config/factory.yaml; a run gets a supervisor only when they exist. */
function supervisorSettings(): SupervisorSettings {
  const settings = loadFactoryConfig().supervisor;
  if (!settings) {
    throw new Error("config/factory.yaml has no supervisor section");
  }
  return settings;
}

/** The configured prompt template rendered over the run summary. */
function supervisorPrompt(settings: SupervisorSettings, summary: RunSummary): string {
  return Mustache.render(settings.prompt, { summaryJson: JSON.stringify(summary, null, 2) }, {}, { escape: (value: unknown) => String(value) });
}

/** The fake model's supervisor output: fixed facts and a verdict line in the configured format with the first verdict. */
function fakeSupervisorText(summary: RunSummary, verdictLine: VerdictLineFormat): string {
  const bottleneck = summary.top.costNode ?? "none";
  return [
    `FACTS: ${summary.run.workflow} ${summary.run.status}, $${summary.totals.costUsd} of $${summary.run.budgetUsd ?? "?"}, ${summary.totals.llmSteps} llm steps, ${summary.loops.length} loops, ${summary.failures.length} failures.`,
    `BOTTLENECK: ${bottleneck}.`,
    "IDEAS: none (fake model).",
    `${verdictLine.prefix} | ${verdictLine.verdicts[0]} | ${bottleneck} | none`,
  ].join("\n");
}
