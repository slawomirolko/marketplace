import type { Run, RunConfig } from "./types.ts";

/** The confirmed configuration of a run; a run has none before factory_confirm. */
export function configOf(run: Run): RunConfig {
  if (!run.config) {
    throw new Error(`run ${run.runId} is not confirmed`);
  }
  return run.config;
}
