import { loadWorkflowSpecs } from "../../src/workflow-yaml.ts";
import { workflowsDir } from "../../src/workflows.ts";
import type { WorkflowSpec, WorkflowSpecNode } from "../../src/types.ts";

/**
 * The steps a fake-backend run of `workflow` takes when every node runs once: an llm node one step per turn for each
 * of its agents, a script one step, an interrupt none, and a subgraph or group the steps of its own workflow. The
 * post-run supervisor adds one more step when it is configured; callers add it from the run's supervisor record.
 * Only straight workflows qualify: a node with conditional edges, visits or state-driven agents would change the count.
 */
export function fakeRunSteps(workflow: string, specs: WorkflowSpec[] = loadWorkflowSpecs(workflowsDir())): number {
  const spec = specs.find((candidate) => candidate.name === workflow);
  if (!spec) {
    throw new Error(`workflow '${workflow}' not found in ${workflowsDir()}`);
  }
  return spec.nodes.reduce((sum, node) => sum + nodeSteps(node, specs, workflow), 0);
}

/** The turns of one llm node as the fake backend counts them; fails for a node the count cannot be derived for. */
export function fakeNodeTurns(workflow: string, nodeId: string, specs: WorkflowSpec[] = loadWorkflowSpecs(workflowsDir())): number {
  const node = specs.find((candidate) => candidate.name === workflow)?.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`node '${nodeId}' not found in workflow '${workflow}'`);
  }
  return nodeSteps(node, specs, workflow);
}

function nodeSteps(node: WorkflowSpecNode, specs: WorkflowSpec[], workflow: string): number {
  if (node.kind === "script") {
    return 1;
  }
  if (node.kind === "interrupt") {
    return 0;
  }
  if ((node.kind === "subgraph" || node.kind === "group") && node.workflow) {
    return fakeRunSteps(node.workflow, specs);
  }
  if (node.kind === "llm" && node.turns !== undefined && !node.agentsFrom) {
    return node.turns * Math.max(1, node.agents?.length ?? 0);
  }
  throw new Error(`${workflow}/${node.id}: the fake step count of a ${node.kind} node without fixed turns cannot be derived`);
}
