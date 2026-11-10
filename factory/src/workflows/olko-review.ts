import type { Agent, PromptContext, Workflow, WorkflowState } from "../types.ts";

export interface DiffFile {
  path: string;
  diff: string;
}

export interface Finding {
  location: string;
  ruleId: string;
  sev: string;
  problem: string;
  fix: string;
  line: string;
  lens?: string;
}

export interface Verdict {
  verdict: string;
  rest: string;
}

interface ScopeState {
  pr: number;
  title: string;
  body: string;
  head: string;
  files: DiffFile[];
  excluded: string[];
}

interface DetectState {
  lenses: Agent[];
  bugsOnlyTypes: string[];
}

interface ReviewState {
  scope: ScopeState;
  detect: DetectState;
  lenses?: Record<string, Finding[]>;
  merge: { findings: Finding[] };
  verify?: { verify?: Verdict[] };
}

interface PullRequestMeta {
  title: string;
  body: string;
  headRefName: string;
}

const STACK_LENSES = [
  { id: "dotnet", agentName: "olko-review-dotnet-lens", pattern: /\.(cs|csproj|props|targets)$/ },
  { id: "react", agentName: "olko-review-react-lens", pattern: /\.(ts|tsx)$/ },
  { id: "mobile", agentName: "olko-review-mobile-lens", pattern: /\.(kt|kts)$/ },
  { id: "python", agentName: "olko-review-python-lens", pattern: /\.py$/ },
];

const GENERATED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/;

const TIERS = ["bug", "security", "repo-rule", "design", "style", "nit"];

function reviewState(state: WorkflowState | undefined): ReviewState {
  return state as unknown as ReviewState;
}

export function splitDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const chunk of diff.split(/^(?=diff --git )/m)) {
    const header = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    if (header?.[2] !== undefined) files.push({ path: header[2], diff: chunk });
  }
  return files;
}

function cleanLine(line: string): string {
  const bare = line.trim().replace(/^[-*]\s+/, "");
  return /^`[^`]*`$/.test(bare) ? bare.slice(1, -1) : bare;
}

export function parseFindings(text: string): Finding[] {
  return String(text)
    .split("\n")
    .map(cleanLine)
    .filter((line) => line.split("|").length >= 5 && !/^path\s*\|/i.test(line))
    .map((line) => {
      const [location = "", ruleId = "", sev = "", problem = "", ...fix] = line.split("|").map((p) => p.trim());
      return { location, ruleId, sev, problem, fix: fix.join(" | "), line };
    });
}

export function parseVerdicts(text: string): Verdict[] {
  const verdicts: Verdict[] = [];
  for (const line of String(text).split("\n").map(cleanLine)) {
    const match = line.match(/^(CONFIRMED-UNCHECKED|CONFIRMED|REJECTED)\s*\|\s*(.+)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) verdicts.push({ verdict: match[1], rest: match[2] });
  }
  return verdicts;
}

export function tierOf(finding: Pick<Finding, "ruleId" | "sev">): string {
  const rule = finding.ruleId;
  const skillPrefix = (name: string) => new RegExp(`^${name}[.:]`).test(rule);
  if (finding.sev === "nit") return "nit";
  if (rule.startsWith("bug.")) return "bug";
  if (rule.startsWith("sec.") || /-security[.:]/.test(rule)) return "security";
  if (rule.startsWith("repo.") || /-testing[.:]/.test(rule)) return "repo-rule";
  if (skillPrefix("olko-design-rules") || /-architecture[.:]/.test(rule)) return "design";
  return "style";
}

function lensPrompt({ state, agent }: PromptContext): string {
  const scope = reviewState(state).scope;
  const paths = agent.paths ?? [];
  const files = agent.id === "bugs" ? scope.files : scope.files.filter((f) => paths.includes(f.path));
  return [
    `PR #${scope.pr}: ${scope.title}`,
    "",
    "PR description:",
    scope.body || "(empty)",
    "",
    `Files for this lens (${files.length}):`,
    ...files.map((f) => `- ${f.path}`),
    "",
    "Suppress: none. Prioritize: none. The factory did not load the memory layer for this run.",
    "The current branch is the PR head. The files in the working tree match the diff.",
    "",
    "Diff hunks:",
    ...files.map((f) => f.diff),
  ].join("\n");
}

function verifierPrompt({ state }: PromptContext): string {
  const review = reviewState(state);
  const findings = review.merge.findings;
  return [
    `PR #${review.scope.pr}: ${review.scope.title}`,
    "The current branch is the PR head. The files in the working tree match the diff.",
    "",
    `Findings (${findings.length}), one per line:`,
    ...findings.map((f) => f.line),
  ].join("\n");
}

export const REVIEW_WORKFLOW: Workflow = {
  name: "olko-review",
  version: "0.1.0",
  source: "agents/opencode/olko-review-orchestrator.md (REVIEW ROUTE)",
  roles: { lens: "medium", verifier: "medium" },
  nodes: [
    {
      id: "scope",
      path: "olko-review/scope",
      kind: "script",
      async script({ input, exec }) {
        const pr = input.pr;
        if (pr === undefined || !Number.isInteger(pr) || !/^[\w.-]+\/[\w.-]+$/.test(input.repo ?? "")) throw new Error("input needs repo owner/name and an integer pr");
        if (!exec) throw new Error("scope needs the host exec tool");
        const repo = input.repo ?? "";
        const view = await exec("gh", ["pr", "view", String(pr), "--repo", repo, "--json", "title,body,headRefName,author"]);
        const diff = await exec("gh", ["pr", "diff", String(pr), "--repo", repo]);
        if (view.code !== 0 || diff.code !== 0) throw new Error(`gh failed: ${(view.stderr || diff.stderr).slice(-300)}`);
        const meta = JSON.parse(view.stdout) as PullRequestMeta;
        const all = splitDiff(diff.stdout);
        const files = all.filter((f) => !GENERATED.test(f.path));
        const excluded = all.filter((f) => GENERATED.test(f.path)).map((f) => f.path);
        if (files.length === 0) throw new Error("no diff to review");
        const scope: ScopeState = { pr, title: meta.title, body: meta.body, head: meta.headRefName, files, excluded };
        return {
          state: scope,
          output: `PR #${pr} "${meta.title}" (${meta.headRefName}): ${files.length} files, ${diff.stdout.length} characters of diff. Not sent to lenses (generated lockfiles): ${excluded.join(", ") || "none"}.`,
        };
      },
    },
    {
      id: "detect",
      path: "olko-review/detect",
      kind: "script",
      async script({ state }) {
        const files = reviewState(state).scope.files;
        const lenses: Agent[] = [{ id: "bugs", agentName: "olko-review-bugs-lens", role: "lens", paths: files.map((f) => f.path) }];
        for (const stack of STACK_LENSES) {
          const paths = files.map((f) => f.path).filter((p) => stack.pattern.test(p));
          if (paths.length) lenses.push({ id: stack.id, agentName: stack.agentName, role: "lens", paths });
        }
        const covered = new Set(lenses.slice(1).flatMap((l) => l.paths ?? []));
        const bugsOnly = [...new Set(files.map((f) => f.path).filter((p) => !covered.has(p)).map((p) => p.match(/\.[^./]+$/)?.[0] ?? "(no extension)"))];
        const detect: DetectState = { lenses, bugsOnlyTypes: bugsOnly };
        return {
          state: detect,
          output: `Lenses: ${lenses.map((l) => `${l.agentName} (${l.paths?.length} files)`).join(", ")}. File types reviewed only by the bugs lens: ${bugsOnly.join(", ") || "none"}.`,
        };
      },
    },
    {
      id: "memory",
      path: "olko-review/memory",
      kind: "script",
      async script() {
        return { state: { loaded: false, suppress: [], prioritize: [] }, output: "Memory layer not loaded: the factory PoC does not run olko-memory-layer. Lenses get empty Suppress and Prioritize lists." };
      },
    },
    {
      id: "lenses",
      path: "olko-review/lenses",
      kind: "llm",
      role: "lens",
      agentsFrom: (state) => reviewState(state).detect.lenses,
      prompt: lensPrompt,
      parse: parseFindings,
    },
    {
      id: "merge",
      path: "olko-review/merge",
      kind: "script",
      async script({ state }) {
        const byKey = new Map<string, Finding>();
        for (const [lens, findings] of Object.entries(reviewState(state).lenses ?? {})) {
          for (const f of findings) {
            const key = `${f.location}|${f.ruleId}`;
            const current = byKey.get(key);
            if (!current || TIERS.indexOf(tierOf(f)) < TIERS.indexOf(tierOf(current))) byKey.set(key, { ...f, lens });
          }
        }
        const findings = [...byKey.values()];
        return { state: { findings }, output: findings.length ? findings.map((f) => f.line).join("\n") : "No findings from the lenses." };
      },
    },
    {
      id: "verify",
      path: "olko-review/verify",
      kind: "llm",
      role: "verifier",
      agent: "olko-review-verifier",
      skipIf: (state) => reviewState(state).merge.findings.length === 0,
      skipReason: "no findings to verify",
      prompt: verifierPrompt,
      parse: parseVerdicts,
    },
    {
      id: "rank",
      path: "olko-review/rank",
      kind: "script",
      async script({ state }) {
        const review = reviewState(state);
        const findings = review.merge.findings;
        const verdicts = review.verify?.verify ?? [];
        const kept: (Finding & { unchecked: boolean })[] = [];
        const dropped: (Finding & { reason: string })[] = [];
        findings.forEach((f, i) => {
          const v = verdicts[i];
          if (v && v.verdict !== "REJECTED") kept.push({ ...f, unchecked: v.verdict === "CONFIRMED-UNCHECKED" });
          else dropped.push({ ...f, reason: v ? (v.rest.split("|").at(-1) ?? "").trim() : "no verdict returned" });
        });
        kept.sort((a, b) => TIERS.indexOf(tierOf(a)) - TIERS.indexOf(tierOf(b)));
        const totals = TIERS.map((t) => `${t}: ${kept.filter((f) => tierOf(f) === t).length}`).join(", ");
        const lines = [
          `Review of PR #${review.scope.pr}: ${review.scope.title}`,
          "",
          ...(kept.length ? kept.map((f) => `${f.line}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."]),
          "",
          `Totals: ${totals}`,
          `Lenses run: ${review.detect.lenses.map((l) => l.agentName).join(", ")}`,
          `File types reviewed only by the bugs lens: ${review.detect.bugsOnlyTypes.join(", ") || "none"}`,
          `Not reviewed (generated lockfiles): ${review.scope.excluded.join(", ") || "none"}`,
          `Dropped by the verifier: ${dropped.length}`,
          ...dropped.map((f) => `  - ${f.line} | ${f.reason}`),
          "Memory: not loaded (factory PoC).",
        ];
        return { state: { kept, dropped }, output: lines.join("\n") };
      },
    },
  ],
};
