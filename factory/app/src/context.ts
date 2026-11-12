import { createContext, useContext } from "react";
import type { FactoryConfig, RunData, RunIndex, RunReport } from "./types.ts";

export interface ViewerState {
  config: FactoryConfig | null;
  report: RunReport | null;
  run: RunData | null;
  toggle: (key: string) => void;
  focusKey: string | null;
  index: RunIndex | null;
  disabled: string[];
}

export const ViewerContext = createContext<ViewerState>({ config: null, report: null, run: null, toggle: () => {}, focusKey: null, index: null, disabled: [] });

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
