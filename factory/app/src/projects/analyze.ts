import { getJson, messageOf } from "../api.ts";
import type { ProjectStatusView } from "../types.ts";
import { checkNote, verdictOf } from "./status-text.ts";

/** Run statuses after which a status check is over. */
export const FINISHED = new Set(["done", "stopped", "cancelled", "failed"]);

/** How often a running status check is polled. */
export const ANALYZE_POLL_MS = 2000;

export interface PolledRun {
  projectId: string;
  runId: string;
  status: string;
}

/** The current status of each status-check run; a run that cannot be read counts as `unknown` and is polled again. */
export function pollRuns(entries: [projectId: string, runId: string][]): Promise<PolledRun[]> {
  return Promise.all(
    entries.map(async ([projectId, runId]) => {
      try {
        const detail = await getJson<{ run: { status: string } }>(`/runs/${encodeURIComponent(runId)}`);
        return { projectId, runId, status: detail.run.status };
      } catch {
        return { projectId, runId, status: "unknown" };
      }
    }),
  );
}

/** The note shown when a status check ends: its verdict when it is done, else how it ended. */
export async function finishNote(projectId: string, runId: string, runStatus: string): Promise<string> {
  if (runStatus !== "done") {
    return checkNote(projectId, `${runStatus} (run ${runId}).`);
  }
  try {
    const view = await getJson<ProjectStatusView>(`/projects/${encodeURIComponent(projectId)}/status`);
    return checkNote(projectId, `finished: ${verdictOf(view.data?.counts, view.data?.ref).title}`);
  } catch (error) {
    return checkNote(projectId, `finished (run ${runId}); its status could not be read: ${messageOf(error)}.`);
  }
}
