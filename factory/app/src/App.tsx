import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ViewerContext } from "./context.ts";
import type { ViewerState } from "./context.ts";
import { humanIcons } from "./human.ts";
import type { FlowNode } from "./layout.ts";
import { nodeAriaLabel } from "./nodes.tsx";
import { PendingDecisions } from "./Pending.tsx";
import { Projects } from "./Projects.tsx";
import { configDisabledKeys, disabledKeys } from "./switches.ts";
import { allItems, ancestorKeys, findItem } from "./tree.ts";
import type { Item } from "./types.ts";
import { DetailsPanel } from "./viewer/DetailsPanel.tsx";
import type { DetailsTab } from "./viewer/DetailsPanel.tsx";
import { FlowCanvas } from "./viewer/FlowCanvas.tsx";
import { Header } from "./viewer/Header.tsx";
import { LoadNotes } from "./viewer/LoadNotes.tsx";
import { RunControls } from "./viewer/RunControls.tsx";
import { useFactoryData } from "./viewer/useFactoryData.ts";
import { useGraph, useLevel } from "./viewer/useGraph.ts";
import { useLiveExpansion } from "./viewer/useLiveExpansion.ts";
import { useLoadNotes } from "./viewer/useLoadNotes.ts";
import { useProjectIds } from "./viewer/useProjectIds.ts";
import { useRunDetail } from "./viewer/useRunDetail.ts";
import { useRuns } from "./viewer/useRuns.ts";
import { useStoredFlag } from "./viewer/useStoredFlag.ts";
import { useUrlSync } from "./viewer/useUrlSync.ts";
import { DEFAULT_WORKFLOW, parseMode } from "./viewer/view-mode.ts";
import type { ViewMode } from "./viewer/view-mode.ts";
import { WorkflowControls } from "./viewer/WorkflowControls.tsx";

const SHOW_COUNTS_KEY = "factory-viewer.show-numbers";
const AGENTS_ONLY_KEY = "factory-viewer.agents-only";

function Viewer() {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<ViewMode>(parseMode(params));
  const [projectFilter, setProjectFilter] = useState(params.get("project") ?? "");
  const [workflowName, setWorkflowName] = useState(params.get("workflow") ?? DEFAULT_WORKFLOW);
  const [requestedRun] = useState(params.get("run"));
  const [runFilter, setRunFilter] = useState(params.get("contains") ?? "");
  const [onlyRan, setOnlyRan] = useState(params.get("ran") === "1");
  const [selected, setSelected] = useState<Item | null>(null);
  const [tab, setTab] = useState<DetailsTab>("node");
  const [showCounts, changeShowCounts] = useStoredFlag(SHOW_COUNTS_KEY);
  const [onlyAgents, changeOnlyAgents] = useStoredFlag(AGENTS_ONLY_KEY);

  const { loadNotes, noteLoad } = useLoadNotes();
  const { workflows, config, agents, error, stale, marketplace, updating, updateNote, update } = useFactoryData(noteLoad);
  const projectIds = useProjectIds(mode, noteLoad);
  const filters = { projectFilter, runFilter, onlyRan };
  const { setRuns, runId, setRunId, runError, setRunError, shownRuns, openRun: openListedRun } = useRuns(mode, requestedRun, workflows, filters);
  const runDetail = useRunDetail(runId, mode, setRuns, setRunError);
  const { detail } = runDetail;
  useUrlSync({ mode, workflowName, runId, runFilter, onlyRan, projectFilter });
  useEffect(() => {
    setSelected(null);
  }, [runId, mode]);

  const showProjectRuns = useCallback((projectId: string) => {
    setProjectFilter(projectId);
    setMode("runs");
  }, []);

  /** Opens a run from a pending decision: the filters are cleared so it stays shown. */
  const openRun = useCallback(
    (id: string) => {
      setProjectFilter("");
      setRunFilter("");
      setMode("runs");
      openListedRun(id);
    },
    [openListedRun],
  );

  const runRoot = detail?.report.workflow.split("@")[0] ?? (runId ? null : runFilter || null);
  const rootName = mode === "workflows" ? workflowName : runRoot;
  const built = useLevel(workflows, rootName, detail);
  const level = built?.level ?? null;
  const { expanded, focusKey, toggle, expand, live, showCurrent } = useLiveExpansion(level, mode === "runs" ? (detail?.run ?? null) : null);
  const { graph, runIndex } = useGraph({ level, onlyAgents, expanded, agents, config, detail });
  const nodes = useMemo(
    (): FlowNode[] => graph.nodes.map((node) => ({ ...node, selected: node.id === selected?.key, ariaLabel: nodeAriaLabel(node.data.item, detail?.report ?? null, runIndex.get(node.id)) })),
    [graph, selected, detail, runIndex],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const picked = changes.find((change) => change.type === "select" && change.selected);
      const node = picked && picked.type === "select" ? graph.nodes.find((candidate) => candidate.id === picked.id) : undefined;
      if (node) {
        setSelected(node.data.item);
      }
    },
    [graph],
  );

  const teamNodes = useMemo(() => new Set(level ? allItems(level).filter((item) => item.kind === "team").map((item) => item.key) : []), [level]);
  const selectKey = useCallback(
    (key: string) => {
      if (!level) {
        return;
      }
      const item = findItem(level, key) ?? findItem(level, key.split("#")[0] ?? key);
      if (!item) {
        return;
      }
      const above = ancestorKeys(level, item.key);
      if (above.length) {
        expand(above);
      }
      setSelected(item);
    },
    [level, expand],
  );

  const shown = mode === "workflows" ? null : detail;
  const humans = useMemo(() => (level ? humanIcons(level, agents) : new Map()), [level, agents]);
  const openQuestions = useCallback((item: Item) => {
    setSelected(item);
    setTab("questions");
  }, []);
  const disabled = useMemo(() => (mode === "workflows" ? configDisabledKeys(level, config) : disabledKeys(detail?.run ?? null)), [mode, level, config, detail]);
  const workflow = useMemo(() => workflows?.find((candidate) => candidate.name === rootName) ?? null, [workflows, rootName]);
  const context = useMemo((): ViewerState => ({ config, report: shown?.report ?? null, run: shown?.run ?? null, toggle, focusKey, index: runIndex, disabled, mode, workflow, workflows: workflows ?? [], agents, live, onlyAgents, stale, showCounts, humans, questions: shown?.questions ?? [], openQuestions }), [config, shown, toggle, focusKey, runIndex, disabled, mode, workflow, workflows, agents, live, onlyAgents, stale, showCounts, humans, openQuestions]);

  if (error) {
    return <p className="error" role="alert">Could not load factory data: {error}</p>;
  }
  if (!workflows) {
    return <p className="muted pad">Loading…</p>;
  }

  const modeControls = (): ReactNode => {
    switch (mode) {
      case "workflows":
        return <WorkflowControls workflows={workflows} stale={stale} workflowName={workflowName} onWorkflowName={setWorkflowName} />;
      case "runs":
        return <RunControls workflows={workflows} stale={stale} projectIds={projectIds} filters={filters} onProjectFilter={setProjectFilter} onRunFilter={setRunFilter} onOnlyRan={setOnlyRan} runId={runId} onRunId={setRunId} shownRuns={shownRuns} runError={runError} runDetail={runDetail} live={live} onShowCurrent={showCurrent} />;
      case "projects":
        return null;
    }
  };

  return (
    <ViewerContext.Provider value={context}>
      <div className="app">
        <Header showCounts={showCounts} onShowCounts={changeShowCounts} mode={mode} onMode={setMode} updater={{ marketplace, updating, updateNote, stale, onUpdate: update }}>
          {modeControls()}
        </Header>
        <LoadNotes notes={loadNotes} />
        <PendingDecisions onOpenRun={openRun} />
        {mode === "projects" ? (
          <Projects onShowRuns={showProjectRuns} />
        ) : (
          <main>
            <div className="canvas">
              <FlowCanvas built={built} mode={mode} runId={runId} runError={runError} nodes={nodes} edges={graph.edges} bounds={graph.bounds} supervisor={shown?.report.supervisor} onNodesChange={onNodesChange} onSelect={setSelected} onlyAgents={onlyAgents} onOnlyAgents={changeOnlyAgents} />
            </div>
            <DetailsPanel tab={tab} onTab={setTab} selected={selected} teamNodes={teamNodes} onSelectKey={selectKey} />
          </main>
        )}
      </div>
    </ViewerContext.Provider>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Viewer />
    </ReactFlowProvider>
  );
}
