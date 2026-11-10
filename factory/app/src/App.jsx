import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ViewerContext } from "./context.js";
import { Details } from "./Details.jsx";
import { layoutGraph } from "./layout.js";
import { nodeAriaLabel, nodeTypes } from "./nodes.jsx";
import { buildLevel, buildRunIndex, formatAmount, formatTokens, isUnknownCost } from "./tree.js";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function FitToBounds({ bounds }) {
  const { fitBounds } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const zoomReady = useStore((state) => Boolean(state.panZoom));
  useEffect(() => {
    if (!bounds || !width || !height || !zoomReady) return undefined;
    const id = setTimeout(() => fitBounds(bounds, { padding: 0.1 }), 0);
    return () => clearTimeout(id);
  }, [bounds, width, height, zoomReady, fitBounds]);
  return null;
}

function Viewer() {
  const [workflows, setWorkflows] = useState(null);
  const [config, setConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState("");
  const [detail, setDetail] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getJson("/api/workflows"), getJson("/api/config"), getJson("/api/runs")])
      .then(([workflowList, factoryConfig, runList]) => {
        setWorkflows(workflowList);
        setConfig(factoryConfig);
        setRuns(runList);
        setRunId(runList[0]?.runId ?? "");
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    setSelected(null);
    if (!runId) {
      setDetail(null);
      return undefined;
    }
    let current = true;
    getJson(`/api/runs/${runId}`)
      .then((runDetail) => {
        if (current) setDetail(runDetail);
      })
      .catch((loadError) => {
        if (current) setError(loadError.message);
      });
    return () => {
      current = false;
    };
  }, [runId]);

  const rootName = detail?.report.workflow.split("@")[0] ?? "hello";
  const built = useMemo(() => {
    if (!workflows) return null;
    try {
      return { level: buildLevel(workflows, rootName, rootName, [rootName], detail?.report ?? null) };
    } catch (e) {
      return { error: e.message };
    }
  }, [workflows, rootName, detail]);
  const level = built?.level ?? null;
  const graph = useMemo(() => (level ? layoutGraph(level, expanded) : { nodes: [], edges: [], bounds: null }), [level, expanded]);
  const runIndex = useMemo(() => (level ? buildRunIndex(level, config, detail?.report ?? null, detail?.run ?? null) : new Map()), [level, config, detail]);
  const nodes = useMemo(
    () => graph.nodes.map((n) => ({ ...n, selected: n.id === selected?.key, ariaLabel: nodeAriaLabel(n.data.item, detail?.report ?? null, runIndex.get(n.id)) })),
    [graph, selected, detail, runIndex],
  );
  const onNodesChange = useCallback(
    (changes) => {
      const picked = changes.find((change) => change.type === "select" && change.selected);
      const node = picked && graph.nodes.find((n) => n.id === picked.id);
      if (node) setSelected(node.data.item);
    },
    [graph],
  );

  const [focusKey, setFocusKey] = useState(null);
  const toggle = useCallback((key) => {
    setFocusKey(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const context = useMemo(() => ({ config, report: detail?.report ?? null, run: detail?.run ?? null, toggle, focusKey, index: runIndex }), [config, detail, toggle, focusKey, runIndex]);
  const total = detail?.report.cost;

  if (error) return <p className="error" role="alert">Could not load factory data: {error}</p>;
  if (!workflows) return <p className="muted pad">Loading…</p>;

  return (
    <ViewerContext.Provider value={context}>
      <div className="app">
        <header>
          <h1>Factory viewer</h1>
          <label>
            Run{" "}
            <select value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">no run (structure only)</option>
              {runs.map((r) => (
                <option key={r.runId} value={r.runId}>
                  {r.runId} · {r.status} · {r.harness ?? "?"} · {(r.usedModels.length ? r.usedModels : r.requestedModels).join(", ")}{r.usedModels.length ? "" : " (requested, none ran)"} · {formatAmount(r.costUsd, r.coverage)} · {r.goal}
                </option>
              ))}
            </select>
          </label>
          {total && (
            <span className="total">
              Total <strong className={isUnknownCost(detail.report.coverage?.run) ? "cost-unknown" : ""}>{formatAmount(total.costUsd, detail.report.coverage?.run)}</strong> of ${total.budgetUsd.toFixed(2)} · {formatTokens(total.tokens, detail.report.cacheTokens)} · {total.steps} steps · {total.source}
            </span>
          )}
        </header>
        <main>
          <div className="canvas">
            {built?.error ? (
              <p className="error" role="alert">Could not draw this run: {built.error}</p>
            ) : (
            <ReactFlow
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
