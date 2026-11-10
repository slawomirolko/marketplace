import { createContext, useContext } from "react";

export const ViewerContext = createContext({ config: null, report: null, run: null, toggle: () => {} });

export function useViewer() {
  return useContext(ViewerContext);
}
