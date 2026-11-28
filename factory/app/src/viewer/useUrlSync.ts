import { useEffect } from "react";
import { queryFor } from "./view-mode.ts";
import type { UrlState } from "./view-mode.ts";

/** Writes the view state into the URL without adding a history entry. */
export function useUrlSync({ mode, workflowName, runId, runFilter, onlyRan, projectFilter }: UrlState): void {
  useEffect(() => {
    const url = new URL(window.location.href);
    const query = queryFor({ mode, workflowName, runId, runFilter, onlyRan, projectFilter });
    url.search = query.size ? `?${query.toString()}` : "";
    window.history.replaceState(null, "", url);
  }, [mode, workflowName, runId, runFilter, onlyRan, projectFilter]);
}
