export type ViewMode = "runs" | "workflows" | "projects";

export const VIEW_MODES: readonly ViewMode[] = ["runs", "workflows", "projects"];

export const VIEW_MODE_LABELS: Record<ViewMode, string> = { runs: "Runs", workflows: "Workflows (config)", projects: "Projects" };

/** The workflow shown in the workflows view when the URL names none. */
export const DEFAULT_WORKFLOW = "olko-review";

/** The view state kept in the URL, so a reload or a shared link opens the same view. */
export interface UrlState {
  mode: ViewMode;
  workflowName: string;
  runId: string;
  runFilter: string;
  onlyRan: boolean;
  projectFilter: string;
}

/** The view a URL opens: `mode=workflows` or `mode=projects`; anything else opens the runs view. */
export function parseMode(params: URLSearchParams): ViewMode {
  switch (params.get("mode")) {
    case "workflows":
      return "workflows";
    case "projects":
      return "projects";
    default:
      return "runs";
  }
}

/** The URL query of a view state: the read side is `parseMode` and the initial state of the viewer. */
export function queryFor(state: UrlState): URLSearchParams {
  switch (state.mode) {
    case "workflows":
      return new URLSearchParams({ mode: "workflows", workflow: state.workflowName });
    case "projects":
      return new URLSearchParams({ mode: "projects" });
    case "runs": {
      const query = new URLSearchParams();
      if (state.projectFilter) {
        query.set("project", state.projectFilter);
      }
      if (state.runFilter) {
        query.set("contains", state.runFilter);
      }
      if (state.runFilter && state.onlyRan) {
        query.set("ran", "1");
      }
      if (state.runId) {
        query.set("run", state.runId);
      }
      return query;
    }
  }
}
