import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson, messageOf } from "./api.ts";
import { AddProjectForm } from "./projects/AddProjectForm.tsx";
import { ANALYZE_POLL_MS } from "./projects/analyze.ts";
import { ProjectHead } from "./projects/ProjectHead.tsx";
import { ProjectList } from "./projects/ProjectList.tsx";
import { RootFolders } from "./projects/RootFolders.tsx";
import { checkNote, mergeBlocker, mergeNote } from "./projects/status-text.ts";
import { StatusView } from "./projects/StatusView.tsx";
import { useAnalyzePolling } from "./projects/useAnalyzePolling.ts";
import { useProjectActions } from "./projects/useProjectActions.ts";
import { useProjectStatus } from "./projects/useProjectStatus.ts";
import type { ProjectCandidate, ProjectOverview } from "./types.ts";

export function Projects({ onShowRuns, pollMs = ANALYZE_POLL_MS }: { onShowRuns: (projectId: string) => void; pollMs?: number }) {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ProjectCandidate[] | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newId, setNewId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [statusVersion, setStatusVersion] = useState(0);

  const { analyzing, analyzeState, analyzeKind, started, adoptRunning } = useAnalyzePolling(pollMs, (notes, merged) => {
    setNote(notes);
    setStatusVersion((version) => version + 1);
    void load();
    for (const projectId of merged) {
      void analyze(projectId);
    }
  });

  const load = useCallback(async () => {
    try {
      const result = await getJson<ProjectOverview>("/projects");
      setOverview(result);
      adoptRunning(result.projects);
      setSelectedId((current) => (current && result.projects.some((project) => project.id === current) ? current : (result.projects[0]?.id ?? null)));
    } catch (error) {
      setNote(messageOf(error));
    }
  }, [adoptRunning]);
  useEffect(() => {
    void load();
  }, [load]);

  const { status, statusMissing, stateFilter, setStateFilter } = useProjectStatus(selectedId, statusVersion, setNote);
  const { busy, act } = useProjectActions(load, setNote);

  const addProject = (path: string, id: string) =>
    act({ action: "add", path, ...(id ? { id } : {}) }, (result: { project: { id: string } }) => {
      setSelectedId(result.project.id);
      setCandidates((current) => current?.filter((candidate) => candidate.path !== path) ?? null);
      setNewPath("");
      setNewId("");
      return `Added ${result.project.id}.`;
    });

  const analyze = (projectId: string) =>
    act({ action: "analyze", id: projectId }, (result: { runId: string; status: string; reused: boolean }) => {
      started(projectId, result.runId, result.status);
      return result.reused ? checkNote(projectId, `is already running (run ${result.runId}).`) : `Started the status check of ${projectId} (run ${result.runId}).`;
    });

  const merge = (projectId: string) =>
    act({ action: "merge", id: projectId }, (result: { runId: string; status: string; reused: boolean }) => {
      started(projectId, result.runId, result.status, "merge");
      return result.reused ? mergeNote(projectId, `is already running (run ${result.runId}).`) : `Started the merge of ${projectId} (run ${result.runId}).`;
    });

  const discover = () =>
    act({ action: "discover" }, (result: { candidates: ProjectCandidate[] }) => {
      setCandidates(result.candidates);
      return result.candidates.length ? null : "No new project found under the root folders.";
    });

  const selected = overview?.projects.find((project) => project.id === selectedId) ?? null;
  const selectedRunId = selected ? analyzing[selected.id] : undefined;
  const selectedMerging = selected ? analyzeKind[selected.id] === "merge" : false;
  const selectedRun = selectedMerging ? undefined : selectedRunId;
  const mergingRun = selectedMerging ? selectedRunId : undefined;
  const rows = useMemo(() => (status?.data?.artifacts ?? []).filter((artifact) => !stateFilter || artifact.state === stateFilter), [status, stateFilter]);

  if (!overview) {
    return <p className="muted pad">{note ?? "Loading projects…"}</p>;
  }

  return (
    <div className="projects">
      <section className="project-list" aria-label="Projects">
        <h2>Projects</h2>
        <ProjectList projects={overview.projects} selectedId={selectedId} onSelect={setSelectedId} />
        <AddProjectForm path={newPath} onPath={setNewPath} id={newId} onId={setNewId} busy={busy} onAdd={(path, id) => void addProject(path, id)} />
        <RootFolders roots={overview.roots} candidates={candidates} busy={busy} act={act} onDiscover={discover} onAddCandidate={(path, id) => void addProject(path, id)} />
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
            <ProjectHead project={selected} overview={overview} checkingRun={selectedRun} checkingState={analyzeState[selected.id]} mergingRun={mergingRun} mergeBlocker={mergeBlocker(status?.data?.artifacts)} hasStatus={Boolean(status || selected.status)} busy={busy} act={act} onAnalyze={(projectId) => void analyze(projectId)} onMerge={(projectId) => void merge(projectId)} onShowRuns={onShowRuns} />
            {!overview.statusWorkflowInstalled && (
              <p className="warn">
                The <code>{overview.statusWorkflow}</code> workflow is not installed, so the project status cannot be checked.
              </p>
            )}
            {overview.statusWorkflowInstalled && !overview.canAnalyze && (
              <p className="muted">
                This viewer cannot start runs. Start the <code>{overview.statusWorkflow}</code> workflow with <code>projectId: {selected.id}</code> (factory_start).
              </p>
            )}
            {statusMissing && !selectedRunId && <p className="muted">Not checked yet. Check status compares the installed skills and agents with the marketplace.</p>}
            {status?.data && <StatusView view={status} data={status.data} rows={rows} stateFilter={stateFilter} onStateFilter={setStateFilter} />}
            {status && !status.data && <p className="warn">The status file of run {status.runId} is missing.</p>}
          </>
        )}
      </section>
    </div>
  );
}
