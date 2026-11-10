import dagre from "@dagrejs/dagre";
import { isGroup } from "./tree.js";

const STEP = { width: 250, height: 104 };
const TERMINAL = { width: 90, height: 40 };
const AGENT = { width: 190, height: 84 };
const PAD = 20;
const HEADER = 72;

function sizeOf(item) {
  if (item.kind === "terminal") return TERMINAL;
  if (item.kind === "agent") return AGENT;
  return STEP;
}

function layoutLevel(level, expanded, parentKey) {
  const sized = level.items.map((item) => {
    if (isGroup(item) && expanded.has(item.key)) {
      const inner = layoutLevel(item.inner, expanded, item.key);
      return { item, inner, width: Math.max(inner.width + PAD * 2, STEP.width), height: inner.height + PAD * 2 + HEADER };
    }
    return { item, ...sizeOf(item) };
  });

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 56, marginx: 0, marginy: 0 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const s of sized) graph.setNode(s.item.key, { width: s.width, height: s.height });
  for (const e of level.edges) graph.setEdge(e.from, e.to, e.label ? { label: e.label, width: Math.min(240, e.label.length * 6.5), height: 18 } : {});
  dagre.layout(graph);

  const placed = sized.map((s) => {
    const p = graph.node(s.item.key);
    return { ...s, x: p.x - s.width / 2, y: p.y - s.height / 2 };
  });
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const nodes = [];
  for (const p of placed) {
    const expandedGroup = Boolean(p.inner);
    nodes.push({
      id: p.item.key,
      type: expandedGroup ? "cluster" : p.item.kind === "terminal" ? "terminal" : "card",
      position: { x: p.x - minX, y: p.y - minY },
      data: { item: p.item, expanded: expandedGroup },
      width: p.width,
      height: p.height,
      style: { width: p.width, height: p.height },
      ...(parentKey ? { parentId: parentKey } : {}),
      draggable: false,
    });
    if (p.inner) {
      for (const child of p.inner.nodes) {
        nodes.push(child.parentId === p.item.key ? { ...child, position: { x: child.position.x + PAD, y: child.position.y + PAD + HEADER } } : child);
      }
    }
  }
  const edges = [
    ...level.edges.map((e) => ({ id: `${e.from}->${e.to}`, source: e.from, target: e.to, label: e.label ?? undefined, type: "smoothstep" })),
    ...placed.flatMap((p) => p.inner?.edges ?? []),
  ];
  return {
    nodes,
    edges,
    width: Math.max(...placed.map((p) => p.x - minX + p.width)),
    height: Math.max(...placed.map((p) => p.y - minY + p.height)),
  };
}

export function layoutGraph(level, expanded) {
  const { nodes, edges, width, height } = layoutLevel(level, expanded, null);
  return { nodes, edges, bounds: { x: 0, y: 0, width, height } };
}
