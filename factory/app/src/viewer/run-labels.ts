import type { RunFilters } from "./useRuns.ts";

/** The text of the disabled option that says why a filter shows no run; null when no note applies. */
export function emptyRunsNote({ projectFilter, runFilter, onlyRan }: RunFilters): string | null {
  if (runFilter) {
    return onlyRan ? `no run where ${runFilter} ran` : `no run contains ${runFilter}`;
  }
  if (projectFilter) {
    return `no run of project ${projectFilter}`;
  }
  return null;
}
