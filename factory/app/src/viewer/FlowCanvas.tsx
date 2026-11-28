import { Background, Controls, Panel, ReactFlow } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import type { FlowEdge, FlowNode } from "../layout.ts";
import { nodeTypes } from "../nodes.tsx";
import { ringBounds } from "../supervisor.ts";
import { SupervisorRing } from "../SupervisorRing.tsx";
import type { Bounds, Item, SupervisorData } from "../types.ts";
import { FitToBounds } from "./FitToBounds.tsx";
import type { BuiltLevel } from "./useGraph.ts";
import type { ViewMode } from "./view-mode.ts";

export interface FlowCanvasProps {
  built: BuiltLevel | null;
  mode: ViewMode;
  runId: string;
  runError: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  bounds: Bounds | null;
  supervisor: SupervisorData | null | undefined;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onSelect: (item: Item | null) => void;
  onlyAgents: boolean;
  onOnlyAgents: (value: boolean) => void;
}

/** The graph: an error when it cannot be drawn, a note while no run is chosen or loaded, else the React Flow canvas. */
export function FlowCanvas({ built, mode, runId, runError, nodes, edges, bounds, supervisor, onNodesChange, onSelect, onlyAgents, onOnlyAgents }: FlowCanvasProps) {
  if (built?.error) {
    return <p className="error" role="alert">Could not draw this run: {built.error}</p>;
  }
  if (!built && mode === "runs") {
    return runError ? null : <p className="muted pad">{runId ? "Loading run…" : "No run selected. Pick a run, or a workflow in the filter to see its structure."}</p>;
  }
  return (
    <ReactFlow<FlowNode, FlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.data.item)}
      onNodesChange={onNodesChange}
      onPaneClick={() => onSelect(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      colorMode="system"
      minZoom={0.1}
    >
      <Panel position="top-left">
        <label className="agents-only" title="Show only agent steps. Solid line: always runs next. Dashed line: runs only under a condition or a switch.">
          <input type="checkbox" checked={onlyAgents} onChange={(event) => onOnlyAgents(event.target.checked)} /> Agents only
        </label>
      </Panel>
      <Background />
      <Controls showInteractive={false} />
      <FitToBounds bounds={ringBounds(bounds)} />
      <SupervisorRing supervisor={supervisor} bounds={bounds} />
    </ReactFlow>
  );
}
