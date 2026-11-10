export type Tier = "low" | "medium" | "high";
export type BackendKind = "fake" | "cli" | "delegate";
export type CliName = "claude" | "opencode";
export type CostSource = "measured" | "estimated" | "reported" | "unknown";
export type RunStatus = "needs_confirmation" | "running" | "waiting_for_user" | "waiting_for_client" | "done" | "stopped" | "cancelled" | "failed";

export interface Backend {
  kind: BackendKind;
  cli?: CliName;
}

export interface Budget {
  maxCostUsd: number;
  infoRatio: number;
  pauseRatio: number;
}

export interface RunConfig {
  roles: Record<string, Tier>;
  tiers: Record<Tier, string>;
  backend: Backend;
  budget: Budget;
}

export interface ConfirmOverrides {
  roles?: Record<string, Tier>;
  budget?: Partial<Budget>;
  backend?: Backend;
  tierModels?: Partial<Record<Tier, string>>;
}

export interface Question {
  id: string;
  text: string;
  allowed?: string[];
}

export interface PendingQuestion extends Question {
  node?: string;
}

export interface PendingWork {
  nodePath: string;
  agentId: string;
  tier: Tier;
  model: string;
  prompt: string;
}

export interface Agent {
  id: string;
  role?: string;
  agentName?: string;
  paths?: string[];
}

export type WorkflowState = Record<string, unknown>;

export interface RunInput {
  cwd?: string;
  agentConfigDir?: string;
  repo?: string;
  pr?: number;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type HostExec = (command: string, args: string[]) => ExecResult | Promise<ExecResult>;

export interface TokenCounts {
  input: number | null;
  output: number | null;
  cacheRead?: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  reasoning?: number;
}

export interface ModelUsage {
  model: string;
  tokens: TokenCounts;
  cacheWriteTtlKnown: boolean;
  harnessCostUsd: number | null;
}

export interface CliRequest {
  model: string;
  prompt: string;
  agent?: string | undefined;
  cwd?: string | undefined;
  configDir?: string | undefined;
}

export interface CliResult {
  ok: boolean;
  error?: string | undefined;
  text?: string;
  turns?: number;
  sessionId?: string | null;
  harnessCostUsd?: number | null;
  usageByModel?: ModelUsage[];
  durationMs?: number;
}

export type CliExecutor = (request: CliRequest) => Promise<CliResult>;

export interface Executors {
  exec?: HostExec;
  claude?: CliExecutor;
  opencode?: CliExecutor;
}

export interface ScriptContext {
  input: RunInput;
  state: WorkflowState;
  exec: HostExec | undefined;
}

export interface ScriptResult {
  state: unknown;
  output?: string | null;
}

export interface PromptContext {
  goal: string;
  input: RunInput | undefined;
  state: WorkflowState | undefined;
  agent: Agent;
}

export interface WorkflowNode {
  id: string;
  path: string;
  kind: "llm" | "script";
  role?: string;
  agent?: string;
  turns?: number;
  askAfterTurn?: number;
  question?: Question;
  prompt?: string | ((context: PromptContext) => string);
  agents?: Agent[];
  agentsFrom?: (state: WorkflowState | undefined) => Agent[];
  script?: (context: ScriptContext) => Promise<ScriptResult>;
  parse?: (text: string) => unknown;
  skipIf?: (state: WorkflowState | undefined) => boolean;
  skipReason?: string;
}

export interface Workflow {
  name: string;
  version: string;
  source?: string;
  roles?: Record<string, Tier>;
  nodes: WorkflowNode[];
}

export interface LedgerRecord {
  runId: string;
  workflow: string;
  at: string;
  nodePath: string;
  agentId?: string;
  kind: "llm" | "script";
  tier: Tier | null;
  model: string | null;
  requestedModel?: string;
  backend: string;
  turn: number;
  harnessTurns?: number | undefined;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens?: number | undefined;
  cacheWrite5mTokens?: number | undefined;
  cacheWrite1hTokens?: number | undefined;
  totalTokens?: number | null;
  childSessionId?: string | null;
  costUsd: number | null;
  costSource: CostSource;
  harnessCostUsd?: number | null;
  durationMs?: number | undefined;
  outputPreview?: string;
  output?: string | null;
  agentName?: string | null;
  enrichedFrom?: string;
}

export type LedgerEntry = Omit<LedgerRecord, "runId" | "workflow" | "at">;

export interface RunEvent {
  at: string;
  type: string;
  node?: string;
  cursor?: number;
  questionId?: string;
  level?: string;
  error?: string;
  [key: string]: unknown;
}

export interface Run {
  runId: string;
  idempotencyKey: string | null;
  goal: string;
  workflow?: string;
  input?: RunInput;
  state?: WorkflowState;
  nodeAgents?: Record<string, Agent[]>;
  status: RunStatus;
  proposal: RunConfig;
  config: RunConfig | null;
  cursor: number;
  nodeTurn: number;
  agentIndex?: number;
  steps: number;
  pendingQuestion: PendingQuestion | null;
  pendingWork: PendingWork | null;
  answers: Record<string, string>;
  ledger: LedgerRecord[];
  events: RunEvent[];
  thresholdsHit: string[];
}

export interface SubmitUsage {
  model?: string | undefined;
  totalTokens?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  childSessionId?: string | undefined;
}

export interface Coverage {
  llmSteps: number;
  unknownSteps: number;
}

export interface AgentCost extends Coverage {
  steps: number;
  tokens: number;
  cacheTokens: number;
  costUsd: number;
  tier: Tier | null;
  model: string | null;
  agentName: string | null;
  costSource: string;
  sources?: CostSource[];
}

export interface NodeCost extends Coverage {
  steps: number;
  tokens: number;
  cacheTokens: number;
  costUsd: number;
  tier: Tier | "mixed" | null;
  model: string | null;
  byAgent: Record<string, AgentCost>;
  costSource: string;
}

export interface CostFooter {
  costUsd: number;
  budgetUsd: number;
  budgetRatio: number;
  tokens: number;
  steps: number;
  perNode: Record<string, number>;
  source: string;
  warnings: string[];
}

export interface Report {
  runId: string;
  status: RunStatus;
  workflow: string;
  backend: Backend | undefined;
  tierModels: Record<Tier, string> | undefined;
  synthetic: boolean;
  byNode: Record<string, NodeCost>;
  byTier: Record<string, number>;
  byModel: Record<string, number>;
  byCostSource: Record<string, number>;
  coverage: { run: Coverage; byTier: Record<string, Coverage>; byModel: Record<string, Coverage> };
  cacheTokens: number;
  harnessCostUsd: number;
  cost: CostFooter;
}

export interface RunStatusView {
  runId: string;
  status: RunStatus;
  currentNode: string | null;
  pendingQuestion: PendingQuestion | null;
  pendingWork?: PendingWork | null;
  retryAfterMs: number | null;
  next: string;
  proposal?: RunConfig;
  cost: CostFooter;
}

export interface WorkflowSpecNode {
  id: string;
  kind: string;
  role?: string;
  workflow?: string;
  over?: string;
  question?: Question;
}

export interface WorkflowSpecEdge {
  from: string;
  to: string;
  when?: string;
}

export interface WorkflowSpec {
  name: string;
  version: string;
  entry: string;
  nodes: WorkflowSpecNode[];
  edges: WorkflowSpecEdge[];
}

export interface FactoryConfigFile {
  tiers: string[];
  roles: Record<string, string>;
}
