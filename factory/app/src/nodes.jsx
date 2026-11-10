import { Handle, Position } from "@xyflow/react";
import { useViewer } from "./context.js";
import { costOf, formatTokens, formatUsd, isGroup, tierOf } from "./tree.js";

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </>
  );
}

function title(item) {
  if (item.kind === "agent") return item.agent.id;
  return item.node?.id ?? item.label;
}

function subtitle(item) {
  if (item.kind === "agent") return `agent · ${item.agent.role}`;
  if (item.kind === "team") return `llm · ${item.node.agents.length} agents`;
  if (item.kind === "subgraph") return `subgraph · ${item.node.workflow}`;
  if (item.kind === "missing") return `subgraph · ${item.node.workflow} (not found)`;
  return item.node.role ? `${item.node.kind} · ${item.node.role}` : item.node.kind;
}

function CostLine({ item }) {
  const { report } = useViewer();
  if (!report) return null;
  const cost = costOf(item, report);
  return (
    <div className={`cost ${cost?.costSource === "unknown" ? "cost-unknown" : ""}`}>
      <strong>{formatUsd(cost)}</strong>
      {cost && <span> · {formatTokens(cost.tokens, cost.cacheTokens)} · {cost.steps} steps · {cost.costSource}</span>}
    </div>
  );
}

function Toggle({ item, expanded }) {
  const { toggle } = useViewer();
  if (!isGroup(item)) return null;
  const count = item.inner.items.length;
  return (
    <button
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

export function CardNode({ data, selected }) {
  const { item } = data;
  const { config, report } = useViewer();
  const tier = tierOf(item, config, report);
  const model = costOf(item, report)?.model ?? (tier ? report?.tierModels?.[tier] : null);
  return (
    <div className={`card tier-${tier ?? "none"} kind-${item.kind} ${selected ? "selected" : ""}`}>
      <Handles />
      <div className="card-title">{title(item)}</div>
      <div className="card-sub">{subtitle(item)}</div>
      {tier && <div className="card-sub">{tier}{model ? ` · ${model}` : ""}</div>}
      <CostLine item={item} />
      <Toggle item={item} expanded={false} />
    </div>
  );
}

export function GroupNode({ data, selected }) {
  const { item } = data;
  return (
    <div className={`group kind-${item.kind} ${selected ? "selected" : ""}`}>
      <Handles />
      <div className="group-header">
        <span className="card-title">{title(item)}</span>
        <span className="card-sub"> {subtitle(item)}</span>
        <CostLine item={item} />
        <Toggle item={item} expanded />
      </div>
    </div>
  );
}

export function TerminalNode({ data }) {
  return (
    <div className="terminal">
      <Handles />
      {data.item.label}
    </div>
  );
}

export const nodeTypes = { card: CardNode, cluster: GroupNode, terminal: TerminalNode };
