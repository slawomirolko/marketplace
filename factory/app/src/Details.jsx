import { useViewer } from "./context.js";
import { costOf, failureOf, formatAmount, formatTokens, formatUsd, ledgerOf, runFailure, tierOf } from "./tree.js";

function usd(value) {
  return value == null ? "unknown" : `$${value.toFixed(6)}`;
}

function num(value) {
  return value == null ? "—" : value.toLocaleString("en-US");
}

function Row({ label, value }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LedgerTable({ records }) {
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

function AgentTable({ item }) {
  const { report } = useViewer();
  const byAgent = report?.byNode?.[item.key]?.byAgent;
  const agents = item.node?.agents ?? item.inner?.items.map((i) => ({ id: i.agent.id })) ?? null;
  if (!agents) return null;
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
              const c = byAgent?.[a.id];
              return (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{c?.agentName ?? a.role ?? item.node.role}</td>
                  <td>{c ? `${c.tier} · ${c.model}` : "—"}</td>
                  <td>{c ? formatTokens(c.tokens, c.cacheTokens) : "—"}</td>
                  <td className={c?.costSource === "unknown" ? "cost-unknown" : ""}>{formatUsd(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunSummary() {
  const { run, report, config } = useViewer();
  if (!report) {
    return (
      <section>
        <h2>Workflow</h2>
        <p className="muted">No run selected. Roles and tiers come from the factory config.</p>
        {Object.entries(config?.roles ?? {}).map(([role, tier]) => <Row key={role} label={role} value={tier} />)}
      </section>
    );
  }
  const group = (entries, format) => entries.map(([k, v]) => <Row key={k} label={k} value={format(v, k)} />);
  return (
    <section>
      <h2>Run {report.runId}</h2>
      <Row label="Goal" value={run.goal} />
      <Row label="Status" value={report.status} />
      {runFailure(run) && <p className="cost-unknown">{runFailure(run)}</p>}
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

export function Details({ item }) {
  const { run, report, config } = useViewer();
  if (!item || item.kind === "terminal") return <RunSummary />;
  const cost = costOf(item, report);
  const tier = tierOf(item, config, report);
  const question = item.kind !== "agent" ? item.node?.question : null;
  const records = ledgerOf(item, run);
  const outputs = records.filter((r) => r.output ?? r.outputPreview);
  return (
    <section>
      <h2>{item.kind === "agent" ? `${item.agent.id} (agent of ${item.node.id})` : item.node.id}</h2>
      <Row label="Path" value={item.kind === "agent" ? `${item.nodePath} / ${item.agent.id}` : item.key} />
      <Row label="Kind" value={item.kind === "team" ? `llm, ${item.inner.items.length} agents` : item.kind === "agent" ? "agent" : item.node.kind} />
      {item.node?.run && <Row label="Runs" value={item.node.run} />}
      {(item.node?.agent || records.find((r) => r.agentName)?.agentName) && <Row label="Harness agent" value={records.find((r) => r.agentName)?.agentName ?? item.node.agent} />}
      {(item.agent?.role ?? item.node.role) && <Row label="Role" value={item.agent?.role ?? item.node.role} />}
      {tier && <Row label="Tier" value={tier} />}
      {cost?.model && <Row label="Model" value={cost.model} />}
      {failureOf(item, run) && <p className="cost-unknown">Failed: {failureOf(item, run)}</p>}
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
          <Row label="Answer" value={run?.answers?.[question.id] ?? "not answered"} />
        </section>
      )}
      {item.kind === "team" && <AgentTable item={item} />}
      {run && (
        <section>
          <h3>Ledger records</h3>
          <LedgerTable records={records} />
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
