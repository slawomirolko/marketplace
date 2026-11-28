export interface WorkflowQuestion {
  id: string;
  text: string;
  allowed?: string[];
}

export interface WorkflowAgent {
  id: string;
  role?: string;
  agentName?: string;
  agent?: string;
}

export interface AgentInfo {
  name: string;
  kind: "agent" | "plugin-agent" | "skill";
  description: string;
  file: string;
  skills: { name: string; description: string; file: string }[];
  scripts: { skill: string; name: string; file: string }[];
  missing: string[];
  asks?: string | null;
  memoryLayer?: boolean;
}

/** A step of another workflow, found through the nearest workflow that inlines both. */
export interface AskedByStep {
  workflow: string;
  step: string;
}

export type AskedByRef = string | AskedByStep;

export type AskedBy = AskedByRef | AskedByRef[];

export interface WorkflowNode {
  id: string;
  kind: string;
  role?: string;
  agent?: string;
  agents?: WorkflowAgent[];
  agentsFrom?: string;
  workflow?: string;
  run?: string;
  maxTurns?: number;
  question?: WorkflowQuestion;
  askedBy?: AskedBy;
  askAfterTurn?: number;
  enabledWhen?: string;
  required?: boolean;
  skill?: string;
  tools?: string[];
  dirs?: string[];
  op?: string;
  with?: Record<string, unknown>;
  parse?: string | { json: string[] } | { line: string[] };
  maxVisits?: number;
  parallel?: number;
  input?: Record<string, string>;
  prompt?: string;
  description?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  when?: string;
  description?: string;
}

export interface StaleWorkflow {
  workflow: string;
  changed: string[];
  missing: string[];
}

export interface Workflow {
  name: string;
  version: string;
  source?: string;
  description?: string;
  standalone?: boolean;
  roles?: Record<string, string>;
  entry: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface FactoryBackend {
  id?: string;
  kind: string;
  cli?: string;
}

export interface Budget {
  maxCostUsd: number;
  infoRatio?: number;
  pauseRatio?: number;
  onExceeded?: string;
}

export interface FactoryConfig {
  schemaVersion?: number;
  tiers?: string[];
  backends?: FactoryBackend[];
  roles?: Record<string, string>;
  budget?: Budget;
  switches?: Record<string, boolean>;
  memoryLayer?: string;
}

export interface Coverage {
  llmSteps: number;
  unknownSteps: number;
}

export interface Cost extends Coverage {
  costUsd: number;
  tokens: number;
  cacheTokens: number;
  steps: number;
  costSource: string;
  tier?: string | null;
  model?: string | null;
}

export interface AgentCost extends Cost {
  agentName: string | null;
}

export interface NodeCost extends Cost {
  byAgent: Record<string, AgentCost>;
}

export interface RunCost {
  costUsd: number;
  budgetUsd: number;
  budgetRatio: number;
  tokens: number;
  steps: number;
  perNode: Record<string, number>;
  source: string;
  warnings: string[];
}

export interface SupervisorData {
  status: "pending" | "running" | "waiting_for_client" | "done" | "failed";
  agent: string;
  tier?: string;
  model?: string;
  startedAt?: string;
  finishedAt?: string;
  costUsd?: number | null;
  output?: string | null;
  verdict?: string | null;
  bottleneck?: string | null;
  idea?: string | null;
  error?: string | null;
}

export interface RunReport {
  runId: string;
  status: string;
  workflow: string;
  backend?: FactoryBackend;
  tierModels?: Record<string, string>;
  byNode: Record<string, NodeCost>;
  byTier: Record<string, number>;
  byModel: Record<string, number>;
  byCostSource: Record<string, number>;
  coverage: {
    run: Coverage;
    byTier: Record<string, Coverage>;
    byModel: Record<string, Coverage>;
  };
  cacheTokens: number;
  harnessCostUsd: number;
  cost: RunCost;
  synthetic: boolean;
  supervisor?: SupervisorData;
  /** The cost of each subgraph, call, map and group drawn for the run's workflow, keyed by its graph key. */
  bySubgraph: Record<string, Cost>;
  passes: RunPass[];
  calls: RunCall[];
}

export interface PassAgent {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  durationMs: number | null;
  waitMs: number;
}

/** One visit of one node: from its node_started to its completed, failed or skipped event. */
export interface RunPass {
  node: string;
  visit: number | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  agents: PassAgent[];
  /** Number of ledger records written while the pass was open. */
  records: number;
  /** Active time: start to end minus the time spent waiting for a user answer; the ledger durationMs sum when the pass has no end. */
  durationMs: number | null;
  /** Time inside the pass spent waiting for a user answer (a question or a budget pause). */
  waitMs: number;
}

/** One call in the calls list: a pass, or one agent of a pass when several agents ran in it. */
export interface RunCall {
  node: string;
  agent: string | null;
  agentName: string | null;
  visit: number | null;
  status: string;
  startedAt: string;
  /** The sum of the call's ledger records; null (unknown, not zero) when any record has no known cost. */
  costUsd: number | null;
  records: number;
  durationMs: number | null;
  waitMs: number;
}

export interface LedgerRecord {
  runId: string;
  workflow: string;
  at: string;
  nodePath: string;
  agentId?: string | null;
  agentName?: string | null;
  kind: string;
  tier: string | null;
  model: string | null;
  backend: string;
  turn: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens?: number | null;
  cacheWrite5mTokens?: number | null;
  cacheWrite1hTokens?: number | null;
  /** Null when the harness reported no cost for this turn: unknown, not zero (`costSource` is then `unknown`). */
  costUsd: number | null;
  costSource: string;
  durationMs?: number | null;
  output?: string | null;
  outputPreview?: string;
}

export interface RunEvent {
  at: string;
  type: string;
  node?: string;
  agentId?: string;
  visit?: number;
  error?: unknown;
  result?: string;
  level?: string;
  questionId?: string;
}

export interface RunConfig {
  backend?: FactoryBackend;
  tiers?: Record<string, string>;
  budget?: Budget;
}

export interface RunData {
  runId: string;
  goal: string;
  status: string;
  config?: RunConfig | null;
  answers?: Record<string, string>;
  ledger: LedgerRecord[];
  events: RunEvent[];
  pendingQuestion?: (WorkflowQuestion & { node?: string }) | null;
  pendingWorkItems?: { nodePath: string; agentId: string }[];
}

export interface AskedQuestion {
  runId: string;
  questionId: string;
  node: string | null;
  askedBy: string[];
  text: string;
  allowed: string[] | null;
  askedAt: string;
  answer: string | null;
  answeredAt: string | null;
}

export interface RunDetail {
  run: RunData;
  report: RunReport;
  questions?: AskedQuestion[];
}

export interface RunListItem {
  source?: string;
  workflow?: string;
  ran?: string[];
  projectId?: string | null;
  runId: string;
  goal: string;
  status: string;
  createdAt: string | null;
  costUsd: number;
  coverage: Coverage;
  harness: string | null;
  requestedModels: string[];
  usedModels: string[];
  synthetic: boolean;
}

export interface LevelEdge {
  from: string;
  to: string;
  label: string | null;
  optional?: boolean;
  dashed?: boolean;
}

export interface LevelExit {
  from: string;
  optional: boolean;
}

export interface Level {
  items: Item[];
  edges: LevelEdge[];
  entry?: string;
  exits?: LevelExit[];
}

export interface TerminalItem {
  key: string;
  kind: "terminal";
  label: string;
}

export interface StepItem {
  key: string;
  kind: "step";
  node: WorkflowNode;
}

export interface MissingItem {
  key: string;
  kind: "missing";
  node: WorkflowNode;
}

export interface SubgraphItem {
  key: string;
  kind: "subgraph";
  node: WorkflowNode;
  inner: Level;
}

export interface AgentItem {
  key: string;
  kind: "agent";
  node: WorkflowNode;
  agent: { id: string; role: string | undefined; agentName?: string };
  nodePath: string;
}

export interface TeamItem {
  key: string;
  kind: "team";
  node: WorkflowNode;
  inner: { items: AgentItem[]; edges: LevelEdge[] };
}

export type GroupItem = SubgraphItem | TeamItem;
export type WorkflowItem = StepItem | MissingItem | SubgraphItem | TeamItem | AgentItem;
export type Item = TerminalItem | WorkflowItem;

export interface RunIndexEntry {
  cost: Cost | null;
  tier: string | null;
  model: string | null;
  failure: string | null;
  runs: number | null;
  timeMs: number | null;
}

export type RunIndex = Map<string, RunIndexEntry>;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProjectSummary {
  id: string;
  path: string;
  marketplace?: string;
  exists: boolean;
  runs: number;
  analyzing: string | null;
  status: { runId: string; createdAt: string | null; summary: string | null; counts: Record<string, number> | null } | null;
}

/** The project registry as the viewer API returns it: root folders, projects and whether the status workflow can run. */
export interface ProjectOverview {
  roots: string[];
  projects: ProjectSummary[];
  statusWorkflow: string;
  statusWorkflowInstalled: boolean;
  mergeWorkflow: string;
  mergeWorkflowInstalled: boolean;
  canAnalyze: boolean;
}

export interface ProjectCandidate {
  path: string;
  suggestedId: string;
  markers: string[];
}

export interface ProjectArtifact {
  id: string;
  kind: "skill" | "agent";
  name: string;
  harness: string | null;
  location: string | null;
  state: string;
  installed: string | null;
  current: string | null;
  installedCommit?: string;
  currentCommit?: string;
  nearestVersion?: string | null;
  nearestCommit?: string;
  lastVersion?: string | null;
  lastCommit?: string;
  upstreamMoved?: boolean;
  files: string[];
  requiredBy?: string[];
  workflows: string[];
}

export interface ProjectStatusData {
  head: string | null;
  harnesses: { id: string; markers: string[] }[];
  /** The marketplace ref compared with: `origin/HEAD` or `origin/main` after a fetch, `HEAD` without a remote. */
  ref?: string;
  /** False when the scan used what the last fetch left, true when it fetched now. */
  fetched?: boolean;
  /** Why the fetch failed; the comparison then used what the last fetch left. */
  fetchError?: string | null;
  /** True when the project is a marketplace source checkout. */
  marketplaceSource?: boolean;
  /** For a source checkout with a remote: the remote branch it is compared with, and its commits behind and ahead of it. */
  upstreamRef?: string;
  behind?: number;
  ahead?: number;
  /** For a source checkout: the factory workflows changed in it since its merge base with the remote. */
  localWorkflows?: string[];
  artifacts: ProjectArtifact[];
  counts: Record<string, number>;
  workflows: string[];
  summary: string;
  createdAt?: string;
}

export interface ProjectStatusView {
  runId: string;
  status: string;
  createdAt: string | null;
  data: ProjectStatusData | null;
}

/** One checkbox of a multiple question: an id to send back, what it is, its expandable detail and whether it starts checked. */
export interface PendingItem {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
}

/** A question of a run the viewer process owns, with the answers it allows. */
export interface PendingDecision {
  runId: string;
  goal: string;
  workflow: string;
  questionId: string;
  text: string;
  allowed: string[];
  /** A multiple question is answered with `none` or the checked item ids joined by commas. */
  multiple?: boolean;
  items?: PendingItem[];
}
