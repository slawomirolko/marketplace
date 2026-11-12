import { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { useViewer } from "./context.ts";
import { formatTokens, formatUsd, isDisabled, isGroup, isLive, ranIn } from "./tree.ts";
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

function subtitle(item: Item, mainAgent: string | null = null): string {
  if (item.kind === "terminal") return item.label;
  if (item.kind === "agent") return `agent · ${item.agent.role}`;
  if (item.kind === "team") return `llm · ${item.inner.items.length} agents`;
  if (item.node.agentsFrom) return `llm · agents from ${item.node.agentsFrom}`;
  if (item.node.agent) return `llm · ${item.node.agent}`;
  if (item.kind === "subgraph") return `${item.node.kind === "call" ? "call" : item.node.kind === "group" ? "group" : "subgraph"} · ${item.node.workflow}${item.node.enabledWhen ? ` · when ${item.node.enabledWhen}` : ""}`;
  if (item.node.skill) return `llm · skill ${item.node.skill}`;
  if (item.kind === "missing") return `subgraph · ${item.node.workflow} (not found)`;
  if (item.node.kind === "script") return mainAgent ? `script · run for ${mainAgent}` : "script · run by the factory";
  return item.node.role ? `${item.node.kind} · ${item.node.role}` : item.node.kind;
}

export function nodeAriaLabel(item: Item, report: RunReport | null, entry: RunIndexEntry = EMPTY_ENTRY): string {
  if (item.kind === "terminal") return item.label;
  const cost = report ? (entry.failure ? `failed: ${entry.failure}` : formatUsd(entry.cost)) : null;
  return [title(item), subtitle(item), cost].filter(Boolean).join(", ");
}

function CostLine({ item }: { item: Item }) {
  const { report, run } = useViewer();
  const { cost, failure } = useEntry(item);
  if (!report) return null;
  if (failure) return <div className="cost cost-unknown">failed: {failure.slice(0, 90)}</div>;
  if (!cost && ranIn(item, run)) return <div className="cost muted">ran · no model cost</div>;
  if (cost && item.kind === "step" && (item.node.kind === "script" || item.node.kind === "interrupt") && cost.costUsd === 0) {
    return <div className="cost muted">{item.node.kind === "interrupt" ? "question" : "script"} · no model cost</div>;
  }
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

function useNotRun(item: Item): boolean {
  const { run, mode } = useViewer();
  return mode === "runs" && run !== null && item.kind !== "terminal" && !ranIn(item, run);
}

function useLive(item: Item): { className: string; label: string | null } {
  const { live } = useViewer();
  if (item.kind === "terminal" || !isLive(item, live)) return { className: "", label: null };
  const waiting = live.waiting !== null && (live.waiting === item.key || (item.kind !== "agent" && isLive(item, { node: live.waiting, agents: [], waiting: live.waiting })));
  return { className: waiting ? "live waiting" : "live", label: waiting ? "waiting for your answer" : "running now" };
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const { item } = data;
  const { tier, model } = useEntry(item);
  const off = useOff(item);
  const live = useLive(item);
  const notRun = useNotRun(item) && !off;
  const { mainAgent } = useViewer();
  return (
    <div className={`${notRun ? "not-run " : ""}card tier-${tier ?? "none"} kind-${item.kind} ${item.kind === "step" ? `node-${item.node.kind}` : ""} ${selected ? "selected" : ""} ${off ? "disabled" : ""} ${live.className}`} title={off ? "switched off in this run" : undefined}>
      <Handles />
      <div className="card-title">{title(item)}</div>
      {live.label && <div className="card-sub live-label">● {live.label}</div>}
      {off && <div className="card-sub off-label">switched off</div>}
      <div className="card-sub">{subtitle(item, mainAgent)}</div>
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
  const live = useLive(item);
  const notRun = useNotRun(item) && !off;
  const { mainAgent } = useViewer();
  return (
    <div className={`${notRun ? "not-run " : ""}group kind-${item.kind} ${selected ? "selected" : ""} ${off ? "disabled" : ""} ${live.className}`} title={off ? "switched off in this run" : undefined}>
      <Handles />
      <div className="group-header">
        <span className="card-title">{title(item)}</span>
        {live.label && <span className="card-sub live-label"> ● {live.label}</span>}
        {off && <span className="card-sub off-label"> switched off</span>}
        <span className="card-sub"> {subtitle(item, mainAgent)}</span>
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
