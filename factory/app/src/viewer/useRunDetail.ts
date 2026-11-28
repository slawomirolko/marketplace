import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getJson, LIVE_REFRESH_MS, messageOf } from "../api.ts";
import { LIVE_STATUSES } from "../live.ts";
import type { RunDetail, RunListItem } from "../types.ts";
import { fetchRuns } from "./useRuns.ts";
import type { ViewMode } from "./view-mode.ts";

export interface RunDetailState {
  detail: RunDetail | null;
  refreshedAt: Date | null;
  refreshError: string | null;
}

function fetchRunDetail(runId: string): Promise<RunDetail> {
  return getJson<RunDetail>(`/runs/${encodeURIComponent(runId)}`);
}

/**
 * The detail of the selected run. It loads when the run or the view changes (not in the workflows view), and while
 * the run is live it and the run list refresh every LIVE_REFRESH_MS. Load errors go to the shared run error.
 */
export function useRunDetail(runId: string, mode: ViewMode, setRuns: Dispatch<SetStateAction<RunListItem[]>>, setRunError: Dispatch<SetStateAction<string | null>>): RunDetailState {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setRunError(null);
    setRefreshError(null);
    if (!runId || mode === "workflows") {
      return undefined;
    }
    let current = true;
    fetchRunDetail(runId)
      .then((runDetail) => {
        if (current) {
          setDetail(runDetail);
        }
      })
      .catch((loadError: unknown) => {
        if (current) {
          setRunError(messageOf(loadError));
        }
      });
    return () => {
      current = false;
    };
  }, [runId, mode, setRunError]);

  const runStatus = mode === "runs" ? (detail?.run.status ?? null) : null;
  useEffect(() => {
    if (!runId || runStatus === null || !LIVE_STATUSES.includes(runStatus)) {
      return undefined;
    }
    let current = true;
    const failed = (refreshFailure: unknown) => {
      if (current) {
        setRefreshError(`refresh failed: ${messageOf(refreshFailure)}`);
      }
    };
    const timer = setInterval(() => {
      fetchRunDetail(runId)
        .then((runDetail) => {
          if (!current) {
            return;
          }
          setDetail(runDetail);
          setRefreshedAt(new Date());
          setRefreshError(null);
        })
        .catch(failed);
      fetchRuns()
        .then((runList) => {
          if (current) {
            setRuns(runList);
          }
        })
        .catch(failed);
    }, LIVE_REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [runId, runStatus, setRuns]);

  return { detail, refreshedAt, refreshError };
}
