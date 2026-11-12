import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { marketplaceDir } from "./marketplace-agents.ts";
import { evaluateWhen } from "./workflow-yaml.ts";
import type { Agent, Operation, ScriptContext, WorkflowState } from "./types.ts";

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
  const previous = nodeId ? (state[nodeId] as { index?: number; done?: boolean } | undefined) : undefined;
  const index = previous?.index === undefined || previous.done ? 0 : previous.index + 1;
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

const MARKETPLACE_FALLBACK = "C:\\Users\\Inny\\Documents\\Git\\marketplace";
const SEMVER_LINE = /^version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m;
const CLASSIFICATIONS = ["identical", "local-only", "marketplace-only", "project-adapter-only", "adapter-candidate", "portable-local-change", "conflict"];
const ADOPT = ["adopt-patch", "adopt-minor", "adopt-major"];

interface SyncArtifact {
  id: string;
  type: "skill" | "agent";
  name: string;
  localPath: string;
  marketplacePath: string;
  manifestPath: string;
  marketplaceVersion: string;
  localVersion: string;
}

interface Comparison {
  classification: string;
  marketplaceVersion: string;
  bump: string;
  nextVersion: string;
  action: string;
  report: string;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function marketplaceRoot(state: WorkflowState): string {
  return stateOf<{ path: string }>(state, "resolve-path").path;
}

const resolveMarketplacePath: Operation = async ({ input, exec, cwd }) => {
  if (!exec) throw new Error("sync.resolvePath needs the host exec tool");
  const adapterFile = path.join(cwd ?? ".", ".opencode", "marketplace-path.local.json");
  const adapter = fs.existsSync(adapterFile) ? (readJson(adapterFile).marketplacePath as string | undefined) : undefined;
  const [source, target] = input.marketplace ? ["input", input.marketplace] : process.env.MARKETPLACE_PATH ? ["MARKETPLACE_PATH", process.env.MARKETPLACE_PATH] : adapter ? ["project adapter", adapter] : ["fallback", MARKETPLACE_FALLBACK];
  if (!fs.existsSync(path.resolve(target))) throw new Error(`marketplace path ${path.resolve(target)} (${source}) does not exist`);
  const resolved = fs.realpathSync.native(path.resolve(target));
  const repo = await exec("git", ["-C", resolved, "rev-parse", "--is-inside-work-tree"]);
  if (repo.code !== 0 || repo.stdout.trim() !== "true") throw new Error(`marketplace path ${resolved} (${source}) is not a Git repository`);
  return { state: { path: resolved, source, fallback: source === "fallback" }, metrics: { fallback: source === "fallback" ? 1 : 0 }, output: `Marketplace (${source}): ${resolved}` };
};

const safeSource: Operation = async ({ state, exec, answers, args }) => {
  if (!exec) throw new Error("sync.safeSource needs the host exec tool");
  const root = typeof args.path === "string" ? String(args.path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), state) ?? "") : marketplaceRoot(state);
  if (!root) throw new Error(`with.path ${String(args.path)} is not set in state`);
  const switchQuestion = typeof args.question === "string" ? args.question : "q-marketplace-main";
  const git = (...args: string[]) => exec("git", ["-C", root, ...args]);
  const stop = (reason: string, detail: string, clean: number) => ({ state: { ok: false, reason, detail }, metrics: { clean, ok: 0 }, output: `Marketplace not safe: ${detail}` });
  const status = await git("status", "--porcelain");
  if (status.code !== 0) return stop("status", status.stderr.trim(), 0);
  if (status.stdout.trim()) return stop("dirty", `the worktree of ${root} has local changes`, 0);
  let branch = (await git("branch", "--show-current")).stdout.trim();
  if (branch !== "main") {
    if (answers?.[switchQuestion] !== "switch") return { state: { ok: false, reason: "not-main", detail: branch || "detached HEAD", branch }, metrics: { clean: 1, ok: 0 }, output: `Marketplace is on ${branch || "a detached HEAD"}, not main.` };
    const checkout = await git("checkout", "main");
    if (checkout.code !== 0) return stop("checkout", checkout.stderr.trim(), 1);
    branch = "main";
  }
  const remote = await git("remote", "get-url", "origin");
  if (remote.code !== 0) return stop("no-remote", `${root} has no origin remote`, 1);
  const fetch = await git("fetch", "origin", "main");
  if (fetch.code !== 0) return stop("fetch", fetch.stderr.trim(), 1);
  const pull = await git("pull", "--ff-only", "origin", "main");
  if (pull.code !== 0) return stop("pull", pull.stderr.trim(), 1);
  const head = (await git("rev-parse", "HEAD")).stdout.trim();
  return { state: { ok: true, reason: "ok", branch, head }, metrics: { clean: 1, ok: 1 }, output: `Marketplace ${root} is clean on main at ${head.slice(0, 12)}, fast-forwarded to origin/main.` };
};

function frontmatterVersion(file: string): string {
  return fs.existsSync(file) ? (fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").match(SEMVER_LINE)?.[1] ?? "none") : "none";
}

function skillDirIn(root: string, name: string): string | undefined {
  const skills = path.join(root, "skills");
  if (!fs.existsSync(skills)) return undefined;
  return fs.readdirSync(skills).map((c) => path.join(skills, c, name)).find((d) => fs.existsSync(path.join(d, "SKILL.md")));
}

function manifestVersion(file: string, key: "skills" | "agents", name: string): string {
  if (!fs.existsSync(file)) return "none";
  const entry = (readJson(file)[key] as { name: string; version?: string }[] | undefined)?.find((e) => e.name === name);
  return entry?.version ?? "none";
}

const discoverArtifacts: Operation = async ({ input, state, cwd }) => {
  const project = path.resolve(cwd ?? ".");
  const root = marketplaceRoot(state);
  const skillsDir = path.join(project, ".agents", "skills");
  const agentsDir = path.join(project, ".opencode", "agents");
  const localSkills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((n) => fs.existsSync(path.join(skillsDir, n, "SKILL.md"))) : [];
  const localAgents = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)) : [];
  const wanted = input.artifacts;
  if (wanted) {
    const missing = wanted.filter((n) => !localSkills.includes(n) && !localAgents.includes(n));
    if (missing.length) throw new Error(`input.artifacts not found in ${project}: ${missing.join(", ")}`);
  }
  const pick = (names: string[]) => (wanted ? names.filter((n) => wanted.includes(n)) : names);
  const skills: SyncArtifact[] = pick(localSkills).map((name) => {
    const dir = skillDirIn(root, name);
    return { id: name, type: "skill", name, localPath: path.join(skillsDir, name), marketplacePath: dir ?? "none", manifestPath: path.join(root, "registry.json"), marketplaceVersion: manifestVersion(path.join(root, "registry.json"), "skills", name), localVersion: frontmatterVersion(path.join(skillsDir, name, "SKILL.md")) };
  });
  const agents: SyncArtifact[] = pick(localAgents).map((name) => {
    const file = path.join(root, "agents", "opencode", `${name}.md`);
    return { id: name, type: "agent", name, localPath: path.join(agentsDir, `${name}.md`), marketplacePath: fs.existsSync(file) ? file : "none", manifestPath: path.join(root, "agents", "opencode", "index.json"), marketplaceVersion: manifestVersion(path.join(root, "agents", "opencode", "index.json"), "agents", name), localVersion: manifestVersion(path.join(agentsDir, "index.json"), "agents", name) };
  });
  const compare = [...skills, ...agents];
  return {
    state: { project, skills, agents, compare },
    metrics: { artifacts: compare.length, skills: skills.length, agents: agents.length },
    output: `Discovered ${skills.length} local skills and ${agents.length} local agents to compare in ${project}.`,
  };
};

const checkSkillVersions: Operation = async ({ state }) => {
  const skills = stateOf<{ skills: SyncArtifact[] }>(state, "discover").skills;
  const missing = skills.filter((s) => frontmatterVersion(path.join(s.localPath, "SKILL.md")) === "none").map((s) => s.name);
  if (missing.length) throw new Error(`olko-adapt-to-marketplace --local-only left no SemVer version in SKILL.md of: ${missing.join(", ")}. The sync stops here; check these skills and run again.`);
  const versions = skills.map((s) => `${s.name} ${frontmatterVersion(path.join(s.localPath, "SKILL.md"))}`);
  return { state: { versions }, metrics: { skills: skills.length }, output: versions.length ? `Local skill versions: ${versions.join(", ")}.` : "No local skills to version." };
};

export function parseComparison(text: string): Comparison {
  const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("result |"));
  if (!line) throw new Error("comparator report has no 'result |' line");
  const [, classification = "", marketplaceVersion = "none", bump = "none", nextVersion = "none", action = ""] = line.split("|").map((p) => p.trim());
  if (!CLASSIFICATIONS.includes(classification)) throw new Error(`comparator returned unknown classification '${classification}'`);
  return { classification, marketplaceVersion, bump, nextVersion, action, report: String(text).trim() };
}

export function syncOptions(classification: string): string[] {
  if (classification === "local-only") return ["create", "reject", "leave"];
  if (classification === "adapter-candidate") return ["move-to-adapter", ...ADOPT, "revert-local", "leave"];
  return [...ADOPT, "revert-local", "leave"];
}

const syncRows: Operation = async ({ state }) => {
  const discovered = stateOf<{ compare: SyncArtifact[] }>(state, "discover").compare;
  const compared = stateOf<Record<string, Comparison>>(state, "compare");
  const rows = discovered.map((a) => {
    const c = compared[a.id];
    if (!c) throw new Error(`no comparison for ${a.type} ${a.name}`);
    const candidate = c.classification === "local-only" ? (a.localVersion !== "none" ? a.localVersion : "1.0.0") : c.nextVersion;
    const line = `${a.type} ${a.name}: ${c.classification}; marketplace ${c.marketplaceVersion}; bump ${c.bump}; proposed ${candidate}; recommended ${c.action || "none"}`;
    return { type: a.type, name: a.name, classification: c.classification, marketplaceVersion: c.marketplaceVersion, bump: c.bump, nextVersion: candidate, action: c.action, line, options: syncOptions(c.classification) };
  });
  const decide = rows.filter((r) => r.classification !== "identical");
  return { state: { rows, decide, table: rows.map((r) => r.line).join("\n") }, metrics: { rows: rows.length, decide: decide.length }, output: `${rows.length} artifacts compared, ${decide.length} need a decision.` };
};

interface SyncRow {
  type: "skill" | "agent";
  name: string;
  classification: string;
  marketplaceVersion: string;
  nextVersion: string;
  decision: string;
}

interface AcceptedRow extends SyncRow {
  route: "change" | "revert" | "adapter";
  version: string;
  localPath: string;
  marketplacePath: string;
  instruction: string;
}

export function bumpVersion(version: string, bump: string): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return "1.0.0";
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const KEEP_LOCAL = "Keep project adapters, secrets, local paths, credentials and runtime settings out of the marketplace.";

export function applyInstruction(row: SyncRow & { localPath: string; marketplacePath: string }, root: string, version: string): string {
  const adapt = path.join(root, "skills", "marketplace", "olko-adapt-to-marketplace", "SKILL.md");
  if (row.decision === "create" && row.type === "skill") return `Create the marketplace skill ${row.name} from the local skill ${row.localPath}. Read ${adapt} and meet its validation requirements before you add the registry entry. Put it in the fitting category under ${path.join(root, "skills")}, set version ${version} in its SKILL.md frontmatter and add its entry to ${path.join(root, "registry.json")} at version ${version}. ${KEEP_LOCAL}`;
  if (row.decision === "create") return `Create the marketplace agent ${row.name}: copy the local definition ${row.localPath} to ${path.join(root, "agents", "opencode", `${row.name}.md`)} and add a valid entry for it to ${path.join(root, "agents", "opencode", "index.json")} at version ${version}, with its stack, role and declared skills taken from the definition. ${KEEP_LOCAL}`;
  if (row.type === "skill") return `Update only the marketplace skill directory ${row.marketplacePath} with the portable changes of the local skill ${row.localPath}. Set version ${version} in its SKILL.md frontmatter and in its entry in ${path.join(root, "registry.json")}. ${KEEP_LOCAL}`;
  return `Update only ${row.marketplacePath} with the portable changes of the local agent ${row.localPath}, and set version ${version} on its entry in ${path.join(root, "agents", "opencode", "index.json")}. Keep its permissions, declared skills and delegates unless they are the approved change. ${KEEP_LOCAL}`;
}

function acceptedRoute(decision: string): AcceptedRow["route"] {
  if (decision === "revert-local") return "revert";
  if (decision === "move-to-adapter") return "adapter";
  return "change";
}

const syncPlanApply: Operation = async ({ state, answers }) => {
  const { rows, decide } = stateOf<{ rows: SyncRow[]; decide: { name: string }[] }>(state, "rows");
  const discovered = stateOf<{ compare: SyncArtifact[] }>(state, "discover").compare;
  const root = marketplaceRoot(state);
  const decisionOf = (name: string) => {
    const index = decide.findIndex((d) => d.name === name);
    return index < 0 ? "none" : answers?.[`q-sync-${index}`] ?? "unanswered";
  };
  const decided = rows.map((r) => ({ ...r, decision: decisionOf(r.name) }));
  const accepted: AcceptedRow[] = decided
    .filter((r) => !["none", "leave", "reject", "unanswered"].includes(r.decision))
    .map((r) => {
      const artifact = discovered.find((a) => a.name === r.name)!;
      const version = r.decision.startsWith("adopt-") ? bumpVersion(r.marketplaceVersion, r.decision.slice(6)) : r.decision === "create" ? r.nextVersion : r.marketplaceVersion;
      const row = { ...r, localPath: artifact.localPath, marketplacePath: artifact.marketplacePath };
      return { ...row, route: acceptedRoute(r.decision), version, instruction: applyInstruction(row, root, version) };
    });
  return { state: { decided, accepted }, metrics: { accepted: accepted.length }, output: accepted.length ? `${accepted.length} accepted decisions to apply: ${accepted.map((a) => `${a.name} ${a.decision}`).join(", ")}.` : "No accepted decisions: nothing to apply, publish or install." };
};

function copyDir(from: string, to: string, keep: string[]): void {
  for (const entry of fs.existsSync(to) ? fs.readdirSync(to) : []) {
    if (!keep.includes(entry)) fs.rmSync(path.join(to, entry), { recursive: true, force: true });
  }
  fs.cpSync(from, to, { recursive: true, force: true });
}

const revertLocal: Operation = async ({ state }) => {
  const row = stateOf<{ item: AcceptedRow }>(state, "apply-next").item;
  if (row.marketplacePath === "none" || !fs.existsSync(row.marketplacePath)) throw new Error(`${row.type} ${row.name} has no marketplace counterpart to revert to`);
  if (row.type === "skill") copyDir(row.marketplacePath, row.localPath, ["project.md"]);
  else fs.copyFileSync(row.marketplacePath, row.localPath);
  return { state: { reverted: row.name }, metrics: { reverted: 1 }, output: `Local ${row.type} ${row.name} replaced with ${row.marketplacePath}.` };
};

const validateMarketplace: Operation = async ({ state, exec }) => {
  if (!exec) throw new Error("sync.validate needs the host exec tool");
  const root = marketplaceRoot(state);
  const accepted = stateOf<{ accepted: AcceptedRow[] }>(state, "plan").accepted.filter((a) => a.route !== "revert");
  const results: string[] = [];
  let failed = 0;
  const run = async (label: string, command: string, args: string[], cwd = root) => {
    const res = await exec(command, args, { cwd });
    if (res.code !== 0) failed += 1;
    results.push(`${label}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-3).join(" ")}`}`);
  };
  if (accepted.some((a) => a.type === "skill")) await run("registry --fix", "node", ["scripts/registry.mjs", "--fix"]);
  for (const agent of accepted.filter((a) => a.type === "agent")) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-check-"));
    await run(`install-opencode-agents ${agent.name}`, "node", ["scripts/install-opencode-agents.mjs", "--project", scratch, "--agent", agent.name]);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  if (accepted.length) await run("node tests", "node", ["--test", "scripts/registry.test.mjs", "scripts/install-opencode-agents.test.mjs", "scripts/readme.test.mjs"]);
  const status = (await exec("git", ["-C", root, "status", "--porcelain", "--untracked-files=all"])).stdout.trim();
  const diffStat = (await exec("git", ["-C", root, "diff", "--stat"])).stdout.trim();
  const versions = accepted.map((a) => `${a.type} ${a.name} ${a.decision} -> ${a.version}`).join("\n");
  return {
    state: { changed: status ? 1 : 0, status, diffStat, versions, summary: results.join("; ") || "nothing to validate", failed },
    metrics: { changed: status ? status.split(/\r?\n/).length : 0, failed },
    output: `Validation: ${results.join("; ") || "nothing to validate"}.`,
  };
};

export function parseApplied(text: string): { files: string[]; version: string } {
  const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => /^(applied|blocked) \|/.test(l));
  if (!line) throw new Error("apply output has no 'applied |' line");
  const [status, files = "", version = ""] = line.split("|").map((p) => p.trim());
  if (status === "blocked") throw new Error(`apply blocked: ${line}`);
  return { files: files.split(",").map((f) => f.trim()).filter(Boolean), version };
}

export function parsePrLine(text: string): { url: string; branch: string; commit: string } {
  const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("pr |"));
  if (!line) throw new Error("publish output has no 'pr |' line");
  const [, url = "", branch = "", commit = ""] = line.split("|").map((p) => p.trim());
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url)) throw new Error(`publish output has no PR URL: ${line}`);
  if (branch === "main") throw new Error("publish pushed to main; the sync requires a feature branch");
  return { url, branch, commit };
}

const waitForChecks: Operation = async ({ state, exec, nodeId }) => {
  if (!exec) throw new Error("sync.waitChecks needs the host exec tool");
  const pr = stateOf<{ "publish": { url: string } }>(state, "publish-pr").publish;
  const res = await exec("gh", ["pr", "checks", pr.url, "--watch", "--fail-fast"]);
  const round = ((nodeId ? (state[nodeId] as { round?: number } | undefined)?.round : 0) ?? 0) + 1;
  return { state: { round, passed: res.code === 0 }, metrics: { round, passed: res.code === 0 ? 1 : 0 }, output: `CI checks ${res.code === 0 ? "passed" : "did not pass"}: ${(res.stdout || res.stderr).trim().split(/\r?\n/).slice(-3).join(" ")}` };
};

const prOf: Operation = async ({ state }) => {
  const parsed = stateOf<Record<string, ReturnType<typeof parsePrLine>>>(state, "publish");
  const pr = Object.values(parsed)[0];
  if (!pr) throw new Error("publish returned no PR");
  return { state: { publish: pr }, metrics: { prs: 1 }, output: `PR ${pr.url} on branch ${pr.branch}.` };
};

const squashMerge: Operation = async ({ state, exec, args }) => {
  if (!exec) throw new Error("sync.merge needs the host exec tool");
  const root = typeof args.path === "string" ? String(args.path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), state) ?? "") : marketplaceRoot(state);
  const pr = stateOf<{ publish: { url: string; branch: string } }>(state, "publish-pr").publish;
  const draft = JSON.parse((await exec("gh", ["pr", "view", pr.url, "--json", "isDraft"])).stdout || "{}") as { isDraft?: boolean };
  if (draft.isDraft) {
    const ready = await exec("gh", ["pr", "ready", pr.url]);
    if (ready.code !== 0) throw new Error(`gh pr ready failed: ${(ready.stderr || ready.stdout).trim()}`);
  }
  const merge = await exec("gh", ["pr", "merge", pr.url, "--squash", "--delete-branch"], { cwd: root });
  if (merge.code !== 0) throw new Error(`squash merge failed: ${(merge.stderr || merge.stdout).trim()}`);
  const view = JSON.parse((await exec("gh", ["pr", "view", pr.url, "--json", "mergeCommit"])).stdout || "{}") as { mergeCommit?: { oid?: string } };
  const commit = view.mergeCommit?.oid;
  if (!commit) throw new Error(`no merge commit for ${pr.url}`);
  for (const args of [["checkout", "main"], ["pull", "--ff-only", "origin", "main"]]) {
    const res = await exec("git", ["-C", root, ...args]);
    if (res.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr.trim()}`);
  }
  await exec("git", ["-C", root, "branch", "-D", pr.branch]);
  const visible = await exec("git", ["-C", root, "merge-base", "--is-ancestor", commit, "origin/main"]);
  if (visible.code !== 0) throw new Error(`merge commit ${commit} is not on origin/main`);
  return { state: { commit }, metrics: { merged: 1 }, output: `Squash merged ${pr.url} as ${commit.slice(0, 12)}; local main updated, branch ${pr.branch} deleted.` };
};

async function openskillsCommand(exec: NonNullable<ScriptContext["exec"]>): Promise<[string, string[]]> {
  if (process.env.OPENSKILLS_CLI) return ["node", [process.env.OPENSKILLS_CLI]];
  if ((await exec("openskills", ["--help"])).code === 0) return ["openskills", []];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const cli = path.join(dir, "node_modules", "openskills", "dist", "cli.js");
    if (fs.existsSync(path.join(dir, "openskills.cmd")) && fs.existsSync(cli)) return ["node", [cli]];
  }
  throw new Error("OpenSkills CLI not found: install openskills or set OPENSKILLS_CLI to its dist/cli.js");
}

const installArtifacts: Operation = async ({ state, exec, cwd }) => {
  if (!exec) throw new Error("sync.install needs the host exec tool");
  const root = marketplaceRoot(state);
  const project = path.resolve(cwd ?? ".");
  const accepted = stateOf<{ accepted: AcceptedRow[] }>(state, "plan").accepted.filter((a) => a.route !== "revert");
  const origin = (await exec("git", ["-C", root, "remote", "get-url", "origin"])).stdout.trim();
  const repo = origin.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(\.git)?$/)?.[1];
  if (!repo) throw new Error(`marketplace origin ${origin} is not a GitHub repository`);
  const [command, prefix] = await openskillsCommand(exec);
  const help = await exec(command, [...prefix, "install", "--help"]);
  if (help.code !== 0 || !/--universal/.test(help.stdout) || !/--yes/.test(help.stdout)) throw new Error("the installed OpenSkills CLI has no install --universal --yes");
  const lines: string[] = [];
  let failed = 0;
  for (const skill of accepted.filter((a) => a.type === "skill")) {
    const dir = skillDirIn(root, skill.name);
    if (!dir) throw new Error(`skill ${skill.name} is not in ${root} after the merge`);
    const subpath = path.relative(root, dir).split(path.sep).join("/");
    const res = await exec(command, [...prefix, "install", `${repo}/${subpath}`, "--universal", "--yes"], { cwd: project });
    const installed = path.join(project, ".agent", "skills", skill.name);
    if (res.code === 0 && fs.existsSync(installed)) {
      fs.cpSync(installed, path.join(project, ".agents", "skills", skill.name), { recursive: true, force: true });
      fs.rmSync(installed, { recursive: true, force: true });
    }
    const same = fs.existsSync(path.join(project, ".agents", "skills", skill.name, "SKILL.md")) && fs.readFileSync(path.join(project, ".agents", "skills", skill.name, "SKILL.md"), "utf8") === (await exec("git", ["-C", root, "show", `origin/main:${subpath}/SKILL.md`])).stdout;
    if (res.code !== 0 || !same) failed += 1;
    lines.push(`skill ${skill.name}: ${res.code !== 0 ? `FAIL ${res.stderr.trim().slice(-200)}` : same ? "installed, matches origin/main" : "installed, DIFFERS from origin/main"}`);
  }
  for (const agent of accepted.filter((a) => a.type === "agent")) {
    const res = await exec("node", [path.join(root, "scripts", "install-opencode-agents.mjs"), "--project", project, "--agent", agent.name, "--force"]);
    const local = path.join(project, ".opencode", "agents", `${agent.name}.md`);
    const same = fs.existsSync(local) && fs.readFileSync(local, "utf8") === (await exec("git", ["-C", root, "show", `origin/main:agents/opencode/${agent.name}.md`])).stdout;
    if (res.code !== 0 || !same) failed += 1;
    lines.push(`agent ${agent.name}: ${res.code !== 0 ? `FAIL ${res.stderr.trim().slice(-200)}` : same ? "installed, matches origin/main" : "installed, DIFFERS from origin/main"}`);
  }
  return { state: { lines, failed }, metrics: { installed: lines.length - failed, failed }, output: `Install: ${lines.join("; ")}.` };
};

const syncMemorySave: Operation = async ({ state }) => {
  const memory = state.memory as { file?: string } | undefined;
  const install = stateOf<{ lines: string[]; failed: number }>(state, "install");
  if (!memory?.file || install.failed) return { state: { written: 0 }, metrics: { written: 0 }, output: "Memory: nothing verified to record." };
  const accepted = stateOf<{ accepted: AcceptedRow[] }>(state, "plan").accepted.filter((a) => a.route !== "revert");
  const lines = accepted.map((a) => `confirmed:sync ${a.decision} ${a.type} ${a.name} ${a.version} installed and verified`);
  fs.mkdirSync(path.dirname(memory.file), { recursive: true });
  fs.appendFileSync(memory.file, `${lines.join("\n")}\n`);
  return { state: { written: lines.length }, metrics: { written: lines.length }, output: `Memory: ${lines.length} verified sync decisions recorded in ${memory.file}.` };
};

const syncReport: Operation = async ({ state }) => {
  const plan = stateOf<{ decided: { type: string; name: string; classification: string; decision: string }[] }>(state, "plan");
  const source = stateOf<{ head?: string }>(state, "safe-source");
  const lines = plan.decided.map((r) => `${r.type} ${r.name}: ${r.classification} -> ${r.decision}`);
  const validate = state.validate as { changed?: number; summary?: string; diffStat?: string } | undefined;
  const pr = (state["publish-pr"] as { publish?: { url: string } } | undefined)?.publish;
  const merged = state.merge as { commit?: string } | undefined;
  const install = state.install as { lines?: string[] } | undefined;
  const outcome = !validate
    ? "Marketplace, branches and installs: unchanged."
    : !validate.changed
      ? "Marketplace unchanged; local reverts only. Nothing to publish."
      : !pr
        ? `Marketplace changes applied in the working tree of ${marketplaceRoot(state)} and not published. Validation: ${validate.summary}.`
        : !merged
          ? `Published as ${pr.url}; not merged, nothing installed.`
          : `Published as ${pr.url}, squash merged as ${merged.commit?.slice(0, 12)}. Install: ${install?.lines?.join("; ") ?? "not run"}.`;
  return { state: { lines }, metrics: { rows: lines.length }, output: [`Marketplace sync report (marketplace ${marketplaceRoot(state)} at ${source.head?.slice(0, 12) ?? "unknown"})`, ...lines, outcome].join("\n") };
};

interface Capability {
  id: string;
  basis: string;
  kind: "skill" | "agent";
  copies: Partial<Record<"target" | "olko" | "user", { name: string; path: string; version?: string; hash?: string }>>;
}

const DIRECTIONS: [from: "target" | "olko" | "user", direction: string][] = [["target", "target->olko"], ["olko", "olko->user"], ["user", "user->olko"]];
const BUMPS = ["patch", "minor", "major"];
const VERDICT_ACTIONS: Record<string, string[]> = {
  "target-only": ["port-to-olko", "exclude", "leave"],
  "olko-only": ["install-user", "reject", "exclude", "leave"],
  "user-only": ["publish-to-olko", "exclude", "leave"],
  "target-ahead": [...BUMPS.map((b) => `port-to-olko-${b}`), "exclude", "leave"],
  "olko-ahead": ["update-user", "exclude", "leave"],
  "user-ahead": [...BUMPS.map((b) => `publish-to-olko-${b}`), "revert-user", "exclude", "leave"],
  diverged: ["take-target", "take-olko", "exclude", "leave"],
  "platform-delta-only": ["leave", "exclude"],
};

function syncStateScript(): string {
  return path.join(marketplaceDir(), "plugins", "olko-sync", "skills", "olko-sync-state", "scripts", "sync-state.mjs");
}

async function syncState(exec: NonNullable<ScriptContext["exec"]>, stateDir: string, args: string[]): Promise<string> {
  const res = await exec("node", [syncStateScript(), ...args, "--state-dir", stateDir]);
  if (res.code !== 0) throw new Error(`sync-state ${args.slice(0, 2).join(" ")} failed: ${(res.stderr || res.stdout).trim()}`);
  return res.stdout;
}

function longPathOf(p: string): string {
  const resolved = path.resolve(p);
  return fs.existsSync(resolved) ? fs.realpathSync.native(resolved) : resolved;
}

const claudeSyncState: Operation = async ({ input, exec }) => {
  if (!exec) throw new Error("csync.state needs the host exec tool");
  const stateDir = longPathOf(input.stateDir ?? process.env.OLKO_SYNC_HOME ?? path.join(os.homedir(), ".olko-sync"));
  await syncState(exec, stateDir, ["init"]);
  if (input.olko) await syncState(exec, stateDir, ["target", "set-olko", "--path", longPathOf(input.olko)]);
  if (input.target) {
    if (!input.targetName || !/^[a-z0-9-]+$/.test(input.targetName)) throw new Error("input.targetName must be a kebab-case name for the Claude marketplace in input.target");
    await syncState(exec, stateDir, ["target", "set", "--name", input.targetName, "--path", longPathOf(input.target)]);
  }
  const targets = JSON.parse(await syncState(exec, stateDir, ["target", "get"])) as { olko: { path: string } | null; default: string | null; targets: Record<string, { path: string }>; leakTerms: string[] };
  const name = input.targetName ?? targets.default;
  const target = name ? targets.targets[name]?.path : undefined;
  if (!targets.olko?.path) throw new Error("no Olko checkout: give input.olko (the Olko marketplace checkout path)");
  if (!target) throw new Error("no Claude marketplace target: give input.target and input.targetName");
  const user = longPathOf(input.user ?? path.join(os.homedir(), ".claude"));
  const stores = [
    { id: "target", path: target, layout: "plugins/*/skills/*/SKILL.md and plugins/*/agents/*.md" },
    { id: "olko", path: targets.olko.path, layout: "skills/*/*/SKILL.md, plugins/*/skills/*/SKILL.md, agents/opencode/*.md (versions in agents/opencode/index.json), plugins/*/agents/*.md (version in plugin.json)" },
    { id: "user", path: user, layout: "skills/*/SKILL.md and agents/*.md" },
  ];
  return {
    state: { stateDir, olko: targets.olko.path, target, user, stores, leakTerms: targets.leakTerms, leakTermsText: targets.leakTerms.length ? `${targets.leakTerms.length} saved` : "none saved", script: syncStateScript() },
    metrics: { leakTerms: targets.leakTerms.length },
    output: `Sync state ready in ${stateDir}: Olko ${targets.olko.path}, user store ${user}, target set (name and path stay out of logs).`,
  };
};

const claudeSyncLeakSave: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.leakSave needs the host exec tool");
  const { stateDir } = stateOf<{ stateDir: string }>(state, "state");
  const answer = (answers?.["q-claude-sync-leak"] ?? "none").trim();
  const terms = /^none$/i.test(answer) ? [] : answer.split(",").map((t) => t.trim()).filter(Boolean);
  for (const term of terms) await syncState(exec, stateDir, ["target", "add-leak-term", "--term", term]);
  return { state: { added: terms.length }, metrics: { added: terms.length }, output: terms.length ? `${terms.length} leak terms added.` : "No leak terms added." };
};

function lastJsonBlock(text: string): any {
  const blocks = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = blocks.at(-1)?.[1];
  if (!raw) throw new Error("matcher output has no ```json block");
  return JSON.parse(raw);
}

export function parseCapabilities(text: string): { capabilities: Capability[]; probable: { id: string; evidence: string }[] } {
  const data = lastJsonBlock(text) as { capabilities?: Capability[]; probable?: { id: string; evidence: string }[] };
  if (!Array.isArray(data.capabilities)) throw new Error("matcher JSON has no capabilities list");
  for (const c of data.capabilities) {
    if (!c.id || !["skill", "agent"].includes(c.kind) || typeof c.copies !== "object") throw new Error(`matcher capability is malformed: ${JSON.stringify(c).slice(0, 200)}`);
  }
  return { capabilities: data.capabilities, probable: data.probable ?? [] };
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^[a-z0-9-]+:/, "").replace(/^olko-/, "");
}

interface InventoryRow {
  kind: "skill" | "agent";
  name: string;
  path: string;
  version?: string;
  hash?: string;
  portedFrom?: string;
}

export function parseInventory(text: string): { rows: InventoryRow[] } {
  const data = lastJsonBlock(text) as { rows?: InventoryRow[] };
  if (!Array.isArray(data.rows)) throw new Error("inventory JSON has no rows list");
  const rows = data.rows.filter((r) => r && (r.kind === "skill" || r.kind === "agent") && typeof r.name === "string" && typeof r.path === "string");
  if (rows.length !== data.rows.length) throw new Error(`inventory JSON has ${data.rows.length - rows.length} malformed rows`);
  return { rows };
}

const STORES = ["target", "olko", "user"] as const;

const claudeSyncInventories: Operation = async ({ state }) => {
  const inventory = stateOf<Record<string, { rows: InventoryRow[] }>>(state, "inventory");
  const texts = Object.fromEntries(STORES.map((store) => [store, JSON.stringify(inventory[store]?.rows ?? [])]));
  const counts = Object.fromEntries(STORES.map((store) => [store, inventory[store]?.rows.length ?? 0]));
  return { state: { ...texts, counts }, metrics: counts, output: `Inventory: ${STORES.map((st) => `${st} ${counts[st]}`).join(", ")} artifacts.` };
};

export function buildCapabilities(inventory: Record<string, { rows: InventoryRow[] }>, roots: Record<string, string>, linked: Capability[]): Capability[] {
  const absolute = (store: string, p: string) => (path.isAbsolute(p) ? p : path.join(roots[store]!, p));
  const key = (store: string, kind: string, name: string) => `${store}|${kind}|${name}`;
  const rowsByKey = new Map<string, InventoryRow & { store: string }>();
  for (const store of STORES) for (const row of inventory[store]?.rows ?? []) rowsByKey.set(key(store, row.kind, row.name), { ...row, store });
  const used = new Set<string>();
  const copyOf = (store: string, row: InventoryRow) => ({ name: row.name, path: absolute(store, row.path), ...(row.version ? { version: row.version } : {}), ...(row.hash ? { hash: row.hash } : {}) });
  const result: Capability[] = [];
  for (const c of linked) {
    const copies: Capability["copies"] = {};
    for (const store of STORES) {
      const copy = c.copies[store];
      if (!copy) continue;
      const row = rowsByKey.get(key(store, c.kind, copy.name));
      if (!row || used.has(key(store, c.kind, copy.name))) continue;
      used.add(key(store, c.kind, copy.name));
      copies[store] = copyOf(store, row);
    }
    if (Object.keys(copies).length) result.push({ ...c, copies });
  }
  const byName = new Map<string, (InventoryRow & { store: string })[]>();
  for (const [k, row] of rowsByKey) {
    if (used.has(k)) continue;
    const name = `${row.kind}|${normalizeName(row.name)}`;
    byName.set(name, [...(byName.get(name) ?? []), row]);
  }
  for (const [name, rows] of byName) {
    const copies: Capability["copies"] = {};
    for (const row of rows) if (!copies[row.store as (typeof STORES)[number]]) copies[row.store as (typeof STORES)[number]] = copyOf(row.store, row);
    const stores = Object.keys(copies).length;
    result.push({ id: name.split("|")[1]!, basis: stores > 1 ? "name" : "single", kind: rows[0]!.kind, copies });
  }
  return result;
}

const claudeSyncCapabilities: Operation = async ({ state }) => {
  const parsed = Object.values(stateOf<Record<string, ReturnType<typeof parseCapabilities>>>(state, "match"))[0];
  if (!parsed) throw new Error("the matcher returned nothing");
  const { target, olko, user } = stateOf<{ target: string; olko: string; user: string }>(state, "state");
  const capabilities = buildCapabilities(stateOf<Record<string, { rows: InventoryRow[] }>>(state, "inventory"), { target, olko, user }, parsed.capabilities);
  const linked = capabilities.filter((c) => Object.keys(c.copies).length > 1).length;
  return { state: { capabilities, probable: parsed.probable }, metrics: { capabilities: capabilities.length, linked, probable: parsed.probable.length }, output: `${capabilities.length} capabilities (${linked} across stores), ${parsed.probable.length} probable links.` };
};

const claudeSyncSelect: Operation = async ({ state, input }) => {
  const { capabilities, probable } = stateOf<ReturnType<typeof parseCapabilities>>(state, "capabilities");
  const wanted = input.artifacts?.map(normalizeName);
  const matches = (c: Capability) => !wanted || [c.id, ...Object.values(c.copies).map((copy) => copy?.name ?? "")].some((n) => wanted.includes(normalizeName(n)));
  const selected = capabilities.filter(matches);
  if (wanted) {
    const missing = input.artifacts!.filter((a) => !selected.some((c) => [c.id, ...Object.values(c.copies).map((copy) => copy?.name ?? "")].some((n) => normalizeName(n) === normalizeName(a))));
    if (missing.length) throw new Error(`input.artifacts not found in any store: ${missing.join(", ")}`);
  }
  const ask = probable.filter((p) => selected.some((c) => c.id === p.id));
  return { state: { selected, probable: ask }, metrics: { selected: selected.length, probable: ask.length }, output: `${selected.length} capabilities selected${wanted ? ` from input.artifacts` : ""}; ${ask.length} probable links to confirm.` };
};

const claudeSyncExclusions: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.exclusions needs the host exec tool");
  const { stateDir } = stateOf<{ stateDir: string }>(state, "state");
  const { selected, probable } = stateOf<{ selected: Capability[]; probable: { id: string }[] }>(state, "select");
  const split = new Set(probable.filter((_, i) => answers?.[`q-claude-sync-probable-${i}`] === "split").map((p) => p.id));
  const capabilities = selected.flatMap((c) => (split.has(c.id) ? Object.entries(c.copies).map(([store, copy]) => ({ ...c, id: `${c.id}@${store}`, basis: "split", copies: { [store]: copy } })) : [c]));
  const compare: (Capability & { copiesText: string })[] = [];
  const excluded: { id: string; reason: string }[] = [];
  for (const c of capabilities) {
    const checks: { status: string; reason?: string }[] = [];
    for (const [store, direction] of DIRECTIONS) {
      const copy = c.copies[store];
      if (!copy) continue;
      const out = await syncState(exec, stateDir, ["exclusion", "check", "--artifact", `${c.kind}:${copy.name}`, "--direction", direction, ...(copy.version && copy.version !== "—" ? ["--version", copy.version] : [])]);
      checks.push(JSON.parse(out));
    }
    if (checks.length && checks.every((x) => x.status === "excluded")) excluded.push({ id: c.id, reason: checks[0]?.reason ?? "excluded" });
    else compare.push({ ...c, copiesText: Object.entries(c.copies).map(([store, copy]) => `${store}: ${copy?.name} ${copy?.path} version ${copy?.version ?? "—"} hash ${copy?.hash ?? "—"}`).join("\n") });
  }
  return { state: { compare, excluded }, metrics: { compare: compare.length, excluded: excluded.length }, output: `${compare.length} capabilities to compare, ${excluded.length} excluded.` };
};

export function parseVerdict(text: string): { verdict: string; bump: string; nextVersion: string; action: string; report: string } {
  const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith("result |"));
  if (!line) throw new Error("comparator report has no 'result |' line");
  const [, verdict = "", bump = "none", nextVersion = "none", action = ""] = line.split("|").map((p) => p.trim());
  if (verdict !== "identical" && !VERDICT_ACTIONS[verdict]) throw new Error(`comparator returned unknown verdict '${verdict}'`);
  return { verdict, bump, nextVersion, action, report: String(text).trim() };
}

export function claudeSyncActions(verdict: string): string[] {
  return VERDICT_ACTIONS[verdict] ?? [];
}

const claudeSyncRows: Operation = async ({ state }) => {
  const { compare, excluded } = stateOf<{ compare: Capability[]; excluded: { id: string; reason: string }[] }>(state, "exclusions");
  const verdicts = (state.compare as Record<string, ReturnType<typeof parseVerdict>> | undefined) ?? {};
  const rows = compare.map((c) => {
    const v = verdicts[c.id];
    if (!v) throw new Error(`no verdict for capability ${c.id}`);
    const copies = Object.entries(c.copies).map(([store, copy]) => `${store} ${copy?.version ?? "—"}`).join(", ");
    return { id: c.id, kind: c.kind, verdict: v.verdict, bump: v.bump, nextVersion: v.nextVersion, action: v.action, options: claudeSyncActions(v.verdict), line: `${c.kind} ${c.id}: ${v.verdict}; copies ${copies}; recommended ${v.action || "none"}; proposed Olko version ${v.nextVersion}` };
  });
  const decide = rows.filter((r) => r.verdict !== "identical");
  const table = [...rows.map((r) => r.line), ...excluded.map((e) => `${e.id}: excluded (${e.reason})`)].join("\n");
  return { state: { rows, decide, excluded, table }, metrics: { rows: rows.length, decide: decide.length }, output: `${rows.length} capabilities compared, ${decide.length} need a decision, ${excluded.length} excluded.` };
};

const claudeSyncPlan: Operation = async ({ state, answers }) => {
  const { rows, decide } = stateOf<{ rows: { id: string; kind: string; verdict: string }[]; decide: { id: string }[] }>(state, "rows");
  const decided = rows.map((r) => {
    const index = decide.findIndex((d) => d.id === r.id);
    return { ...r, decision: index < 0 ? "none" : answers?.[`q-claude-sync-${index}`] ?? "unanswered" };
  });
  const records = decided.filter((r) => r.decision === "exclude");
  const rejects = decided.filter((r) => r.decision === "reject");
  const changes = decided.filter((r) => !["none", "leave", "exclude", "reject", "unanswered"].includes(r.decision));
  return { state: { decided, records, rejects, changes }, metrics: { records: records.length, rejects: rejects.length, changes: changes.length }, output: `${changes.length} rows to apply, ${records.length} exclusions and ${rejects.length} rejections to record.` };
};

const claudeSyncRecord: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.record needs the host exec tool");
  const { stateDir } = stateOf<{ stateDir: string }>(state, "state");
  const { compare } = stateOf<{ compare: Capability[] }>(state, "exclusions");
  const { records, rejects } = stateOf<{ records: { id: string; kind: string; decision: string }[]; rejects: { id: string; kind: string; decision: string }[] }>(state, "plan");
  const lines: string[] = [];
  for (const [i, r] of [...records, ...rejects].entries()) {
    const c = compare.find((x) => x.id === r.id)!;
    const source = c.copies.target ?? c.copies.olko ?? c.copies.user;
    const artifact = `${r.kind}:${source?.name}`;
    if (r.decision === "reject") {
      await syncState(exec, stateDir, ["exclusion", "add", "--artifact", artifact, "--reason", "rejected new artifact", "--kind", "rejected-new", "--version", c.copies.olko?.version ?? "0.0.0"]);
    } else {
      const scope = answers?.[`q-claude-sync-scope-${i}`] ?? "all";
      const reason = answers?.[`q-claude-sync-reason-${i}`] ?? "excluded by the user";
      await syncState(exec, stateDir, ["exclusion", "add", "--artifact", artifact, "--reason", reason, ...(scope === "all" ? [] : ["--scope", scope])]);
    }
    lines.push(`${artifact} ${r.decision}`);
  }
  return { state: { lines }, metrics: { recorded: lines.length }, output: lines.length ? `Recorded: ${lines.join(", ")}.` : "Nothing to record." };
};

const claudeSyncReport: Operation = async ({ state }) => {
  const plan = stateOf<{ decided: { id: string; verdict: string; decision: string }[] }>(state, "plan");
  const { excluded } = stateOf<{ excluded: { id: string }[] }>(state, "exclusions");
  const lines = [...plan.decided.map((r) => `row | ${r.id} | ${r.verdict} | ${r.decision}`), ...excluded.map((e) => `row | ${e.id} | excluded | excluded`)];
  const changes = plan.decided.filter((r) => !["none", "leave", "exclude", "reject", "unanswered"].includes(r.decision)).length;
  const applied = (state["apply-record"] as { applied?: string[] } | undefined)?.applied ?? [];
  const pr = (state["publish-pr"] as { publish?: { url: string } } | undefined)?.publish;
  const merged = state.merge as { commit?: string } | undefined;
  const olkoChanged = (state["apply-record"] as { olkoChanged?: boolean } | undefined)?.olkoChanged;
  const published = pr ? (merged ? `Published as ${pr.url}, squash merged as ${merged.commit?.slice(0, 12)}.` : `Published as draft ${pr.url}, not merged.`) : olkoChanged ? "Olko changes are in the working tree and not published." : "No Olko change to publish.";
  const outcome = changes ? `Applied ${applied.length} of ${changes} rows: ${applied.join(", ") || "none"}. ${published}` : "Olko, the target and the user scope: unchanged.";
  const consolidation = state["consolidation-record"] as { accepted: number; rejected: number; planFile: string } | undefined;
  const consolidated = consolidation ? `Consolidation: ${consolidation.accepted} accepted (plan ${consolidation.planFile}), ${consolidation.rejected} rejected.` : "Consolidation: skipped.";
  return { state: { lines }, metrics: { rows: lines.length }, output: ["Claude sync report", ...lines, outcome, consolidated].join("\n") };
};

interface StageItem {
  id: string;
  rowId: string;
  kind: "skill" | "agent";
  decision: string;
  direction: "to-olko" | "to-user";
  source: string;
  sourceStore: "target" | "olko" | "user";
  existing: string;
  stageDir: string;
  overwrite: boolean;
  version: string;
}

interface Staged {
  name: string;
  stagedPath: string;
  findings: { file: string; line: number; category: string; replacement: string }[];
  missing: string[];
  entry: Record<string, unknown> | null;
  category: string | null;
  blockers: string[];
}

function directionOf(decision: string): { direction: StageItem["direction"]; from: StageItem["sourceStore"]; overwrite: boolean } {
  if (decision.startsWith("port-to-olko") || decision === "take-target") return { direction: "to-olko", from: "target", overwrite: decision === "take-target" };
  if (decision.startsWith("publish-to-olko")) return { direction: "to-olko", from: "user", overwrite: false };
  return { direction: "to-user", from: "olko", overwrite: decision === "take-olko" || decision === "revert-user" };
}

const claudeSyncStagePlan: Operation = async ({ state, answers, nodeId }) => {
  const { changes } = stateOf<{ changes: { id: string; kind: "skill" | "agent"; decision: string; nextVersion?: string }[] }>(state, "plan");
  const { compare } = stateOf<{ compare: Capability[] }>(state, "exclusions");
  const rows = stateOf<{ rows: { id: string; nextVersion: string }[] }>(state, "rows").rows;
  const previous = nodeId ? (state[nodeId] as { items?: StageItem[]; round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const missing = (state.findings as { missing?: { id: string; kind: "skill" | "agent"; name: string; olkoPath: string }[] } | undefined)?.missing ?? [];
  const added = missing.filter((_, i) => answers?.[`q-claude-sync-missing-${previous?.round ?? 0}-${i}`] === "install-user");
  const items: StageItem[] = [];
  const add = (row: Omit<StageItem, "stageDir">) => items.push({ ...row, stageDir: fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "factory-stage-"))) });
  if (round === 1) {
    for (const change of changes) {
      const c = compare.find((x) => x.id === change.id)!;
      const { direction, from, overwrite } = directionOf(change.decision);
      const source = c.copies[from];
      if (!source) throw new Error(`${change.decision} for ${change.id} needs a ${from} copy`);
      const existing = direction === "to-olko" ? c.copies.olko?.path : c.copies.user?.path;
      const bump = change.decision.match(/-(patch|minor|major)$/)?.[1];
      const version = direction === "to-user" ? c.copies.olko?.version ?? "none" : bump ? bumpVersion(c.copies.olko?.version ?? "0.0.0", bump) : rows.find((r) => r.id === change.id)?.nextVersion ?? "1.0.0";
      add({ id: change.id, rowId: change.id, kind: c.kind, decision: change.decision, direction, source: source.path, sourceStore: from, existing: existing ?? "none", overwrite, version: direction === "to-user" || /^\d+\.\d+\.\d+$/.test(version) ? version : "1.0.0" });
    }
  } else {
    for (const m of added) add({ id: `${m.kind}-${m.name}`, rowId: m.id, kind: m.kind, decision: "install-user", direction: "to-user", source: m.olkoPath, sourceStore: "olko", existing: "none", overwrite: false, version: "none" });
  }
  const all = [...(previous?.items ?? []), ...items];
  return { state: { items: all, wave: items, round }, metrics: { staged: items.length, round }, output: `Wave C round ${round}: ${items.length} rows to stage.` };
};

export function parseStaged(text: string): Staged {
  const data = lastJsonBlock(text) as Partial<Staged>;
  if (typeof data.name !== "string" || typeof data.stagedPath !== "string") throw new Error("porter JSON needs name and stagedPath");
  return { name: data.name, stagedPath: data.stagedPath, findings: data.findings ?? [], missing: data.missing ?? [], entry: data.entry ?? null, category: data.category ?? null, blockers: data.blockers ?? [] };
}

const claudeSyncFindings: Operation = async ({ state }) => {
  const { wave: items, items: all, round } = stateOf<{ wave: StageItem[]; items: StageItem[]; round: number }>(state, "stage-plan");
  const staged = stateOf<Record<string, Staged>>(state, "stage");
  const olko = stateOf<{ olko: string }>(state, "state").olko;
  const blocked = items.filter((i) => staged[i.id]?.blockers.length).map((i) => `${i.id}: ${staged[i.id]!.blockers.join("; ")}`);
  if (blocked.length) throw new Error(`porter blockers, nothing applied: ${blocked.join(" | ")}`);
  const findings = items.flatMap((i) => (staged[i.id]?.findings ?? []).map((f) => ({ item: i.id, ...f, line: `${i.id} ${f.file}:${f.line} — ${f.category} — proposed: ${f.replacement}` })));
  const missing = items
    .filter((i) => i.direction === "to-user")
    .flatMap((i) => (staged[i.id]?.missing ?? []).map((ref) => {
      const [kind, name] = ref.split(":") as ["skill" | "agent", string];
      const olkoPath = kind === "agent" ? path.join(olko, "agents", "opencode", `${name}.md`) : (skillDirIn(olko, name) ?? "none");
      return { id: `${kind}:${name}`, kind, name, olkoPath, for: i.id, line: `${kind} ${name}, needed by ${i.id}` };
    }))
    .filter((m, i, list) => m.olkoPath !== "none" && list.findIndex((x) => x.id === m.id) === i && !all.some((it) => it.id === `${m.kind}-${m.name}`));
  return { state: { findings, missing, round }, metrics: { findings: findings.length, missing: missing.length }, output: `${findings.length} sanitize findings to decide, ${missing.length} missing dependencies.` };
};

const claudeSyncFixes: Operation = async ({ state, answers, nodeId }) => {
  const { findings, round } = stateOf<{ findings: { item: string; line: string }[]; round: number }>(state, "findings");
  const previous = nodeId ? (state[nodeId] as { ready?: StageItem[]; skipped?: string[] } | undefined) : undefined;
  const decided = findings.map((f, i) => ({ ...f, decision: answers?.[`q-claude-sync-finding-${round}-${i}`] ?? "skip-row" }));
  const skipped = [...new Set([...(previous?.skipped ?? []), ...decided.filter((d) => d.decision === "skip-row").map((d) => d.item)])];
  const byItem = new Map<string, string[]>();
  for (const d of decided.filter((d) => d.decision === "replace" || d.decision === "delete")) byItem.set(d.item, [...(byItem.get(d.item) ?? []), `${d.decision}: ${d.line}`]);
  const { items, wave } = stateOf<{ items: StageItem[]; wave: StageItem[] }>(state, "stage-plan");
  const fixes = wave.filter((i) => byItem.has(i.id) && !skipped.includes(i.id)).map((i) => ({ ...i, decisions: byItem.get(i.id)!.join("\n") }));
  const ready = items.filter((i) => !skipped.includes(i.id));
  return { state: { fixes, ready, skipped }, metrics: { fixes: fixes.length, ready: ready.length, skipped: skipped.length }, output: `${ready.length} rows ready, ${fixes.length} need staged fixes, ${skipped.length} skipped by a finding.` };
};

function olkoCategories(olko: string): string[] {
  const skills = path.join(olko, "skills");
  return fs.existsSync(skills) ? fs.readdirSync(skills).filter((c) => fs.statSync(path.join(skills, c)).isDirectory()).sort() : [];
}

const claudeSyncMoreDeps: Operation = async ({ state, answers }) => {
  const { missing, round } = stateOf<{ missing: unknown[]; round: number }>(state, "findings");
  const more = round < 2 ? missing.filter((_, i) => answers?.[`q-claude-sync-missing-${round}-${i}`] === "install-user").length : 0;
  return { state: { more }, metrics: { more }, output: more ? `${more} missing dependencies to stage in the next wave.` : "No more dependencies to stage." };
};

const claudeSyncApplyPlan: Operation = async ({ state }) => {
  const { ready } = stateOf<{ ready: StageItem[] }>(state, "fixes");
  const staged = stateOf<Record<string, Staged>>(state, "stage");
  const olko = stateOf<{ olko: string }>(state, "state").olko;
  const categories = olkoCategories(olko);
  const rows = ready.map((i) => {
    const s = staged[i.id]!;
    const newSkill = i.direction === "to-olko" && i.kind === "skill" && i.existing === "none";
    const diffFile = path.join(i.stageDir, "diff.patch");
    const diff = fs.existsSync(diffFile) ? fs.readFileSync(diffFile, "utf8").slice(0, 6000) : "new file, no existing copy";
    return { ...i, name: s.name, stagedPath: s.stagedPath, needsCategory: newSkill, categories: s.category && categories.includes(s.category) ? [s.category, ...categories.filter((c) => c !== s.category)] : categories, diff };
  });
  return { state: { rows }, metrics: { rows: rows.length }, output: `${rows.length} rows to apply one at a time.` };
};

async function contentHash(exec: NonNullable<ScriptContext["exec"]>, stateDir: string, target: string): Promise<string> {
  return (await syncState(exec, stateDir, ["hash", "--path", target])).trim().split(/\s+/).at(-1) ?? "";
}

async function recordLineage(exec: NonNullable<ScriptContext["exec"]>, stateDir: string, capability: string, store: string, target: string, sourceStore: string, source: string) {
  const hash = await contentHash(exec, stateDir, target);
  const sourceHash = await contentHash(exec, stateDir, source);
  await syncState(exec, stateDir, ["lineage", "set", "--capability", capability.replace(/[^a-z0-9-]/g, "-"), "--store", store, "--path", target, "--hash", hash, "--ported-from", `${sourceStore}@${sourceHash}`]);
  return hash;
}

function upsertEntry(file: string, key: "skills" | "agents", entry: Record<string, unknown>): void {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = json[key] as Record<string, unknown>[];
  const index = list.findIndex((e) => e.name === entry.name);
  if (index >= 0) list[index] = { ...list[index], ...entry };
  else list.push(entry);
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

const claudeSyncApplyOlko: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.applyOlko needs the host exec tool");
  const { item, index } = stateOf<{ item: { id: string; kind: string; name: string; stagedPath: string; version: string; needsCategory: boolean; existing: string; source: string; sourceStore: string; overwrite: boolean }; index: number }>(state, "apply-next");
  const { olko, stateDir } = stateOf<{ olko: string; stateDir: string }>(state, "state");
  const staged = stateOf<Record<string, Staged>>(state, "stage")[item.id]!;
  if (item.overwrite && answers?.[`q-claude-sync-overwrite-${index}`] !== "overwrite") return { state: { applied: false }, metrics: { applied: 0, failed: 0 }, output: `${item.id}: overwrite not confirmed, nothing written.` };
  const results: string[] = [];
  let target: string;
  if (item.kind === "skill") {
    const category = item.needsCategory ? answers?.[`q-claude-sync-category-${index}`] : path.basename(path.dirname(item.existing));
    if (!category) throw new Error(`no category for ${item.name}`);
    target = item.existing !== "none" ? item.existing : path.join(olko, "skills", category, item.name);
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(item.stagedPath, target, { recursive: true, force: true, filter: (f) => path.basename(f) !== "diff.patch" });
    upsertEntry(path.join(olko, "registry.json"), "skills", { ...(staged.entry ?? {}), name: item.name, category, version: item.version });
    for (const args of [["scripts/registry.mjs", "--fix"], ["scripts/registry.mjs"]]) {
      const res = await exec("node", args, { cwd: olko });
      results.push(`${args.join(" ")}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}`}`);
    }
  } else {
    target = path.join(olko, "agents", "opencode", `${item.name}.md`);
    fs.copyFileSync(fs.statSync(item.stagedPath).isDirectory() ? path.join(item.stagedPath, `${item.name}.md`) : item.stagedPath, target);
    upsertEntry(path.join(olko, "agents", "opencode", "index.json"), "agents", { ...(staged.entry ?? {}), name: item.name, version: item.version, file: `${item.name}.md` });
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agent-check-"));
    const res = await exec("node", ["scripts/install-opencode-agents.mjs", "--project", scratch, "--agent", item.name], { cwd: olko });
    fs.rmSync(scratch, { recursive: true, force: true });
    results.push(`install-opencode-agents ${item.name}: ${res.code === 0 ? "pass" : `FAIL ${(res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}`}`);
  }
  await recordLineage(exec, stateDir, item.id, "olko", target, item.sourceStore, item.source);
  const failed = results.filter((r) => r.includes("FAIL")).length;
  return { state: { applied: true, target, results, failed }, metrics: { applied: 1, failed }, output: `${item.id} -> Olko ${path.relative(olko, target)} at ${item.version}. ${results.join("; ")}` };
};

const claudeSyncApplyUser: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.applyUser needs the host exec tool");
  const { item, index } = stateOf<{ item: { id: string; kind: string; name: string; stagedPath: string; source: string; overwrite: boolean }; index: number }>(state, "apply-next");
  const { user, stateDir } = stateOf<{ user: string; stateDir: string }>(state, "state");
  if (answers?.[`q-claude-sync-write-${index}`] !== "write") return { state: { applied: false }, metrics: { applied: 0 }, output: `${item.id}: write to the user scope declined.` };
  const target = item.kind === "skill" ? path.join(user, "skills", item.name) : path.join(user, "agents", `${item.name}.md`);
  if (item.kind === "skill") {
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(item.stagedPath, target, { recursive: true, force: true, filter: (f) => path.basename(f) !== "diff.patch" });
  } else {
    fs.copyFileSync(fs.statSync(item.stagedPath).isDirectory() ? path.join(item.stagedPath, `${item.name}.md`) : item.stagedPath, target);
  }
  await recordLineage(exec, stateDir, item.id, "user", target, "olko", item.source);
  return { state: { applied: true, target }, metrics: { applied: 1 }, output: `${item.id} -> user scope ${target}.` };
};

const claudeSyncApplyRecord: Operation = async ({ state, nodeId }) => {
  const previous = nodeId ? (state[nodeId] as { applied?: string[]; failed?: number } | undefined) : undefined;
  const { item } = stateOf<{ item: { id: string; direction: string } }>(state, "apply-next");
  const result = (item.direction === "to-olko" ? state["apply-olko"] : state["apply-user"]) as { applied?: boolean; failed?: number } | undefined;
  const applied = [...(previous?.applied ?? []), ...(result?.applied ? [`${item.id} ${item.direction}`] : [])];
  const failed = (previous?.failed ?? 0) + (result?.failed ?? 0);
  return { state: { applied, failed, olkoChanged: applied.some((a) => a.endsWith("to-olko")) }, metrics: { applied: applied.length, failed }, output: `${applied.length} rows applied so far.` };
};

const claudeSyncOlkoTests: Operation = async ({ state, exec }) => {
  if (!exec) throw new Error("csync.olkoTests needs the host exec tool");
  const { olko } = stateOf<{ olko: string }>(state, "state");
  const res = await exec("node", ["--test", "scripts/*.test.mjs"], { cwd: olko });
  const summary = (res.stdout.match(/^ℹ (pass|fail) \d+$/gm) ?? []).join(", ");
  return { state: { passed: res.code === 0, summary }, metrics: { failed: res.code === 0 ? 0 : 1 }, output: `Olko node tests: ${res.code === 0 ? "pass" : "FAIL"} (${summary || (res.stderr || res.stdout).trim().split(/\r?\n/).slice(-2).join(" ")}).` };
};

const claudeSyncLeakCheck: Operation = async ({ state, exec, input }) => {
  if (!exec) throw new Error("csync.leakCheck needs the host exec tool");
  const { olko, target, leakTerms } = stateOf<{ olko: string; target: string; leakTerms: string[] }>(state, "state");
  const plugins = fs.existsSync(path.join(target, "plugins")) ? fs.readdirSync(path.join(target, "plugins")) : [];
  const portedPlugins = new Set(stateOf<{ rows: { source: string; sourceStore: string }[] }>(state, "apply-plan").rows.filter((r) => r.sourceStore === "target").map((r) => path.relative(path.join(target, "plugins"), r.source).split(path.sep)[0]));
  const terms = [...leakTerms, input.targetName ?? "", target, path.basename(target), ...plugins.filter((p) => !portedPlugins.has(p))].filter((t) => t.length > 2).map((t) => t.toLowerCase());
  const changed = (await exec("git", ["-C", olko, "status", "--porcelain", "--untracked-files=all"])).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
  const hits: string[] = [];
  for (const file of changed) {
    const full = path.join(olko, file);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
    const added = file.endsWith(".json") ? (await exec("git", ["-C", olko, "diff", "--", file])).stdout.split(/\r?\n/).filter((l) => l.startsWith("+")).join("\n") : fs.readFileSync(full, "utf8");
    terms.forEach((t, n) => {
      if (added.toLowerCase().includes(t)) hits.push(`${file}: leak term #${n + 1}`);
    });
  }
  if (hits.length) throw new Error(`leak check failed, nothing published: ${hits.join("; ")}`);
  return { state: { changed, files: changed.join("\n") }, metrics: { leaks: 0, changed: changed.length }, output: `Leak check passed on ${changed.length} changed Olko files.` };
};

const claudeSyncPublish: Operation = async ({ state, exec }) => {
  if (!exec) throw new Error("csync.publish needs the host exec tool");
  const { olko } = stateOf<{ olko: string }>(state, "state");
  const { changed } = stateOf<{ changed: string[] }>(state, "leak-check");
  const rows = stateOf<{ rows: { name: string; version: string; decision: string }[] }>(state, "apply-plan").rows.filter((r) => !r.decision.includes("user"));
  const tests = stateOf<{ summary: string; passed: boolean }>(state, "olko-tests");
  const slug = rows.map((r) => r.name.replace(/^olko-/, "")).join("-").slice(0, 40).replace(/-+$/, "");
  const branch = `feat/claude-sync-${slug}`;
  const git = async (...args: string[]) => {
    const res = await exec("git", ["-C", olko, ...args]);
    if (res.code !== 0) throw new Error(`git ${args[0]} failed: ${(res.stderr || res.stdout).trim()}`);
    return res.stdout.trim();
  };
  await git("checkout", "-b", branch);
  await git("add", "--", ...changed);
  const subject = `feat(sync): port ${rows.map((r) => `${r.name} ${r.version}`).join(", ")}`;
  await git("commit", "-m", subject);
  await git("push", "-u", "origin", branch);
  const body = [`Artifacts: ${rows.map((r) => `${r.name} ${r.version} (${r.decision})`).join(", ")}`, `Validation: ${tests.passed ? "node tests pass" : "node tests FAIL"} ${tests.summary}`].join("\n\n");
  const pr = await exec("gh", ["pr", "create", "--draft", "--head", branch, "--base", "main", "--title", subject, "--body", body], { cwd: olko });
  if (pr.code !== 0) throw new Error(`gh pr create failed: ${(pr.stderr || pr.stdout).trim()}`);
  const url = pr.stdout.trim().split(/\r?\n/).at(-1)!;
  const commit = await git("rev-parse", "HEAD");
  return { state: { publish: { url, branch, commit } }, metrics: { prs: 1 }, output: `Draft PR ${url} on ${branch}.` };
};

const claudeSyncConsolidationRecord: Operation = async ({ state, exec, answers }) => {
  if (!exec) throw new Error("csync.consolidationRecord needs the host exec tool");
  const { stateDir } = stateOf<{ stateDir: string }>(state, "state");
  const suggestions = Object.values(stateOf<Record<string, { suggestions: { items: string[]; verdict: string; evidence: string; loses: string }[] }>>(state, "consolidate"))[0]?.suggestions ?? [];
  const accepted: string[] = [];
  const rejected: string[] = [];
  for (const [i, s] of suggestions.entries()) {
    const answer = answers?.[`q-claude-sync-suggestion-${i}`];
    if (answer === "reject") {
      await syncState(exec, stateDir, ["rejection", "add", "--items", s.items.join(","), "--suggestion", s.verdict, "--reason", answers?.[`q-claude-sync-suggestion-reason-${i}`] ?? "declined"]);
      rejected.push(s.items.join(","));
    } else if (answer === "accept") accepted.push(`- ${s.verdict}: ${s.items.join(", ")}\n  evidence: ${s.evidence}\n  loses: ${s.loses}`);
  }
  const planFile = path.join(stateDir, `consolidation-plan-${new Date().toISOString().slice(0, 10)}.md`);
  if (accepted.length) fs.appendFileSync(planFile, `${accepted.join("\n")}\n`);
  return { state: { accepted: accepted.length, rejected: rejected.length, planFile: accepted.length ? planFile : "none" }, metrics: { accepted: accepted.length, rejected: rejected.length }, output: `Consolidation: ${accepted.length} accepted${accepted.length ? ` (plan ${planFile})` : ""}, ${rejected.length} rejected.` };
};

export function parseSuggestions(text: string): { suggestions: { items: string[]; verdict: string; evidence: string; loses: string }[] } {
  const data = lastJsonBlock(text) as { suggestions?: { items: string[]; verdict: string; evidence: string; loses: string }[] };
  const suggestions = (data.suggestions ?? []).filter((s) => ["merge", "remove", "extend"].includes(s.verdict) && Array.isArray(s.items) && s.items.length >= 2);
  return { suggestions: suggestions.map((s, i) => ({ ...s, line: `${i + 1}. ${s.verdict}: ${s.items.join(" + ")} — ${s.evidence} — loses: ${s.loses}` })) as never };
}

interface DraftTask {
  id: string;
  title: string;
  criteria: string[];
}

interface Draft {
  questions: string[];
  feature: { title: string; goal: string; criteria: string[] } | null;
  tasks: DraftTask[];
  text: string;
}

interface GrillQuestion {
  problem: string;
  why: string;
  options: { label: string; business: string; scope: string }[];
  glossary?: string;
}

export function parseDraft(text: string): Draft {
  const data = lastJsonBlock(text) as Partial<Draft>;
  return { questions: (data.questions ?? []).filter((q) => typeof q === "string" && q.trim()), feature: data.feature ?? null, tasks: data.tasks ?? [], text: String(data.text ?? "") };
}

export function parseGrill(text: string): { questions: GrillQuestion[] } {
  const data = lastJsonBlock(text) as { questions?: GrillQuestion[] };
  const questions = data.questions ?? [];
  for (const q of questions) {
    if (!q.problem || !Array.isArray(q.options) || q.options.length !== 3) throw new Error(`grill question needs a problem and exactly 3 options: ${JSON.stringify(q).slice(0, 200)}`);
  }
  return { questions };
}

export function parseVerdictLine(prefix: string): (text: string) => { pass: boolean; count: number; detail: string } {
  return (text) => {
    const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.startsWith(`${prefix} |`));
    if (!line) throw new Error(`output has no '${prefix} |' line`);
    const [, verdict = "", count = "0", detail = ""] = line.split("|").map((p) => p.trim());
    return { pass: verdict === "pass" || verdict === "yes" || verdict === "none", count: Number(count) || 0, detail };
  };
}

const planRoute: Operation = async ({ input, answers }) => {
  const route = input.route ?? answers?.["q-plan-route"];
  if (route && !["discovery", "planning", "both"].includes(route)) throw new Error(`input.route must be discovery, planning or both, not ${route}`);
  return { state: { route: route ?? "ask" }, metrics: {}, output: `Route: ${route ?? "ask the user"}.` };
};

const planDraftCheck: Operation = async ({ state, answers, nodeId }) => {
  const draft = Object.values(stateOf<Record<string, Draft>>(state, "draft"))[0]!;
  const previous = nodeId ? (state[nodeId] as { round?: number; answered?: string } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const answer = previous ? (answers?.[`q-plan-questions-${previous.round}`] ?? answers?.[`q-plan-revise-${previous.round}`]) : undefined;
  const answered = [previous?.answered, answer].filter(Boolean).join("\n\n");
  const ask = draft.questions.length > 0 && round <= 3;
  return { state: { round, ask, questions: draft.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"), answered: answered || "none yet", draft }, metrics: { questions: draft.questions.length, round }, output: ask ? `Draft round ${round}: ${draft.questions.length} open questions.` : `Draft ready: ${draft.tasks.length} Tasks.` };
};

const planFeature: Operation = async ({ state, input, cwd }) => {
  const fromTracker = state["tracker-context/context"] as Record<string, Draft> | undefined;
  const draft = (fromTracker && Object.values(fromTracker)[0]) ?? (state["draft-check"] as { draft?: Draft } | undefined)?.draft;
  if (!draft) throw new Error("no Feature context: give input.route planning with the tracker on, or run the discovery draft first");
  const missing = draft.tasks.filter((t) => !t.criteria?.length).map((t) => t.id);
  if (!draft.tasks.length) throw new Error("entry gate: the Feature has no child Tasks; route to the backlog writer draft first");
  if (missing.length) throw new Error(`entry gate: Tasks without acceptance criteria: ${missing.join(", ")}; never plan from a guessed criterion`);
  const featureId = input.featureId ?? (draft.feature?.title ?? "feature").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const featureDir = `plans/features/${featureId}`;
  fs.mkdirSync(path.join(cwd ?? ".", featureDir, "tasks"), { recursive: true });
  const tasks = draft.tasks.map((t) => `- ${t.id}: ${t.title}\n${t.criteria.map((c) => `  - ${c}`).join("\n")}`).join("\n");
  const criteria = [...(draft.feature?.criteria ?? []), ...draft.tasks.flatMap((t) => t.criteria)].join("\n");
  return { state: { featureId, featureDir, text: draft.text, tasks, taskIds: draft.tasks.map((t) => t.id), criteria }, metrics: { tasks: draft.tasks.length }, output: `Feature ${featureId}: ${draft.tasks.length} Tasks with acceptance criteria; plan folder ${featureDir}.` };
};

const AUDITORS: [RegExp, string][] = [
  [/\.net|c#|csproj|asp\.net/i, "olko-dotnet-auditor"],
  [/kotlin|android/i, "olko-mobile-auditor"],
  [/react native|expo/i, "olko-react-native-auditor"],
  [/\breact\b(?! native)/i, "olko-react-auditor"],
  [/army python|python army/i, "olko-army-python-auditor"],
];

const planAuditors: Operation = async ({ state, cwd }) => {
  const { featureDir } = stateOf<{ featureDir: string }>(state, "feature");
  const file = path.join(cwd ?? ".", featureDir, "implementation.md");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const scope = text.split(/^## /m).find((s) => /^(implementation scope|scope|technical scope)/i.test(s)) ?? text;
  const agents = AUDITORS.filter(([re]) => re.test(scope)).map(([, agent]) => ({ id: agent.replace(/^olko-|-auditor$/g, ""), agentName: agent }));
  return { state: { agents }, metrics: { auditors: agents.length }, output: agents.length ? `Auditors for the planned technologies: ${agents.map((a) => a.agentName).join(", ")}.` : "No stack auditor matches the planned technologies; audits skipped." };
};

const planFindings: Operation = async ({ state, args }) => {
  const from = String(args.from);
  const results = Object.entries((state[from] as Record<string, { pass: boolean; count: number; detail: string }> | undefined) ?? {});
  const total = results.reduce((sum, [, r]) => sum + r.count, 0);
  const text = results.filter(([, r]) => r.count > 0).map(([id, r]) => `${id}: ${r.detail}`).join("\n");
  return { state: { total, text: text || "none" }, metrics: { findings: total }, output: total ? `${total} findings to fold from ${from}.` : `No findings from ${from}.` };
};

const planFiles: Operation = async ({ state, cwd }) => {
  const { featureDir, criteria } = stateOf<{ featureDir: string; criteria: string }>(state, "feature");
  const root = path.join(cwd ?? ".", featureDir);
  const tasks = fs.existsSync(path.join(root, "tasks")) ? fs.readdirSync(path.join(root, "tasks")).filter((f) => f.endsWith("-implementation.md")).sort().map((f) => `${featureDir}/tasks/${f}`) : [];
  const files = [`${featureDir}/implementation.md`, ...tasks].map((p) => ({ path: p, criteria }));
  return { state: { files }, metrics: { files: files.length }, output: `${files.length} plan files to review.` };
};

const planReviewCollect: Operation = async ({ state, nodeId }) => {
  const previous = nodeId ? (state[nodeId] as { reports?: string[]; confirmed?: number } | undefined) : undefined;
  const review = state["plan-review"] as Record<string, unknown> | undefined;
  const report = review?.["plan-report"] as { kept?: { line: string }[] } | undefined;
  const file = (state["plan-next"] as { item?: { path: string } } | undefined)?.item?.path ?? "?";
  const lines = (report?.kept ?? []).map((f) => f.line);
  const reports = [...(previous?.reports ?? []), ...lines.map((l) => `${file}: ${l}`)];
  return { state: { reports, confirmed: reports.length, text: reports.join("\n") || "none" }, metrics: { confirmed: reports.length }, output: `${lines.length} confirmed plan findings for ${file}.` };
};

const planGrillQuestions: Operation = async ({ state, nodeId }) => {
  const parsed = Object.values(stateOf<Record<string, { questions: GrillQuestion[] }>>(state, "grill"))[0]!;
  const previous = nodeId ? (state[nodeId] as { round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const questions = parsed.questions.map((q, i) => ({
    index: i,
    text: [`Problem: ${q.problem}`, `Why I am asking: ${q.why}`, ...q.options.map((o, n) => `${n + 1}. ${o.label}${n === 0 ? " (recommended)" : ""}\n   Business: ${o.business}\n   Change scope: ${o.scope}`), q.glossary ? `Glossary: ${q.glossary}` : ""].filter(Boolean).join("\n"),
  }));
  const count = round <= 3 ? questions.length : 0;
  return { state: { round, questions, count }, metrics: { questions: questions.length, round }, output: count ? `Grill round ${round}: ${count} questions as one batch.` : `Grill round ${round}: no open question${questions.length ? " (round limit reached; the rest stays in Open items)" : ""}.` };
};

const planAnswers: Operation = async ({ state, answers, args }) => {
  const from = String(args.from);
  const prefix = String(args.prefix);
  const source = stateOf<{ round: number; questions: { index: number; text: string }[] }>(state, from);
  const lines = source.questions.map((q) => `Question ${q.index + 1}:\n${q.text}\nAnswer: ${answers?.[`${prefix}${source.round}-${q.index}`] ?? "unanswered"}`);
  return { state: { text: lines.join("\n\n") || "none", count: lines.length }, metrics: { answers: lines.length }, output: `${lines.length} answers collected.` };
};

const planReadiness: Operation = async ({ state, nodeId }) => {
  const parsed = Object.values(stateOf<Record<string, { questions: GrillQuestion[] }>>(state, "readiness"))[0]!;
  const previous = nodeId ? (state[nodeId] as { round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const questions = parsed.questions.map((q, i) => ({ index: i, text: [`Blocker: ${q.problem}`, `Why I am asking: ${q.why}`, ...q.options.map((o, n) => `${n + 1}. ${o.label}${n === 0 ? " (recommended)" : ""}\n   Business: ${o.business}\n   Change scope: ${o.scope}`)].join("\n") }));
  return { state: { round, questions, count: round <= 3 ? questions.length : 0 }, metrics: { blockers: questions.length, round }, output: questions.length ? `Readiness round ${round}: ${questions.length} blockers.` : "Ready for implementation: no blockers." };
};

const planOpenEditor: Operation = async ({ state, exec, cwd }) => {
  const { featureDir } = stateOf<{ featureDir: string }>(state, "feature");
  const res = exec ? await exec("code", ["-n", featureDir], { cwd: cwd ?? "." }) : { code: -1, stdout: "", stderr: "no exec" };
  return { state: { opened: res.code === 0 }, metrics: { opened: res.code === 0 ? 1 : 0 }, output: res.code === 0 ? `Opened ${featureDir} in VS Code.` : `Could not open VS Code; run: code -n ${featureDir}` };
};

const planScopeCheck: Operation = async ({ state, exec, cwd }) => {
  if (!exec) throw new Error("plan.scopeCheck needs the host exec tool");
  const { featureDir } = stateOf<{ featureDir: string }>(state, "feature");
  const status = (await exec("git", ["-C", cwd ?? ".", "status", "--porcelain", "--untracked-files=all"])).stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).trim());
  const allowed = (p: string) => p.startsWith(`${featureDir}/`) || p === ".opencode/memory/olko-plan-documentation-orchestrator.md";
  const outside = status.filter((p) => !allowed(p));
  if (outside.length) throw new Error(`planning changed files outside the plan folder: ${outside.join(", ")}`);
  return { state: { changed: status }, metrics: { changed: status.length }, output: `Plan scope check passed: ${status.length} changed files, all under ${featureDir}.` };
};

const planFeatureReport: Operation = async ({ state, cwd }) => {
  const { featureDir, featureId } = stateOf<{ featureDir: string; featureId: string }>(state, "feature");
  const root = path.join(cwd ?? ".", featureDir);
  const tasks = fs.existsSync(path.join(root, "tasks")) ? fs.readdirSync(path.join(root, "tasks")).filter((f) => f.endsWith("-implementation.md")) : [];
  const ready = fs.existsSync(path.join(root, "implementation.md")) ? (fs.readFileSync(path.join(root, "implementation.md"), "utf8").match(/Ready for implementation:\s*(yes|no)/i)?.[1] ?? "missing") : "missing";
  const auditors = (state.auditors as { agents?: { agentName: string }[] } | undefined)?.agents?.map((a) => a.agentName) ?? [];
  const review = (state["plan-collect"] as { confirmed?: number } | undefined)?.confirmed ?? 0;
  return {
    state: { ready },
    metrics: { tasks: tasks.length },
    output: [`Feature plan ${featureId}`, `Files: ${["business.md", "implementation.md", "stack.md", "tracker.md"].map((f) => `${featureDir}/${f}`).join(", ")}`, `Task plans: ${tasks.map((t) => `${featureDir}/tasks/${t}`).join(", ") || "none"}`, `Ready for implementation: ${ready}`, `Auditors: ${auditors.join(", ") || "none (no matching technology)"}`, `Plan review: ${review} confirmed findings folded`, "Domain changes: write-free recommendation in business.md; vault changes stay approval-gated after implementation."].join("\n"),
  };
};

export const OPERATIONS: Record<string, Operation> = {
  "builtin.pass": pass,
  "builtin.count": async ({ state, nodeId }) => {
    const count = ((nodeId ? (state[nodeId] as { count?: number } | undefined)?.count : 0) ?? 0) + 1;
    return { state: { count }, metrics: { count }, output: `Round ${count}.` };
  },
  "builtin.stop": async ({ args }) => {
    throw new Error(String(args.reason ?? "stopped by the user"));
  },
  "plan.route": planRoute,
  "plan.draftCheck": planDraftCheck,
  "plan.feature": planFeature,
  "plan.auditors": planAuditors,
  "plan.findings": planFindings,
  "plan.files": planFiles,
  "plan.reviewCollect": planReviewCollect,
  "plan.grillQuestions": planGrillQuestions,
  "plan.answers": planAnswers,
  "plan.readiness": planReadiness,
  "plan.openEditor": planOpenEditor,
  "plan.scopeCheck": planScopeCheck,
  "plan.report": planFeatureReport,
  "builtin.values": async ({ args }) => {
    if (!Array.isArray(args.values)) throw new Error("with.values must be a list");
    return { state: { values: args.values }, metrics: { values: args.values.length }, output: `${args.values.length} values.` };
  },
  "builtin.gate": async ({ state, input, args }) => {
    const when = String(args.when);
    const enabled = evaluateWhen(when, { ...state, input, switches: input.switches ?? {} });
    return { state: { enabled }, metrics: { enabled: enabled ? 1 : 0 }, output: enabled ? `Subgraph ${String(args.subgraph)} runs (${when}).` : `Subgraph ${String(args.subgraph)} skipped: switch off (${when} is false).` };
  },
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
  "sync.resolvePath": resolveMarketplacePath,
  "sync.safeSource": safeSource,
  "sync.discover": discoverArtifacts,
  "sync.checkVersions": checkSkillVersions,
  "sync.rows": syncRows,
  "sync.plan": syncPlanApply,
  "sync.revertLocal": revertLocal,
  "sync.validate": validateMarketplace,
  "sync.prOf": prOf,
  "sync.waitChecks": waitForChecks,
  "sync.merge": squashMerge,
  "sync.install": installArtifacts,
  "sync.memorySave": syncMemorySave,
  "csync.state": claudeSyncState,
  "csync.leakSave": claudeSyncLeakSave,
  "csync.inventories": claudeSyncInventories,
  "csync.capabilities": claudeSyncCapabilities,
  "csync.select": claudeSyncSelect,
  "csync.exclusions": claudeSyncExclusions,
  "csync.rows": claudeSyncRows,
  "csync.plan": claudeSyncPlan,
  "csync.record": claudeSyncRecord,
  "csync.report": claudeSyncReport,
  "csync.stagePlan": claudeSyncStagePlan,
  "csync.findings": claudeSyncFindings,
  "csync.fixes": claudeSyncFixes,
  "csync.applyPlan": claudeSyncApplyPlan,
  "csync.moreDeps": claudeSyncMoreDeps,
  "csync.applyOlko": claudeSyncApplyOlko,
  "csync.applyUser": claudeSyncApplyUser,
  "csync.applyRecord": claudeSyncApplyRecord,
  "csync.olkoTests": claudeSyncOlkoTests,
  "csync.leakCheck": claudeSyncLeakCheck,
  "csync.publish": claudeSyncPublish,
  "csync.consolidationRecord": claudeSyncConsolidationRecord,
  "sync.report": syncReport,
  "sync.stopUnsafe": async ({ state, args }) => {
    const source = stateOf<{ detail?: string }>(state, typeof args.from === "string" ? args.from : "safe-source");
    throw new Error(`Marketplace sync stopped before any comparison: ${source.detail ?? "the marketplace checkout is not safe"}.`);
  },
};

export const PARSERS: Record<string, (text: string) => unknown> = {
  "text.raw": (text) => String(text).trim(),
  "review.findings": parseFindings,
  "review.verdicts": parseVerdicts,
  "review.rulesCheck": parseRulesCheck,
  "sync.comparison": parseComparison,
  "sync.prLine": parsePrLine,
  "sync.applied": parseApplied,
  "csync.capabilities": parseCapabilities,
  "csync.inventory": parseInventory,
  "csync.verdict": parseVerdict,
  "csync.staged": parseStaged,
  "plan.draft": parseDraft,
  "plan.grill": parseGrill,
  "plan.consistency": parseVerdictLine("consistency"),
  "plan.findings": parseVerdictLine("findings"),
  "csync.suggestions": parseSuggestions,
};
