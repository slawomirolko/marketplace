import type { StaleWorkflow, Workflow } from "../types.ts";
import { WorkflowOptions } from "./WorkflowOptions.tsx";

/** The header controls of the workflows view: the workflow to draw. */
export function WorkflowControls({ workflows, stale, workflowName, onWorkflowName }: { workflows: Workflow[]; stale: Record<string, StaleWorkflow>; workflowName: string; onWorkflowName: (name: string) => void }) {
  return (
    <label>
      Workflow{" "}
      <select value={workflowName} onChange={(event) => onWorkflowName(event.target.value)}>
        <WorkflowOptions workflows={workflows} stale={stale} />
      </select>
    </label>
  );
}
