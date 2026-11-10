import dagre from "@dagrejs/dagre";
import { isGroup } from "./tree.ts";
import type { Bounds, FlowEdge, FlowNode, Item, Level } from "./types.ts";

const STEP = { width: 270, height: 112 };
const TERMINAL = { width: 90, height: 40 };
const AGENT = { width: 220, height: 124 };
const PAD = 20;
const HEADER = 72;

interface LevelLayout {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
}

interface Box {
  item: Item;
  inner?: LevelLayout;
  width: number;
  height: number;
}

function nodeTypeOf(box: Box): FlowNode["type"] {
  if (box.inner) return "cluster";
  if (box.item.kind === "terminal") return "terminal";
  return "card";
}

function sizeOf(item: Item): { width: number; height: number } {
  if (item.kind === "terminal") return TERMINAL;
  if (item.kind === "agent") return AGENT;
  return STEP;
}

function layoutLevel(level: Level, expanded: Set<string>, parentKey: string | null): LevelLayout {
  const sized = level.items.map((item): Box => {
    if (isGroup(item) && expanded.has(item.key)) {
      const inner = layoutLevel(item.inner, expanded, item.key);
      return { item, inner, width: Math.max(inner.width + PAD * 2, STEP.width), height: inner.height + PAD * 2 + HEADER };
    }
    return { item, ...sizeOf(item) };
  });

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 56, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const entry of sized) graph.setNode(entry.item.key, { width: entry.width, height: entry.height });
  for (const edge of level.edges) graph.setEdge(edge.from, edge.to, edge.label ? { label: edge.label, width: Math.min(240, edge.label.length * 6.5), height: 18 } : {});
  dagre.layout(graph);

  const placed = sized.map((entry) => {
    const center = graph.node(entry.item.key);
    return { ...entry, x: center.x - entry.width / 2, y: center.y - entry.height / 2 };
  });
  const minX = Math.min(...placed.map((box) => box.x));
  const minY = Math.min(...placed.map((box) => box.y));
  const nodes: FlowNode[] = [];
  for (const box of placed) {
    const expandedGroup = Boolean(box.inner);
    nodes.push({
      id: box.item.key,
      type: nodeTypeOf(box),
      position: { x: box.x - minX, y: box.y - minY },
      data: { item: box.item, expanded: expandedGroup },
      width: box.width,
      height: box.height,
      style: { width: box.width, height: box.height },
      ...(parentKey ? { parentId: parentKey } : {}),
      draggable: false,
    });
    if (box.inner) {
      for (const child of box.inner.nodes) {
        nodes.push(child.parentId === box.item.key ? { ...child, position: { x: child.position.x + PAD, y: child.position.y + PAD + HEADER } } : child);
      }
    }
  }
  const edges: FlowEdge[] = [
    ...level.edges.map((edge) => ({ id: `${edge.from}->${edge.to}`, source: edge.from, target: edge.to, label: edge.label ?? undefined, type: "smoothstep" })),
    ...placed.flatMap((box) => box.inner?.edges ?? []),
  ];
  return {
    nodes,
    edges,
    width: Math.max(...placed.map((box) => box.x - minX + box.width)),
    height: Math.max(...placed.map((box) => box.y - minY + box.height)),
  };
}

export function layoutGraph(level: Level, expanded: Set<string>): { nodes: FlowNode[]; edges: FlowEdge[]; bounds: Bounds } {
  const { nodes, edges, width, height } = layoutLevel(level, expanded, null);
  return { nodes, edges, bounds: { x: 0, y: 0, width, height } };
}
