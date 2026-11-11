import type { Agent, Operation, WorkflowState } from "./types.ts";

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
  repo: string;
  title: string;
  body: string;
  head: string;
  files: DiffFile[];
  excluded: string[];
}

interface LensConfig {
  id: string;
  agent: string;
  extensions?: string[];
}

interface PullRequestMeta {
  title: string;
  body: string;
  headRefName: string;
}

interface Ranked extends Finding {
  unchecked: boolean;
}

const TIERS = ["bug", "security", "repo-rule", "design", "style", "nit"];

function stateOf<T>(state: WorkflowState, key: string): T {
  const value = state[key];
  if (value === undefined) throw new Error(`state.${key} is not set`);
  return value as T;
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new Error(`${name} must be a list of strings`);
  return value;
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

const pass: Operation = async () => ({ state: { passed: true }, output: "verify passed" });

const prScope: Operation = async ({ input, exec, args }) => {
  const pr = input.pr;
  const repo = input.repo ?? "";
  if (pr === undefined || !Number.isInteger(pr) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("input needs repo owner/name and an integer pr");
  if (!exec) throw new Error("github.prScope needs the host exec tool");
  const exclude = stringList(args.exclude ?? [], "with.exclude").map((p) => new RegExp(p));
  const view = await exec("gh", ["pr", "view", String(pr), "--repo", repo, "--json", "title,body,headRefName,author"]);
  const diff = await exec("gh", ["pr", "diff", String(pr), "--repo", repo]);
  if (view.code !== 0 || diff.code !== 0) throw new Error(`gh failed: ${(view.stderr || diff.stderr).slice(-300)}`);
  const meta = JSON.parse(view.stdout) as PullRequestMeta;
  const all = splitDiff(diff.stdout);
  const isExcluded = (p: string) => exclude.some((re) => re.test(p));
  const files = all.filter((f) => !isExcluded(f.path));
  const excluded = all.filter((f) => isExcluded(f.path)).map((f) => f.path);
  if (files.length === 0) throw new Error("no diff to review");
  const scope: ScopeState = { pr, repo, title: meta.title, body: meta.body || "(empty)", head: meta.headRefName, files, excluded };
  return {
    state: scope,
    metrics: { files: files.length, excluded: excluded.length },
    output: `PR #${pr} "${meta.title}" (${meta.headRefName}): ${files.length} files, ${diff.stdout.length} characters of diff. Not sent to lenses: ${excluded.join(", ") || "none"}.`,
  };
};

const detectLenses: Operation = async ({ state, args }) => {
  const files = stateOf<ScopeState>(state, "scope").files;
  const always = args.always as LensConfig | undefined;
  const stacks = (args.stacks ?? []) as LensConfig[];
  if (!always?.id || !always.agent) throw new Error("with.always needs id and agent");
  const lenses: Agent[] = [{ id: always.id, agentName: always.agent, role: "lens", paths: files.map((f) => f.path), files }];
  for (const stack of stacks) {
    const extensions = stringList(stack.extensions ?? [], `with.stacks.${stack.id}.extensions`);
    const matched = files.filter((f) => extensions.some((ext) => f.path.endsWith(ext)));
    if (matched.length) lenses.push({ id: stack.id, agentName: stack.agent, role: "lens", paths: matched.map((f) => f.path), files: matched });
  }
  const covered = new Set(lenses.slice(1).flatMap((l) => l.paths ?? []));
  const onlyAlways = [...new Set(files.map((f) => f.path).filter((p) => !covered.has(p)).map((p) => p.match(/\.[^./]+$/)?.[0] ?? "(no extension)"))];
  return {
    state: { lenses, bugsOnlyTypes: onlyAlways },
    metrics: { lenses: lenses.length },
    output: `Lenses: ${lenses.map((l) => `${l.agentName} (${l.paths?.length} files)`).join(", ")}. File types reviewed only by ${always.agent}: ${onlyAlways.join(", ") || "none"}.`,
  };
};

const memoryNotLoaded: Operation = async () => ({
  state: { loaded: false, suppress: [], prioritize: [] },
  output: "Memory layer not loaded: the factory does not run olko-memory-layer yet. Lenses get empty Suppress and Prioritize lists.",
});

const mergeFindings: Operation = async ({ state }) => {
  const byKey = new Map<string, Finding>();
  const lensResults = (state.lenses ?? {}) as Record<string, Finding[]>;
  for (const [lens, findings] of Object.entries(lensResults)) {
    for (const f of findings) {
      const key = `${f.location}|${f.ruleId}`;
      const current = byKey.get(key);
      if (!current || TIERS.indexOf(tierOf(f)) < TIERS.indexOf(tierOf(current))) byKey.set(key, { ...f, lens });
    }
  }
  const findings = [...byKey.values()];
  return { state: { findings }, metrics: { findings: findings.length }, output: findings.length ? findings.map((f) => f.line).join("\n") : "No findings from the lenses." };
};

const rankFindings: Operation = async ({ state }) => {
  const scope = stateOf<ScopeState>(state, "scope");
  const detect = stateOf<{ lenses: Agent[]; bugsOnlyTypes: string[] }>(state, "detect");
  const findings = stateOf<{ findings: Finding[] }>(state, "merge").findings;
  const verdicts = (state.verify as Record<string, Verdict[]> | undefined)?.verify ?? [];
  const kept: Ranked[] = [];
  const dropped: (Finding & { reason: string })[] = [];
  findings.forEach((f, i) => {
    const v = verdicts[i];
    if (v && v.verdict !== "REJECTED") kept.push({ ...f, unchecked: v.verdict === "CONFIRMED-UNCHECKED" });
    else dropped.push({ ...f, reason: v ? (v.rest.split("|").at(-1) ?? "").trim() : "no verdict returned" });
  });
  kept.sort((a, b) => TIERS.indexOf(tierOf(a)) - TIERS.indexOf(tierOf(b)));
  const totals = TIERS.map((t) => `${t}: ${kept.filter((f) => tierOf(f) === t).length}`).join(", ");
  const lines = [
    `Review of PR #${scope.pr}: ${scope.title}`,
    "",
    ...(kept.length ? kept.map((f) => `${f.line}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."]),
    "",
    `Totals: ${totals}`,
    `Lenses run: ${detect.lenses.map((l) => l.agentName).join(", ")}`,
    `File types reviewed only by the always-on lens: ${detect.bugsOnlyTypes.join(", ") || "none"}`,
    `Not reviewed (excluded): ${scope.excluded.join(", ") || "none"}`,
    `Dropped by the verifier: ${dropped.length}`,
    ...dropped.map((f) => `  - ${f.line} | ${f.reason}`),
    "Memory: not loaded.",
  ];
  return { state: { kept, dropped, count: kept.length }, metrics: { kept: kept.length, dropped: dropped.length }, output: lines.join("\n") };
};

const postComments: Operation = async ({ state, exec }) => {
  if (!exec) throw new Error("github.postComments needs the host exec tool");
  const scope = stateOf<ScopeState>(state, "scope");
  const kept = stateOf<{ kept: Ranked[] }>(state, "rank").kept;
  let posted = 0;
  for (const finding of kept) {
    const result = await exec("gh", ["pr", "comment", String(scope.pr), "--repo", scope.repo, "--body", finding.line]);
    if (result.code !== 0) throw new Error(`gh pr comment failed after ${posted} comments: ${result.stderr.slice(-300)}`);
    posted += 1;
  }
  return { state: { posted }, metrics: { posted }, output: `Posted ${posted} comments on PR #${scope.pr}.` };
};

export const OPERATIONS: Record<string, Operation> = {
  "builtin.pass": pass,
  "github.prScope": prScope,
  "github.postComments": postComments,
  "review.detectLenses": detectLenses,
  "review.memoryNotLoaded": memoryNotLoaded,
  "review.mergeFindings": mergeFindings,
  "review.rankFindings": rankFindings,
};

export const PARSERS: Record<string, (text: string) => unknown> = {
  "review.findings": parseFindings,
  "review.verdicts": parseVerdicts,
};
