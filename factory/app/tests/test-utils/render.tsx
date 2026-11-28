import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { NodeMouseHandler } from "@xyflow/react";
import { ViewerContext } from "../../src/context.ts";
import type { ViewerState } from "../../src/context.ts";
import { nodeTypes } from "../../src/nodes.tsx";
import { humanIcons } from "../../src/human.ts";
import { buildLevel } from "../../src/tree.ts";
import { drawGraph } from "../../src/viewer/useGraph.ts";
import type { FlowNode } from "../../src/layout.ts";
import type { Workflow } from "../../src/types.ts";
import { agents, mainWorkflow } from "./data.ts";
import { FLOW_HEIGHT, FLOW_WIDTH } from "./flow-size.ts";

export function viewerState(overrides: Partial<ViewerState> = {}): ViewerState {
  return {
    config: null,
    report: null,
    run: null,
    toggle: () => {},
    focusKey: null,
    index: null,
    disabled: [],
    mode: "workflows",
    workflow: mainWorkflow,
    workflows: [mainWorkflow],
    agents,
    live: { node: null, agents: [], waiting: null },
    onlyAgents: false,
    stale: {},
    showCounts: false,
    humans: new Map(),
    questions: [],
    openQuestions: () => {},
    ...overrides,
  };
}

export function renderWithViewer(ui: ReactElement, overrides: Partial<ViewerState> = {}): RenderResult {
  return render(<ViewerContext.Provider value={viewerState(overrides)}>{ui}</ViewerContext.Provider>);
}

export interface FlowOptions {
  workflows?: Workflow[];
  root?: string;
  expanded?: string[];
  state?: Partial<ViewerState>;
  onNodeClick?: NodeMouseHandler<FlowNode>;
}

/** Renders a workflow through the viewer's own pipeline (buildLevel, then drawGraph as useGraph draws it) into React Flow. */
export function renderFlow({ workflows = [mainWorkflow], root = "main", expanded = [], state = {}, onNodeClick }: FlowOptions = {}): RenderResult {
  const level = buildLevel(workflows, root);
  const full = viewerState({ workflows, humans: humanIcons(level, state.agents ?? agents), ...state });
  const graph = drawGraph(level, { onlyAgents: full.onlyAgents, expanded: new Set(expanded), agents: full.agents });
  return render(
    <ViewerContext.Provider value={full}>
      <ReactFlowProvider>
        <div style={{ width: FLOW_WIDTH, height: FLOW_HEIGHT }}>
          <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} {...(onNodeClick ? { onNodeClick } : {})} />
        </div>
      </ReactFlowProvider>
    </ViewerContext.Provider>,
  );
}
