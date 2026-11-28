import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflowDir } from "../src/workflow-yaml.ts";
import type { Run } from "../src/types.ts";

const WORKFLOWS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows");

/** Lists the edges of the loaded workflow (subgraphs expanded) that no run in `runs` took, as `from -> to [when]`. */
export function missingEdges(workflow: string, runs: Run[]): string[] {
  const loaded = loadWorkflowDir(WORKFLOWS).get(workflow);
  if (!loaded) throw new Error(`no workflow ${workflow} in ${WORKFLOWS}`);
  const taken = new Set(runs.flatMap((run) => run.events.filter((e) => e.type === "edge_taken").map((e) => `${e.from} -> ${e.to}`)));
  return loaded.edges.filter((edge) => !taken.has(`${edge.from} -> ${edge.to}`)).map((edge) => `${edge.from} -> ${edge.to}${edge.when ? ` [${edge.when}]` : ""}`);
}

/**
 * The skip reason for an edge coverage test, or false. The coverage test of a file checks the runs of every scenario
 * test above it; with a test name filter or --test-only some scenarios do not run, so the check would fail falsely.
 */
export const SCENARIOS_FILTERED: string | false = process.execArgv.some((arg) => /^--test-(name-pattern|skip-pattern|only)\b/.test(arg))
  ? "a test name filter runs only some scenarios, so their edge coverage cannot be checked"
  : false;
