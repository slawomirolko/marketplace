import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { ViewerContext } from "../../src/context.ts";
import type { ViewerState } from "../../src/context.ts";
import { agentsOnly } from "../../src/agents-only.ts";
import { layoutGraph, scriptsHeight } from "../../src/layout.ts";
import { nodeTypes } from "../../src/nodes.tsx";
import { agentScripts, buildLevel } from "../../src/tree.ts";
import type { Workflow } from "../../src/types.ts";
import { agents, mainWorkflow } from "./data.ts";

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
}

/** Renders a workflow through the viewer's own pipeline (level, optional agents-only reduction, layout) into React Flow. */
export function renderFlow({ workflows = [mainWorkflow], root = "main", expanded = [], state = {} }: FlowOptions = {}): RenderResult {
  const full = viewerState({ workflows, ...state });
  const level = buildLevel(workflows, root);
  const drawn = full.onlyAgents ? agentsOnly(level) : level;
  const graph = layoutGraph(drawn, new Set(expanded), (item) => scriptsHeight(agentScripts(item, full.agents).length, full.onlyAgents));
  return render(
    <ViewerContext.Provider value={full}>
      <ReactFlowProvider>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} />
        </div>
      </ReactFlowProvider>
    </ViewerContext.Provider>,
  );
}
