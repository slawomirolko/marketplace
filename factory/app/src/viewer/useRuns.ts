import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getJson, messageOf } from "../api.ts";
import { containedWorkflows } from "../tree.ts";
import type { RunListItem, Workflow } from "../types.ts";
import type { ViewMode } from "./view-mode.ts";

export function fetchRuns(): Promise<RunListItem[]> {
  return getJson<RunListItem[]>("/runs");
}

export interface RunFilters {
  projectFilter: string;
  runFilter: string;
  onlyRan: boolean;
}

/** The runs a filter keeps: runs of the project, and runs whose workflow contains (or, with onlyRan, ran) the filter workflow. */
export function filterRuns(runs: RunListItem[], workflows: Workflow[] | null, { projectFilter, runFilter, onlyRan }: RunFilters): RunListItem[] {
  const ofProject = projectFilter ? runs.filter((run) => run.projectId === projectFilter) : runs;
  if (!runFilter || !workflows) {
    return ofProject;
  }
  return ofProject.filter((run) => (onlyRan ? (run.ran ?? []).includes(runFilter) : Boolean(run.workflow) && containedWorkflows(workflows, run.workflow ?? "").has(runFilter)));
}

export interface Runs {
  runs: RunListItem[];
  setRuns: Dispatch<SetStateAction<RunListItem[]>>;
  runId: string;
  setRunId: (runId: string) => void;
  runError: string | null;
  setRunError: Dispatch<SetStateAction<string | null>>;
  shownRuns: RunListItem[];
  /** Selects a run after a fresh run-list load; the one-time load is marked done so it cannot pick another run. */
  openRun: (runId: string) => void;
}

/**
 * The run list and the selected run. The list loads once, the first time the runs view opens, and selects the run
 * the URL names (or the newest); when a filter hides the selected run, the first shown run is selected instead.
 */
export function useRuns(mode: ViewMode, requestedRun: string | null, workflows: Workflow[] | null, filters: RunFilters): Runs {
  const { projectFilter, runFilter, onlyRan } = filters;
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runId, setRunId] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [runsLoaded, setRunsLoaded] = useState(false);

  useEffect(() => {
    if (mode !== "runs" || runsLoaded) {
      return;
    }
    setRunsLoaded(true);
    fetchRuns()
      .then((runList) => {
        setRuns(runList);
        setRunId(requestedRun !== null && runList.some((run) => run.runId === requestedRun) ? requestedRun : (runList[0]?.runId ?? ""));
      })
      .catch((loadError: unknown) => setRunError(messageOf(loadError)));
  }, [mode, runsLoaded, requestedRun]);

  const openRun = useCallback((id: string) => {
    setRunsLoaded(true);
    fetchRuns()
      .then((runList) => {
        setRuns(runList);
        setRunId(id);
      })
      .catch((loadError: unknown) => {
        setRunError(messageOf(loadError));
        setRunId(id);
      });
  }, []);

  const shownRuns = useMemo(() => filterRuns(runs, workflows, { projectFilter, runFilter, onlyRan }), [runs, runFilter, onlyRan, workflows, projectFilter]);
  useEffect(() => {
    if (mode !== "runs" || !runsLoaded) {
      return;
    }
    if (!runId || shownRuns.some((run) => run.runId === runId)) {
      return;
    }
    setRunId(shownRuns[0]?.runId ?? "");
  }, [mode, runsLoaded, shownRuns, runId]);

  return { runs, setRuns, runId, setRunId, runError, setRunError, shownRuns, openRun };
}
