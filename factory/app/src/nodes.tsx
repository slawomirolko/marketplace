import { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { useViewer } from "./context.ts";
import { formatTokens, formatUsd, isDisabled, isGroup } from "./tree.ts";
import type { CardFlowNode, ClusterFlowNode, Item, RunIndexEntry, RunReport, TerminalFlowNode } from "./types.ts";

const EMPTY_ENTRY: RunIndexEntry = { cost: null, tier: null, model: null, failure: null };

function useEntry(item: Item): RunIndexEntry {
  return useViewer().index?.get(item.key) ?? EMPTY_ENTRY;
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function title(item: Item): string {
  if (item.kind === "agent") return item.agent.id;
  if (item.kind === "terminal") return item.label;
  return item.node.id;
}

function subtitle(item: Item): string {
  if (item.kind === "terminal") return item.label;
  if (item.kind === "agent") return `agent · ${item.agent.role}`;
  if (item.kind === "team") return `llm · ${item.inner.items.length} agents`;
  if (item.node.agentsFrom) return `llm · agents from ${item.node.agentsFrom}`;
  if (item.node.agent) return `llm · ${item.node.agent}`;
  if (item.kind === "subgraph") return `${item.node.kind === "call" ? "call" : item.node.kind === "group" ? "group" : "subgraph"} · ${item.node.workflow}${item.node.enabledWhen ? ` · when ${item.node.enabledWhen}` : ""}`;
  if (item.node.skill) return `llm · skill ${item.node.skill}`;
  if (item.kind === "missing") return `subgraph · ${item.node.workflow} (not found)`;
  return item.node.role ? `${item.node.kind} · ${item.node.role}` : item.node.kind;
}

export function nodeAriaLabel(item: Item, report: RunReport | null, entry: RunIndexEntry = EMPTY_ENTRY): string {
  if (item.kind === "terminal") return item.label;
  const cost = report ? (entry.failure ? `failed: ${entry.failure}` : formatUsd(entry.cost)) : null;
  return [title(item), subtitle(item), cost].filter(Boolean).join(", ");
}

function CostLine({ item }: { item: Item }) {
  const { report } = useViewer();
  const { cost, failure } = useEntry(item);
  if (!report) return null;
  if (failure) return <div className="cost cost-unknown">failed: {failure.slice(0, 90)}</div>;
  return (
    <div className={`cost ${cost?.costSource === "unknown" ? "cost-unknown" : ""}`}>
      <strong>{formatUsd(cost)}</strong>
      {cost && <span> · {formatTokens(cost.tokens, cost.cacheTokens)} · {cost.steps} steps · {cost.costSource}</span>}
    </div>
  );
}

function Toggle({ item, expanded }: { item: Item; expanded: boolean }) {
  const { toggle, focusKey } = useViewer();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusKey === item.key) button.current?.focus();
  }, [focusKey, item.key]);
  if (!isGroup(item)) return null;
  const count = item.inner.items.length;
  return (
    <button
      ref={button}
      type="button"
      className="toggle nodrag"
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        toggle(item.key);
      }}
    >
      {expanded ? "▾ collapse" : `▸ expand (${count})`}
    </button>
  );
}

function useOff(item: Item): boolean {
  return isDisabled(item.key, useViewer().disabled);
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const { item } = data;
  const { tier, model } = useEntry(item);
  const off = useOff(item);
  return (
    <div className={`card tier-${tier ?? "none"} kind-${item.kind} ${selected ? "selected" : ""} ${off ? "disabled" : ""}`} title={off ? "switched off in this run" : undefined}>
      <Handles />
      <div className="card-title">{title(item)}</div>
      {off && <div className="card-sub off-label">switched off</div>}
      <div className="card-sub">{subtitle(item)}</div>
      {item.kind !== "terminal" && item.kind !== "agent" && item.node.description && <div className="card-desc">{item.node.description}</div>}
      {tier && <div className="card-sub">{tier}{model ? ` · ${model}` : ""}</div>}
      <CostLine item={item} />
      <Toggle item={item} expanded={false} />
    </div>
  );
}

export function GroupNode({ data, selected }: NodeProps<ClusterFlowNode>) {
  const { item } = data;
  const off = useOff(item);
  return (
    <div className={`group kind-${item.kind} ${selected ? "selected" : ""} ${off ? "disabled" : ""}`} title={off ? "switched off in this run" : undefined}>
      <Handles />
      <div className="group-header">
        <span className="card-title">{title(item)}</span>
        {off && <span className="card-sub off-label"> switched off</span>}
        <span className="card-sub"> {subtitle(item)}</span>
        {item.kind !== "terminal" && item.kind !== "agent" && item.node.description && <div className="card-desc">{item.node.description}</div>}
        <CostLine item={item} />
        <Toggle item={item} expanded />
      </div>
    </div>
  );
}

export function TerminalNode({ data }: NodeProps<TerminalFlowNode>) {
  return (
    <div className="terminal">
      <Handles />
      {data.item.kind === "terminal" ? data.item.label : null}
    </div>
  );
}

export const nodeTypes = { card: CardNode, cluster: GroupNode, terminal: TerminalNode };
