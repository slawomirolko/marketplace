import path from "node:path";
import { FACTORY_DIR } from "./paths.ts";
import { loadWorkflowDir } from "./workflow-yaml.ts";
import type { Run, Workflow } from "./types.ts";

let workflows: Map<string, Workflow> | undefined;

export function workflowsDir(): string {
  return process.env.FACTORY_WORKFLOWS_DIR ?? path.join(FACTORY_DIR, "workflows");
}

/** The workflows of the workflow folder, loaded once per process. */
export function loadedWorkflows(): Map<string, Workflow> {
  workflows ??= loadWorkflowDir(workflowsDir());
  return workflows;
}

export function workflowOf(run: Pick<Run, "workflow">): Workflow {
  const workflow = loadedWorkflows().get(run.workflow ?? "hello");
  if (!workflow) {
    throw new Error(`unknown workflow ${run.workflow}`);
  }
  return workflow;
}

export function workflowLabel(run: Pick<Run, "workflow">): string {
  const workflow = workflowOf(run);
  return `${workflow.name}@${workflow.version}`;
}
