import type { ReactNode } from "react";
import { useViewer } from "./context.ts";
import { costOf, failureOf, formatAmount, formatTokens, formatUsd, ledgerOf, runFailure, tierOf } from "./tree.ts";
import type { Item, LedgerRecord, TeamItem, Workflow, WorkflowAgent, WorkflowItem } from "./types.ts";

function kindLabel(item: WorkflowItem): string {
  if (item.kind === "team") return `llm, ${item.inner.items.length} agents`;
  if (item.kind === "agent") return "agent";
  return item.node.kind;
}

function usd(value: number | null | undefined): string {
  return value == null ? "unknown" : `$${value.toFixed(6)}`;
}

function num(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US");
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LedgerTable({ records }: { records: LedgerRecord[] }) {
  if (records.length === 0) return <p className="muted">No ledger records yet.</p>;
  return (
    <div className="table-wrap" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Node / agent</th>
            <th>Turn</th>
            <th>Model</th>
            <th>In</th>
            <th>Out</th>
            <th>Cache read</th>
            <th>Cache write</th>
            <th>Cost</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td>{r.nodePath.split("/").at(-1)}{r.agentId && r.agentId !== r.nodePath.split("/").at(-1) ? ` / ${r.agentId}` : ""}</td>
              <td>{r.turn}</td>
              <td>{r.model ?? "—"}</td>
              <td>{num(r.inputTokens)}</td>
              <td>{num(r.outputTokens)}</td>
              <td>{num(r.cacheReadTokens)}</td>
              <td>{num((r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0) || null)}</td>
              <td>{usd(r.costUsd)}</td>
              <td className={r.costSource === "unknown" ? "cost-unknown" : ""}>{r.costSource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentTable({ item }: { item: TeamItem }) {
  const { report } = useViewer();
  const byAgent = report?.byNode?.[item.key]?.byAgent;
  const agents: WorkflowAgent[] = item.node.agents ?? item.inner.items.map((i) => ({ id: i.agent.id }));
  return (
    <section>
      <h3>Agents</h3>
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Role</th>
              <th>Tier · model</th>
              <th>Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const agentCost = byAgent?.[a.id];
              return (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{agentCost?.agentName ?? a.role ?? item.node.role}</td>
                  <td>{agentCost ? `${agentCost.tier} · ${agentCost.model}` : "—"}</td>
                  <td>{agentCost ? formatTokens(agentCost.tokens, agentCost.cacheTokens) : "—"}</td>
                  <td className={agentCost?.costSource === "unknown" ? "cost-unknown" : ""}>{formatUsd(agentCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function group<T>(entries: [string, T][], format: (value: T, key: string) => ReactNode) {
  return entries.map(([k, v]) => <Row key={k} label={k} value={format(v, k)} />);
}

function allNodes(workflow: Workflow, workflows: Workflow[], prefix = "", seen: string[] = []): (Workflow["nodes"][number] & { at: string })[] {
  return workflow.nodes.flatMap((n) => {
    const here = { ...n, at: `${prefix}${n.id}` };
    const inner = n.workflow ? workflows.find((w) => w.name === n.workflow) : undefined;
    if (!inner || seen.includes(inner.name)) return [here];
    return [here, ...allNodes(inner, workflows, n.kind === "group" ? prefix : `${prefix}${n.id}/`, [...seen, workflow.name])];
  });
}

function WorkflowSummary() {
  const { workflow, config, workflows } = useViewer();
  if (!workflow) return <p className="muted">No workflow selected.</p>;
  const kinds = workflow.nodes.reduce<Record<string, number>>((acc, n) => ({ ...acc, [n.kind]: (acc[n.kind] ?? 0) + 1 }), {});
  const nodes = allNodes(workflow, workflows);
  const agents = [...new Set(nodes.flatMap((n) => [n.agent, n.skill ? `skill ${n.skill}` : undefined, ...(n.agents ?? []).map((a) => (a as { agent?: string }).agent)]).filter((a): a is string => Boolean(a)))];
  const loops = nodes.filter((n) => n.maxVisits).map((n) => `${n.at} (max ${n.maxVisits})`);
  const switched = nodes.filter((n) => n.enabledWhen).map((n) => `${n.at}: ${n.enabledWhen}`);
  const writers = nodes.filter((n) => n.tools?.some((t) => t !== "read")).map((n) => `${n.at}: ${n.tools!.join(", ")}`);
  const steps = nodes.filter((n) => !["group", "subgraph", "call"].includes(n.kind)).length;
  const roles = Object.fromEntries(nodes.flatMap((n) => [n.role, ...(n.agents ?? []).map((a) => (a as { role?: string }).role)]).filter((r): r is string => Boolean(r)).map((r) => [r, r]));
  return (
    <section>
      <h2>{workflow.name}</h2>
      <p className="muted">Configuration only: no run, no cost.</p>
      <Row label="Version" value={workflow.version} />
      {workflow.source && <Row label="Source" value={workflow.source} />}
      <Row label="Entry" value={workflow.entry} />
      <Row label="Nodes on this level" value={Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(", ")} />
      <Row label="Steps in total (groups, subgraphs and calls expanded)" value={steps} />
      <Row label="Edges" value={workflow.edges.length} />
      <h3>Roles → tier</h3>
      {Object.keys(roles).length ? Object.keys(roles).sort().map((role) => <Row key={role} label={role} value={config?.roles?.[role] ?? `${workflow.roles?.[role] ?? "?"} (workflow default)`} />) : <p className="muted">No LLM step.</p>}
      <h3>Agents and skills</h3>
      {agents.length ? agents.map((a) => <Row key={a} label={a} value="" />) : <p className="muted">None.</p>}
      <h3>Write access</h3>
      {writers.length ? writers.map((w) => <Row key={w} label={w} value="" />) : <p className="muted">Every agent is read-only.</p>}
      <h3>Loops (maxVisits)</h3>
      {loops.length ? <p>{loops.join(", ")}</p> : <p className="muted">None.</p>}
      <h3>Switches</h3>
      {switched.length ? switched.map((s) => <Row key={s} label={s} value="" />) : <p className="muted">None.</p>}
      {Object.entries(config?.switches ?? {}).map(([k, v]) => <Row key={k} label={`config switches.${k}`} value={String(v)} />)}
    </section>
  );
}

function RunSummary() {
  const { run, report, config, mode } = useViewer();
  if (mode === "workflows") return <WorkflowSummary />;
  if (!report) {
    return (
      <section>
        <h2>Workflow</h2>
        <p className="muted">No run selected. Roles and tiers come from the factory config.</p>
        {Object.entries(config?.roles ?? {}).map(([role, tier]) => <Row key={role} label={role} value={tier} />)}
      </section>
    );
  }
  const runError = runFailure(run);
  return (
    <section>
      <h2>Run {report.runId}</h2>
      {report.synthetic && <p className="cost-unknown" role="note">Fake test model: costs are synthetic</p>}
      <Row label="Goal" value={run?.goal} />
      <Row label="Status" value={report.status} />
      {runError && <p className="cost-unknown">{runError}</p>}
      <Row label="Cost" value={`${formatAmount(report.cost.costUsd, report.coverage?.run)} of ${usd(report.cost.budgetUsd)} (${Math.round(report.cost.budgetRatio * 100)}%)`} />
      <Row label="Tokens (in + out)" value={num(report.cost.tokens)} />
      <Row label="Cache tokens (read + write)" value={num(report.cacheTokens ?? 0)} />
      <Row label="Steps" value={report.cost.steps} />
      <Row label="Cost source" value={report.cost.source} />
      <Row label="Harness" value={report.backend?.kind === "cli" ? `${report.backend.cli} CLI` : report.backend?.kind ?? "—"} />
      <h3>Requested tier → model</h3>
      {group(Object.entries(report.tierModels ?? {}), (v) => v)}
      <h3>Models that actually ran</h3>
      {Object.keys(report.byModel ?? {}).length ? group(Object.entries(report.byModel), (v, k) => formatAmount(v, report.coverage?.byModel?.[k])) : <p className="muted">None. No LLM step finished in this run.</p>}
      <h3>Cost by tier</h3>
      {group(Object.entries(report.byTier ?? {}), (v, k) => formatAmount(v, report.coverage?.byTier?.[k]))}
      <h3>LLM steps by cost source</h3>
      {group(Object.entries(report.byCostSource ?? {}), (v) => v)}
      <p className="muted">Click a node to see its agents, ledger records and questions.</p>
    </section>
  );
}

export function Details({ item }: { item: Item | null }) {
  const { run, report, config } = useViewer();
  if (!item || item.kind === "terminal") return <RunSummary />;
  const cost = costOf(item, report);
  const tier = tierOf(item, config, report);
  const question = item.kind !== "agent" ? item.node.question : null;
  const records = ledgerOf(item, run);
  const outputs = records.filter((r) => r.output ?? r.outputPreview);
  const harnessAgent = records.find((r) => r.agentName)?.agentName ?? item.node.agent;
  const role = item.kind === "agent" ? (item.agent.role ?? item.node.role) : item.node.role;
  const failure = failureOf(item, run);
  const switchedOff = run?.events.find((e) => e.type === "node_completed" && typeof e.result === "string" && e.result.includes("skipped: switch off") && (item.key === e.node || item.key.startsWith(`${e.node}/`)))?.result ?? null;
  return (
    <section>
      <h2>{item.kind === "agent" ? `${item.agent.id} (agent of ${item.node.id})` : item.node.id}</h2>
      <Row label="Path" value={item.kind === "agent" ? `${item.nodePath} / ${item.agent.id}` : item.key} />
      <Row label="Kind" value={kindLabel(item)} />
      {item.node.enabledWhen && <Row label="Enabled when" value={item.node.enabledWhen} />}
      {switchedOff && <Row label="Status" value={`switched off in this run: ${switchedOff}`} />}
      {item.node.run && <Row label="Runs" value={item.node.run} />}
      {item.node.skill && <Row label="Skill" value={item.node.skill} />}
      {item.node.agentsFrom && <Row label="Agents from" value={item.node.agentsFrom} />}
      {item.node.tools && <Row label="Tools" value={item.node.tools.join(", ")} />}
      {item.node.dirs && <Row label="Extra dirs" value={item.node.dirs.join(", ")} />}
      {item.node.op && <Row label="Operation" value={item.node.op} />}
      {item.node.with && <Row label="Operation args" value={JSON.stringify(item.node.with)} />}
      {item.node.parse && <Row label="Parser" value={item.node.parse} />}
      {item.node.maxVisits && <Row label="Max visits" value={item.node.maxVisits} />}
      {item.node.input && <Row label="Call input" value={Object.entries(item.node.input).map(([k, v]) => `${k} = ${v}`).join("; ")} />}
      {harnessAgent && <Row label="Harness agent" value={harnessAgent} />}
      {role && <Row label="Role" value={role} />}
      {tier && <Row label="Tier" value={tier} />}
      {cost?.model && <Row label="Model" value={cost.model} />}
      {failure && <p className="cost-unknown">Failed: {failure}</p>}
      {report && <Row label="Cost" value={formatUsd(cost)} />}
      {cost && <Row label="Tokens (in + out)" value={num(cost.tokens)} />}
      {cost && <Row label="Cache tokens (read + write)" value={num(cost.cacheTokens ?? 0)} />}
      {cost && <Row label="Steps" value={cost.steps} />}
      {cost && <Row label="Cost source" value={cost.costSource} />}
      {question && (
        <section>
          <h3>Question to the user</h3>
          <p>{question.text}</p>
          <Row label="Allowed" value={(question.allowed ?? []).join(", ") || "free text"} />
          {run && <Row label="Answer" value={run.answers?.[question.id] ?? "not answered"} />}
        </section>
      )}
      {item.kind === "team" && <AgentTable item={item} />}
      {run && (
        <section>
          <h3>Ledger records</h3>
          <LedgerTable records={records} />
        </section>
      )}
      {!run && item.kind !== "agent" && item.node.prompt && (
        <section>
          <h3>Prompt template</h3>
          <pre>{item.node.prompt}</pre>
        </section>
      )}
      {outputs.length > 0 && (
        <section>
          <h3>Output</h3>
          {outputs.map((r, i) => (
            <div key={i}>
              {outputs.length > 1 && <p className="muted">{r.agentId ?? r.nodePath}</p>}
              <pre>{r.output ?? `${r.outputPreview} (first 200 characters only)`}</pre>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
