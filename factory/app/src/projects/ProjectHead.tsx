import type { ProjectOverview, ProjectSummary } from "../types.ts";
import type { ProjectAction } from "./useProjectActions.ts";

export interface ProjectHeadProps {
  project: ProjectSummary;
  overview: ProjectOverview;
  /** The running status-check run of this project, if any. */
  checkingRun: string | undefined;
  checkingState: string | undefined;
  /** The running merge run of this project, if any. */
  mergingRun: string | undefined;
  /** Why Merge updates is off, or null when the latest status has something to merge. */
  mergeBlocker: string | null;
  hasStatus: boolean;
  busy: boolean;
  act: ProjectAction;
  onAnalyze: (projectId: string) => void;
  onMerge: (projectId: string) => void;
  onShowRuns: (projectId: string) => void;
}

function checkButtonText(checkingRun: string | undefined, checkingState: string | undefined, hasStatus: boolean): string {
  if (checkingRun) {
    return `Checking… (${checkingState ?? "running"})`;
  }
  return hasStatus ? "Re-check status" : "Check status";
}

/** The selected project's name and path, with its actions: check status, show its runs, remove it from the list. */
export function ProjectHead({ project, overview, checkingRun, checkingState, mergingRun, mergeBlocker, hasStatus, busy, act, onAnalyze, onMerge, onShowRuns }: ProjectHeadProps) {
  const remove = () => {
    if (window.confirm(`Remove ${project.id} from the project list? The folder is not touched.`)) {
      void act({ action: "remove", id: project.id }, () => `Removed ${project.id}.`);
    }
  };
  return (
    <header className="project-head">
      <h2>{project.id}</h2>
      <code>{project.path}</code>
      <span className="project-actions">
        {overview.statusWorkflowInstalled && overview.canAnalyze && (
          <button type="button" data-testid="check-status" disabled={busy || Boolean(checkingRun) || Boolean(mergingRun) || !project.exists} onClick={() => onAnalyze(project.id)} title={`Check the installed skills and agents against the marketplace (${overview.statusWorkflow} workflow).`}>
            {checkButtonText(checkingRun, checkingState, hasStatus)}
          </button>
        )}
        {overview.mergeWorkflowInstalled && overview.canAnalyze && (
          <button type="button" data-testid="merge-updates" disabled={busy || Boolean(checkingRun) || Boolean(mergingRun) || !project.exists || mergeBlocker !== null} onClick={() => onMerge(project.id)} title={mergeBlocker ?? `Merge the marketplace updates of the outdated and changed skills and agents into the project; you choose what is applied (${overview.mergeWorkflow} workflow).`}>
            {mergingRun ? "Merging…" : "Merge updates"}
          </button>
        )}
        <button type="button" data-testid="project-runs" onClick={() => onShowRuns(project.id)} disabled={project.runs === 0}>
          Runs ({project.runs})
        </button>
        <button type="button" data-testid="remove-project" disabled={busy} onClick={remove}>
          Remove
        </button>
      </span>
    </header>
  );
}
