import { SUPERVISOR_PATH } from "./run-summary.ts";
import { workflowLabel } from "./workflows.ts";
import type { AgentCost, CostFooter, CostSource, Coverage, LedgerRecord, NodeCost, Report, Run, WorkflowSpec } from "./types.ts";

/** The sums a report builds up while it reads the ledger record by record. */
interface ReportSums {
  byNode: Record<string, NodeCost>;
  byTier: Record<string, number>;
  byModel: Record<string, number>;
  byCostSource: Record<string, number>;
  coverage: Report["coverage"];
  harnessCostUsd: number;
  cacheTokens: number;
}

/** The summed cost of every node inside a subgraph, call, map or group. */
export interface SubgraphCost extends Coverage {
  costUsd: number;
  tokens: number;
  cacheTokens: number;
  steps: number;
  costSource: string;
}

type FooterRun = Pick<Run, "config" | "proposal" | "ledger" | "steps" | "thresholdsHit"> & { events?: Run["events"] };

export function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** The cost, tokens and steps of a run so far. */
export function runTotals(run: Pick<Run, "ledger" | "steps">) {
  const costUsd = run.ledger.reduce((sum, record) => sum + (record.costUsd ?? 0), 0);
  const tokens = run.ledger.reduce((sum, record) => sum + (record.inputTokens ?? 0) + (record.outputTokens ?? 0) + (record.inputTokens == null ? (record.totalTokens ?? 0) : 0), 0);
  return { costUsd, tokens, steps: run.steps };
}

/** The cost footer of a run: totals against the budget, cost per node and the warnings. */
export function costFooter(run: FooterRun): CostFooter {
  const totals = runTotals(run);
  const maxCostUsd = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
  const perNode: Record<string, number> = {};
  for (const record of run.ledger) {
    perNode[record.nodePath] = round((perNode[record.nodePath] ?? 0) + (record.costUsd ?? 0));
  }
  return {
    costUsd: round(totals.costUsd),
    budgetUsd: maxCostUsd,
    budgetRatio: round(totals.costUsd / maxCostUsd),
    tokens: totals.tokens,
    steps: totals.steps,
    perNode,
    source: costSourceSummary(run.ledger),
    warnings: footerWarnings(run),
  };
}

/** The cost report of a run by node, agent, tier and model. It only reads the run, so the viewer uses it without a factory. */
export function runReport(run: Run): Report {
  const sums: ReportSums = { byNode: {}, byTier: {}, byModel: {}, byCostSource: {}, coverage: { run: { llmSteps: 0, unknownSteps: 0 }, byTier: {}, byModel: {} }, harnessCostUsd: 0, cacheTokens: 0 };
  for (const record of run.ledger) {
    addLedgerRecord(sums, record);
  }
  for (const [nodePath, entry] of Object.entries(sums.byNode)) {
    finalizeNodeCosts(run, nodePath, entry);
  }
  for (const costs of [sums.byTier, sums.byModel]) {
    for (const [key, value] of Object.entries(costs)) {
      costs[key] = round(value);
    }
  }
  return {
    runId: run.runId,
    status: run.status,
    workflow: workflowLabel(run),
    backend: run.config?.backend,
    tierModels: run.config?.tiers,
    synthetic: (run.config ?? run.proposal).backend?.kind === "fake",
    byNode: sums.byNode,
    byTier: sums.byTier,
    byModel: sums.byModel,
    byCostSource: sums.byCostSource,
    coverage: sums.coverage,
    cacheTokens: sums.cacheTokens,
    harnessCostUsd: round(sums.harnessCostUsd),
    result: [...run.ledger].reverse().find((record) => typeof record.output === "string" && record.nodePath !== SUPERVISOR_PATH)?.output ?? null,
    cost: costFooter(run),
    ...(run.supervisor ? { supervisor: supervisorView(run.supervisor) } : {}),
  };
}

/** The run as text: one line per ledger turn under its node, then the question and budget events. */
export function runTrace(run: Run): string {
  const lines = [`run ${run.runId} [${run.status}] ${workflowLabel(run)}  $${round(runTotals(run).costUsd)}`];
  let lastNode: string | null = null;
  for (const record of run.ledger) {
    if (record.nodePath !== lastNode) {
      lines.push(`  ${record.nodePath} (${record.tier ?? "script"})`);
      lastNode = record.nodePath;
    }
    lines.push(`    turn ${record.turn}: in=${record.inputTokens} out=${record.outputTokens} $${record.costUsd == null ? "?" : round(record.costUsd)} ${record.costSource}`);
  }
  for (const event of run.events.filter((candidate) => ["needs_input", "run_resumed", "budget_threshold"].includes(candidate.type))) {
    lines.push(`  event ${event.type} ${event.node ?? event.questionId ?? event.level ?? ""}`);
  }
  return lines.join("\n");
}

/** The cost of the supervisor's ledger records, or null when it has none. */
export function supervisorCost(run: Run): number | null {
  const records = run.ledger.filter((record) => record.nodePath === SUPERVISOR_PATH);
  return records.length ? round(records.reduce((sum, record) => sum + (record.costUsd ?? 0), 0)) : null;
}

/**
 * The cost of every subgraph, call, map and group the viewer draws for a run of `root`, keyed by its graph key.
 * A subgraph, call or map sums every node under its own path. A group draws its workflow in its parent's path,
 * so it sums the nodes it draws. Workflows already open higher up are not walked again, as in the viewer graph.
 */
export function subgraphCosts(specs: WorkflowSpec[], root: string, byNode: Record<string, NodeCost>): Record<string, SubgraphCost> {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const costs: Record<string, SubgraphCost> = {};
  const walk = (name: string, prefix: string, stack: string[]): string[] => {
    const drawnKeys: string[] = [];
    for (const node of byName.get(name)?.nodes ?? []) {
      const key = `${prefix}/${node.id}`;
      const inner = node.workflow;
      if (!NESTING_KINDS.has(node.kind) || inner === undefined || !byName.has(inner) || stack.includes(inner)) {
        drawnKeys.push(key);
        continue;
      }
      const isGroup = node.kind === "group";
      const innerKeys = walk(inner, isGroup ? prefix : key, [...stack, inner]);
      const inside = isGroup ? innerKeys : [key];
      const cost = costInside(byNode, inside);
      if (cost) {
        costs[key] = cost;
      }
      drawnKeys.push(...inside);
    }
    return drawnKeys;
  };
  if (byName.has(root)) {
    walk(root, root, [root]);
  }
  return costs;
}

/** The budget thresholds a run has hit and the required steps it ran with their switch off. */
function footerWarnings(run: Pick<Run, "thresholdsHit"> & { events?: Run["events"] }): string[] {
  const thresholds = run.thresholdsHit.map((level) => `budget threshold: ${level}`);
  const switchedOff = (run.events ?? []).filter((event) => event.type === "node_completed" && String(event.result ?? "").includes("required step switched off")).map((event) => `required step switched off: ${String(event.node)}`);
  return [...thresholds, ...switchedOff];
}

const NESTING_KINDS = new Set(["subgraph", "map", "call", "group"]);

/** The summed cost of the nodes at or below any of `keys`, or null when none of them has a cost. */
function costInside(byNode: Record<string, NodeCost>, keys: string[]): SubgraphCost | null {
  const parts = Object.entries(byNode).filter(([nodePath]) => keys.some((key) => nodePath === key || nodePath.startsWith(`${key}/`))).map(([, cost]) => cost);
  if (parts.length === 0) {
    return null;
  }
  return {
    costUsd: round(parts.reduce((sum, cost) => sum + cost.costUsd, 0)),
    tokens: parts.reduce((sum, cost) => sum + cost.tokens, 0),
    cacheTokens: parts.reduce((sum, cost) => sum + (cost.cacheTokens ?? 0), 0),
    steps: parts.reduce((sum, cost) => sum + cost.steps, 0),
    llmSteps: parts.reduce((sum, cost) => sum + (cost.llmSteps ?? 0), 0),
    unknownSteps: parts.reduce((sum, cost) => sum + (cost.unknownSteps ?? 0), 0),
    costSource: singleOrMixed(new Set(parts.map((cost) => cost.costSource))),
  };
}

function addLedgerRecord(sums: ReportSums, record: LedgerRecord): void {
  const cache = (record.cacheReadTokens ?? 0) + (record.cacheWrite5mTokens ?? 0) + (record.cacheWrite1hTokens ?? 0);
  sums.cacheTokens += cache;
  const nodeEntry = (sums.byNode[record.nodePath] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: record.tier, model: record.model ?? null, byAgent: {}, costSource: "" });
  const agentKey = record.agentId ?? record.nodePath.split("/").at(-1) ?? record.nodePath;
  const agentEntry = (nodeEntry.byAgent[agentKey] ??= { steps: 0, llmSteps: 0, unknownSteps: 0, tokens: 0, cacheTokens: 0, costUsd: 0, tier: record.tier, model: record.model ?? null, agentName: record.agentName ?? null, costSource: "", sources: [] });
  for (const entry of [nodeEntry, agentEntry]) {
    entry.cacheTokens += cache;
    entry.steps += 1;
    entry.tokens += (record.inputTokens ?? 0) + (record.outputTokens ?? 0);
    entry.costUsd += record.costUsd ?? 0;
  }
  agentEntry.sources?.push(record.costSource);
  const tierKey = record.tier ?? "script";
  bump(sums.byTier, tierKey, record.costUsd ?? 0);
  if (record.kind === "llm") {
    const modelKey = record.model ?? "unknown";
    bump(sums.byModel, modelKey, record.costUsd ?? 0);
    bump(sums.byCostSource, record.costSource, 1);
    const targets = [
      sums.coverage.run,
      (sums.coverage.byTier[tierKey] ??= { llmSteps: 0, unknownSteps: 0 }),
      (sums.coverage.byModel[modelKey] ??= { llmSteps: 0, unknownSteps: 0 }),
      nodeEntry,
      agentEntry,
    ];
    for (const target of targets) {
      target.llmSteps += 1;
      if (record.costSource === "unknown") {
        target.unknownSteps += 1;
      }
    }
  }
  sums.harnessCostUsd += record.harnessCostUsd ?? 0;
}

/** Rounds a node's costs, marks a node whose agents ran on different tiers as mixed and settles each cost source. */
function finalizeNodeCosts(run: Run, nodePath: string, entry: NodeCost): void {
  entry.costUsd = round(entry.costUsd);
  const agentTiers = new Set(Object.values(entry.byAgent).map((agent) => agent.tier));
  if (agentTiers.size > 1) {
    Object.assign(entry, { tier: "mixed", model: "mixed" });
  }
  for (const agentEntry of Object.values(entry.byAgent)) {
    finalizeAgentCosts(agentEntry);
  }
  entry.costSource = singleOrMixed(new Set(run.ledger.filter((record) => record.nodePath === nodePath).map((record) => record.costSource)));
}

function finalizeAgentCosts(agentEntry: AgentCost): void {
  agentEntry.costUsd = round(agentEntry.costUsd);
  agentEntry.costSource = singleOrMixed(new Set(agentEntry.sources));
  delete agentEntry.sources;
}

function bump(sums: Record<string, number>, key: string, amount: number): void {
  sums[key] = (sums[key] ?? 0) + amount;
}

function supervisorView(record: NonNullable<Run["supervisor"]>): Omit<NonNullable<Run["supervisor"]>, "work"> {
  const { work: _work, ...view } = record;
  return view;
}

function singleOrMixed(sources: Set<string>): string {
  const [first] = sources;
  return sources.size === 1 && first !== undefined ? first : "mixed";
}

function costSourceSummary(ledger: LedgerRecord[]): string {
  const sources = new Set<CostSource>(ledger.filter((record) => record.kind === "llm").map((record) => record.costSource));
  if (sources.size === 0) {
    return "none";
  }
  return singleOrMixed(sources);
}
