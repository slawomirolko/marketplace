import type { ProjectOverview, ProjectSummary } from "../types.ts";
import type { ProjectAction } from "./useProjectActions.ts";

export interface ProjectHeadProps {
  project: ProjectSummary;
  overview: ProjectOverview;
  /** The running status-check run of this project, if any. */
  checkingRun: string | undefined;
  checkingState: string | undefined;
  hasStatus: boolean;
  busy: boolean;
  act: ProjectAction;
  onAnalyze: (projectId: string) => void;
  onShowRuns: (projectId: string) => void;
}

function checkButtonText(checkingRun: string | undefined, checkingState: string | undefined, hasStatus: boolean): string {
  if (checkingRun) {
    return `Checking… (${checkingState ?? "running"})`;
  }
  return hasStatus ? "Re-check status" : "Check status";
}

/** The selected project's name and path, with its actions: check status, show its runs, remove it from the list. */
export function ProjectHead({ project, overview, checkingRun, checkingState, hasStatus, busy, act, onAnalyze, onShowRuns }: ProjectHeadProps) {
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
          <button type="button" data-testid="check-status" disabled={busy || Boolean(checkingRun) || !project.exists} onClick={() => onAnalyze(project.id)} title={`Check the installed skills and agents against the marketplace (${overview.statusWorkflow} workflow).`}>
            {checkButtonText(checkingRun, checkingState, hasStatus)}
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
