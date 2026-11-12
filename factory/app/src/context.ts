import { createContext, useContext } from "react";
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
}

export const ViewerContext = createContext<ViewerState>({ config: null, report: null, run: null, toggle: () => {}, focusKey: null, index: null, disabled: [], mode: "runs", workflow: null, workflows: [], agents: {} });

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
