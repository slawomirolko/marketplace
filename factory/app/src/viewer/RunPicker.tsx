import { formatAmount } from "../format.ts";
import type { RunListItem } from "../types.ts";
import { emptyRunsNote } from "./run-labels.ts";
import type { RunFilters } from "./useRuns.ts";

function RunOption({ run }: { run: RunListItem }) {
  return (
    <option value={run.runId}>
      {run.runId} · {run.status} · {run.harness ?? "?"} · {(run.usedModels.length ? run.usedModels : run.requestedModels).join(", ")}{run.usedModels.length ? "" : " (requested, none ran)"} · {formatAmount(run.costUsd, run.coverage)} · {run.goal}{run.synthetic ? " · fake model" : ""}{run.source && run.source !== "main" ? ` · ${run.source}` : ""}
    </option>
  );
}

export function RunPicker({ runId, onRunId, shownRuns, filters }: { runId: string; onRunId: (runId: string) => void; shownRuns: RunListItem[]; filters: RunFilters }) {
  const emptyNote = shownRuns.length === 0 ? emptyRunsNote(filters) : null;
  return (
    <label>
      Run{" "}
      <select value={runId} onChange={(event) => onRunId(event.target.value)}>
        <option value="">no run (structure only)</option>
        {emptyNote && (
          <option value="" disabled>
            {emptyNote}
          </option>
        )}
        {shownRuns.map((run) => (
          <RunOption key={run.runId} run={run} />
        ))}
      </select>
    </label>
  );
}
