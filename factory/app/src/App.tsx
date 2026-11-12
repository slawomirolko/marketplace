import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ViewerContext } from "./context.ts";
import type { ViewerState } from "./context.ts";
import { Details } from "./Details.tsx";
import { layoutGraph } from "./layout.ts";
import { nodeAriaLabel, nodeTypes } from "./nodes.tsx";
import { buildLevel, buildRunIndex, formatAmount, formatTokens, isUnknownCost, disabledKeys, configDisabledKeys, liveAncestors, liveState, LIVE_STATUSES } from "./tree.ts";
import type { AgentInfo, Bounds, FactoryConfig, FlowEdge, FlowNode, Item, Level, RunDetail, RunIndex, RunListItem, Workflow } from "./types.ts";

const API = `${import.meta.env.BASE_URL}api`;
const LIVE_REFRESH_MS = 15_000;

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

function Viewer() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [config, setConfig] = useState<FactoryConfig | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [runId, setRunId] = useState("");
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<"runs" | "workflows">(params.get("mode") === "workflows" ? "workflows" : "runs");
  const [workflowName, setWorkflowName] = useState(params.get("workflow") ?? "olko-review");
  const [requestedRun] = useState(params.get("run"));
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getJson<Workflow[]>("/workflows"), getJson<FactoryConfig>("/config")])
      .then(([workflowList, factoryConfig]) => {
        setWorkflows(workflowList);
        setConfig(factoryConfig);
      })
      .catch((loadError: unknown) => setError(messageOf(loadError)));
    getJson<Record<string, AgentInfo>>("/agents").then(setAgents).catch(() => setAgents({}));
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
    url.search = mode === "workflows" ? `?mode=workflows&workflow=${encodeURIComponent(workflowName)}` : runId ? `?run=${encodeURIComponent(runId)}` : "";
    window.history.replaceState(null, "", url);
  }, [mode, workflowName, runId]);

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
  const graph = useMemo(() => (level ? layoutGraph(level, expanded) : { nodes: [], edges: [], bounds: null }), [level, expanded]);
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

  const shown = mode === "workflows" ? null : detail;
  const disabled = useMemo(() => (mode === "workflows" ? configDisabledKeys(level, config) : disabledKeys(detail?.run ?? null)), [mode, level, config, detail]);
  const workflow = useMemo(() => workflows?.find((w) => w.name === rootName) ?? null, [workflows, rootName]);
  const context = useMemo((): ViewerState => ({ config, report: shown?.report ?? null, run: shown?.run ?? null, toggle, focusKey, index: runIndex, disabled, mode, workflow, workflows: workflows ?? [], agents, live }), [config, shown, toggle, focusKey, runIndex, disabled, mode, workflow, workflows, agents, live]);
  const total = detail?.report.cost;

  if (error) return <p className="error" role="alert">Could not load factory data: {error}</p>;
  if (!workflows) return <p className="muted pad">Loading…</p>;

  return (
    <ViewerContext.Provider value={context}>
      <div className="app">
        <header>
          <h1>Factory viewer</h1>
          <div className="mode" role="radiogroup" aria-label="View">
            {(["runs", "workflows"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "runs" ? "Runs" : "Workflows (config)"}
              </button>
            ))}
          </div>
          {mode === "workflows" && (
            <label>
              Workflow{" "}
              <select value={workflowName} onChange={(e) => setWorkflowName(e.target.value)}>
                {(workflows ?? []).map((w) => (
                  <option key={w.name} value={w.name}>
                    {w.name} · {w.version} · {w.nodes.length} nodes
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "runs" && (
          <label>
            Run{" "}
            <select value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">no run (structure only)</option>
              {runs.map((r) => (
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
        </header>
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
              <Background />
              <Controls showInteractive={false} />
              <FitToBounds bounds={graph.bounds} />
            </ReactFlow>
            )}
          </div>
          <aside>
            <Details item={selected} />
          </aside>
        </main>
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
