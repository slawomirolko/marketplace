import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Panel, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ViewerContext } from "./context.ts";
import type { ViewerState } from "./context.ts";
import { Details } from "./Details.tsx";
import { CallsList } from "./Calls.tsx";
import { QuestionsList } from "./Questions.tsx";
import { Projects } from "./Projects.tsx";
import type { ProjectList } from "./Projects.tsx";
import { SupervisorRing, ringBounds } from "./SupervisorRing.tsx";
import { layoutGraph, scriptsHeight } from "./layout.ts";
import { agentsOnly } from "./agents-only.ts";
import { nodeAriaLabel, nodeTypes } from "./nodes.tsx";
import { buildLevel, buildRunIndex, formatAmount, formatTokens, isUnknownCost, disabledKeys, configDisabledKeys, liveAncestors, liveState, LIVE_STATUSES, agentScripts, containedWorkflows, findItem, ancestorKeys, allItems, humanIcons } from "./tree.ts";
import type { StaleWorkflow } from "./types.ts";
import type { AgentInfo, Bounds, FactoryConfig, FlowEdge, FlowNode, Item, Level, RunDetail, RunIndex, RunListItem, Workflow } from "./types.ts";

const API = `${import.meta.env.BASE_URL}api`;
const LIVE_REFRESH_MS = 15_000;
const SHOW_COUNTS_KEY = "factory-viewer.show-numbers";
const AGENTS_ONLY_KEY = "factory-viewer.agents-only";

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    return;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(`${API}${url}`);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function FitToBounds({ bounds }: { bounds: Bounds | null }) {
  const { fitBounds } = useReactFlow<FlowNode, FlowEdge>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoomReady = useStore((state) => Boolean(state.panZoom));
  const boundsKey = bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "";
  useEffect(() => {
    if (!bounds || !width || !height || !zoomReady) return undefined;
    const id = setTimeout(() => fitBounds(bounds, { padding: 0.1 }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey, width, height, zoomReady, fitBounds]);
  return null;
}

function WorkflowOptions({ workflows, stale = {} }: { workflows: Workflow[]; stale?: Record<string, StaleWorkflow> }) {
  const option = (w: Workflow) => (
    <option key={w.name} value={w.name}>
      {stale[w.name] ? "⚠ " : ""}{w.name} · {w.version} · {w.nodes.length} nodes{stale[w.name] ? " · source changed" : ""}
    </option>
  );
  return (
    <>
      <optgroup label="Standalone (started by a primary agent)">{workflows.filter((w) => w.standalone).map(option)}</optgroup>
      <hr />
      <optgroup label="Parts (inlined or called by another workflow)">{workflows.filter((w) => !w.standalone).map(option)}</optgroup>
    </>
  );
}

function Viewer() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [config, setConfig] = useState<FactoryConfig | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runId, setRunId] = useState("");
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<"runs" | "workflows" | "projects">(params.get("mode") === "workflows" ? "workflows" : params.get("mode") === "projects" ? "projects" : "runs");
  const [projectFilter, setProjectFilter] = useState(params.get("project") ?? "");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [workflowName, setWorkflowName] = useState(params.get("workflow") ?? "olko-review");
  const [requestedRun] = useState(params.get("run"));
  const [runFilter, setRunFilter] = useState(params.get("contains") ?? "");
  const [onlyRan, setOnlyRan] = useState(params.get("ran") === "1");
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<Record<string, StaleWorkflow>>({});
  const [marketplace, setMarketplace] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [showCounts, setShowCounts] = useState(() => readFlag(SHOW_COUNTS_KEY));
  const [onlyAgents, setOnlyAgents] = useState(() => readFlag(AGENTS_ONLY_KEY));
  const [tab, setTab] = useState<"node" | "calls" | "questions">("node");
  const changeShowCounts = useCallback((value: boolean) => {
    setShowCounts(value);
    writeFlag(SHOW_COUNTS_KEY, value);
  }, []);
  const changeOnlyAgents = useCallback((value: boolean) => {
    setOnlyAgents(value);
    writeFlag(AGENTS_ONLY_KEY, value);
  }, []);
  const loadStale = useCallback(() => {
    getJson<{ marketplace: string; stale: StaleWorkflow[] }>("/stale")
      .then((r) => {
        setMarketplace(r.marketplace);
        setStale(Object.fromEntries(r.stale.map((s) => [s.workflow, s])));
      })
      .catch(() => setStale({}));
  }, []);
  useEffect(loadStale, [loadStale]);
  const update = useCallback(async () => {
    setUpdating(true);
    setUpdateNote(null);
    try {
      const response = await fetch(`${API}/update`, { method: "POST", headers: { "x-factory-action": "update" } });
      const body = (await response.json()) as { error?: string; before?: string; after?: string; changedFiles?: string[]; stale?: StaleWorkflow[] };
      if (!response.ok) throw new Error(body.error ?? `update failed: ${response.status}`);
      const [workflowList, agentList] = await Promise.all([getJson<Workflow[]>("/workflows"), getJson<Record<string, AgentInfo>>("/agents")]);
      setWorkflows(workflowList);
      setAgents(agentList);
      setStale(Object.fromEntries((body.stale ?? []).map((s) => [s.workflow, s])));
      const moved = body.before === body.after ? "already up to date" : `${body.before?.slice(0, 7)} → ${body.after?.slice(0, 7)}, ${body.changedFiles?.length ?? 0} files changed`;
      setUpdateNote(`Marketplace ${moved}; agents and skills reloaded; ${body.stale?.length ?? 0} workflows have a changed source.`);
    } catch (updateError) {
      setUpdateNote(messageOf(updateError));
    } finally {
      setUpdating(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([getJson<Workflow[]>("/workflows"), getJson<FactoryConfig>("/config")])
      .then(([workflowList, factoryConfig]) => {
        setWorkflows(workflowList);
        setConfig(factoryConfig);
      })
      .catch((loadError: unknown) => setError(messageOf(loadError)));
    getJson<Record<string, AgentInfo>>("/agents").then(setAgents).catch(() => setAgents({}));
  }, []);
  useEffect(() => {
    if (mode !== "runs") return;
    getJson<ProjectList>("/projects")
      .then((r) => setProjectIds(r.projects.map((p) => p.id)))
      .catch(() => setProjectIds([]));
  }, [mode]);
  const showProjectRuns = useCallback((projectId: string) => {
    setProjectFilter(projectId);
    setMode("runs");
  }, []);

  const [runsLoaded, setRunsLoaded] = useState(false);
  useEffect(() => {
    if (mode !== "runs" || runsLoaded) return;
    setRunsLoaded(true);
    getJson<RunListItem[]>("/runs")
      .then((runList) => {
        setRuns(runList);
        setRunId(requestedRun !== null && runList.some((r) => r.runId === requestedRun) ? requestedRun : (runList[0]?.runId ?? ""));
      })
      .catch((loadError: unknown) => setError(messageOf(loadError)));
  }, [mode, runsLoaded, requestedRun]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = new URLSearchParams(mode === "workflows" ? { mode: "workflows", workflow: workflowName } : mode === "projects" ? { mode: "projects" } : { ...(projectFilter ? { project: projectFilter } : {}), ...(runFilter ? { contains: runFilter } : {}), ...(runFilter && onlyRan ? { ran: "1" } : {}), ...(runId ? { run: runId } : {}) });
    url.search = query.size ? `?${query.toString()}` : "";
    window.history.replaceState(null, "", url);
  }, [mode, workflowName, runId, runFilter, onlyRan, projectFilter]);

  const shownRuns = useMemo(() => {
    const ofProject = projectFilter ? runs.filter((r) => r.projectId === projectFilter) : runs;
    if (!runFilter || !workflows) return ofProject;
    return ofProject.filter((r) => (onlyRan ? (r.ran ?? []).includes(runFilter) : Boolean(r.workflow) && containedWorkflows(workflows, r.workflow ?? "").has(runFilter)));
  }, [runs, runFilter, onlyRan, workflows, projectFilter]);
  useEffect(() => {
    if (mode !== "runs" || !runsLoaded) return;
    if (!runId || shownRuns.some((r) => r.runId === runId)) return;
    setRunId(shownRuns[0]?.runId ?? "");
  }, [mode, runsLoaded, shownRuns, runId]);

  useEffect(() => {
    setSelected(null);
    if (!runId || mode === "workflows") {
      setDetail(null);
      return undefined;
    }
    let current = true;
    getJson<RunDetail>(`/runs/${runId}`)
      .then((runDetail) => {
        if (current) setDetail(runDetail);
      })
      .catch((loadError: unknown) => {
        if (current) setError(messageOf(loadError));
      });
    return () => {
      current = false;
    };
  }, [runId, mode]);

  const runStatus = mode === "runs" ? (detail?.run.status ?? null) : null;
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!runId || runStatus === null || !LIVE_STATUSES.includes(runStatus)) return undefined;
    const id = setInterval(() => {
      getJson<RunDetail>(`/runs/${runId}`)
        .then((runDetail) => {
          setDetail(runDetail);
          setRefreshedAt(new Date());
        })
        .catch(() => undefined);
      getJson<RunListItem[]>("/runs").then(setRuns).catch(() => undefined);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [runId, runStatus]);

  const rootName = mode === "workflows" ? workflowName : (detail?.report.workflow.split("@")[0] ?? "hello");
  const built = useMemo((): { level?: Level; error?: string } | null => {
    if (!workflows) return null;
    try {
      return { level: buildLevel(workflows, rootName, rootName, [rootName], detail?.report ?? null) };
    } catch (e) {
      return { error: messageOf(e) };
    }
  }, [workflows, rootName, detail]);
  const level = built?.level ?? null;
  const drawn = useMemo(() => (level && onlyAgents ? agentsOnly(level) : level), [level, onlyAgents]);
  const graph = useMemo(() => (drawn ? layoutGraph(drawn, expanded, (item) => scriptsHeight(agentScripts(item, agents).length, onlyAgents)) : { nodes: [], edges: [], bounds: null }), [drawn, expanded, agents, onlyAgents]);
  const runIndex: RunIndex = useMemo(() => (level ? buildRunIndex(level, config, detail?.report ?? null, detail?.run ?? null) : new Map()), [level, config, detail]);
  const nodes = useMemo(
    (): FlowNode[] => graph.nodes.map((n) => ({ ...n, selected: n.id === selected?.key, ariaLabel: nodeAriaLabel(n.data.item, detail?.report ?? null, runIndex.get(n.id)) })),
    [graph, selected, detail, runIndex],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const picked = changes.find((change) => change.type === "select" && change.selected);
      const node = picked && picked.type === "select" ? graph.nodes.find((n) => n.id === picked.id) : undefined;
      if (node) setSelected(node.data.item);
    },
    [graph],
  );

  const [focusKey, setFocusKey] = useState<string | null>(null);
  const toggle = useCallback((key: string) => {
    setFocusKey(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const live = useMemo(() => liveState(mode === "runs" ? (detail?.run ?? null) : null), [mode, detail]);
  const showCurrent = useCallback(() => {
    if (!level) return;
    const ancestors = liveAncestors(level, live);
    setExpanded((current) => new Set([...current, ...ancestors]));
  }, [level, live]);
  const liveKey = `${live.node ?? ""}|${live.agents.join(",")}`;
  useEffect(() => {
    if (live.node || live.agents.length) showCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, level !== null]);

  const teamNodes = useMemo(() => new Set(level ? allItems(level).filter((i) => i.kind === "team").map((i) => i.key) : []), [level]);
  const selectKey = useCallback(
    (key: string) => {
      if (!level) return;
      const item = findItem(level, key) ?? findItem(level, key.split("#")[0] ?? key);
      if (!item) return;
      const above = ancestorKeys(level, item.key);
      if (above.length) setExpanded((current) => new Set([...current, ...above]));
      setSelected(item);
    },
    [level],
  );

  const shown = mode === "workflows" ? null : detail;
  const humans = useMemo(() => (level ? humanIcons(level, agents) : new Map()), [level, agents]);
  const openQuestions = useCallback((item: Item) => {
    setSelected(item);
    setTab("questions");
  }, []);
  const disabled = useMemo(() => (mode === "workflows" ? configDisabledKeys(level, config) : disabledKeys(detail?.run ?? null)), [mode, level, config, detail]);
  const workflow = useMemo(() => workflows?.find((w) => w.name === rootName) ?? null, [workflows, rootName]);
  const context = useMemo((): ViewerState => ({ config, report: shown?.report ?? null, run: shown?.run ?? null, toggle, focusKey, index: runIndex, disabled, mode, workflow, workflows: workflows ?? [], agents, live, onlyAgents, stale, showCounts, humans, questions: shown?.questions ?? [], openQuestions }), [config, shown, toggle, focusKey, runIndex, disabled, mode, workflow, workflows, agents, live, onlyAgents, stale, showCounts, humans, openQuestions]);
  const total = detail?.report.cost;

  if (error) return <p className="error" role="alert">Could not load factory data: {error}</p>;
  if (!workflows) return <p className="muted pad">Loading…</p>;

  return (
    <ViewerContext.Provider value={context}>
      <div className="app">
        <header>
          <label className="show-numbers" title="Show on every node how many times it ran in the selected run">
            <input type="checkbox" checked={showCounts} onChange={(e) => changeShowCounts(e.target.checked)} /> Show numbers
          </label>
          <h1>Factory viewer</h1>
          <div className="mode" role="radiogroup" aria-label="View">
            {(["runs", "workflows", "projects"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "runs" ? "Runs" : m === "workflows" ? "Workflows (config)" : "Projects"}
              </button>
            ))}
          </div>
          {mode === "workflows" && (
            <label>
              Workflow{" "}
              <select value={workflowName} onChange={(e) => setWorkflowName(e.target.value)}>
                <WorkflowOptions workflows={workflows ?? []} stale={stale} />
              </select>
            </label>
          )}
          {mode === "runs" && (projectIds.length > 0 || projectFilter) && (
            <label>
              Project{" "}
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                <option value="">all runs</option>
                {[...new Set([...projectIds, ...(projectFilter ? [projectFilter] : [])])].map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "runs" && (
            <label>
              Workflow{" "}
              <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
                <option value="">all workflows</option>
                <hr />
                <WorkflowOptions workflows={workflows ?? []} stale={stale} />
              </select>
            </label>
          )}
          {mode === "runs" && runFilter && (
            <label title="Off: every run whose workflow contains it. On: only runs in which at least one of its steps started.">
              <input type="checkbox" checked={onlyRan} onChange={(e) => setOnlyRan(e.target.checked)} /> only where it ran
            </label>
          )}
          {mode === "runs" && (
          <label>
            Run{" "}
            <select value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">no run (structure only)</option>
              {shownRuns.length === 0 && projectFilter && !runFilter && <option value="" disabled>no run of project {projectFilter}</option>}
              {shownRuns.length === 0 && runFilter && <option value="" disabled>{onlyRan ? `no run where ${runFilter} ran` : `no run contains ${runFilter}`}</option>}
              {shownRuns.map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.runId} · {r.status} · {r.harness ?? "?"} · {(r.usedModels.length ? r.usedModels : r.requestedModels).join(", ")}{r.usedModels.length ? "" : " (requested, none ran)"} · {formatAmount(r.costUsd, r.coverage)} · {r.goal}{r.synthetic ? " · fake model" : ""}{r.source && r.source !== "main" ? ` · ${r.source}` : ""}
                </option>
              ))}
            </select>
          </label>
          )}
          {mode === "runs" && detail && total && (
            <span className="total">
              Total <strong className={isUnknownCost(detail.report.coverage?.run) ? "cost-unknown" : ""}>{formatAmount(total.costUsd, detail.report.coverage?.run)}</strong> of ${total.budgetUsd.toFixed(2)} · {formatTokens(total.tokens, detail.report.cacheTokens)} · {total.steps} steps · {total.source}
            </span>
          )}
          {mode === "runs" && detail && LIVE_STATUSES.includes(detail.run.status) && (
            <span className="live-bar" role="status">
              <span className="live-dot" aria-hidden="true" />
              {live.waiting ? "Waiting for your answer" : "Running"}
              {live.node ? ` · now: ${live.node.split("/").slice(1).join("/") || live.node}` : ""}
              {live.agents.length ? ` · ${live.agents.length} agent${live.agents.length === 1 ? "" : "s"} working` : ""}
              {` · refreshes every ${LIVE_REFRESH_MS / 1000} s${refreshedAt ? `, last ${refreshedAt.toLocaleTimeString()}` : ""}`}
              <button type="button" onClick={showCurrent}>Show current step</button>
            </span>
          )}
          <span className="update">
            <button type="button" onClick={update} disabled={updating} title={`git fetch and fast-forward of ${marketplace || "the marketplace checkout"} (only when it is clean and on main), then reload agents, skills and workflows`}>
              {updating ? "Updating…" : "Update from marketplace"}
            </button>
            {Object.keys(stale).length > 0 && <span className="stale-count">⚠ {Object.keys(stale).length} workflows: source changed</span>}
            {updateNote && <span className="muted" role="status"> {updateNote}</span>}
          </span>
        </header>
        {mode === "projects" ? (
          <Projects onShowRuns={showProjectRuns} />
        ) : (
        <main>
          <div className="canvas">
            {built?.error ? (
              <p className="error" role="alert">Could not draw this run: {built.error}</p>
            ) : (
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelected(node.data.item)}
              onNodesChange={onNodesChange}
              onPaneClick={() => setSelected(null)}
              nodesDraggable={false}
              nodesConnectable={false}
              colorMode="system"
              minZoom={0.1}
            >
              <Panel position="top-left">
                <label className="agents-only" title="Show only agent steps. Solid line: always runs next. Dashed line: runs only under a condition or a switch.">
                  <input type="checkbox" checked={onlyAgents} onChange={(e) => changeOnlyAgents(e.target.checked)} /> Agents only
                </label>
              </Panel>
              <Background />
              <Controls showInteractive={false} />
              <FitToBounds bounds={ringBounds(graph.bounds)} />
              <SupervisorRing supervisor={shown?.report.supervisor} bounds={graph.bounds} />
            </ReactFlow>
            )}
          </div>
          <aside>
            <div className="tabs" role="tablist" aria-label="Details">
              <button type="button" role="tab" id="tab-node" aria-selected={tab === "node"} aria-controls="panel-node" className={tab === "node" ? "active" : ""} onClick={() => setTab("node")}>
                Node
              </button>
              <button type="button" role="tab" id="tab-calls" aria-selected={tab === "calls"} aria-controls="panel-calls" className={tab === "calls" ? "active" : ""} onClick={() => setTab("calls")}>
                All calls
              </button>
              <button type="button" role="tab" id="tab-questions" aria-selected={tab === "questions"} aria-controls="panel-questions" className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>
                Questions
              </button>
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "node" ? <Details item={selected} /> : tab === "calls" ? <CallsList selectedKey={selected?.key ?? null} teamNodes={teamNodes} onSelect={selectKey} /> : <QuestionsList item={selected} />}
            </div>
          </aside>
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
