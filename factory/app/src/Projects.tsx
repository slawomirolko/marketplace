import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, getJson, messageOf, postAction } from "./api.ts";

export interface ProjectSummary {
  id: string;
  path: string;
  marketplace?: string;
  exists: boolean;
  runs: number;
  analyzing: string | null;
  status: { runId: string; createdAt: string | null; summary: string | null; counts: Record<string, number> | null } | null;
}

export interface ProjectList {
  roots: string[];
  projects: ProjectSummary[];
  statusWorkflow: string;
  statusWorkflowInstalled: boolean;
  canAnalyze: boolean;
}

const FINISHED = new Set(["done", "stopped", "cancelled", "failed"]);
const POLL_MS = 2000;

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
  installedCommit?: string;
  currentCommit?: string;
  nearestVersion?: string | null;
  nearestCommit?: string;
  lastVersion?: string | null;
  lastCommit?: string;
  upstreamMoved?: boolean;
  files: string[];
  requiredBy?: string[];
  workflows: string[];
}

export interface ProjectStatusData {
  head: string | null;
  harnesses: { id: string; markers: string[] }[];
  /** The marketplace ref compared with: `origin/HEAD` or `origin/main` after a fetch, `HEAD` without a remote. */
  ref?: string;
  /** False when the scan used what the last fetch left, true when it fetched now. */
  fetched?: boolean;
  /** Why the fetch failed; the comparison then used what the last fetch left. */
  fetchError?: string | null;
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

function postProjects<T>(body: Record<string, string>): Promise<T> {
  return postAction<T>(`${API}/projects`, "projects", body);
}

function checkNote(projectId: string, text: string): string {
  return `Status check of ${projectId} ${text}`;
}

async function finishNote(projectId: string, runId: string, runStatus: string): Promise<string> {
  if (runStatus !== "done") {
    return checkNote(projectId, `${runStatus} (run ${runId}).`);
  }
  try {
    const view = await getJson<ProjectStatusView>(`/projects/${encodeURIComponent(projectId)}/status`);
    return checkNote(projectId, `finished: ${verdictOf(view.data?.counts, view.data?.ref).title}`);
  } catch (error) {
    return checkNote(projectId, `finished (run ${runId}); its status could not be read: ${messageOf(error)}.`);
  }
}

/** The ref of a marketplace checkout without an origin remote. */
const LOCAL_REF = "HEAD";
/** The harness of the skills and agents of a marketplace source checkout. */
const SOURCE_HARNESS = "source";

/** The remote a status was compared with; null for a checkout without a remote, where the ref is plain `HEAD`. */
export function remoteNameOf(ref: string | null | undefined): string | null {
  return ref && ref !== LOCAL_REF ? ref : null;
}

/** The suffix of the "compared with" line: a failed fetch, or a comparison with what the last fetch left. */
export function fetchNoteOf(data: Pick<ProjectStatusData, "ref" | "fetched" | "fetchError">): string {
  if (data.fetchError) {
    return ` (fetch failed: ${data.fetchError})`;
  }
  return data.fetched === false && remoteNameOf(data.ref) ? " (last fetch)" : "";
}

function sideText(version: string | null | undefined, commit: string | undefined, withCommit: boolean): string {
  if (!version) {
    return commit ? `commit ${commit}` : "–";
  }
  return withCommit && commit ? `${version} (${commit})` : version;
}

function installedIsCurrent(artifact: ProjectArtifact): boolean {
  if (artifact.installedCommit && artifact.currentCommit) {
    return artifact.installedCommit === artifact.currentCommit;
  }
  return artifact.installed === artifact.current;
}

/** The version text of one artifact row: versions; a commit only where versions cannot tell two sides apart. */
export function versionText(artifact: ProjectArtifact): string {
  if (artifact.state === "unknown-base") {
    return `nearest ${sideText(artifact.nearestVersion, artifact.nearestCommit, false)}`;
  }
  if (artifact.state === "removed") {
    return `last ${sideText(artifact.lastVersion, artifact.lastCommit, false)}`;
  }
  if (!artifact.installed && !artifact.current && !artifact.installedCommit && !artifact.currentCommit) {
    return "–";
  }
  if (installedIsCurrent(artifact)) {
    return artifact.installed ?? "–";
  }
  const versionsAmbiguous = !artifact.installed || !artifact.current || artifact.installed === artifact.current;
  return `${sideText(artifact.installed, artifact.installedCommit, versionsAmbiguous)} → ${sideText(artifact.current, artifact.currentCommit, versionsAmbiguous)}`;
}

/** Counts as one line, in state order, without zeros. */
export function countsText(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  return STATES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(" · ");
}

const TO_CHANGE = ["outdated", "modified", "unknown-base", "missing", "removed"] as const;

export interface Verdict {
  level: "ok" | "change" | "empty";
  title: string;
  badge: string;
}

/** The answer of one status: in sync with the remote, how much to change, or nothing installed. */
export function verdictOf(counts: Record<string, number> | null | undefined, ref?: string | null): Verdict {
  const total = STATES.reduce((sum, s) => sum + (counts?.[s] ?? 0), 0);
  const remote = remoteNameOf(ref) ?? "the marketplace";
  if (total === 0) {
    return { level: "empty", title: "No marketplace skill or agent is installed in this project.", badge: "nothing installed" };
  }
  const change = TO_CHANGE.filter((s) => counts?.[s]);
  if (change.length === 0) {
    return { level: "ok", title: `In sync with ${remote}: ${total} skills and agents, nothing to change.`, badge: "in sync" };
  }
  const toChange = change.reduce((sum, s) => sum + (counts?.[s] ?? 0), 0);
  return { level: "change", title: `${toChange} of ${total} differ from ${remote}: ${change.map((s) => `${counts?.[s]} ${s}`).join(" · ")}.`, badge: `${toChange} to change` };
}

/** What to do with a skill or agent of a marketplace source checkout, compared with its remote. */
function sourceActionOf(artifact: ProjectArtifact): string {
  switch (artifact.state) {
    case "outdated":
    case "missing":
    case "removed":
      return "Pull the remote (git pull, or Update from marketplace).";
    case "modified":
    case "unknown-base":
      return "Local change not on the remote: commit and push it in a PR, or discard it.";
    case "local-only":
      return "New here, not on the remote: commit and push it in a PR.";
    default:
      return "Nothing to do.";
  }
}

const SYNC_SKILL = "olko-marketplace-skill-sync";
const UPSTREAM_SKILL = "olko-marketplace-upstream";

function neededBy(artifact: ProjectArtifact): string {
  return artifact.requiredBy?.length ? `; needed by ${artifact.requiredBy.join(", ")}` : "";
}

/** What to do with one skill or agent, by its state. */
export function actionOf(artifact: ProjectArtifact): string {
  if (artifact.harness === SOURCE_HARNESS) {
    return sourceActionOf(artifact);
  }
  switch (artifact.state) {
    case "outdated":
      return `Update to ${artifact.current ?? "the marketplace version"} (${SYNC_SKILL}).`;
    case "modified":
      if (artifact.upstreamMoved) {
        return `Take the newer marketplace version into the local change, then send the change upstream (${UPSTREAM_SKILL}).`;
      }
      return `Send the local change upstream (${UPSTREAM_SKILL}) or reinstall the marketplace version.`;
    case "unknown-base":
      return "Compare by hand: it matches no marketplace version.";
    case "missing":
      return `Install it (${SYNC_SKILL})${neededBy(artifact)}.`;
    case "removed":
      return "The marketplace dropped it: remove it from the project or keep it as a local copy.";
    case "local-only":
      return `Local only: publish it to the marketplace if other projects need it (${SYNC_SKILL}).`;
    default:
      return "Nothing to do.";
  }
}

export function Projects({ onShowRuns, pollMs = POLL_MS }: { onShowRuns: (projectId: string) => void; pollMs?: number }) {
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
  const [statusVersion, setStatusVersion] = useState(0);
  const [analyzing, setAnalyzing] = useState<Record<string, string>>({});
  const [analyzeState, setAnalyzeState] = useState<Record<string, string>>({});
  const [pollTick, setPollTick] = useState(0);
  const finishedRuns = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await getJson<ProjectList>("/projects");
      setList(result);
      setAnalyzing((current) => {
        const started = result.projects.flatMap((project) => (project.analyzing && !finishedRuns.current.has(project.analyzing) && !(project.id in current) ? [[project.id, project.analyzing]] : []));
        return started.length ? { ...Object.fromEntries(started), ...current } : current;
      });
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
  }, [selectedId, statusVersion]);

  useEffect(() => {
    /** Runs already reported as finished are neither polled nor reported again. */
    const entries = Object.entries(analyzing).filter(([, runId]) => !finishedRuns.current.has(runId));
    if (entries.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void Promise.all(
        entries.map(async ([projectId, runId]) => {
          try {
            const detail = await getJson<{ run: { status: string } }>(`/runs/${encodeURIComponent(runId)}`);
            return { projectId, runId, status: detail.run.status };
          } catch {
            return { projectId, runId, status: "unknown" };
          }
        }),
      ).then(async (results) => {
        if (cancelled) return;
        setAnalyzeState((current) => ({ ...current, ...Object.fromEntries(results.map((r) => [r.projectId, r.status])) }));
        const finished = results.filter((r) => FINISHED.has(r.status));
        if (finished.length === 0) {
          setPollTick((t) => t + 1);
          return;
        }
        for (const f of finished) finishedRuns.current.add(f.runId);
        const notes = await Promise.all(finished.map((f) => finishNote(f.projectId, f.runId, f.status)));
        if (!mounted.current) {
          return;
        }
        setAnalyzing((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !finished.some((f) => f.projectId === id))));
        setNote(notes.join(" "));
        setStatusVersion((v) => v + 1);
        void load();
      });
    }, pollMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analyzing, pollTick, load, pollMs]);

  const act = useCallback(
    async <T,>(body: Record<string, string>, done: (result: T) => string | null) => {
      setBusy(true);
      setNote(null);
      try {
        const result = await postProjects<T>(body);
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

  const analyze = (projectId: string) =>
    act({ action: "analyze", id: projectId }, (r: { runId: string; status: string; reused: boolean }) => {
      setAnalyzing((current) => ({ ...current, [projectId]: r.runId }));
      setAnalyzeState((current) => ({ ...current, [projectId]: r.status }));
      return r.reused ? checkNote(projectId, `is already running (run ${r.runId}).`) :`Started the status check of ${projectId} (run ${r.runId}).`;
    });

  const discover = () =>
    act({ action: "discover" }, (r: { candidates: ProjectCandidate[] }) => {
      setCandidates(r.candidates);
      return r.candidates.length ? null : "No new project found under the root folders.";
    });

  const selected = list?.projects.find((p) => p.id === selectedId) ?? null;
  const selectedRun = selected ? analyzing[selected.id] : undefined;
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
                {p.status ? <ListVerdict counts={p.status.counts} /> : <span className="muted small">not checked yet</span>}
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
                {list.statusWorkflowInstalled && list.canAnalyze && (
                  <button type="button" disabled={busy || Boolean(selectedRun) || !selected.exists} onClick={() => void analyze(selected.id)} title={`Check the installed skills and agents against the marketplace (${list.statusWorkflow} workflow).`}>
                    {selectedRun ? `Checking… (${analyzeState[selected.id] ?? "running"})` : status || selected.status ? "Re-check status" : "Check status"}
                  </button>
                )}
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
            {!list.statusWorkflowInstalled && (
              <p className="warn">
                The <code>{list.statusWorkflow}</code> workflow is not installed, so the project status cannot be checked.
              </p>
            )}
            {list.statusWorkflowInstalled && !list.canAnalyze && (
              <p className="muted">
                This viewer cannot start runs. Start the <code>{list.statusWorkflow}</code> workflow with <code>projectId: {selected.id}</code> (factory_start).
              </p>
            )}
            {statusMissing && !selectedRun && <p className="muted">Not checked yet. Check status compares the installed skills and agents with the marketplace.</p>}
            {status?.data && <StatusView view={status} data={status.data} rows={rows} stateFilter={stateFilter} onStateFilter={setStateFilter} />}
            {status && !status.data && <p className="warn">The status file of run {status.runId} is missing.</p>}
          </>
        )}
      </section>
    </div>
  );
}

function StatusView({ view, data, rows, stateFilter, onStateFilter }: { view: ProjectStatusView; data: ProjectStatusData; rows: ProjectArtifact[]; stateFilter: string; onStateFilter: (state: string) => void }) {
  const verdict = verdictOf(data.counts, data.ref);
  return (
    <>
      <section className={`verdict verdict-${verdict.level}`} aria-label="Verdict">
        <strong>{verdict.title}</strong>
        {verdict.level === "empty" && <span className="small">The check looks for skills in .agents/skills, .claude/skills and .opencode/skills, and for agents in .claude/agents and .opencode/agents.</span>}
      </section>
      <p className="project-meta">
        Checked {view.createdAt ? new Date(view.createdAt).toLocaleString() : "?"} · run {view.runId} · compared with {data.ref ?? "marketplace"} {data.head ? data.head.slice(0, 7) : "?"}{fetchNoteOf(data)} · harnesses: {data.harnesses.length ? data.harnesses.map((h) => h.id).join(", ") : "none found"}
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

function ListVerdict({ counts }: { counts: Record<string, number> | null }) {
  const verdict = verdictOf(counts);
  return (
    <span className="small">
      <span className={`verdict-badge verdict-${verdict.level}`}>{verdict.badge}</span> {countsText(counts)}
    </span>
  );
}

function ArtifactTable({ data, rows, stateFilter, onStateFilter }: { data: ProjectStatusData; rows: ProjectArtifact[]; stateFilter: string; onStateFilter: (state: string) => void }) {
  return (
    <>
      <h3>Skills and agents</h3>
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
              <td className="small">{actionOf(a)}</td>
              <td className="small">
                {a.requiredBy?.length ? `needed by ${a.requiredBy.join(", ")}` : a.files.length ? `${a.files.join(", ")}${a.upstreamMoved ? " · marketplace moved on" : ""}` : ""}
              </td>
              <td className="small">{a.workflows.length ? a.workflows.join(", ") : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
