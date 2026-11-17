import { createContext, useContext } from "react";
import type { HumanIcon, LiveState } from "./tree.ts";
import type { Item, StaleWorkflow } from "./types.ts";
import type { AgentInfo, AskedQuestion, FactoryConfig, RunData, RunIndex, RunReport, Workflow } from "./types.ts";

export interface ViewerState {
  config: FactoryConfig | null;
  report: RunReport | null;
  run: RunData | null;
  toggle: (key: string) => void;
  focusKey: string | null;
  index: RunIndex | null;
  disabled: string[];
  mode: "runs" | "workflows";
  workflow: Workflow | null;
  workflows: Workflow[];
  agents: Record<string, AgentInfo>;
  live: LiveState;
  onlyAgents: boolean;
  stale: Record<string, StaleWorkflow>;
  showCounts: boolean;
  humans: Map<string, HumanIcon>;
  questions: AskedQuestion[];
  openQuestions: (item: Item) => void;
}

export const ViewerContext = createContext<ViewerState>({ config: null, report: null, run: null, toggle: () => {}, focusKey: null, index: null, disabled: [], mode: "runs", workflow: null, workflows: [], agents: {}, live: { node: null, agents: [], waiting: null }, onlyAgents: false, stale: {}, showCounts: false, humans: new Map(), questions: [], openQuestions: () => {} });

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
