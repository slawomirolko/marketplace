import { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { useViewer } from "./context.ts";
import { formatDuration, formatTokens, formatUsd } from "./format.ts";
import { humanLabel } from "./human.ts";
import type { CardFlowNode, ClusterFlowNode, TerminalFlowNode } from "./layout.ts";
import { isLive } from "./live.ts";
import { EMPTY_ENTRY, isRequired, nodeSubtitle, nodeTitle } from "./node-labels.ts";
import { ranIn } from "./run-facts.ts";
import { isDisabled } from "./switches.ts";
import { agentScripts, hasMemoryLayer, isGroup } from "./tree.ts";
import type { Item, RunIndexEntry } from "./types.ts";

/** The longest failure text shown on a card; the details panel shows all of it. */
const FAILURE_CHARS = 90;

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

function CostLine({ item }: { item: Item }) {
  const { report, run } = useViewer();
  const { cost, failure } = useEntry(item);
  if (!report) return null;
  if (failure) return <div className="cost cost-unknown">failed: {failure.slice(0, FAILURE_CHARS)}</div>;
  if (!cost && ranIn(item, run)) return <div className="cost muted">ran · no model cost</div>;
  if (cost && item.kind === "step" && (item.node.kind === "script" || item.node.kind === "interrupt") && cost.costUsd === 0) {
    return <div className="cost muted">{item.node.kind === "interrupt" ? "question" : "engine script"} · no model cost</div>;
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
      data-testid={`group-toggle-${item.key}`}
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

function useStale(item: Item): string | null {
  const { stale } = useViewer();
  if (item.kind === "terminal" || item.kind === "agent" || !item.node.workflow) return null;
  const entry = stale[item.node.workflow];
  return entry ? [...entry.changed, ...entry.missing.map((name) => `${name} (missing)`)].join(", ") : null;
}

function useLive(item: Item): { className: string; label: string | null } {
  const { live } = useViewer();
  if (item.kind === "terminal" || !isLive(item, live)) return { className: "", label: null };
  const waiting = live.waiting !== null && (live.waiting === item.key || (item.kind !== "agent" && isLive(item, { node: live.waiting, agents: [], waiting: live.waiting })));
  return { className: waiting ? "live waiting" : "live", label: waiting ? "waiting for your answer" : "running now" };
}

function RunBadge({ item }: { item: Item }) {
  const { showCounts, mode } = useViewer();
  const { runs, timeMs } = useEntry(item);
  if (!showCounts || mode !== "runs" || runs === null) return null;
  const time = timeMs === null ? null : formatDuration(timeMs);
  const counted = item.kind === "subgraph" ? `${runs} step runs inside this group` : `ran ${runs} time${runs === 1 ? "" : "s"} in this run`;
  const label = time === null ? counted : `${counted}, ${time} in total`;
  return (
    <span className={`run-badge${item.kind === "subgraph" ? " run-badge-sum" : ""}`} title={label} aria-label={label}>
      {runs}
      {time !== null && <span className="run-time">{time}</span>}
    </span>
  );
}

function HumanMark({ item }: { item: Item }) {
  const { humans, openQuestions } = useViewer();
  const icon = humans.get(item.key);
  if (!icon) return null;
  const label = humanLabel(icon);
  return (
    <button
      type="button"
      className={`human-icon human-${icon.role} nodrag`}
      data-testid={`human-icon-${item.key}`}
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        openQuestions(item);
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <circle cx="8" cy="4.5" r="3" />
        <path d="M2 15c0-3.6 2.7-6 6-6s6 2.4 6 6z" />
      </svg>
    </button>
  );
}

function AgentScripts({ item }: { item: Item }) {
  const { agents, onlyAgents } = useViewer();
  const scripts = agentScripts(item, agents);
  if (!scripts.length) return null;
  const names = scripts.map((script) => script.name).join(", ");
  if (onlyAgents) return <div className="card-sub agent-script-list" title={names}>scripts: {names}</div>;
  return (
    <ul className="agent-scripts" aria-label="scripts of this agent">
      {scripts.map((script) => (
        <li key={script.file} className="agent-script" title={script.file}>
          {script.name} <span className="muted">· {script.skill}</span>
        </li>
      ))}
    </ul>
  );
}

function MemoryMark({ item }: { item: Item }) {
  const { agents, config } = useViewer();
  if (!hasMemoryLayer(item, agents)) return null;
  const label = `memory layer attached: ${config?.memoryLayer ?? "olko-memory-layer"}`;
  return (
    <svg className="memory-mark" viewBox="0 0 16 16" width="16" height="16" role="img" aria-label={label}>
      <title>{label}</title>
      <path d="M1.5 1.5h10l3 3v10h-13z" fill="#000" />
      <rect x="4" y="2" width="6" height="4" fill="#fff" />
      <rect x="8" y="2.8" width="1.3" height="2.4" fill="#000" />
      <rect x="3.5" y="8.5" width="9" height="5.5" rx="0.5" fill="#fff" />
    </svg>
  );
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const { item } = data;
  const { tier, model } = useEntry(item);
  const off = useOff(item);
  const live = useLive(item);
  const notRun = useNotRun(item) && !off;
  const staleSource = useStale(item);
  const required = isRequired(item);
  return (
    <>
      <div className={`${notRun ? "not-run " : ""}${staleSource ? "stale " : ""}card tier-${tier ?? "none"} kind-${item.kind} ${item.kind === "step" ? `node-${item.node.kind}` : ""} ${selected ? "selected" : ""} ${off ? "disabled" : ""} ${live.className}`} title={off ? "switched off in this run" : undefined}>
        <Handles />
        <div className="card-title">
          <HumanMark item={item} />
          {nodeTitle(item)}
        </div>
        {live.label && <div className="card-sub live-label">● {live.label}</div>}
        {staleSource && <div className="card-sub stale-label">⚠ source changed</div>}
        {off && <div className={`card-sub off-label${required ? " required-off" : ""}`}>{required ? "required step switched off" : "switched off"}</div>}
        <div className="card-sub">{nodeSubtitle(item)}</div>
        {item.kind !== "terminal" && item.kind !== "agent" && item.node.description && <div className="card-desc">{item.node.description}</div>}
        {tier && <div className="card-sub">{tier}{model ? ` · ${model}` : ""}</div>}
        <CostLine item={item} />
        <AgentScripts item={item} />
        <Toggle item={item} expanded={false} />
      </div>
      <MemoryMark item={item} />
      <RunBadge item={item} />
    </>
  );
}

export function GroupNode({ data, selected }: NodeProps<ClusterFlowNode>) {
  const { item } = data;
  const off = useOff(item);
  const live = useLive(item);
  const notRun = useNotRun(item) && !off;
  const staleSource = useStale(item);
  const required = isRequired(item);
  return (
    <>
      <div className={`${notRun ? "not-run " : ""}${staleSource ? "stale " : ""}group kind-${item.kind} ${selected ? "selected" : ""} ${off ? "disabled" : ""} ${live.className}`} title={off ? "switched off in this run" : undefined}>
        <Handles />
        <div className="group-header">
          <span className="card-title">
            <HumanMark item={item} />
            {nodeTitle(item)}
          </span>
          {live.label && <span className="card-sub live-label"> ● {live.label}</span>}
          {staleSource && <div className="card-sub stale-label">⚠ source changed since the YAML was written: {staleSource}</div>}
          {off && <span className={`card-sub off-label${required ? " required-off" : ""}`}> {required ? "required step switched off" : "switched off"}</span>}
          <span className="card-sub"> {nodeSubtitle(item)}</span>
          {item.kind !== "terminal" && item.kind !== "agent" && item.node.description && <div className="card-desc">{item.node.description}</div>}
          <CostLine item={item} />
          <Toggle item={item} expanded />
        </div>
      </div>
      <RunBadge item={item} />
    </>
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
