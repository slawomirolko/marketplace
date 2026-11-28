import { createContext, useContext } from "react";
import type { HumanIcon } from "./human.ts";
import type { LiveState } from "./live.ts";
import type { AgentInfo, AskedQuestion, FactoryConfig, Item, RunData, RunIndex, RunReport, StaleWorkflow, Workflow } from "./types.ts";
import type { ViewMode } from "./viewer/view-mode.ts";

export interface ViewerState {
  config: FactoryConfig | null;
  report: RunReport | null;
  run: RunData | null;
  toggle: (key: string) => void;
  focusKey: string | null;
  index: RunIndex | null;
  disabled: string[];
  mode: ViewMode;
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
