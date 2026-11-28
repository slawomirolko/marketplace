import { useMemo } from "react";
import { messageOf } from "../api.ts";
import { agentsOnly } from "../agents-only.ts";
import { layoutGraph, scriptsHeight } from "../layout.ts";
import type { FlowEdge, FlowNode } from "../layout.ts";
import { buildRunIndex } from "../run-facts.ts";
import { agentScripts, buildLevel } from "../tree.ts";
import type { AgentInfo, Bounds, FactoryConfig, Level, RunDetail, RunIndex, Workflow } from "../types.ts";

export interface BuiltLevel {
  level?: Level;
  error?: string;
}

/** The graph level of the root workflow, or the error that stopped it; null while there is nothing to draw. */
export function useLevel(workflows: Workflow[] | null, rootName: string | null, detail: RunDetail | null): BuiltLevel | null {
  return useMemo((): BuiltLevel | null => {
    if (!workflows || !rootName) {
      return null;
    }
    try {
      return { level: buildLevel(workflows, rootName, rootName, [rootName], detail?.report ?? null) };
    } catch (error) {
      return { error: messageOf(error) };
    }
  }, [workflows, rootName, detail]);
}

export interface GraphInput {
  level: Level | null;
  onlyAgents: boolean;
  expanded: Set<string>;
  agents: Record<string, AgentInfo>;
  config: FactoryConfig | null;
  detail: RunDetail | null;
}

export interface Graph {
  graph: { nodes: FlowNode[]; edges: FlowEdge[]; bounds: Bounds | null };
  runIndex: RunIndex;
}

/** The laid-out graph (all steps, or agents only) and the run facts of each of its nodes. */
export function useGraph({ level, onlyAgents, expanded, agents, config, detail }: GraphInput): Graph {
  const drawn = useMemo(() => (level && onlyAgents ? agentsOnly(level) : level), [level, onlyAgents]);
  const graph = useMemo(() => (drawn ? layoutGraph(drawn, expanded, (item) => scriptsHeight(agentScripts(item, agents).length, onlyAgents)) : { nodes: [], edges: [], bounds: null }), [drawn, expanded, agents, onlyAgents]);
  const runIndex: RunIndex = useMemo(() => (level ? buildRunIndex(level, config, detail?.report ?? null, detail?.run ?? null) : new Map()), [level, config, detail]);
  return { graph, runIndex };
}
