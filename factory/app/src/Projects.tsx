import { useCallback, useEffect, useMemo, useState } from "react";

const API = `${import.meta.env.BASE_URL}api`;

export interface ProjectSummary {
  id: string;
  path: string;
  marketplace?: string;
  exists: boolean;
  runs: number;
  status: { runId: string; createdAt: string | null; summary: string | null; counts: Record<string, number> | null } | null;
}

export interface ProjectList {
  roots: string[];
  projects: ProjectSummary[];
  statusWorkflow: string;
}

export interface ProjectCandidate {
  path: string;
  suggestedId: string;
  markers: string[];
}

export interface ProjectArtifact {
  id: string;
  kind: "skill" | "agent";
  name: string;
  harness: string | null;
  location: string | null;
  state: string;
  installed: string | null;
  current: string | null;
  nearestVersion?: string;
  lastVersion?: string;
  upstreamMoved?: boolean;
  files: string[];
  requiredBy?: string[];
  workflows: string[];
}

export interface ProjectStatusData {
  head: string | null;
  harnesses: { id: string; markers: string[] }[];
  artifacts: ProjectArtifact[];
  counts: Record<string, number>;
  workflows: string[];
  summary: string;
  createdAt?: string;
}

export interface ProjectStatusView {
  runId: string;
  status: string;
  createdAt: string | null;
  data: ProjectStatusData | null;
}

export const STATES = ["current", "adapted", "outdated", "modified", "unknown-base", "missing", "removed", "local-only"] as const;

const STATE_HELP: Record<string, string> = {
  current: "Same as the marketplace HEAD.",
  adapted: "Same as HEAD, plus a project adapter or a project model.",
  outdated: "Same as an older marketplace version.",
  modified: "Changed in the project; compared with the nearest marketplace version.",
  "unknown-base": "Shares no file with any marketplace version.",
  missing: "Not installed, but an installed agent or skill needs it.",
  removed: "The marketplace no longer has it.",
  "local-only": "The marketplace never had it.",
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API}${url}`);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

async function postProjects<T>(body: Record<string, string>): Promise<T> {
  const response = await fetch(`${API}/projects`, { method: "POST", headers: { "content-type": "application/json", "x-factory-action": "projects" }, body: JSON.stringify(body) });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `projects: ${response.status}`);
  return result;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The version text of one artifact row: installed → current, or the nearest / last version. */
export function versionText(a: ProjectArtifact): string {
  if (a.state === "unknown-base") return `nearest ${a.nearestVersion ?? "?"}`;
  if (a.state === "removed") return `last ${a.lastVersion ?? "?"}`;
  if (!a.installed && !a.current) return "–";
  if (a.installed === a.current) return a.installed ?? "–";
  return `${a.installed ?? "–"} → ${a.current ?? "–"}`;
}

/** Counts as one line, in state order, without zeros. */
export function countsText(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  return STATES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(" · ");
}

export function Projects({ onShowRuns }: { onShowRuns: (projectId: string) => void }) {
  const [list, setList] = useState<ProjectList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatusView | null>(null);
  const [statusMissing, setStatusMissing] = useState(false);
  const [candidates, setCandidates] = useState<ProjectCandidate[] | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newId, setNewId] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getJson<ProjectList>("/projects");
      setList(result);
      setSelectedId((current) => (current && result.projects.some((p) => p.id === current) ? current : (result.projects[0]?.id ?? null)));
    } catch (error) {
      setNote(messageOf(error));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setStatus(null);
    setStatusMissing(false);
    setStateFilter("");
    if (!selectedId) return;
    let cancelled = false;
    fetch(`${API}/projects/${encodeURIComponent(selectedId)}/status`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) return setStatusMissing(true);
        if (!response.ok) throw new Error(`status: ${response.status}`);
        setStatus((await response.json()) as ProjectStatusView);
      })
      .catch((error: unknown) => !cancelled && setNote(messageOf(error)));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const act = useCallback(
    async (body: Record<string, string>, done: (result: never) => string | null) => {
      setBusy(true);
      setNote(null);
      try {
        const result = await postProjects<never>(body);
        setNote(done(result));
        await load();
      } catch (error) {
        setNote(messageOf(error));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const addProject = (path: string, id: string) =>
    act({ action: "add", path, ...(id ? { id } : {}) }, (r: { project: { id: string } }) => {
      setSelectedId(r.project.id);
      setCandidates((c) => c?.filter((x) => x.path !== path) ?? null);
      setNewPath("");
      setNewId("");
      return `Added ${r.project.id}.`;
    });

  const discover = () =>
    act({ action: "discover" }, (r: { candidates: ProjectCandidate[] }) => {
      setCandidates(r.candidates);
      return r.candidates.length ? null : "No new project found under the root folders.";
    });

  const selected = list?.projects.find((p) => p.id === selectedId) ?? null;
  const rows = useMemo(() => (status?.data?.artifacts ?? []).filter((a) => !stateFilter || a.state === stateFilter), [status, stateFilter]);

  if (!list) return <p className="muted pad">{note ?? "Loading projects…"}</p>;

  return (
    <div className="projects">
      <section className="project-list" aria-label="Projects">
        <h2>Projects</h2>
        {list.projects.length === 0 && <p className="muted">No project yet. Add a folder or discover projects under a root folder.</p>}
        <ul>
          {list.projects.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.id === selectedId ? "active" : ""} aria-current={p.id === selectedId} onClick={() => setSelectedId(p.id)}>
                <strong>{p.id}</strong>
                {!p.exists && <span className="warn"> · folder missing</span>}
                <span className="muted small">{p.status ? countsText(p.status.counts) || p.status.summary : "no status yet"}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="project-add"
          onSubmit={(e) => {
            e.preventDefault();
            void addProject(newPath.trim(), newId.trim());
          }}
        >
          <h3>Add a project</h3>
          <label>
            Folder <input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="C:\src\sample-app" required />
          </label>
          <label>
            Id (optional) <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="sample-app" pattern="[a-z0-9][a-z0-9-]*" />
          </label>
          <button type="submit" disabled={busy || !newPath.trim()}>Add</button>
        </form>
        <div className="project-roots">
          <h3>Root folders</h3>
          <ul>
            {list.roots.map((r) => (
              <li key={r}>
                <code>{r}</code>{" "}
                <button type="button" disabled={busy} onClick={() => void act({ action: "remove_root", path: r }, () => null)} aria-label={`Remove root ${r}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: "add_root", path: newRoot.trim() }, () => {
                setNewRoot("");
                return null;
              });
            }}
          >
            <input value={newRoot} onChange={(e) => setNewRoot(e.target.value)} placeholder="C:\src" aria-label="Root folder" />
            <button type="submit" disabled={busy || !newRoot.trim()}>Add root</button>
          </form>
          <button type="button" onClick={discover} disabled={busy || list.roots.length === 0} title="Search the root folders for projects with marketplace markers. Nothing is added until you add a candidate.">
            Discover
          </button>
          {candidates && candidates.length > 0 && (
            <ul className="candidates" aria-label="Discovered projects">
              {candidates.map((c) => (
                <li key={c.path}>
                  <code>{c.path}</code> <span className="muted small">{c.markers.join(", ")}</span>{" "}
                  <button type="button" disabled={busy} onClick={() => void addProject(c.path, c.suggestedId)}>
                    Add as {c.suggestedId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {note && (
          <p className="muted" role="status">
            {note}
          </p>
        )}
      </section>
      <section className="project-status" aria-label="Project status">
        {!selected && <p className="muted">Select a project.</p>}
        {selected && (
          <>
            <header className="project-head">
              <h2>{selected.id}</h2>
              <code>{selected.path}</code>
              <span className="project-actions">
                <button type="button" onClick={() => onShowRuns(selected.id)} disabled={selected.runs === 0}>
                  Runs ({selected.runs})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Remove ${selected.id} from the project list? The folder is not touched.`)) void act({ action: "remove", id: selected.id }, () => `Removed ${selected.id}.`);
                  }}
                >
                  Remove
                </button>
              </span>
            </header>
            {statusMissing && (
              <p className="muted">
                No finished status yet. Start the <code>{list.statusWorkflow}</code> workflow with <code>projectId: {selected.id}</code> (factory_start).
              </p>
            )}
            {status?.data && <StatusView view={status} data={status.data} rows={rows} stateFilter={stateFilter} onStateFilter={setStateFilter} />}
            {status && !status.data && <p className="warn">The status file of run {status.runId} is missing.</p>}
          </>
        )}
      </section>
    </div>
  );
}

function StatusView({ view, data, rows, stateFilter, onStateFilter }: { view: ProjectStatusView; data: ProjectStatusData; rows: ProjectArtifact[]; stateFilter: string; onStateFilter: (state: string) => void }) {
  return (
    <>
      <p className="project-meta">
        Harnesses: {data.harnesses.length ? data.harnesses.map((h) => h.id).join(", ") : "none found"} · Marketplace {data.head ? data.head.slice(0, 7) : "?"} · Status run {view.runId}
        {view.createdAt ? `, ${new Date(view.createdAt).toLocaleString()}` : ""}
      </p>
      <div className="state-chips" role="radiogroup" aria-label="Filter by state">
        <button type="button" role="radio" aria-checked={stateFilter === ""} className={stateFilter === "" ? "active" : ""} onClick={() => onStateFilter("")}>
          all {data.artifacts.length}
        </button>
        {STATES.filter((s) => data.counts[s]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={stateFilter === s} className={`state-${s}${stateFilter === s ? " active" : ""}`} title={STATE_HELP[s]} onClick={() => onStateFilter(s)}>
            {data.counts[s]} {s}
          </button>
        ))}
      </div>
      <div className="artifacts-scroll">
      <table className="artifacts">
        <thead>
          <tr>
            <th>Artifact</th>
            <th>Harness</th>
            <th>Version</th>
            <th>State</th>
            <th>Details</th>
            <th>Workflows</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={`${a.id}@${a.location ?? ""}`}>
              <td>
                <span className="muted small">{a.kind}</span> {a.name}
              </td>
              <td>{a.harness ?? "–"}</td>
              <td>{versionText(a)}</td>
              <td>
                <span className={`state state-${a.state}`} title={STATE_HELP[a.state]}>
                  {a.state}
                </span>
              </td>
              <td className="small">
                {a.requiredBy?.length ? `needed by ${a.requiredBy.join(", ")}` : a.files.length ? `${a.files.join(", ")}${a.upstreamMoved ? " · marketplace moved on" : ""}` : ""}
              </td>
              <td className="small">{a.workflows.length ? a.workflows.join(", ") : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {data.workflows.length > 0 && (
        <p className="muted small">
          Factory workflows that run an installed artifact: {data.workflows.join(", ")}
        </p>
      )}
    </>
  );
}
