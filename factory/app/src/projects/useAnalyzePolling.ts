import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "../types.ts";
import { FINISHED, finishNote, mergeFinishNote, pollRuns } from "./analyze.ts";
import type { PolledRun } from "./analyze.ts";

/** What a polled run does for its project: a status check, or a merge of marketplace updates. */
export type RunKind = "status" | "merge";

export interface AnalyzePolling {
  /** The running status-check run of each project, by project id. */
  analyzing: Record<string, string>;
  /** The last polled run status of each project's status check. */
  analyzeState: Record<string, string>;
  /** Whether each polled project run is a status check or a merge. */
  analyzeKind: Record<string, RunKind>;
  /** Records a run the viewer just started (or found already running): a status check unless `kind` says merge. */
  started: (projectId: string, runId: string, status: string, kind?: RunKind) => void;
  /** Takes over the status checks the server reports as running that this page does not poll yet. */
  adoptRunning: (projects: ProjectSummary[]) => void;
}

/**
 * Polls the running status checks and merges every `pollMs`. When some end, their notes are joined and passed to
 * `onSettled` (once per run) with the projects whose merge finished, which need a new status check; while none end,
 * the poll is scheduled again.
 */
export function useAnalyzePolling(pollMs: number, onSettled: (notes: string, merged: string[]) => void): AnalyzePolling {
  const [analyzing, setAnalyzing] = useState<Record<string, string>>({});
  const [analyzeState, setAnalyzeState] = useState<Record<string, string>>({});
  const [analyzeKind, setAnalyzeKind] = useState<Record<string, RunKind>>({});
  const [pollTick, setPollTick] = useState(0);
  const mergeRuns = useRef(new Set<string>());
  /** Runs already reported as finished are neither polled nor reported again. */
  const finishedRuns = useRef(new Set<string>());
  const mounted = useRef(true);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const started = useCallback((projectId: string, runId: string, status: string, kind: RunKind = "status") => {
    if (kind === "merge") {
      mergeRuns.current.add(runId);
    }
    setAnalyzeKind((current) => ({ ...current, [projectId]: kind }));
    setAnalyzing((current) => ({ ...current, [projectId]: runId }));
    setAnalyzeState((current) => ({ ...current, [projectId]: status }));
  }, []);

  const adoptRunning = useCallback((projects: ProjectSummary[]) => {
    setAnalyzing((current) => {
      const running = projects.flatMap((project) => (project.analyzing && !finishedRuns.current.has(project.analyzing) && !(project.id in current) ? [[project.id, project.analyzing]] : []));
      return running.length ? { ...Object.fromEntries(running), ...current } : current;
    });
  }, []);

  useEffect(() => {
    const entries = Object.entries(analyzing).filter(([, runId]) => !finishedRuns.current.has(runId));
    if (entries.length === 0) {
      return;
    }
    let cancelled = false;
    const settle = async (finished: PolledRun[]) => {
      for (const run of finished) {
        finishedRuns.current.add(run.runId);
      }
      const notes = await Promise.all(finished.map((run) => (mergeRuns.current.has(run.runId) ? mergeFinishNote(run.projectId, run.runId, run.status) : finishNote(run.projectId, run.runId, run.status))));
      const merged = finished.filter((run) => mergeRuns.current.has(run.runId) && run.status === "done").map((run) => run.projectId);
      if (!mounted.current) {
        return;
      }
      setAnalyzing((current) => Object.fromEntries(Object.entries(current).filter(([projectId]) => !finished.some((run) => run.projectId === projectId))));
      settled.current(notes.join(" "), merged);
    };
    const timer = setTimeout(() => {
      void pollRuns(entries).then(async (results) => {
        if (cancelled) {
          return;
        }
        setAnalyzeState((current) => ({ ...current, ...Object.fromEntries(results.map((run) => [run.projectId, run.status])) }));
        const finished = results.filter((run) => FINISHED.has(run.status));
        if (finished.length === 0) {
          setPollTick((tick) => tick + 1);
          return;
        }
        await settle(finished);
      });
    }, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analyzing, pollTick, pollMs]);

  return { analyzing, analyzeState, analyzeKind, started, adoptRunning };
}
