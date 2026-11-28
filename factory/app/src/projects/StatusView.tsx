import type { ProjectArtifact, ProjectStatusData, ProjectStatusView } from "../types.ts";
import { ArtifactTable } from "./ArtifactTable.tsx";
import { fetchNoteOf, verdictOf } from "./status-text.ts";

export function StatusView({ view, data, rows, stateFilter, onStateFilter }: { view: ProjectStatusView; data: ProjectStatusData; rows: ProjectArtifact[]; stateFilter: string; onStateFilter: (state: string) => void }) {
  const verdict = verdictOf(data.counts, data.ref);
  return (
    <>
      <section className={`verdict verdict-${verdict.level}`} aria-label="Verdict">
        <strong>{verdict.title}</strong>
        {verdict.level === "empty" && <span className="small">The check looks for skills in .agents/skills, .claude/skills and .opencode/skills, and for agents in .claude/agents and .opencode/agents.</span>}
      </section>
      <p className="project-meta">
        Checked {view.createdAt ? new Date(view.createdAt).toLocaleString() : "?"} · run {view.runId} · compared with {data.ref ?? "marketplace"} {data.head ? data.head.slice(0, 7) : "?"}{fetchNoteOf(data)} · harnesses: {data.harnesses.length ? data.harnesses.map((harness) => harness.id).join(", ") : "none found"}
      </p>
      {data.artifacts.length > 0 && <ArtifactTable data={data} rows={rows} stateFilter={stateFilter} onStateFilter={onStateFilter} />}
      {data.workflows.length > 0 && (
        <p className="muted small">
          Factory workflows that run an installed skill or agent: {data.workflows.join(", ")}
        </p>
      )}
    </>
  );
}
