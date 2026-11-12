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
  allowedFrom?: string;
}

export type AgentTool = "read" | "edit" | "bash";

export interface PendingQuestion extends Question {
  node?: string;
}

export interface PendingWork {
  nodePath: string;
  agentId: string;
  tier: Tier;
  model: string;
  prompt: string;
  agentName?: string;
  agentDescription?: string;
  agentInstructions?: string;
  tools: AgentTool[];
  dirs: string[];
}

export interface Agent {
  id: string;
  role?: string;
  agentName?: string;
  paths?: string[];
  files?: { path: string; diff: string }[];
  criteria?: string;
  mode?: string;
}

export type WorkflowState = Record<string, unknown>;

export interface RunInput {
  cwd?: string;
  agentConfigDir?: string;
  repo?: string;
  pr?: number;
  fresh?: boolean;
  plan?: string;
  criteria?: string;
  project?: string;
  marketplace?: string;
  artifacts?: string[];
  target?: string;
  targetName?: string;
  olko?: string;
  user?: string;
  stateDir?: string;
  switches?: Record<string, boolean>;
  idea?: string;
  route?: string;
  featureId?: string;
}

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type HostExec = (command: string, args: string[], options?: { cwd?: string }) => ExecResult | Promise<ExecResult>;

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
  tools?: AgentTool[] | undefined;
  dirs?: string[] | undefined;
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
  goal?: string;
  answers?: Record<string, string>;
  cwd?: string;
  nodeId?: string;
}

export interface ScriptResult {
  state: unknown;
  output?: string | null;
  metrics?: Record<string, number>;
}

export type Operation = (context: ScriptContext & { args: Record<string, unknown> }) => Promise<ScriptResult>;

export interface PromptContext {
  goal: string;
  input: RunInput | undefined;
  state: WorkflowState | undefined;
  agent: Agent;
  answer?: string;
  steps?: number;
}

export interface WorkflowNode {
  id: string;
  path: string;
  kind: "llm" | "script" | "interrupt";
  role?: string;
  agent?: string;
  turns?: number;
  askAfterTurn?: number;
  question?: Question;
  prompt?: (context: PromptContext) => string;
  agents?: Agent[];
  agentsFrom?: (state: WorkflowState | undefined) => Agent[];
  script?: (context: ScriptContext) => Promise<ScriptResult>;
  parse?: (text: string) => unknown;
  skipIf?: (state: WorkflowState | undefined) => boolean;
  skipReason?: string;
  maxVisits?: number;
  parallel?: number;
  tools?: AgentTool[];
  dirs?: (context: PromptContext) => string[];
  scope?: string;
  localId?: string;
  enterScope?: { workflow: string; input: Record<string, string> };
}

export interface Workflow {
  name: string;
  version: string;
  source?: string;
  roles?: Record<string, Tier>;
  entry: string;
  nodes: WorkflowNode[];
  edges: WorkflowSpecEdge[];
  maxCycleIterations: number;
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
  ownerPid?: number;
  idempotencyKey: string | null;
  goal: string;
  workflow?: string;
  input?: RunInput;
  state?: WorkflowState;
  nodeAgents?: Record<string, Agent[]>;
  scopes?: Record<string, { iteration: number; input: RunInput }>;
  status: RunStatus;
  proposal: RunConfig;
  config: RunConfig | null;
  cursor: number;
  visits?: Record<string, number>;
  nodeTurn: number;
  agentIndex?: number;
  steps: number;
  pendingQuestion: PendingQuestion | null;
  pendingWork: PendingWork | null;
  pendingWorkItems?: PendingWork[];
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
  result: string | null;
  cost: CostFooter;
}

export interface RunStatusView {
  runId: string;
  status: RunStatus;
  currentNode: string | null;
  pendingQuestion: PendingQuestion | null;
  pendingWork?: PendingWork | null;
  pendingWorkItems?: PendingWork[] | undefined;
  retryAfterMs: number | null;
  next: string;
  proposal?: RunConfig;
  cost: CostFooter;
}

export interface WorkflowSpecAgent {
  id: string;
  role?: string;
  agent?: string;
}

export interface WorkflowSpecNode {
  id: string;
  kind: string;
  role?: string;
  agent?: string;
  agents?: WorkflowSpecAgent[];
  agentsFrom?: string;
  op?: string;
  with?: Record<string, unknown>;
  prompt?: string;
  parse?: string;
  turns?: number;
  askAfterTurn?: number;
  maxVisits?: number;
  parallel?: number;
  workflow?: string;
  over?: string;
  question?: Question;
  skill?: string;
  tools?: AgentTool[];
  dirs?: string[];
  enabledWhen?: string;
  input?: Record<string, string>;
  description?: string;
  scope?: string;
  localId?: string;
}

export interface WorkflowSpecEdge {
  from: string;
  to: string;
  when?: string;
  description?: string;
}

export interface WorkflowSpec {
  name: string;
  description?: string;
  version: string;
  source?: string;
  roles?: Record<string, string>;
  entry: string;
  nodes: WorkflowSpecNode[];
  edges: WorkflowSpecEdge[];
  limits?: { maxCycleIterations?: number; maxTurnsPerNode?: number };
}

export interface FactoryConfigFile {
  tiers: string[];
  roles: Record<string, string>;
  switches?: Record<string, boolean>;
}
