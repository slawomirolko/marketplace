const TIER_CLASS = { low: "tierLow", medium: "tierMedium", high: "tierHigh" };

const CLASS_DEFS = [
  "classDef tierLow fill:#e6f4ea,stroke:#2e7d32,color:#1b1b1b",
  "classDef tierMedium fill:#fff4e0,stroke:#e08a00,color:#1b1b1b",
  "classDef tierHigh fill:#fde7e9,stroke:#c62828,color:#1b1b1b",
  "classDef script fill:#eceff1,stroke:#546e7a,color:#1b1b1b",
  "classDef interrupt fill:#e8eaf6,stroke:#3949ab,color:#1b1b1b",
  "classDef missing fill:#ffffff,stroke:#9e9e9e,stroke-dasharray:4 3,color:#616161",
  "classDef costUnknown stroke:#b00020,stroke-width:3px,stroke-dasharray:6 3",
  "classDef terminal fill:#263238,stroke:#263238,color:#ffffff",
];

export function escapeLabel(text) {
  return String(text).replaceAll("&", "#amp;").replaceAll('"', "#quot;").replaceAll("<", "#lt;").replaceAll(">", "#gt;");
}

function mermaidId(scope, id) {
  return `n_${[...scope, id].join("__").replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function formatUsd(value) {
  return `$${Number(value).toFixed(4)}`;
}

function costLine(cost) {
  if (!cost) return "not run";
  const amount = cost.costSource === "unknown" ? "$ unknown" : formatUsd(cost.costUsd);
  return `${amount} · ${cost.tokens} tok · ${cost.steps} steps · ${cost.costSource}`;
}

export function toMermaid({ workflows, root, config = {}, report = null }) {
  const byName = new Map(workflows.map((w) => [w.name, w]));
  const rootWorkflow = byName.get(root);
  if (!rootWorkflow) throw new Error(`workflow '${root}' not found`);
  const roles = config.roles ?? {};
  const tierModels = report?.tierModels ?? {};
  const byNode = report?.byNode ?? {};
  const lines = [];
  const classes = [];

  const title = report
    ? `${root} · run ${report.runId} · ${report.status} · ${formatUsd(report.cost?.costUsd ?? 0)} of ${formatUsd(report.cost?.budgetUsd ?? 0)}`
    : `${root}@${rootWorkflow.version}`;
  lines.push("---", `title: "${escapeLabel(title)}"`, "---", "flowchart TD");
  lines.push('  START(("start")):::terminal', '  END_NODE(("END")):::terminal');

  function nodeLabel(node, nodePath) {
    const parts = [`${node.id} · ${node.kind}`];
    const tier = byNode[nodePath]?.tier ?? roles[node.role];
    if (node.role) {
      const model = byNode[nodePath]?.model ?? tierModels[tier];
      parts.push(`${node.role} → ${tier ?? "no tier"}${model ? ` · ${model}` : ""}`);
    }
    if (node.question) parts.push(`asks: ${node.question.text}`);
    if (report && node.kind !== "subgraph" && node.kind !== "map") parts.push(costLine(byNode[nodePath]));
    const [heading, ...details] = parts.map(escapeLabel);
    return { label: [`<b>${heading}</b>`, ...details].join("<br/>"), tier };
  }

  function subgraphCost(prefix) {
    const entries = Object.entries(byNode).filter(([p]) => p.startsWith(`${prefix}/`));
    if (entries.length === 0) return "not run";
    const usd = entries.reduce((sum, [, c]) => sum + (c.costUsd ?? 0), 0);
    const unknown = entries.some(([, c]) => c.costSource === "unknown");
    return `${formatUsd(usd)}${unknown ? " + unknown" : ""}`;
  }

  function renderWorkflow(workflow, scope, pathPrefix, indent, stack) {
    const pad = " ".repeat(indent);
    for (const node of workflow.nodes) {
      const id = mermaidId(scope, node.id);
      const nodePath = `${pathPrefix}/${node.id}`;
      if (node.kind === "subgraph" || node.kind === "map") {
        const inner = byName.get(node.workflow);
        const heading = node.kind === "map" ? `${node.id} · map over ${node.over} · ${node.workflow}` : `${node.id} · subgraph ${node.workflow}`;
        if (!inner || stack.includes(node.workflow)) {
          const reason = inner ? "cycle" : "not found";
          lines.push(`${pad}${id}[["${escapeLabel(`${heading} (${reason})`)}"]]`);
          classes.push(`class ${id} missing`);
          continue;
        }
        const costText = report ? ` · ${subgraphCost(nodePath)}` : "";
        lines.push(`${pad}subgraph ${id}["${escapeLabel(heading + costText)}"]`);
        lines.push(`${pad}  direction TB`);
        renderWorkflow(inner, [...scope, node.id], nodePath, indent + 2, [...stack, node.workflow]);
        lines.push(`${pad}end`);
        continue;
      }
      const { label, tier } = nodeLabel(node, nodePath);
      const shape = { llm: ["(", ")"], script: ["[/", "/]"], interrupt: ["{{", "}}"] }[node.kind];
      lines.push(`${pad}${id}${shape[0]}"${label}"${shape[1]}`);
      const cls = node.kind === "llm" ? TIER_CLASS[tier] : node.kind;
      if (cls) classes.push(`class ${id} ${cls}`);
      if (report && byNode[nodePath]?.costSource === "unknown") classes.push(`class ${id} costUnknown`);
    }
    const ownEdges = workflow.edges.filter((e) => e.to !== "END" || scope.length === 0);
    for (const edge of ownEdges) {
      const from = mermaidId(scope, edge.from);
      const to = edge.to === "END" ? "END_NODE" : mermaidId(scope, edge.to);
      const arrow = edge.when ? `-->|"${escapeLabel(edge.when)}"|` : "-->";
      lines.push(`${pad}${from} ${arrow} ${to}`);
    }
  }

  lines.push(`  START --> ${mermaidId([], rootWorkflow.entry)}`);
  renderWorkflow(rootWorkflow, [], root, 2, [root]);
  lines.push(...CLASS_DEFS.map((d) => `  ${d}`), ...classes.map((c) => `  ${c}`));
  return lines.join("\n");
}
