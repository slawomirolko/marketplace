import { useEffect, useState } from "react";
import { API, messageOf } from "../api.ts";
import type { ProjectStatusView } from "../types.ts";

export interface ProjectStatus {
  status: ProjectStatusView | null;
  /** True when the project was never checked (the server answers 404). */
  statusMissing: boolean;
  stateFilter: string;
  setStateFilter: (state: string) => void;
}

/**
 * The last status check of the selected project, reloaded when the selection or `statusVersion` changes; the state
 * filter resets with it. `onError` must be stable (a state setter), or every render reloads the status.
 */
export function useProjectStatus(selectedId: string | null, statusVersion: number, onError: (message: string) => void): ProjectStatus {
  const [status, setStatus] = useState<ProjectStatusView | null>(null);
  const [statusMissing, setStatusMissing] = useState(false);
  const [stateFilter, setStateFilter] = useState("");
  useEffect(() => {
    setStatus(null);
    setStatusMissing(false);
    setStateFilter("");
    if (!selectedId) {
      return;
    }
    let cancelled = false;
    fetch(`${API}/projects/${encodeURIComponent(selectedId)}/status`)
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (response.status === 404) {
          setStatusMissing(true);
          return;
        }
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        setStatus((await response.json()) as ProjectStatusView);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError(messageOf(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, statusVersion, onError]);
  return { status, statusMissing, stateFilter, setStateFilter };
}
