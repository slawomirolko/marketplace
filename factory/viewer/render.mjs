import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toMermaid } from "./mermaid.mjs";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@12.3.0/dist/mermaid.esm.min.mjs";
const PANZOOM_URL = "https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.2/dist/panzoom.min.js";

function parseArgs(argv) {
  const args = { root: "hello", workflows: path.join(factoryDir, "workflows"), config: path.join(factoryDir, "spec", "examples", "valid", "factory-config.json"), report: null, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (!(key in args)) throw new Error(`unknown option ${argv[i]}`);
    args[key] = argv[i + 1];
  }
  args.out ??= path.join(process.cwd(), args.root);
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadWorkflows(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(dir, f)));
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function summaryRows(report) {
  if (!report) return "";
  const rows = [
    ...Object.entries(report.byTier ?? {}).map(([k, v]) => ["tier", k, `$${v.toFixed(6)}`]),
    ...Object.entries(report.byModel ?? {}).map(([k, v]) => ["model", k, `$${v.toFixed(6)}`]),
    ...Object.entries(report.byCostSource ?? {}).map(([k, v]) => ["cost source", k, `${v} LLM steps`]),
  ];
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr><th>Group</th><th>Name</th><th>Value</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function toHtml(diagram, title, report) {
  const source = JSON.stringify(diagram).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg: #ffffff; --fg: #1b1b1b; --muted: #5f6368; --line: #dadce0; }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .toolbar { display: flex; gap: 8px; margin: 8px 0; }
  button { font: inherit; padding: 4px 12px; border: 1px solid var(--line); background: #f8f9fa; border-radius: 6px; cursor: pointer; }
  #stage { border: 1px solid var(--line); border-radius: 8px; height: 75vh; overflow: hidden; }
  #diagram { width: 100%; }
  table { border-collapse: collapse; margin-top: 12px; }
  td, th { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
  .legend { color: var(--muted); margin-top: 8px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="toolbar"><button id="zoom-in">+</button><button id="zoom-out">&minus;</button><button id="reset">Reset</button></div>
<div id="stage"><div id="diagram"></div></div>
<p class="legend">Colors: green = low tier, orange = medium, red = high. Grey parallelogram = script. Red dashed border = cost unknown. Mouse wheel zooms, drag pans.</p>
${summaryRows(report)}
<script id="source" type="application/json">${source}</script>
<script src="${PANZOOM_URL}"></script>
<script type="module">
  import mermaid from "${MERMAID_URL}";
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", flowchart: { htmlLabels: true, wrappingWidth: 360 } });
  const source = JSON.parse(document.getElementById("source").textContent);
  const { svg } = await mermaid.render("factory-graph", source);
  const target = document.getElementById("diagram");
  target.innerHTML = svg;
  const panzoom = Panzoom(target, { maxScale: 8, minScale: 0.2 });
  document.getElementById("stage").addEventListener("wheel", panzoom.zoomWithWheel);
  document.getElementById("zoom-in").addEventListener("click", () => panzoom.zoomIn());
  document.getElementById("zoom-out").addEventListener("click", () => panzoom.zoomOut());
  document.getElementById("reset").addEventListener("click", () => panzoom.reset());
</script>
</body>
</html>
`;
}

export function toMarkdown(diagram, title) {
  return `# ${title}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = args.report ? readJson(args.report) : null;
  const diagram = toMermaid({ workflows: loadWorkflows(args.workflows), root: args.root, config: readJson(args.config), report });
  const title = report ? `Factory run ${report.runId} (${args.root})` : `Factory workflow ${args.root}`;
  fs.writeFileSync(`${args.out}.mmd`, `${diagram}\n`);
  fs.writeFileSync(`${args.out}.md`, toMarkdown(diagram, title));
  fs.writeFileSync(`${args.out}.html`, toHtml(diagram, title, report));
  console.log(`wrote ${args.out}.mmd, .md, .html`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
