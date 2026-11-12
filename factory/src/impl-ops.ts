import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { localDiff, tierOf, type DiffFile } from "./ops.ts";
import type { Agent, Operation, RunInput, ScriptContext, WorkflowState } from "./types.ts";

type Exec = NonNullable<ScriptContext["exec"]>;

interface TaskState {
  ok: boolean;
  featureId: string;
  featureDir: string;
  featurePlan: string;
  tracker: string;
  taskFile: string;
  taskName: string;
  criteria: string;
}

interface Stack {
  id: string;
  pattern: RegExp;
  extensions: string[];
}

const STACKS: Stack[] = [
  { id: "dotnet", pattern: /\.net\b|c#|csproj|asp\.net|\.cs\b/i, extensions: [".cs", ".csproj"] },
  { id: "mobile", pattern: /kotlin|android|\.kt\b/i, extensions: [".kt", ".kts"] },
  { id: "react-native", pattern: /react native|expo/i, extensions: [] },
  { id: "react", pattern: /\breact\b(?! native)|\.tsx\b/i, extensions: [".ts", ".tsx"] },
  { id: "army-python", pattern: /\bpython\b|\.py\b/i, extensions: [".py"] },
];
const AGENT_PREFIX: Record<string, string> = { dotnet: "olko-dotnet", mobile: "olko-mobile", "react-native": "olko-react-native", react: "olko-react", "army-python": "olko-army-python" };
const CODE_EXTENSIONS = [".cs", ".ts", ".tsx", ".js", ".jsx", ".kt", ".kts", ".py"];
const CONTEXT_FILE = /(^|\/)(AGENTS|CODING_STYLE|TESTING|CLAUDE)\.md$/;
const DOC_PATH = /(^|\/)(docs|plans)\/|\.md$/i;
const TEST_PATH = /(^|\/)tests?\/|tests?\.(cs|ts|tsx|kt|py)$|test_[^/]+\.py$|\.(test|spec)\.(ts|tsx)$/i;

function stateOf<T>(state: WorkflowState, key: string): T {
  const value = state[key];
  if (value === undefined) throw new Error(`state.${key} is not set`);
  return value as T;
}

function section(text: string, title: RegExp): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,4}\s/.test(l) && title.test(l));
  if (start < 0) return "";
  const level = lines[start]!.match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function appendJournal(file: string, line: string): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const entry = `- ${stamp} ${line.replace(/\r?\n/g, " ").slice(0, 600)}`;
  if (/^## Implementation\s*$/m.test(text)) fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n${entry}\n`);
  else fs.writeFileSync(file, `${text.replace(/\s*$/, "")}\n\n## Implementation\n\n${entry}\n`);
}

function taskOf(state: WorkflowState, input: RunInput): TaskState {
  const task = state.task as TaskState | undefined;
  if (task) return task;
  if (!input.plan) throw new Error("no Task in state and no input.plan");
  return { ok: true, featureId: "", featureDir: path.dirname(path.dirname(input.plan)), featurePlan: path.join(path.dirname(path.dirname(input.plan)), "implementation.md"), tracker: "", taskFile: input.plan, taskName: path.basename(input.plan).replace(/-implementation\.md$/, ""), criteria: input.criteria ?? "" };
}

function baseOf(state: WorkflowState, input: RunInput): string {
  const base = (state.worktree as { base?: string } | undefined)?.base ?? input.base;
  if (!base) throw new Error("no base branch: run the worktree step first or give input.base");
  return base;
}

function lastLine(text: string, prefix: string): string[] | null {
  const line = String(text).split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.toLowerCase().startsWith(`${prefix} |`));
  return line ? line.split("|").map((p) => p.trim()) : null;
}

export function parseLine(prefix: string): (text: string) => { verdict: string; detail: string; fields: string[]; text: string } {
  return (text) => {
    const fields = lastLine(text, prefix);
    if (!fields) throw new Error(`output has no '${prefix} |' line`);
    return { verdict: (fields[1] ?? "").toLowerCase(), detail: fields.slice(2).join(" | "), fields: fields.slice(1), text: String(text).slice(-4000) };
  };
}

export function parseChunks(text: string): { chunks: { stack: string; title: string; files: string[]; brief: string }[] } {
  const block = [...String(text).matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1]).pop();
  if (!block) throw new Error("chunker output has no ```json block");
  const parsed = JSON.parse(block) as { chunks?: { stack?: string; title?: string; files?: string[]; brief?: string }[] };
  if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) throw new Error("chunker returned no chunks");
  return { chunks: parsed.chunks.map((c) => ({ stack: String(c.stack ?? ""), title: String(c.title ?? ""), files: (c.files ?? []).map(String), brief: String(c.brief ?? "") })) };
}

function results<T>(state: WorkflowState, node: string): [string, T][] {
  return Object.entries((state[node] as Record<string, T> | undefined) ?? {});
}

async function changed(exec: Exec, root: string, base: string): Promise<DiffFile[]> {
  return (await localDiff(exec, root, base)).files;
}

function addedLines(file: DiffFile): string[] {
  return file.diff.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

function hashFile(file: string): string {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "missing";
}

const implTask: Operation = async ({ input, state, nodeId }) => {
  const previous = nodeId ? (state[nodeId] as { visits?: number } | undefined) : undefined;
  const visits = (previous?.visits ?? 0) + 1;
  const root = path.resolve(input.project ?? ".");
  const planned = (state.plan as Record<string, { featureId?: string }> | undefined)?.feature?.featureId;
  const featureId = input.featureId ?? planned ?? "";
  const featureDir = path.join(root, "plans", "features", featureId);
  const tasksDir = path.join(featureDir, "tasks");
  const tasks = featureId && fs.existsSync(tasksDir) ? fs.readdirSync(tasksDir).filter((f) => f.endsWith("-implementation.md")).sort() : [];
  const pick = input.taskId ? tasks.find((f) => f.startsWith(input.taskId!)) : tasks[0];
  const taskFile = pick ? path.join(tasksDir, pick) : "";
  const text = taskFile ? fs.readFileSync(taskFile, "utf8") : "";
  const criteria = section(text, /acceptance criteria/i);
  const ready = /ready for implementation:\s*\**\s*yes/i.test(text);
  const reason = !featureId ? "no featureId in the input" : !pick ? `no approved Task plan in ${path.relative(root, tasksDir)}` : !criteria ? `${pick} has no acceptance criteria` : !ready ? `${pick} does not say Ready for implementation: yes` : "";
  const ok = reason === "";
  const canPlan = !ok && visits === 1 && Boolean(input.idea);
  const task: TaskState & { visits: number; canPlan: boolean; reason: string; stop: boolean } = { ok, canPlan, stop: !ok && !canPlan, visits, reason, featureId, featureDir, featurePlan: path.join(featureDir, "implementation.md"), tracker: path.join(featureDir, "feature-tracker.md"), taskFile, taskName: pick ? pick.replace(/-implementation\.md$/, "") : "", criteria };
  return { state: task, metrics: { ok: ok ? 1 : 0, tasks: tasks.length }, output: ok ? `Task ${task.taskName} of Feature ${featureId}: acceptance criteria present, plan ready.` : `Entry gate: ${reason}.${canPlan ? " Routing to plan documentation." : ""}` };
};

const implWorktree: Operation = async ({ input, state, exec }) => {
  if (!exec) throw new Error("impl.worktree needs the host exec tool");
  const task = stateOf<TaskState>(state, "task");
  const root = path.resolve(input.project ?? ".");
  const current = await exec("git", ["-C", root, "branch", "--show-current"]);
  const base = current.stdout.trim();
  if (current.code !== 0 || !base) throw new Error(`the main checkout ${root} is not on a branch`);
  const slug = task.taskName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const branch = `feature/${slug}`;
  const target = path.join(path.dirname(root), `${path.basename(root)}-worktrees`, slug);
  let resumed = false;
  if (fs.existsSync(path.join(target, ".git"))) resumed = true;
  else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const exists = (await exec("git", ["-C", root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0;
    const add = await exec("git", ["-C", root, "worktree", "add", ...(exists ? [target, branch] : ["-b", branch, target, "HEAD"])]);
    if (add.code !== 0) throw new Error(`git worktree add failed: ${add.stderr.slice(-300)}`);
  }
  const workspace = fs.realpathSync.native(target);
  return { state: { path: workspace, branch, base, resumed }, workspace, metrics: { resumed: resumed ? 1 : 0 }, output: `${resumed ? "Resumed" : "Created"} worktree ${workspace} on ${branch} (base ${base}). Every later agent and operation runs there.` };
};

const implJournal: Operation = async ({ state, exec }) => {
  const task = stateOf<TaskState>(state, "task");
  const worktree = stateOf<{ path: string; branch: string; base: string; resumed: boolean }>(state, "worktree");
  const text = fs.readFileSync(task.taskFile, "utf8");
  if (!/^## Implementation\s*$/m.test(text)) {
    fs.writeFileSync(task.taskFile, `${text.replace(/\s*$/, "")}\n\n## Implementation\n\n- Session status: in progress\n- Current step: preflight\n- Worktree: ${worktree.path}\n- Branch: ${worktree.branch} (base ${worktree.base})\n\n### Log\n`);
  }
  appendJournal(task.taskFile, worktree.resumed ? "resumed by the factory run" : "started by the factory run");
  if (!fs.existsSync(task.tracker)) {
    const head = exec ? (await exec("git", ["-C", worktree.path, "rev-parse", "HEAD"])).stdout.trim() : "";
    fs.writeFileSync(task.tracker, `# Feature tracker: ${task.featureId}\n\n- Base commit: ${head}\n\n## Tasks\n\n- ${task.taskName}: in progress on ${worktree.branch}\n\n## Pending\n\n## Final Feature audit\n\nnot run\n`);
  }
  return { state: { journal: task.taskFile, tracker: task.tracker }, metrics: {}, output: `Journal in ${task.taskFile}; Feature tracker ${task.tracker}.` };
};

const implPreflight: Operation = async ({ state, nodeId }) => {
  const task = stateOf<TaskState>(state, "task");
  const previous = nodeId ? (state[nodeId] as { round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const verdicts = results<{ verdict: string; detail: string }>(state, "workers");
  const expected = ["flow", "runtime", "test", "readiness"];
  const lines = expected.map((id) => {
    const v = verdicts.find(([k]) => k === id)?.[1];
    return { id, verdict: v ? v.verdict.toUpperCase() : "MISSING", detail: v?.detail ?? "no result" };
  });
  const pass = lines.every((l) => l.verdict === "PASS");
  const text = lines.map((l) => `${l.id}: ${l.verdict} | ${l.detail}`).join("\n");
  appendJournal(task.taskFile, `preflight round ${round}: ${lines.map((l) => `${l.id}=${l.verdict}`).join(", ")}`);
  const next = pass ? "pass" : round < 3 ? "ask" : "stop";
  return { state: { round, pass, next, text, reason: `preflight did not pass after ${round} rounds:\n${text}` }, metrics: { pass: pass ? 1 : 0, round }, output: pass ? "Preflight: four PASS results; implementation may start." : `Preflight round ${round}: not all PASS.\n${text}` };
};

const implStacks: Operation = async ({ state, input }) => {
  const task = taskOf(state, input);
  const text = [task.taskFile, task.featurePlan].filter((f) => f && fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const stacks = STACKS.filter((s) => s.pattern.test(text)).map((s) => s.id);
  if (stacks.length === 0) throw new Error(`no known stack named in ${task.taskFile}`);
  const prefix = (s: string) => AGENT_PREFIX[s]!;
  const as = (role: string): Agent[] => stacks.map((s) => ({ id: s, agentName: role === "author" ? "olko-test-first-author" : `${prefix(s)}-${role}`, role: role === "author" ? "implementer" : role === "test-runner" ? "runner" : "implementer" }));
  return { state: { stacks, authors: as("author"), implementers: as("implementer"), runners: as("test-runner") }, metrics: { stacks: stacks.length }, output: `Stacks of this Task: ${stacks.join(", ")}.` };
};

const implTestsFirst: Operation = async ({ state, input, answers, nodeId, exec, cwd }) => {
  const task = taskOf(state, input);
  const previous = nodeId ? (state[nodeId] as { round?: number; answered?: string } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const answer = previous ? answers?.[`q-impl-unclear-${previous.round}`] : undefined;
  const answered = [previous?.answered, answer].filter(Boolean).join("\n");
  const written = results<{ verdict: string; fields: string[] }>(state, "write-tests");
  const open = written.flatMap(([stack, r]) => r.fields.slice(1).filter((f) => !/^(unclear|blocked):\s*none\s*$/i.test(f) && /^(unclear|blocked):/i.test(f)).map((f) => `${stack}: ${f}`));
  const count = written.reduce((sum, [, r]) => sum + (Number(r.verdict) || 0), 0);
  const testFiles: Record<string, string> = {};
  if (exec && cwd) {
    for (const file of await changed(exec, cwd, baseOf(state, input))) if (TEST_PATH.test(file.path)) testFiles[file.path] = hashFile(path.join(cwd, file.path));
  }
  appendJournal(task.taskFile, `failing tests first, round ${round}: ${count} tests written (${Object.keys(testFiles).join(", ") || "no test file changed"}); open items: ${open.length}`);
  const next = open.length === 0 ? "done" : round < 2 ? "ask" : "stop";
  return { state: { round, count, open: open.length, questions: open.join("\n"), answered: answered || "none", testFiles, testList: Object.keys(testFiles).join(", ") || "none", next, reason: `criteria still unclear after ${round} rounds:\n${open.join("\n")}` }, metrics: { tests: count, open: open.length, files: Object.keys(testFiles).length }, output: `${count} failing tests written; ${Object.keys(testFiles).length} test files; ${open.length} open items.` };
};

const implChunkPlan: Operation = async ({ state }) => {
  const stacks = stateOf<{ implementers: Agent[] }>(state, "stacks");
  const parsed = Object.values(stateOf<Record<string, { chunks: { stack: string; title: string; files: string[]; brief: string }[] }>>(state, "chunker"))[0]!;
  const owner = new Map<string, number>();
  const chunks = parsed.chunks.map((c, index) => {
    const agent = stacks.implementers.find((a) => a.id === c.stack) ?? stacks.implementers[0]!;
    const files = c.files.filter((f) => {
      if (owner.has(f)) return false;
      owner.set(f, index);
      return true;
    });
    return { index, title: c.title, stack: agent.id, files, brief: c.brief, agents: [agent] };
  });
  return { state: { chunks }, metrics: { chunks: chunks.length }, output: `${chunks.length} chunks: ${chunks.map((c) => `${c.index + 1}. ${c.stack} ${c.title}`).join("; ")}.` };
};

const implChildCheck: Operation = async ({ state, input, exec, cwd, nodeId }) => {
  if (!exec || !cwd) throw new Error("impl.childCheck needs the host exec tool");
  const task = taskOf(state, input);
  const chunk = stateOf<{ item: { index: number; title: string; stack: string } }>(state, "chunk-next").item;
  const previous = nodeId ? (state[nodeId] as { chunk?: number; attempts?: number; edgeRuns?: number } | undefined) : undefined;
  const attempts = previous?.chunk === chunk.index ? (previous.attempts ?? 0) + 1 : 1;
  const edgeRuns = previous?.edgeRuns ?? 0;
  const result = Object.values((state.implement as Record<string, { verdict: string; detail: string; text: string }> | undefined) ?? {})[0];
  const verdict = result?.verdict ?? "missing";
  const frozen = (state["tests-check"] as { testFiles?: Record<string, string> } | undefined)?.testFiles ?? {};
  const violations: string[] = [];
  for (const file of await changed(exec, cwd, baseOf(state, input))) {
    if (/^\.github\/workflows\/|azure-pipelines|\.gitlab-ci/.test(file.path)) violations.push(`${file.path}: CI/CD workflow file changed without explicit permission`);
    if (frozen[file.path] !== undefined) {
      if (hashFile(path.join(cwd, file.path)) !== frozen[file.path]) violations.push(`${file.path}: a failing-test-first file was changed`);
      continue;
    }
    if (!CODE_EXTENSIONS.some((e) => file.path.endsWith(e))) continue;
    const python = file.path.endsWith(".py");
    for (const line of addedLines(file)) {
      if (python ? /^\s*#(?!!)/.test(line) : /^\s*(\/\/(?!\/)|\/\*)/.test(line)) violations.push(`${file.path}: explanatory comment added: ${line.trim().slice(0, 120)}`);
      if (/\b(AC|D)\d+\b|\bMAIN-\d+\b/.test(line)) violations.push(`${file.path}: plan or criterion id inside code: ${line.trim().slice(0, 120)}`);
    }
  }
  const next = violations.length ? (attempts < 3 ? "fix" : "stop") : verdict === "blocked" ? "blocked" : verdict === "dispute" ? "dispute" : verdict === "edge-cases" && edgeRuns === 0 ? "edge" : "done";
  appendJournal(task.taskFile, `chunk ${chunk.index + 1} (${chunk.stack} ${chunk.title}) attempt ${attempts}: ${verdict}; ${violations.length} rule violations`);
  return {
    state: { chunk: chunk.index, attempts, edgeRuns: next === "edge" ? edgeRuns + 1 : edgeRuns, verdict, next, violations: violations.join("\n"), detail: result?.detail ?? "", report: result?.text ?? "", reason: `chunk ${chunk.index + 1} still breaks the child-result rules after ${attempts} attempts:\n${violations.join("\n")}` },
    metrics: { violations: violations.length, attempts },
    output: violations.length ? `Chunk ${chunk.index + 1}: ${violations.length} violations.\n${violations.join("\n")}` : `Chunk ${chunk.index + 1}: ${verdict}.`,
  };
};

const implDispute: Operation = async ({ state }) => {
  const result = Object.values((state.dispute as Record<string, { verdict: string; detail: string }> | undefined) ?? {})[0];
  const justified = result?.verdict === "justified";
  return { state: { justified, next: justified ? "ask" : "implement", detail: result?.detail ?? "" }, metrics: { justified: justified ? 1 : 0 }, output: justified ? `The test author keeps the test: ${result?.detail}` : `The test author changed the test: ${result?.detail ?? "no detail"}` };
};

const implChecks: Operation = async ({ state, input, nodeId }) => {
  const task = taskOf(state, input);
  const previous = nodeId ? (state[nodeId] as { round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const style = results<{ verdict: string; detail: string }>(state, "style");
  const tests = results<{ verdict: string; detail: string }>(state, "runners");
  const failures = [...style.map(([id, r]) => ({ kind: "style", id, ...r })), ...tests.map(([id, r]) => ({ kind: "tests", id, ...r }))].filter((r) => r.verdict !== "pass");
  const pass = failures.length === 0 && style.length > 0 && tests.length > 0;
  const text = failures.map((f) => `${f.kind} ${f.id}: ${f.verdict} | ${f.detail}`).join("\n");
  appendJournal(task.taskFile, `checks round ${round}: ${pass ? "style and tests pass" : text}`);
  const next = pass ? "pass" : round < 3 ? "fix" : "stop";
  return { state: { round, pass, next, failures: text || "none", reason: `style or tests still fail after ${round} rounds:\n${text}` }, metrics: { failures: failures.length, round }, output: pass ? "Style and affected tests pass." : `Round ${round}: ${failures.length} failing checks.\n${text}` };
};

const implDocker: Operation = async ({ state, input }) => {
  const task = taskOf(state, input);
  const docker = Object.values((state["docker-rebuild"] as Record<string, { verdict: string; detail: string }> | undefined) ?? {})[0];
  const runtime = results<{ verdict: string; detail: string }>(state, "runtime");
  const verified = docker?.verdict === "pass" && runtime.length > 0 && runtime.every(([, r]) => r.verdict === "verified");
  const text = [`docker: ${docker?.verdict ?? "missing"} | ${docker?.detail ?? ""}`, ...runtime.map(([id, r]) => `runtime ${id}: ${r.verdict} | ${r.detail}`)].join("\n");
  appendJournal(task.taskFile, `isolated Docker and runtime verification: ${verified ? "VERIFIED" : "NOT VERIFIED"}`);
  if (task.tracker && fs.existsSync(task.tracker)) fs.appendFileSync(task.tracker, `\n### Runtime evidence ${task.taskName}\n\n${text}\n`);
  return { state: { verified, next: verified ? "pass" : "stop", text, reason: `runtime verification failed:\n${text}` }, metrics: { verified: verified ? 1 : 0 }, output: verified ? "Isolated Docker rebuild and runtime evidence: VERIFIED." : `NOT VERIFIED:\n${text}` };
};

const implContextFiles: Operation = async ({ state, input, exec, cwd }) => {
  if (!exec || !cwd) throw new Error("impl.contextFiles needs the host exec tool");
  const files = (await changed(exec, cwd, baseOf(state, input))).map((f) => f.path).filter((p) => CONTEXT_FILE.test(p) && fs.existsSync(path.join(cwd, p)) && fs.readFileSync(path.join(cwd, p), "utf8").split(/\r?\n/).length >= 20);
  return { state: { files, count: files.length, list: files.join("\n") || "none" }, metrics: { files: files.length }, output: files.length ? `Context files to optimize: ${files.join(", ")}.` : "No agent-context file of 20 lines or more changed." };
};

const implScopeGate: Operation = async ({ state, input, exec, cwd }) => {
  if (!exec || !cwd) throw new Error("impl.scopeGate needs the host exec tool");
  const files = (await changed(exec, cwd, baseOf(state, input))).map((f) => f.path);
  const code = files.filter((p) => !DOC_PATH.test(p));
  const docs = files.filter((p) => DOC_PATH.test(p));
  const over = code.length > 15;
  return { state: { count: code.length, docs: docs.length, over, paths: code.join("\n") }, metrics: { code: code.length, docs: docs.length }, output: `${code.length} code paths${over ? " (more than 15: needs an explicit extension)" : ""}, ${docs.length} documentation paths.` };
};

const implReviewGate: Operation = async ({ state, input, nodeId }) => {
  const task = taskOf(state, input);
  const previous = nodeId ? (state[nodeId] as { round?: number } | undefined) : undefined;
  const round = (previous?.round ?? 0) + 1;
  const review = (state.review as Record<string, unknown> | undefined) ?? {};
  const kept = ((review["local-rank"] ?? review.rank) as { kept?: { ruleId: string; sev: string; line: string }[] } | undefined)?.kept ?? [];
  const blocking = kept.filter((f) => ["bug", "security"].includes(tierOf(f as never)) || /^req\.(missing|partial)/.test(f.ruleId) || /merge/i.test(f.ruleId));
  const other = kept.filter((f) => !blocking.includes(f));
  appendJournal(task.taskFile, `Task review round ${round}: ${blocking.length} blocking, ${other.length} non-blocking findings`);
  if (task.tracker && fs.existsSync(task.tracker)) fs.appendFileSync(task.tracker, `\n### Task review ${task.taskName} round ${round}\n\n${kept.map((f) => `- ${f.line}`).join("\n") || "- no findings"}\n`);
  const next = blocking.length === 0 ? "pass" : round < 3 ? "fix" : "stop";
  return { state: { round, blocking: blocking.length, next, text: blocking.map((f) => f.line).join("\n") || "none", nonBlocking: other.map((f) => f.line).join("\n") || "none", reason: `blocking review findings remain after ${round} rounds:\n${blocking.map((f) => f.line).join("\n")}` }, metrics: { blocking: blocking.length, nonBlocking: other.length }, output: blocking.length ? `${blocking.length} blocking findings:\n${blocking.map((f) => f.line).join("\n")}` : `No blocking finding (${other.length} non-blocking recorded).` };
};

const implStop: Operation = async ({ state, args }) => {
  const from = String(args.from ?? "");
  const reason = (state[from] as { reason?: string } | undefined)?.reason ?? String(args.reason ?? "stopped");
  throw new Error(`Implementation stopped: ${reason}`);
};

const implOpenEditor: Operation = async ({ exec, cwd }) => {
  if (!exec || !cwd) throw new Error("impl.openEditor needs the host exec tool");
  const result = await exec("code", ["--new-window", cwd]);
  return { state: { opened: result.code === 0 }, metrics: { opened: result.code === 0 ? 1 : 0 }, output: result.code === 0 ? `Opened ${cwd} in a new VS Code window.` : `Could not open VS Code; run: code --new-window "${cwd}"` };
};

const implReport: Operation = async ({ state, input }) => {
  const task = taskOf(state, input);
  const worktree = state.worktree as { path: string; branch: string } | undefined;
  const get = <T>(key: string) => state[key] as T | undefined;
  const chunks = get<{ chunks: unknown[] }>("chunk-plan")?.chunks.length ?? 0;
  const commit = get<{ answer?: string }>("ask-commit");
  const delivery = Object.values(get<Record<string, { fields: string[] }>>("commit") ?? {})[0];
  const lines = [
    `Task ${task.taskName} (Feature ${task.featureId})`,
    `Worktree: ${worktree?.path ?? "none"} on ${worktree?.branch ?? "none"}`,
    `Preflight: ${get<{ pass: boolean }>("preflight")?.pass ? "four PASS" : "not passed"}`,
    `Failing tests first: ${get<{ count: number }>("tests-check")?.count ?? 0}`,
    `Chunks implemented: ${chunks}`,
    `Checks: ${(get<Record<string, { pass?: boolean }>>("checks")?.check?.pass ?? get<Record<string, { pass?: boolean }>>("recheck")?.check?.pass) ? "style and tests pass" : "see the journal"}`,
    `Code paths: ${get<{ count: number }>("scope-gate")?.count ?? "?"}`,
    `Task review: ${get<{ blocking: number; nonBlocking: string }>("review-gate")?.blocking === 0 ? "no blocking finding" : "blocking findings left"}`,
    `Delivery: ${delivery ? `committed, PR ${delivery.fields[1] ?? "?"}` : commit?.answer === "no" ? "not committed (you answered no)" : "not reached"}`,
  ];
  appendJournal(task.taskFile, `run report: ${lines.slice(1).join("; ")}`);
  return { state: { text: lines.join("\n") }, metrics: { chunks }, output: lines.join("\n") };
};

export const IMPL_OPERATIONS: Record<string, Operation> = {
  "impl.task": implTask,
  "impl.worktree": implWorktree,
  "impl.journal": implJournal,
  "impl.preflight": implPreflight,
  "impl.stacks": implStacks,
  "impl.testsFirst": implTestsFirst,
  "impl.chunkPlan": implChunkPlan,
  "impl.childCheck": implChildCheck,
  "impl.dispute": implDispute,
  "impl.checks": implChecks,
  "impl.docker": implDocker,
  "impl.contextFiles": implContextFiles,
  "impl.scopeGate": implScopeGate,
  "impl.reviewGate": implReviewGate,
  "impl.stop": implStop,
  "impl.openEditor": implOpenEditor,
  "impl.report": implReport,
};

export const IMPL_PARSERS: Record<string, (text: string) => unknown> = {
  "impl.preflight": parseLine("preflight"),
  "impl.tests": parseLine("tests"),
  "impl.chunks": parseChunks,
  "impl.chunk": parseLine("chunk"),
  "impl.dispute": parseLine("dispute"),
  "impl.style": parseLine("style"),
  "impl.docker": parseLine("docker"),
  "impl.runtime": parseLine("runtime"),
  "impl.delivery": parseLine("delivery"),
};
