import type { ReactNode } from "react";
import { useViewer } from "./context.ts";
import { formatAmount, formatCost, formatCount, formatDuration, formatTokens, formatUsd } from "./format.ts";
import { kindLabel } from "./node-labels.ts";
import { costOf, failureOf, itemPasses, ledgerOf, rawFailureOf, runFailure, tierOf, timeSpent } from "./run-facts.ts";
import { switchedOffResult } from "./switches.ts";
import { allNodes } from "./tree.ts";
import type { Item, LedgerRecord, TeamItem, WorkflowAgent, WorkflowItem } from "./types.ts";

/** Output previews are cut by the backend to this many characters. */
const PREVIEW_CHARS = 200;

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
          {records.map((record, index) => (
            <tr key={index}>
              <td>{record.nodePath.split("/").at(-1)}{record.agentId && record.agentId !== record.nodePath.split("/").at(-1) ? ` / ${record.agentId}` : ""}</td>
              <td>{record.turn}</td>
              <td>{record.model ?? "—"}</td>
              <td>{formatCount(record.inputTokens)}</td>
              <td>{formatCount(record.outputTokens)}</td>
              <td>{formatCount(record.cacheReadTokens)}</td>
              <td>{formatCount((record.cacheWrite5mTokens ?? 0) + (record.cacheWrite1hTokens ?? 0) || null)}</td>
              <td>{formatCost(record.costUsd)}</td>
              <td className={record.costSource === "unknown" ? "cost-unknown" : ""}>{record.costSource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PassTimes({ item }: { item: WorkflowItem }) {
  const { run, report } = useViewer();
  const passes = itemPasses(item, report);
  if (!run || passes.length === 0) return null;
  const total = timeSpent(item, report);
  const waited = passes.reduce((sum, pass) => sum + pass.waitMs, 0);
  if (item.kind === "subgraph") {
    return (
      <section>
        <h3>Time</h3>
        <Row label="Total" value={`${formatDuration(total)} over ${passes.length} step run${passes.length === 1 ? "" : "s"} inside`} />
        {waited > 0 && <Row label="Waiting for answers" value={`${formatDuration(waited)} (not counted)`} />}
      </section>
    );
  }
  return (
    <section>
      <h3>Time</h3>
      <Row label="Total" value={formatDuration(total)} />
      <div className="table-wrap" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>Pass</th>
              <th>Started</th>
              <th>Status</th>
              <th>Time</th>
              {waited > 0 && <th>Waiting for answer</th>}
            </tr>
          </thead>
          <tbody>
            {passes.map((pass, index) => (
              <tr key={`${pass.startedAt}|${index}`}>
                <td>{pass.visit ?? index + 1}</td>
                <td title={pass.startedAt}>{new Date(pass.startedAt).toLocaleTimeString([], { hour12: false })}</td>
                <td>{pass.status}</td>
                <td>{formatDuration(pass.durationMs)}</td>
                {waited > 0 && <td>{pass.waitMs ? formatDuration(pass.waitMs) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {waited > 0 && <p className="muted">Time waiting for a user answer is not counted in the pass time.</p>}
    </section>
  );
}

function AgentTable({ item }: { item: TeamItem }) {
  const { report } = useViewer();
  const byAgent = report?.byNode?.[item.key]?.byAgent;
  const agents: WorkflowAgent[] = item.node.agents ?? item.inner.items.map((member) => ({ id: member.agent.id }));
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
            {agents.map((agent) => {
              const agentCost = byAgent?.[agent.id];
              return (
                <tr key={agent.id}>
                  <td>{agent.id}</td>
                  <td>{agentCost?.agentName ?? agent.role ?? item.node.role}</td>
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
  return entries.map(([key, value]) => <Row key={key} label={key} value={format(value, key)} />);
}

function AgentSection({ names }: { names: string[] }) {
  const { agents } = useViewer();
  const known = names.map((name) => agents[name]).filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  if (!known.length) return null;
  return (
    <>
      {known.map((agent) => (
        <section key={agent.name}>
          <h3>{agent.kind === "skill" ? "Skill" : "Agent"}: {agent.name}</h3>
          <p>{agent.description}</p>
          <Row label="Definition" value={agent.file} />
          {agent.kind !== "skill" && (
            <>
              <h3>Skills this agent may use</h3>
              {agent.skills.length ? (
                <ul className="skills">
                  {agent.skills.map((skill) => (
                    <li key={skill.name}>
                      <strong>{skill.name}</strong>
                      <span className="muted">{skill.description || "no description"} · {skill.file}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">None declared.</p>
              )}
              {agent.missing.length > 0 && <p className="cost-unknown">Declared but not in the marketplace: {agent.missing.join(", ")}</p>}
            </>
          )}
        </section>
      ))}
    </>
  );
}

function WorkflowSummary() {
  const { workflow, config, workflows } = useViewer();
  if (!workflow) return <p className="muted">No workflow selected.</p>;
  const kinds = workflow.nodes.reduce<Record<string, number>>((counts, node) => ({ ...counts, [node.kind]: (counts[node.kind] ?? 0) + 1 }), {});
  const nodes = allNodes(workflow, workflows);
  const agents = [...new Set(nodes.flatMap((node) => [node.agent, node.skill ? `skill ${node.skill}` : undefined, ...(node.agents ?? []).map((agent) => agent.agent)]).filter((name): name is string => Boolean(name)))];
  const loops = nodes.filter((node) => node.maxVisits).map((node) => `${node.at} (max ${node.maxVisits})`);
  const switched = nodes.filter((node) => node.enabledWhen).map((node) => `${node.at}: ${node.enabledWhen}`);
  const writers = nodes.filter((node) => node.tools?.some((tool) => tool !== "read")).map((node) => `${node.at}: ${node.tools!.join(", ")}`);
  const steps = nodes.filter((node) => !["group", "subgraph", "call"].includes(node.kind)).length;
  const roles = [...new Set(nodes.flatMap((node) => [node.role, ...(node.agents ?? []).map((agent) => agent.role)]).filter((role): role is string => Boolean(role)))];
  return (
    <section>
      <h2>{workflow.name}</h2>
      {workflow.description && <p>{workflow.description}</p>}
      <p className="muted">Configuration only: no run, no cost.</p>
      <Row label="Version" value={workflow.version} />
      {workflow.source && <Row label="Source" value={workflow.source} />}
      <Row label="Entry" value={workflow.entry} />
      <Row label="Nodes on this level" value={Object.entries(kinds).map(([kind, count]) => `${count} ${kind}`).join(", ")} />
      <Row label="Steps in total (groups, subgraphs and calls expanded)" value={steps} />
      <Row label="Edges" value={workflow.edges.length} />
      <h3>Roles → tier</h3>
      {roles.length ? roles.sort().map((role) => <Row key={role} label={role} value={config?.roles?.[role] ?? `${workflow.roles?.[role] ?? "?"} (workflow default)`} />) : <p className="muted">No LLM step.</p>}
      <h3>Agents and skills</h3>
      {agents.length ? agents.map((name) => <Row key={name} label={name} value="" />) : <p className="muted">None.</p>}
      <h3>Write access</h3>
      {writers.length ? writers.map((writer) => <Row key={writer} label={writer} value="" />) : <p className="muted">Every agent is read-only.</p>}
      <h3>Loops (maxVisits)</h3>
      {loops.length ? <p>{loops.join(", ")}</p> : <p className="muted">None.</p>}
      <h3>Switches</h3>
      {switched.length ? switched.map((entry) => <Row key={entry} label={entry} value="" />) : <p className="muted">None.</p>}
      {Object.entries(config?.switches ?? {}).map(([name, value]) => <Row key={name} label={`config switches.${name}`} value={String(value)} />)}
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
      <Row label="Cost" value={`${formatAmount(report.cost.costUsd, report.coverage?.run)} of ${formatCost(report.cost.budgetUsd)} (${Math.round(report.cost.budgetRatio * 100)}%)`} />
      <Row label="Tokens (in + out)" value={formatCount(report.cost.tokens)} />
      <Row label="Cache tokens (read + write)" value={formatCount(report.cacheTokens ?? 0)} />
      <Row label="Steps" value={report.cost.steps} />
      <Row label="Cost source" value={report.cost.source} />
      <Row label="Harness" value={report.backend?.kind === "cli" ? `${report.backend.cli} CLI` : report.backend?.kind ?? "—"} />
      <h3>Requested tier → model</h3>
      {group(Object.entries(report.tierModels ?? {}), (model) => model)}
      <h3>Models that actually ran</h3>
      {Object.keys(report.byModel ?? {}).length ? group(Object.entries(report.byModel), (cost, model) => formatAmount(cost, report.coverage?.byModel?.[model])) : <p className="muted">None. No LLM step finished in this run.</p>}
      <h3>Cost by tier</h3>
      {group(Object.entries(report.byTier ?? {}), (cost, tier) => formatAmount(cost, report.coverage?.byTier?.[tier]))}
      <h3>LLM steps by cost source</h3>
      {group(Object.entries(report.byCostSource ?? {}), (count) => count)}
      <p className="muted">Click a node to see its agents, ledger records and questions.</p>
    </section>
  );
}

export function Details({ item }: { item: Item | null }) {
  const { run, report, config, workflows } = useViewer();
  if (!item || item.kind === "terminal") return <RunSummary />;
  const cost = costOf(item, report);
  const tier = tierOf(item, config, report);
  const question = item.kind !== "agent" ? item.node.question : null;
  const records = ledgerOf(item, run);
  const outputs = records.filter((record) => record.output ?? record.outputPreview);
  const harnessAgent = records.find((record) => record.agentName)?.agentName ?? item.node.agent;
  const role = item.kind === "agent" ? (item.agent.role ?? item.node.role) : item.node.role;
  const failure = failureOf(item, run);
  const groupDescription = item.kind === "subgraph" && item.node.workflow ? (workflows.find((candidate) => candidate.name === item.node.workflow)?.description ?? null) : null;
  const agentNames = item.kind === "agent" ? [item.agent.agentName ?? item.node.agent].filter((name): name is string => Boolean(name)) : [item.node.agent, item.node.skill, ...(item.node.agents ?? []).map((agent) => agent.agent)].filter((name): name is string => Boolean(name));
  const switchedOff = switchedOffResult(run, item.key);
  return (
    <section>
      <h2>{item.kind === "agent" ? `${item.agent.id} (agent of ${item.node.id})` : item.node.id}</h2>
      <Row label="Path" value={item.kind === "agent" ? `${item.nodePath} / ${item.agent.id}` : item.key} />
      <Row label="Kind" value={kindLabel(item)} />
      {item.kind !== "agent" && item.node.description && <p>{item.node.description}</p>}
      {groupDescription && <p className="muted">{groupDescription}</p>}
      {item.node.enabledWhen && <Row label="Enabled when" value={item.node.enabledWhen} />}
      {switchedOff && <Row label="Status" value={`switched off in this run: ${switchedOff}`} />}
      {item.node.run && <Row label="Runs" value={item.node.run} />}
      {item.node.skill && <Row label="Skill" value={item.node.skill} />}
      {item.node.agentsFrom && <Row label="Agents from" value={item.node.agentsFrom} />}
      {item.node.tools && <Row label="Tools" value={item.node.tools.join(", ")} />}
      {item.node.dirs && <Row label="Extra dirs" value={item.node.dirs.join(", ")} />}
      {item.node.op && <Row label="Operation" value={item.node.op} />}
      {item.node.with && <Row label="Operation args" value={JSON.stringify(item.node.with)} />}
      {item.node.parse && <Row label="Parser" value={typeof item.node.parse === "string" ? item.node.parse : JSON.stringify(item.node.parse)} />}
      {item.node.maxVisits && <Row label="Max visits" value={item.node.maxVisits} />}
      {item.node.input && <Row label="Call input" value={Object.entries(item.node.input).map(([name, value]) => `${name} = ${value}`).join("; ")} />}
      {harnessAgent && <Row label="Harness agent" value={harnessAgent} />}
      {role && <Row label="Role" value={role} />}
      {tier && <Row label="Tier" value={tier} />}
      {cost?.model && <Row label="Model" value={cost.model} />}
      {failure && (
        <p className="cost-unknown" title={rawFailureOf(item, run) ?? undefined}>
          Failed: {failure}
        </p>
      )}
      {report && <Row label="Cost" value={formatUsd(cost)} />}
      {cost && <Row label="Tokens (in + out)" value={formatCount(cost.tokens)} />}
      {cost && <Row label="Cache tokens (read + write)" value={formatCount(cost.cacheTokens ?? 0)} />}
      {cost && <Row label="Steps" value={cost.steps} />}
      {cost && <Row label="Cost source" value={cost.costSource} />}
      <PassTimes item={item} />
      {question && (
        <section>
          <h3>Question to the user</h3>
          <p>{question.text}</p>
          <Row label="Allowed" value={(question.allowed ?? []).join(", ") || "free text"} />
          {run && <Row label="Answer" value={run.answers?.[question.id] ?? "not answered"} />}
        </section>
      )}
      {item.kind === "team" && <AgentTable item={item} />}
      <AgentSection names={[...new Set(agentNames)]} />
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
          {outputs.map((record, index) => (
            <div key={index}>
              {outputs.length > 1 && <p className="muted">{record.agentId ?? record.nodePath}</p>}
              <pre>{record.output ?? `${record.outputPreview} (first ${PREVIEW_CHARS} characters only)`}</pre>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
