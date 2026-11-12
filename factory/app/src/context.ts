import { createContext, useContext } from "react";
import type { LiveState } from "./tree.ts";
import type { StaleWorkflow } from "./types.ts";
import type { AgentInfo, FactoryConfig, RunData, RunIndex, RunReport, Workflow } from "./types.ts";

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
  mainAgent: string | null;
  stale: Record<string, StaleWorkflow>;
}

export const ViewerContext = createContext<ViewerState>({ config: null, report: null, run: null, toggle: () => {}, focusKey: null, index: null, disabled: [], mode: "runs", workflow: null, workflows: [], agents: {}, live: { node: null, agents: [], waiting: null }, mainAgent: null, stale: {} });

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
