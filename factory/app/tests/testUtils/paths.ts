/** The workflow the project status checks run, as the API reports it. */
export const STATUS_WORKFLOW = "olko-project-status";

/** The viewer API routes the tests serve with MSW. */
export const API = {
  workflows: "/api/workflows",
  agents: "/api/agents",
  config: "/api/config",
  projects: "/api/projects",
  projectStatus: "/api/projects/:id/status",
  stale: "/api/stale",
  pending: "/api/pending",
  update: "/api/update",
  runs: "/api/runs",
  anyRun: "/api/runs/:runId",
  run: (runId: string) => `/api/runs/${encodeURIComponent(runId)}`,
  answer: (runId: string) => `/api/runs/${runId}/answer`,
};
