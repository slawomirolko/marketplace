import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { ViewerContext } from "./context.js";
import { Details } from "./Details.jsx";
import { layoutGraph } from "./layout.js";
import { nodeTypes } from "./nodes.jsx";
import { buildLevel, formatTokens } from "./tree.js";

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

function FitToBounds({ bounds }) {
  const { fitBounds } = useReactFlow();
  useEffect(() => {
    if (!bounds) return undefined;
    const id = requestAnimationFrame(() => fitBounds(bounds, { padding: 0.1, duration: 200 }));
    return () => cancelAnimationFrame(id);
  }, [bounds, fitBounds]);
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
      .then(([w, c, r]) => {
        setWorkflows(w);
        setConfig(c);
        setRuns(r);
        setRunId(r[0]?.runId ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setSelected(null);
    if (!runId) return setDetail(null);
    getJson(`/api/runs/${runId}`).then(setDetail).catch((e) => setError(e.message));
  }, [runId]);

  const rootName = detail?.report.workflow.split("@")[0] ?? "hello";
  const level = useMemo(() => (workflows ? buildLevel(workflows, rootName, rootName, [rootName], detail?.report ?? null) : null), [workflows, rootName, detail]);
  const graph = useMemo(() => (level ? layoutGraph(level, expanded) : { nodes: [], edges: [], bounds: null }), [level, expanded]);
  const nodes = useMemo(() => graph.nodes.map((n) => ({ ...n, selected: n.id === selected?.key })), [graph, selected]);

  const toggle = useCallback((key) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const context = useMemo(() => ({ config, report: detail?.report ?? null, run: detail?.run ?? null, toggle }), [config, detail, toggle]);
  const total = detail?.report.cost;

  if (error) return <p className="error">Could not load factory data: {error}</p>;
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
                  {r.runId} · {r.status} · {r.harness ?? "?"} · {(r.usedModels.length ? r.usedModels : r.requestedModels).join(", ")}{r.usedModels.length ? "" : " (requested, none ran)"} · ${r.costUsd.toFixed(6)} · {r.goal}
                </option>
              ))}
            </select>
          </label>
          {total && (
            <span className="total">
              Total <strong>${total.costUsd.toFixed(6)}</strong> of ${total.budgetUsd.toFixed(2)} · {formatTokens(total.tokens, detail.report.cacheTokens)} · {total.steps} steps · {total.source}
            </span>
          )}
        </header>
        <main>
          <div className="canvas">
            <ReactFlow
              nodes={nodes}
              edges={graph.edges}
              nodeTypes={nodeTypes}
              onNodeClick={(_, node) => setSelected(node.data.item)}
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
