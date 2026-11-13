import { useMemo } from "react";
import { useViewer } from "./context.ts";
import { formatDuration, runCalls } from "./tree.ts";
import type { RunCall } from "./tree.ts";

export function callKey(call: RunCall, teamNodes: Set<string>): string {
  return call.agent && teamNodes.has(call.node) ? `${call.node}#${call.agent}` : call.node;
}

function shortPath(path: string): string {
  return path.split("/").slice(1).join("/") || path;
}

function cost(value: number | null): string {
  return value == null ? "unknown" : `$${value.toFixed(6)}`;
}

export function CallsList({ selectedKey, teamNodes, onSelect }: { selectedKey: string | null; teamNodes: Set<string>; onSelect: (key: string) => void }) {
  const { run, mode } = useViewer();
  const calls = useMemo(() => runCalls(run), [run]);
  if (mode !== "runs" || !run) return <p className="muted">Pick a run to see its calls.</p>;
  if (calls.length === 0) return <p className="muted">No step has started in this run yet.</p>;
  return (
    <section>
      <h2>Calls in run {run.runId}</h2>
      <p className="muted">{calls.length} calls in time order. Click a row to select its node.</p>
      <div className="table-wrap" tabIndex={0}>
        <table className="calls">
          <thead>
            <tr>
              <th>Started</th>
              <th>Node</th>
              <th>Agent</th>
              <th>Visit</th>
              <th>Status</th>
              <th>Cost</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call, i) => {
              const key = callKey(call, teamNodes);
              return (
                <tr
                  key={`${call.node}|${call.agent ?? ""}|${call.startedAt}|${i}`}
                  className={`${selectedKey === key ? "selected " : ""}status-${call.status.replace(/\s+/g, "-")}`}
                  tabIndex={0}
                  aria-selected={selectedKey === key}
                  onClick={() => onSelect(key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(key);
                    }
                  }}
                >
                  <td title={call.startedAt}>{new Date(call.startedAt).toLocaleTimeString([], { hour12: false })}</td>
                  <td title={call.node}>{shortPath(call.node)}</td>
                  <td title={call.agentName ?? undefined}>{call.agent ?? "—"}</td>
                  <td>{call.visit ?? "—"}</td>
                  <td>{call.status}</td>
                  <td className={call.costUsd == null && call.records > 0 ? "cost-unknown" : ""}>{call.records ? cost(call.costUsd) : "—"}</td>
                  <td>{formatDuration(call.durationMs)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
