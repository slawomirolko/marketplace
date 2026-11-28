import type { StaleWorkflow, Workflow } from "../types.ts";

export function WorkflowOptions({ workflows, stale = {} }: { workflows: Workflow[]; stale?: Record<string, StaleWorkflow> }) {
  const option = (workflow: Workflow) => (
    <option key={workflow.name} value={workflow.name}>
      {stale[workflow.name] ? "⚠ " : ""}{workflow.name} · {workflow.version} · {workflow.nodes.length} nodes{stale[workflow.name] ? " · source changed" : ""}
    </option>
  );
  return (
    <>
      <optgroup label="Standalone (started by a primary agent)">{workflows.filter((workflow) => workflow.standalone).map(option)}</optgroup>
      <hr />
      <optgroup label="Parts (inlined or called by another workflow)">{workflows.filter((workflow) => !workflow.standalone).map(option)}</optgroup>
    </>
  );
}
