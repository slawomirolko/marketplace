import type { ProjectArtifact, ProjectStatusData } from "../types.ts";
import { actionOf, detailsText, STATE_HELP, STATES, versionText } from "./status-text.ts";

export function ArtifactTable({ data, rows, stateFilter, onStateFilter }: { data: ProjectStatusData; rows: ProjectArtifact[]; stateFilter: string; onStateFilter: (state: string) => void }) {
  return (
    <>
      <h3>Skills and agents</h3>
      <div className="state-chips" role="radiogroup" aria-label="Filter by state">
        <button type="button" role="radio" aria-checked={stateFilter === ""} className={stateFilter === "" ? "active" : ""} onClick={() => onStateFilter("")}>
          all {data.artifacts.length}
        </button>
        {STATES.filter((state) => data.counts[state]).map((state) => (
          <button key={state} type="button" role="radio" aria-checked={stateFilter === state} className={`state-${state}${stateFilter === state ? " active" : ""}`} title={STATE_HELP[state]} onClick={() => onStateFilter(state)}>
            {data.counts[state]} {state}
          </button>
        ))}
      </div>
      <div className="artifacts-scroll">
        <table className="artifacts">
          <thead>
            <tr>
              <th>Skill / agent</th>
              <th>Harness</th>
              <th>Version</th>
              <th>State</th>
              <th>What to do</th>
              <th>Details</th>
              <th>Workflows</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((artifact) => (
              <tr key={`${artifact.id}@${artifact.location ?? ""}`}>
                <td>
                  <span className="muted small">{artifact.kind}</span> {artifact.name}
                </td>
                <td>{artifact.harness ?? "–"}</td>
                <td>{versionText(artifact)}</td>
                <td>
                  <span className={`state state-${artifact.state}`} title={STATE_HELP[artifact.state]}>
                    {artifact.state}
                  </span>
                </td>
                <td className="small">{actionOf(artifact)}</td>
                <td className="small">{detailsText(artifact)}</td>
                <td className="small">{artifact.workflows.length ? artifact.workflows.join(", ") : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
