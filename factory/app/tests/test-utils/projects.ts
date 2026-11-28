import type { ProjectArtifact, ProjectOverview, ProjectStatusView, ProjectSummary } from "../../src/types.ts";
import { MERGE_WORKFLOW, STATUS_WORKFLOW } from "./paths.ts";

/** A current sample skill installed for the agents harness; `extra` changes its state, versions or links. */
export function artifact(extra: Partial<ProjectArtifact>): ProjectArtifact {
  return { id: "skill:sample-skill", kind: "skill", name: "sample-skill", harness: "agents", location: ".agents/skills/sample-skill", state: "current", installed: "1.0.0", current: "1.0.0", files: [], workflows: [], ...extra };
}

/** Two registered projects: sample-app with a finished status run, sample-web whose folder is gone. */
export const projectList: ProjectOverview = {
  roots: ["/src"],
  statusWorkflow: STATUS_WORKFLOW,
  statusWorkflowInstalled: true,
  mergeWorkflow: MERGE_WORKFLOW,
  mergeWorkflowInstalled: true,
  canAnalyze: true,
  projects: [
    { id: "sample-app", path: "/src/sample-app", exists: true, runs: 2, analyzing: null, status: { runId: "r-0000000a", createdAt: null, summary: "1 current", counts: { current: 1, outdated: 1, missing: 1 } } },
    { id: "sample-web", path: "/src/sample-web", exists: false, runs: 0, analyzing: null, status: null },
  ],
};

/** The status of sample-app: one current, one outdated and one missing artifact. */
export const projectStatus: ProjectStatusView = {
  runId: "r-0000000a",
  status: "done",
  createdAt: "2026-11-20T10:00:00.000Z",
  data: {
    head: "9f8e7d6c5b",
    harnesses: [{ id: "opencode", markers: [".opencode"] }],
    counts: { current: 1, outdated: 1, missing: 1 },
    workflows: ["sample-flow"],
    summary: "1 current, 1 outdated, 1 missing",
    artifacts: [
      artifact({ workflows: ["sample-flow"] }),
      artifact({ id: "skill:sample-old", name: "sample-old", state: "outdated", installed: "1.0.0", current: "1.2.0", files: ["SKILL.md"] }),
      artifact({ id: "agent:sample-helper", kind: "agent", name: "sample-helper", harness: null, location: null, state: "missing", installed: null, current: null, requiredBy: ["agent:sample-agent"] }),
    ],
  },
};

/** The sample status with some of its data replaced. */
export function withData(data: Partial<NonNullable<ProjectStatusView["data"]>>): ProjectStatusView {
  if (!projectStatus.data) {
    throw new Error("the sample status has no data");
  }
  return { ...projectStatus, data: { ...projectStatus.data, ...data } };
}

/** The remote ref and the two commits the remote comparison tests use. */
export const REMOTE_REF = "origin/main";
export const INSTALLED_COMMIT = "aaaaaaa";
export const CURRENT_COMMIT = "bbbbbbb";

/** A project with no finished status, checked right now by run `analyzing` (null: not being checked). */
export function uncheckedProject(id: string, analyzing: string | null, extra: Partial<ProjectSummary> = {}): ProjectSummary {
  return { id, path: `/src/${id}`, exists: true, runs: 1, analyzing, status: null, ...extra };
}

/** The project list holding only `projects`. */
export function listOf(...projects: ProjectSummary[]): ProjectOverview {
  return { ...projectList, projects };
}
