import type { Edge, Node } from "@xyflow/react";

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
  missing: string[];
}

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
  enabledWhen?: string;
  skill?: string;
  tools?: string[];
  dirs?: string[];
  op?: string;
  with?: Record<string, unknown>;
  parse?: string;
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
  costUsd: number | null;
  costSource: string;
  output?: string | null;
  outputPreview?: string;
}

export interface RunEvent {
  at: string;
  type: string;
  node?: string;
  agentId?: string;
  error?: unknown;
  result?: string;
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

export interface RunDetail {
  run: RunData;
  report: RunReport;
}

export interface RunListItem {
  source?: string;
  workflow?: string;
  ran?: string[];
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
}

export interface Level {
  items: Item[];
  edges: LevelEdge[];
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
}

export type RunIndex = Map<string, RunIndexEntry>;

export type NodeData = { item: Item; expanded: boolean };
export type CardFlowNode = Node<NodeData, "card">;
export type ClusterFlowNode = Node<NodeData, "cluster">;
export type TerminalFlowNode = Node<NodeData, "terminal">;
export type FlowNode = CardFlowNode | ClusterFlowNode | TerminalFlowNode;
export type FlowEdge = Edge;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
