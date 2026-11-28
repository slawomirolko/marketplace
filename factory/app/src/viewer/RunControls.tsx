import { formatAmount, formatTokens, isUnknownCost } from "../format.ts";
import { LIVE_STATUSES } from "../live.ts";
import type { LiveState } from "../live.ts";
import type { RunDetail, RunListItem, StaleWorkflow, Workflow } from "../types.ts";
import { LiveBar } from "./LiveBar.tsx";
import { RunPicker } from "./RunPicker.tsx";
import type { RunDetailState } from "./useRunDetail.ts";
import type { RunFilters } from "./useRuns.ts";
import { WorkflowOptions } from "./WorkflowOptions.tsx";

export interface RunControlsProps {
  workflows: Workflow[];
  stale: Record<string, StaleWorkflow>;
  projectIds: string[];
  filters: RunFilters;
  onProjectFilter: (projectId: string) => void;
  onRunFilter: (workflow: string) => void;
  onOnlyRan: (onlyRan: boolean) => void;
  runId: string;
  onRunId: (runId: string) => void;
  shownRuns: RunListItem[];
  runError: string | null;
  runDetail: RunDetailState;
  live: LiveState;
  onShowCurrent: () => void;
}

function RunTotal({ detail }: { detail: RunDetail }) {
  const total = detail.report.cost;
  return (
    <span className="total">
      Total <strong className={isUnknownCost(detail.report.coverage?.run) ? "cost-unknown" : ""}>{formatAmount(total.costUsd, detail.report.coverage?.run)}</strong> of ${total.budgetUsd.toFixed(2)} · {formatTokens(total.tokens, detail.report.cacheTokens)} · {total.steps} steps · {total.source}
    </span>
  );
}

/** The header controls of the runs view: project and workflow filters, the run picker, its total, errors and live state. */
export function RunControls({ workflows, stale, projectIds, filters, onProjectFilter, onRunFilter, onOnlyRan, runId, onRunId, shownRuns, runError, runDetail, live, onShowCurrent }: RunControlsProps) {
  const { projectFilter, runFilter, onlyRan } = filters;
  const { detail, refreshedAt, refreshError } = runDetail;
  const projectOptions = [...new Set([...projectIds, ...(projectFilter ? [projectFilter] : [])])];
  return (
    <>
      {(projectIds.length > 0 || projectFilter) && (
        <label>
          Project{" "}
          <select data-testid="project-filter" value={projectFilter} onChange={(event) => onProjectFilter(event.target.value)}>
            <option value="">all runs</option>
            {projectOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Workflow{" "}
        <select data-testid="workflow-filter" value={runFilter} onChange={(event) => onRunFilter(event.target.value)}>
          <option value="">all workflows</option>
          <hr />
          <WorkflowOptions workflows={workflows} stale={stale} />
        </select>
      </label>
      {runFilter && (
        <label title="Off: every run whose workflow contains it. On: only runs in which at least one of its steps started.">
          <input type="checkbox" data-testid="only-ran" checked={onlyRan} onChange={(event) => onOnlyRan(event.target.checked)} /> only where it ran
        </label>
      )}
      <RunPicker runId={runId} onRunId={onRunId} shownRuns={shownRuns} filters={filters} />
      {detail && detail.report.cost && <RunTotal detail={detail} />}
      {runError && (
        <span className="error" role="alert">
          Could not load the runs: {runError}
        </span>
      )}
      {detail && LIVE_STATUSES.includes(detail.run.status) && <LiveBar live={live} refreshedAt={refreshedAt} refreshError={refreshError} onShowCurrent={onShowCurrent} />}
    </>
  );
}
