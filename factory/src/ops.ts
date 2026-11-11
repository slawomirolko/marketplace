import fs from "node:fs";
import path from "node:path";
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
  stale: boolean;
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

const reviewRoute: Operation = async ({ input, exec }) => {
  if (input.plan) return { state: { route: "PLAN" }, output: `PLAN (${input.plan})` };
  if (!exec) throw new Error("review.route needs the host exec tool");
  if (input.pr === undefined || !input.repo) throw new Error("review.route needs repo and pr, or plan, in the input");
  const view = await exec("gh", ["pr", "view", String(input.pr), "--repo", input.repo, "--json", "author"]);
  const user = await exec("gh", ["api", "user", "--jq", ".login"]);
  if (view.code !== 0 || user.code !== 0) throw new Error(`gh failed: ${(view.stderr || user.stderr).slice(-300)}`);
  const author = (JSON.parse(view.stdout) as { author: { login: string } }).author.login;
  const own = author === user.stdout.trim();
  if (own && !input.fresh) return { state: { route: "FEEDBACK", own }, output: "FEEDBACK (the PR author is the signed-in user)" };
  const reason = own ? "fresh review of own PR" : `PR by ${author}`;
  return { state: { route: "REVIEW", own }, output: `REVIEW (${reason})` };
};

const prScope: Operation = async ({ input, exec, args, cwd }) => {
  const pr = input.pr;
  const repo = input.repo ?? "";
  if (pr === undefined || !Number.isInteger(pr) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("input needs repo owner/name and an integer pr");
  if (!exec) throw new Error("github.prScope needs the host exec tool");
  const exclude = stringList(args.exclude ?? [], "with.exclude").map((p) => new RegExp(p));
  const view = await exec("gh", ["pr", "view", String(pr), "--repo", repo, "--json", "title,body,headRefName,author"]);
  const diff = await exec("gh", ["pr", "diff", String(pr), "--repo", repo]);
  if (view.code !== 0 || diff.code !== 0) throw new Error(`gh failed: ${(view.stderr || diff.stderr).slice(-300)}`);
  const branch = await exec("git", ["-C", cwd ?? ".", "branch", "--show-current"]);
  const meta = JSON.parse(view.stdout) as PullRequestMeta;
  const all = splitDiff(diff.stdout);
  const isExcluded = (p: string) => exclude.some((re) => re.test(p));
  const files = all.filter((f) => !isExcluded(f.path));
  const excluded = all.filter((f) => isExcluded(f.path)).map((f) => f.path);
  if (files.length === 0) throw new Error("no diff to review");
  const stale = branch.code !== 0 || branch.stdout.trim() !== meta.headRefName;
  const scope: ScopeState = { pr, repo, title: meta.title, body: meta.body || "", head: meta.headRefName, files, excluded, stale };
  return {
    state: scope,
    metrics: { files: files.length, excluded: excluded.length, stale: stale ? 1 : 0 },
    output: `PR #${pr} "${meta.title}" (${meta.headRefName}): ${files.length} files, ${diff.stdout.length} characters of diff. Not sent to lenses: ${excluded.join(", ") || "none"}. Working tree ${stale ? "is not the PR head: lenses judge changed lines from the hunks only" : "is the PR head"}.`,
  };
};

const detectLenses: Operation = async ({ state, args }) => {
  const scope = stateOf<ScopeState>(state, "scope");
  const files = scope.files;
  const always = args.always as LensConfig | undefined;
  const stacks = (args.stacks ?? []) as LensConfig[];
  const requirements = args.requirements as LensConfig | undefined;
  if (!always?.id || !always.agent) throw new Error("with.always needs id and agent");
  const lenses: Agent[] = [{ id: always.id, agentName: always.agent, role: "lens", paths: files.map((f) => f.path), files }];
  for (const stack of stacks) {
    const extensions = stringList(stack.extensions ?? [], `with.stacks.${stack.id}.extensions`);
    const matched = files.filter((f) => extensions.some((ext) => f.path.endsWith(ext)));
    if (matched.length) lenses.push({ id: stack.id, agentName: stack.agent, role: "lens", paths: matched.map((f) => f.path), files: matched });
  }
  const covered = new Set(lenses.slice(1).flatMap((l) => l.paths ?? []));
  const onlyAlways = [...new Set(files.map((f) => f.path).filter((p) => !covered.has(p)).map((p) => p.match(/\.[^./]+$/)?.[0] ?? "(no extension)"))];
  const criteria = scope.body.trim();
  if (requirements?.id && requirements.agent && criteria) {
    lenses.push({ id: requirements.id, agentName: requirements.agent, role: "lens", paths: files.map((f) => f.path), files, criteria, mode: "code" });
  }
  return {
    state: { lenses, bugsOnlyTypes: onlyAlways, criteria: criteria ? "PR description" : "none" },
    metrics: { lenses: lenses.length },
    output: `Lenses: ${lenses.map((l) => `${l.agentName} (${l.paths?.length} files)`).join(", ")}. File types reviewed only by ${always.agent}: ${onlyAlways.join(", ") || "none"}. Acceptance criteria: ${criteria ? "PR description" : "none, requirements lens skipped"}.`,
  };
};

export function memoryLists(text: string): { suppress: string[]; prioritize: string[] } {
  const counts = new Map<string, { confirmed: number; rejected: number }>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().replace(/^[-*]\s+/, "").match(/^(confirmed|rejected):(\S+)/);
    if (!match?.[1] || !match[2]) continue;
    const entry = counts.get(match[2]) ?? { confirmed: 0, rejected: 0 };
    entry[match[1] as "confirmed" | "rejected"] += 1;
    counts.set(match[2], entry);
  }
  const suppress = [...counts].filter(([, c]) => c.rejected >= 2).map(([p]) => p);
  const prioritize = [...counts].filter(([, c]) => c.confirmed >= 1).map(([p]) => p);
  return { suppress, prioritize };
}

function memoryFile(cwd: string | undefined, agent: unknown): string {
  if (typeof agent !== "string" || !/^[a-z0-9-]+$/.test(agent)) throw new Error("with.agent must name the agent that owns the memory block");
  return path.join(cwd ?? process.cwd(), ".opencode", "memory", `${agent}.md`);
}

const memoryLoad: Operation = async ({ args, cwd }) => {
  const file = memoryFile(cwd, args.agent);
  if (!fs.existsSync(file)) {
    return { state: { loaded: false, file, suppressText: "none", prioritizeText: "none" }, metrics: { loaded: 0, suppress: 0, prioritize: 0 }, output: `Memory block ${file} does not exist.` };
  }
  const { suppress, prioritize } = memoryLists(fs.readFileSync(file, "utf8"));
  return {
    state: { loaded: true, file, suppress, prioritize, suppressText: suppress.join(", ") || "none", prioritizeText: prioritize.join(", ") || "none" },
    metrics: { loaded: 1, suppress: suppress.length, prioritize: prioritize.length },
    output: `Memory loaded from ${file}: ${suppress.length} suppressed, ${prioritize.length} prioritized patterns.`,
  };
};

function nodeArg(args: Record<string, unknown>, key: string, fallback: string): string {
  const value = args[key] ?? fallback;
  if (typeof value !== "string") throw new Error(`with.${key} must name a node`);
  return value;
}

const mergeFindings: Operation = async ({ state, args }) => {
  const byKey = new Map<string, Finding>();
  const lensResults = (state[nodeArg(args, "from", "lenses")] ?? {}) as Record<string, Finding[]>;
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

const confirmFindings: Operation = async ({ state, args }) => {
  const findings = stateOf<{ findings: Finding[] }>(state, nodeArg(args, "findings", "merge")).findings;
  const verifyNode = nodeArg(args, "verdicts", "verify");
  const verdicts = (state[verifyNode] as Record<string, Verdict[]> | undefined)?.[verifyNode] ?? [];
  const confirmed: Ranked[] = [];
  const dropped: (Finding & { reason: string })[] = [];
  findings.forEach((f, i) => {
    const v = verdicts[i];
    if (v && v.verdict !== "REJECTED") confirmed.push({ ...f, unchecked: v.verdict === "CONFIRMED-UNCHECKED" });
    else dropped.push({ ...f, reason: v ? (v.rest.split("|").at(-1) ?? "").trim() : "no verdict returned" });
  });
  return { state: { confirmed, dropped, count: confirmed.length }, metrics: { confirmed: confirmed.length, dropped: dropped.length }, output: `${confirmed.length} confirmed, ${dropped.length} dropped by the verifier.` };
};

export interface RulesCheck {
  noStore: boolean;
  violations: string[];
  verdicts: { verdict: "keep" | "drop" | "ask"; finding: string; cite: string }[];
}

export function parseRulesCheck(text: string): RulesCheck {
  const lines = String(text).split("\n").map(cleanLine).filter(Boolean);
  const result: RulesCheck = { noStore: lines.some((l) => /^no-store$/i.test(l)), violations: [], verdicts: [] };
  for (const line of lines) {
    if (/^violation\s*\|/.test(line)) result.violations.push(line.replace(/^violation\s*\|\s*/, ""));
    const verdict = line.match(/^(keep|drop|ask)\s*\|\s*(.+)\|\s*([^|]+)$/);
    if (verdict?.[1] && verdict[2] && verdict[3]) result.verdicts.push({ verdict: verdict[1] as "keep" | "drop" | "ask", finding: verdict[2].trim(), cite: verdict[3].trim() });
  }
  return result;
}

interface Decision {
  kind: "violation" | "ask";
  line: string;
  cite: string;
}

const mergeRules: Operation = async ({ state, args }) => {
  const confirmed = stateOf<{ confirmed: Ranked[] }>(state, nodeArg(args, "confirmed", "confirm")).confirmed;
  const check = Object.values((state[nodeArg(args, "check", "rules-check")] ?? {}) as Record<string, RulesCheck>)[0];
  if (!check) throw new Error("rules-check returned nothing");
  if (check.noStore) {
    return { state: { kept: confirmed, dropped: [], decide: [], violations: [], noStore: true }, metrics: { noStore: 1, decide: 0, violations: 0, dropped: 0 }, output: "Project rules check: no-store (no ADR or rule directory). Skipped." };
  }
  const kept: Ranked[] = [];
  const dropped: { line: string; cite: string }[] = [];
  const decide: Decision[] = [];
  confirmed.forEach((f, i) => {
    const v = check.verdicts[i];
    if (v?.verdict === "drop") dropped.push({ line: f.line, cite: v.cite });
    else if (v?.verdict === "ask") decide.push({ kind: "ask", line: f.line, cite: v.cite });
    else kept.push(f);
  });
  return {
    state: { kept, dropped, decide, violations: check.violations, noStore: false },
    metrics: { noStore: 0, decide: decide.length, violations: check.violations.length, dropped: dropped.length },
    output: `Project rules check: ${check.violations.length} violations, ${dropped.length} findings dropped by the store, ${decide.length} to decide.`,
  };
};

const addViolations: Operation = async ({ state, args }) => {
  const rules = stateOf<{ decide: Decision[]; violations: string[] }>(state, nodeArg(args, "rules", "rules-merge"));
  const verifyNode = nodeArg(args, "verdicts", "verify-violations");
  const verdicts = (state[verifyNode] as Record<string, Verdict[]> | undefined)?.[verifyNode] ?? [];
  const confirmed = rules.violations.filter((_, i) => verdicts[i] && verdicts[i].verdict !== "REJECTED");
  const decide = [...rules.decide, ...confirmed.map((line) => ({ kind: "violation" as const, line, cite: line.split("|").slice(-2).join("|").trim() }))];
  return { state: { decide }, metrics: { decide: decide.length, violations: confirmed.length }, output: `${confirmed.length} store violations confirmed by the verifier.` };
};

const listNext: Operation = async ({ state, args, nodeId }) => {
  if (typeof args.over !== "string") throw new Error("with.over must be a state path");
  const list = args.over.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), state);
  if (!Array.isArray(list)) throw new Error(`state.${args.over} is not a list`);
  const previous = nodeId ? (state[nodeId] as { index?: number } | undefined) : undefined;
  const index = previous?.index === undefined ? 0 : previous.index + 1;
  const done = index >= list.length;
  return { state: { index, number: index + 1, total: list.length, item: done ? null : list[index], done }, metrics: { index, total: list.length }, output: done ? `All ${list.length} items handled.` : `Item ${index + 1} of ${list.length}.` };
};

const rankFindings: Operation = async ({ state, answers }) => {
  const scope = stateOf<ScopeState>(state, "scope");
  const detect = stateOf<{ lenses: Agent[]; bugsOnlyTypes: string[]; criteria: string }>(state, "detect");
  const confirm = stateOf<{ dropped: (Finding & { reason: string })[] }>(state, "confirm");
  const rules = stateOf<{ kept: Ranked[]; dropped: { line: string; cite: string }[]; noStore: boolean }>(state, "rules-merge");
  const decide = ((state["rules-violations"] as { decide?: Decision[] } | undefined)?.decide ?? (state["rules-merge"] as { decide: Decision[] }).decide);
  const memory = state.memory as { loaded?: boolean } | undefined;
  const decided = decide.map((d, i) => ({ ...d, answer: answers?.[`q-rule-${i}`] ?? "unanswered" }));
  const kept: Ranked[] = [...rules.kept];
  for (const d of decided) {
    if (d.answer !== "store") kept.push({ location: d.line.split("|")[0]?.trim() ?? "", ruleId: d.kind === "violation" ? "repo.store" : "repo.ask", sev: "bug", problem: d.line, fix: "", line: d.line, unchecked: false });
  }
  kept.sort((a, b) => TIERS.indexOf(tierOf(a)) - TIERS.indexOf(tierOf(b)));
  const totals = TIERS.map((t) => `${t}: ${kept.filter((f) => tierOf(f) === t).length}`).join(", ");
  const lines = [
    `Review of PR #${scope.pr}: ${scope.title}`,
    "",
    ...(kept.length ? kept.map((f) => `${f.line}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."]),
    "",
    `Totals: ${totals}`,
    `Lenses run: ${detect.lenses.map((l) => l.agentName).join(", ")}`,
    `Acceptance criteria: ${detect.criteria}`,
    `File types reviewed only by the always-on lens: ${detect.bugsOnlyTypes.join(", ") || "none"}`,
    `Not reviewed (excluded): ${scope.excluded.join(", ") || "none"}`,
    `Dropped by the verifier: ${confirm.dropped.length}`,
    ...confirm.dropped.map((f) => `  - ${f.line} | ${f.reason}`),
    `Project rules check: ${rules.noStore ? "no-store, skipped" : `${rules.dropped.length} dropped by the store`}`,
    ...rules.dropped.map((d) => `  - ${d.line} | ${d.cite}`),
    ...decided.map((d) => `Decided (${d.kind}): ${d.line} -> ${d.answer === "store" ? "store entry holds" : "finding holds"}`),
    `Memory: ${memory?.loaded ? "loaded" : "not loaded (the user chose to continue without it)"}`,
  ];
  return { state: { kept, count: kept.length }, metrics: { kept: kept.length }, output: lines.join("\n") };
};

const postComment: Operation = async ({ state, exec, args }) => {
  if (!exec) throw new Error("github.postComment needs the host exec tool");
  if (typeof args.from !== "string") throw new Error("with.from must name the list node");
  const scope = stateOf<ScopeState>(state, "scope");
  const item = (state[args.from] as { item?: Finding } | undefined)?.item;
  if (!item) throw new Error(`state.${args.from}.item is not set`);
  const result = await exec("gh", ["pr", "comment", String(scope.pr), "--repo", scope.repo, "--body", item.line]);
  if (result.code !== 0) throw new Error(`gh pr comment failed: ${result.stderr.slice(-300)}`);
  return { state: { posted: item.line }, metrics: { posted: 1 }, output: `Posted on PR #${scope.pr}: ${item.line}` };
};

export function memoryDecisionLines(kept: Pick<Finding, "ruleId">[], answers: Record<string, string>, prefix: string): string[] {
  return kept.flatMap((f, i) => {
    const answer = answers[`${prefix}${i}`];
    if (answer === "post") return [`confirmed:${f.ruleId}`];
    if (answer === "skip") return [`rejected:${f.ruleId}`];
    return [];
  });
}

const memoryPersist: Operation = async ({ state, answers, args }) => {
  const memory = state.memory as { loaded?: boolean; file?: string } | undefined;
  if (!memory?.loaded || !memory.file) return { state: { written: 0 }, metrics: { written: 0 }, output: "Learning skipped: the memory block was not loaded." };
  const kept = stateOf<{ kept: Finding[] }>(state, "rank").kept;
  const lines = memoryDecisionLines(kept, answers ?? {}, typeof args.questionPrefix === "string" ? args.questionPrefix : "q-post-");
  if (lines.length) fs.appendFileSync(memory.file, `${lines.join("\n")}\n`);
  return { state: { written: lines.length }, metrics: { written: lines.length }, output: lines.length ? `Memory: ${lines.length} decisions recorded in ${memory.file}.` : "Memory: nothing durable happened." };
};

const planRead: Operation = async ({ input, cwd }) => {
  const root = path.resolve(cwd ?? process.cwd());
  const file = path.resolve(root, input.plan ?? "");
  if (!input.plan || (file !== root && !file.startsWith(root + path.sep))) throw new Error("input.plan must be a file inside the workspace");
  if (!fs.existsSync(file)) throw new Error(`plan file ${input.plan} does not exist in ${root}`);
  const text = fs.readFileSync(file, "utf8");
  const criteria = (input.criteria ?? "").trim();
  return { state: { path: input.plan, text, criteria: criteria || "none" }, metrics: { characters: text.length, criteria: criteria ? 1 : 0 }, output: `Plan ${input.plan}: ${text.length} characters. Acceptance criteria: ${criteria ? "given" : "none (design rules only)"}.` };
};

function decisions(state: WorkflowState, answers: Record<string, string> | undefined, violationsNode: string, rulesNode: string, prefix: string) {
  const decide = (state[violationsNode] as { decide?: Decision[] } | undefined)?.decide ?? (state[rulesNode] as { decide?: Decision[] } | undefined)?.decide ?? [];
  return decide.map((d, i) => ({ ...d, answer: answers?.[`${prefix}${i}`] ?? "unanswered" }));
}

const planReport: Operation = async ({ state, answers }) => {
  const plan = stateOf<{ path: string; criteria: string }>(state, "plan-read");
  const confirm = stateOf<{ dropped: (Finding & { reason: string })[] }>(state, "plan-confirm");
  const rules = stateOf<{ kept: Ranked[]; dropped: { line: string; cite: string }[]; noStore: boolean }>(state, "plan-rules-merge");
  const asPlanLine = (line: string) => (line.startsWith("plan:") ? line : `plan: ${line}`);
  const lines = [
    `Plan review of ${plan.path}`,
    "",
    ...(rules.kept.length ? rules.kept.map((f) => `${asPlanLine(f.line)}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."]),
    "",
    `Totals: ${TIERS.map((t) => `${t}: ${rules.kept.filter((f) => tierOf(f) === t).length}`).join(", ")}`,
    `Acceptance criteria: ${plan.criteria === "none" ? "none, design rules only" : "given"}`,
    `Dropped by the verifier: ${confirm.dropped.length}`,
    ...confirm.dropped.map((f) => `  - ${f.line} | ${f.reason}`),
    `Project rules check: ${rules.noStore ? "no-store, skipped" : `${rules.dropped.length} dropped by the store`}`,
    ...rules.dropped.map((d) => `  - ${d.line} | ${d.cite}`),
    ...decisions(state, answers, "plan-rules-violations", "plan-rules-merge", "q-plan-rule-").map((d) => `Decided (${d.kind}): ${d.line} -> ${d.answer === "store" ? "store entry holds" : d.answer === "finding" ? "finding holds" : "not decided"}`),
  ];
  return { state: { kept: rules.kept, count: rules.kept.length }, metrics: { kept: rules.kept.length }, output: lines.join("\n") };
};

export interface FeedbackComment {
  id: string;
  kind: "thread" | "comment";
  author: string;
  path: string | null;
  line: number | null;
  body: string;
  url: string;
}

export interface FeedbackItem {
  index: number;
  path: string | null;
  line: number | null;
  comments: FeedbackComment[];
}

export function groupComments(comments: FeedbackComment[], nearbyLines = 3): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  for (const comment of comments) {
    const near = comment.path
      ? items.find((i) => i.path === comment.path && i.line !== null && comment.line !== null && Math.abs(i.line - comment.line) <= nearbyLines)
      : undefined;
    if (near) near.comments.push(comment);
    else items.push({ index: items.length, path: comment.path, line: comment.line, comments: [comment] });
  }
  return items;
}

interface ThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: { nodes: { author: { login: string } | null; path: string | null; line: number | null; body: string; url: string }[] };
}

const prFeedback: Operation = async ({ input, exec, cwd }) => {
  if (!exec) throw new Error("github.prFeedback needs the host exec tool");
  const repo = input.repo ?? "";
  const [owner, name] = repo.split("/");
  if (!owner || !name || input.pr === undefined) throw new Error("github.prFeedback needs repo and pr");
  const view = await exec("gh", ["pr", "view", String(input.pr), "--repo", repo, "--json", "headRefName,author,comments"]);
  if (view.code !== 0) throw new Error(`gh pr view failed: ${view.stderr.slice(-300)}`);
  const meta = JSON.parse(view.stdout) as { headRefName: string; author: { login: string }; comments: { id: string; author: { login: string } | null; body: string; url: string }[] };
  const branch = await exec("git", ["-C", cwd ?? ".", "branch", "--show-current"]);
  if (branch.code !== 0 || branch.stdout.trim() !== meta.headRefName) {
    throw new Error(`the local branch (${branch.stdout.trim() || "unknown"}) is not the PR head branch ${meta.headRefName}: check out ${meta.headRefName} first`);
  }
  const checks = await exec("gh", ["pr", "checks", String(input.pr), "--repo", repo, "--json", "name,state"]);
  const checkList = checks.code === 0 && checks.stdout.trim() ? (JSON.parse(checks.stdout) as { name: string; state: string }[]) : [];
  const query = `query { repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${input.pr}) { reviewThreads(first: 100) { nodes { id isResolved isOutdated comments(first: 1) { nodes { author { login } path line body url } } } } } } }`;
  const threads = await exec("gh", ["api", "graphql", "-f", `query=${query}`]);
  if (threads.code !== 0) throw new Error(`gh api graphql failed: ${threads.stderr.slice(-300)}`);
  const nodes = (JSON.parse(threads.stdout) as { data: { repository: { pullRequest: { reviewThreads: { nodes: ThreadNode[] } } } } }).data.repository.pullRequest.reviewThreads.nodes;
  const comments: FeedbackComment[] = [
    ...nodes
      .filter((t) => !t.isResolved && !t.isOutdated && t.comments.nodes[0])
      .map((t) => {
        const c = t.comments.nodes[0]!;
        return { id: t.id, kind: "thread" as const, author: c.author?.login ?? "unknown", path: c.path, line: c.line, body: c.body, url: c.url };
      }),
    ...meta.comments
      .filter((c) => c.author?.login !== meta.author.login)
      .map((c) => ({ id: c.id, kind: "comment" as const, author: c.author?.login ?? "unknown", path: null, line: null, body: c.body, url: c.url })),
  ];
  const items = groupComments(comments);
  const ci = checkList.length ? checkList.map((c) => `${c.name}: ${c.state}`).join(", ") : "no checks";
  return {
    state: { head: meta.headRefName, checks: checkList, ci, comments, items },
    metrics: { checks: checkList.length, comments: comments.length, items: items.length },
    output: `CI: ${ci}. Unresolved comments: ${comments.length} in ${items.length} items.`,
  };
};

const feedbackPlan: Operation = async ({ state, answers }) => {
  const items = stateOf<{ items: FeedbackItem[] }>(state, "fb-check").items;
  const decided = items.map((item) => ({ ...item, decision: answers?.[`q-feedback-${item.index}`] ?? "skip" }));
  const count = (d: string) => decided.filter((i) => i.decision === d).length;
  const replies = decided.filter((i) => i.decision === "wont-fix" || i.decision === "question");
  return {
    state: { decided, replies, fixes: count("fix") },
    metrics: { fixes: count("fix"), wontFix: count("wont-fix"), questions: count("question"), skipped: count("skip"), replies: replies.length },
    output: `Plan: ${count("fix")} fix, ${count("wont-fix")} won't fix, ${count("question")} question, ${count("skip")} skipped.`,
  };
};

const postReply: Operation = async ({ state, exec, input, args }) => {
  if (!exec) throw new Error("github.postReply needs the host exec tool");
  const from = nodeArg(args, "from", "fb-reply-next");
  const draftNode = nodeArg(args, "draft", "fb-draft");
  const item = (state[from] as { item?: FeedbackItem } | undefined)?.item;
  const draft = Object.values((state[draftNode] ?? {}) as Record<string, string>)[0];
  if (!item || !draft) throw new Error("no reply to post");
  const first = item.comments[0]!;
  const result = first.kind === "thread"
    ? await exec("gh", ["api", "graphql", "-f", `query=mutation { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: "${first.id}", body: ${JSON.stringify(draft)} }) { comment { url } } }`])
    : await exec("gh", ["pr", "comment", String(input.pr), "--repo", input.repo ?? "", "--body", draft]);
  if (result.code !== 0) throw new Error(`posting the reply failed: ${result.stderr.slice(-300)}`);
  return { state: { posted: first.url }, metrics: { posted: 1 }, output: `Reply posted to ${first.url}` };
};

const feedbackReport: Operation = async ({ state, answers }) => {
  const check = stateOf<{ ci: string; comments: FeedbackComment[] }>(state, "fb-check");
  const plan = stateOf<{ decided: (FeedbackItem & { decision: string })[] }>(state, "fb-plan");
  const implement = answers?.["q-feedback-implement"];
  const lines = [
    `CI: ${check.ci}`,
    `Unresolved comments: ${check.comments.length}`,
    ...plan.decided.map((i) => `  - ${i.path ?? "PR"}${i.line ? `:${i.line}` : ""} (${i.comments.length} comments): ${i.decision}`),
    `Implementation: ${implement === "yes" ? "approved" : implement === "no" ? "declined" : "nothing to implement"}`,
  ];
  return { state: { done: true }, output: lines.join("\n") };
};

export const OPERATIONS: Record<string, Operation> = {
  "builtin.pass": pass,
  "github.prScope": prScope,
  "github.postComment": postComment,
  "list.next": listNext,
  "plan.read": planRead,
  "review.planReport": planReport,
  "github.prFeedback": prFeedback,
  "github.postReply": postReply,
  "feedback.plan": feedbackPlan,
  "feedback.report": feedbackReport,
  "feedback.fixNotAvailable": async () => {
    throw new Error("Fixing code from review comments needs write-capable agents in the factory (docs/yaml-migration-plan.md, E9). The decisions are recorded in this run; nothing was changed.");
  },
  "memory.load": memoryLoad,
  "memory.persist": memoryPersist,
  "review.route": reviewRoute,
  "review.detectLenses": detectLenses,
  "review.mergeFindings": mergeFindings,
  "review.confirmFindings": confirmFindings,
  "review.mergeRules": mergeRules,
  "review.addViolations": addViolations,
  "review.rankFindings": rankFindings,
};

export const PARSERS: Record<string, (text: string) => unknown> = {
  "text.raw": (text) => String(text).trim(),
  "review.findings": parseFindings,
  "review.verdicts": parseVerdicts,
  "review.rulesCheck": parseRulesCheck,
};
