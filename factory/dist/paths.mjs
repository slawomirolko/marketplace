import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import crypto, { randomBytes } from "node:crypto";
import os from "node:os";
// src/prices.ts
var PER_MTOK = {
	"claude-haiku-5-5": {
		input: .1,
		output: .5,
		cacheRead: .01,
		longContext: {
			overTokens: 1e5,
			input: .5,
			output: 2.5,
			cacheRead: .05
		}
	},
	"claude-sonnet-5-5": {
		input: 2,
		output: 10,
		cacheRead: .1
	},
	"claude-opus-5-5": {
		input: 4,
		output: 20,
		cacheRead: .2
	},
	"opencode/deepseek-v4.1-flash-free": {
		input: 0,
		output: 0,
		cacheRead: 0
	}
};
var ALIASES = {
	haiku: "claude-haiku-5-5",
	sonnet: "claude-sonnet-5-5",
	opus: "claude-opus-5-5"
};
var CACHE_WRITE_5M = 1.25;
var CACHE_WRITE_1H = 2;
function canonicalModel(model) {
	if (!model) return null;
	const bare = String(model).replace(/^anthropic\//, "");
	return ALIASES[bare] ?? bare;
}
function priceUsage(model, tokens, cacheWriteTtlKnown) {
	const canonical = canonicalModel(model);
	const base = canonical === null ? void 0 : PER_MTOK[canonical];
	if (!base) return {
		costUsd: null,
		costSource: "unknown"
	};
	if (tokens.input == null || tokens.output == null) return {
		costUsd: null,
		costSource: "unknown"
	};
	const promptTokens = tokens.input + (tokens.cacheRead ?? 0) + (tokens.cacheWrite5m ?? 0) + (tokens.cacheWrite1h ?? 0);
	const price = base.longContext && promptTokens > base.longContext.overTokens ? base.longContext : base;
	const cost = tokens.input * price.input + tokens.output * price.output + (tokens.cacheRead ?? 0) * price.cacheRead + (tokens.cacheWrite5m ?? 0) * price.input * CACHE_WRITE_5M + (tokens.cacheWrite1h ?? 0) * price.input * CACHE_WRITE_1H;
	const hasUntimedWrites = !cacheWriteTtlKnown && (tokens.cacheWrite5m ?? 0) > 0;
	return {
		costUsd: cost / 1e6,
		costSource: hasUntimedWrites ? "estimated" : "measured"
	};
}
// src/workflows/olko-review.ts
var STACK_LENSES = [
	{
		id: "dotnet",
		agentName: "olko-review-dotnet-lens",
		pattern: /\.(cs|csproj|props|targets)$/
	},
	{
		id: "react",
		agentName: "olko-review-react-lens",
		pattern: /\.(ts|tsx)$/
	},
	{
		id: "mobile",
		agentName: "olko-review-mobile-lens",
		pattern: /\.(kt|kts)$/
	},
	{
		id: "python",
		agentName: "olko-review-python-lens",
		pattern: /\.py$/
	}
];
var GENERATED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/;
var TIERS = [
	"bug",
	"security",
	"repo-rule",
	"design",
	"style",
	"nit"
];
function reviewState(state) {
	return state;
}
function splitDiff(diff) {
	const files = [];
	for (const chunk of diff.split(/^(?=diff --git )/m)) {
		const header = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
		if (header?.[2] !== void 0) files.push({
			path: header[2],
			diff: chunk
		});
	}
	return files;
}
function cleanLine(line) {
	const bare = line.trim().replace(/^[-*]\s+/, "");
	return /^`[^`]*`$/.test(bare) ? bare.slice(1, -1) : bare;
}
function parseFindings(text) {
	return String(text).split("\n").map(cleanLine).filter((line) => line.split("|").length >= 5 && !/^path\s*\|/i.test(line)).map((line) => {
		const [location = "", ruleId = "", sev = "", problem = "", ...fix] = line.split("|").map((p) => p.trim());
		return {
			location,
			ruleId,
			sev,
			problem,
			fix: fix.join(" | "),
			line
		};
	});
}
function parseVerdicts(text) {
	const verdicts = [];
	for (const line of String(text).split("\n").map(cleanLine)) {
		const match = line.match(/^(CONFIRMED-UNCHECKED|CONFIRMED|REJECTED)\s*\|\s*(.+)$/);
		if (match?.[1] !== void 0 && match[2] !== void 0) verdicts.push({
			verdict: match[1],
			rest: match[2]
		});
	}
	return verdicts;
}
function tierOf$1(finding) {
	const rule = finding.ruleId;
	const skillPrefix = (name) => new RegExp(`^${name}[.:]`).test(rule);
	if (finding.sev === "nit") return "nit";
	if (rule.startsWith("bug.")) return "bug";
	if (rule.startsWith("sec.") || /-security[.:]/.test(rule)) return "security";
	if (rule.startsWith("repo.") || /-testing[.:]/.test(rule)) return "repo-rule";
	if (skillPrefix("olko-design-rules") || /-architecture[.:]/.test(rule)) return "design";
	return "style";
}
function lensPrompt({ state, agent }) {
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
		...files.map((f) => f.diff)
	].join("\n");
}
function verifierPrompt({ state }) {
	const review = reviewState(state);
	const findings = review.merge.findings;
	return [
		`PR #${review.scope.pr}: ${review.scope.title}`,
		"The current branch is the PR head. The files in the working tree match the diff.",
		"",
		`Findings (${findings.length}), one per line:`,
		...findings.map((f) => f.line)
	].join("\n");
}
var REVIEW_WORKFLOW = {
	name: "olko-review",
	version: "0.1.0",
	source: "agents/opencode/olko-review-orchestrator.md (REVIEW ROUTE)",
	roles: {
		lens: "medium",
		verifier: "medium"
	},
	nodes: [
		{
			id: "scope",
			path: "olko-review/scope",
			kind: "script",
			async script({ input, exec }) {
				const pr = input.pr;
				if (pr === void 0 || !Number.isInteger(pr) || !/^[\w.-]+\/[\w.-]+$/.test(input.repo ?? "")) throw new Error("input needs repo owner/name and an integer pr");
				if (!exec) throw new Error("scope needs the host exec tool");
				const repo = input.repo ?? "";
				const view = await exec("gh", [
					"pr",
					"view",
					String(pr),
					"--repo",
					repo,
					"--json",
					"title,body,headRefName,author"
				]);
				const diff = await exec("gh", [
					"pr",
					"diff",
					String(pr),
					"--repo",
					repo
				]);
				if (view.code !== 0 || diff.code !== 0) throw new Error(`gh failed: ${(view.stderr || diff.stderr).slice(-300)}`);
				const meta = JSON.parse(view.stdout);
				const all = splitDiff(diff.stdout);
				const files = all.filter((f) => !GENERATED.test(f.path));
				const excluded = all.filter((f) => GENERATED.test(f.path)).map((f) => f.path);
				if (files.length === 0) throw new Error("no diff to review");
				return {
					state: {
						pr,
						title: meta.title,
						body: meta.body,
						head: meta.headRefName,
						files,
						excluded
					},
					output: `PR #${pr} "${meta.title}" (${meta.headRefName}): ${files.length} files, ${diff.stdout.length} characters of diff. Not sent to lenses (generated lockfiles): ${excluded.join(", ") || "none"}.`
				};
			}
		},
		{
			id: "detect",
			path: "olko-review/detect",
			kind: "script",
			async script({ state }) {
				const files = reviewState(state).scope.files;
				const lenses = [{
					id: "bugs",
					agentName: "olko-review-bugs-lens",
					role: "lens",
					paths: files.map((f) => f.path)
				}];
				for (const stack of STACK_LENSES) {
					const paths = files.map((f) => f.path).filter((p) => stack.pattern.test(p));
					if (paths.length) lenses.push({
						id: stack.id,
						agentName: stack.agentName,
						role: "lens",
						paths
					});
				}
				const covered = new Set(lenses.slice(1).flatMap((l) => l.paths ?? []));
				const bugsOnly = [...new Set(files.map((f) => f.path).filter((p) => !covered.has(p)).map((p) => p.match(/\.[^./]+$/)?.[0] ?? "(no extension)"))];
				return {
					state: {
						lenses,
						bugsOnlyTypes: bugsOnly
					},
					output: `Lenses: ${lenses.map((l) => `${l.agentName} (${l.paths?.length} files)`).join(", ")}. File types reviewed only by the bugs lens: ${bugsOnly.join(", ") || "none"}.`
				};
			}
		},
		{
			id: "memory",
			path: "olko-review/memory",
			kind: "script",
			async script() {
				return {
					state: {
						loaded: false,
						suppress: [],
						prioritize: []
					},
					output: "Memory layer not loaded: the factory PoC does not run olko-memory-layer. Lenses get empty Suppress and Prioritize lists."
				};
			}
		},
		{
			id: "lenses",
			path: "olko-review/lenses",
			kind: "llm",
			role: "lens",
			agentsFrom: (state) => reviewState(state).detect.lenses,
			prompt: lensPrompt,
			parse: parseFindings
		},
		{
			id: "merge",
			path: "olko-review/merge",
			kind: "script",
			async script({ state }) {
				const byKey = /* @__PURE__ */ new Map();
				for (const [lens, findings] of Object.entries(reviewState(state).lenses ?? {})) for (const f of findings) {
					const key = `${f.location}|${f.ruleId}`;
					const current = byKey.get(key);
					if (!current || TIERS.indexOf(tierOf$1(f)) < TIERS.indexOf(tierOf$1(current))) byKey.set(key, {
						...f,
						lens
					});
				}
				const findings = [...byKey.values()];
				return {
					state: { findings },
					output: findings.length ? findings.map((f) => f.line).join("\n") : "No findings from the lenses."
				};
			}
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
			parse: parseVerdicts
		},
		{
			id: "rank",
			path: "olko-review/rank",
			kind: "script",
			async script({ state }) {
				const review = reviewState(state);
				const findings = review.merge.findings;
				const verdicts = review.verify?.verify ?? [];
				const kept = [];
				const dropped = [];
				findings.forEach((f, i) => {
					const v = verdicts[i];
					if (v && v.verdict !== "REJECTED") kept.push({
						...f,
						unchecked: v.verdict === "CONFIRMED-UNCHECKED"
					});
					else dropped.push({
						...f,
						reason: v ? (v.rest.split("|").at(-1) ?? "").trim() : "no verdict returned"
					});
				});
				kept.sort((a, b) => TIERS.indexOf(tierOf$1(a)) - TIERS.indexOf(tierOf$1(b)));
				const totals = TIERS.map((t) => `${t}: ${kept.filter((f) => tierOf$1(f) === t).length}`).join(", ");
				const lines = [
					`Review of PR #${review.scope.pr}: ${review.scope.title}`,
					"",
					...kept.length ? kept.map((f) => `${f.line}${f.unchecked ? " (rule unchecked)" : ""}`) : ["No confirmed findings."],
					"",
					`Totals: ${totals}`,
					`Lenses run: ${review.detect.lenses.map((l) => l.agentName).join(", ")}`,
					`File types reviewed only by the bugs lens: ${review.detect.bugsOnlyTypes.join(", ") || "none"}`,
					`Not reviewed (generated lockfiles): ${review.scope.excluded.join(", ") || "none"}`,
					`Dropped by the verifier: ${dropped.length}`,
					...dropped.map((f) => `  - ${f.line} | ${f.reason}`),
					"Memory: not loaded (factory PoC)."
				];
				return {
					state: {
						kept,
						dropped
					},
					output: lines.join("\n")
				};
			}
		}
	]
};
// src/engine.ts
var FAKE_PRICE_PER_MTOK = {
	low: {
		input: .8,
		output: 4
	},
	medium: {
		input: 3,
		output: 15
	},
	high: {
		input: 15,
		output: 75
	}
};
var DEFAULT_ROLES = {
	planner: "high",
	implementer: "medium",
	reviewer: "medium",
	accountant: "low"
};
var DEFAULT_BUDGET = {
	maxCostUsd: 1.5,
	infoRatio: .5,
	pauseRatio: .8
};
var DEFAULT_CONFIG = {
	roles: DEFAULT_ROLES,
	tiers: {
		low: "claude-haiku-5-5",
		medium: "claude-sonnet-5-5",
		high: "claude-opus-5-5"
	},
	backend: { kind: "delegate" },
	budget: DEFAULT_BUDGET
};
var FAKE_CONFIG = {
	roles: DEFAULT_ROLES,
	tiers: {
		low: "fake-low",
		medium: "fake-medium",
		high: "fake-high"
	},
	backend: { kind: "fake" },
	budget: DEFAULT_BUDGET
};
function processAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === "EPERM";
	}
}
function ownedByOtherProcess(run) {
	return run.ownerPid !== void 0 && run.ownerPid !== process.pid && processAlive(run.ownerPid);
}
function parseBackend(value) {
	const backend = value ?? "delegate";
	if (backend !== "fake" && backend !== "delegate") throw new Error("FACTORY_BACKEND must be fake or delegate");
	return backend;
}
var WORKFLOWS = {
	hello: {
		name: "hello",
		version: "0.1.0",
		nodes: [
			{
				id: "plan",
				path: "hello/plan",
				kind: "llm",
				role: "planner",
				turns: 3,
				prompt: "You are the planner node of a test workflow. Goal: {goal}. Reply with a 3-step plan in at most 50 words. Do not use any tools."
			},
			{
				id: "implement",
				path: "hello/build/implement",
				kind: "llm",
				role: "implementer",
				turns: 4,
				askAfterTurn: 2,
				question: {
					id: "q-endpoint",
					text: "New endpoint or extend the existing one?",
					allowed: ["new", "extend"]
				},
				prompt: "You are the implementer node of a test workflow. Goal: {goal}. The user chose: {answer}. Reply with a JavaScript function of at most 8 lines that returns a greeting. Do not use any tools."
			},
			{
				id: "verify",
				path: "hello/build/verify",
				kind: "script"
			},
			{
				id: "review",
				path: "hello/review",
				kind: "llm",
				role: "reviewer",
				turns: 1,
				agents: [
					{ id: "security" },
					{ id: "style" },
					{ id: "tests" },
					{
						id: "docs",
						role: "accountant"
					}
				],
				prompt: "You are the {agent} reviewer of a test workflow. Goal: {goal}. In one sentence, name one {agent} risk of a greeting function. Do not use any tools."
			},
			{
				id: "accountant",
				path: "hello/accountant",
				kind: "llm",
				role: "accountant",
				turns: 1,
				prompt: "You are the accountant node of a test workflow. In one sentence, report that the run has used {steps} steps so far. Do not use any tools."
			}
		]
	},
	[REVIEW_WORKFLOW.name]: REVIEW_WORKFLOW
};
function workflowOf(run) {
	const workflow = WORKFLOWS[run.workflow ?? "hello"];
	if (!workflow) throw new Error(`unknown workflow ${run.workflow}`);
	return workflow;
}
function workflowLabel(run) {
	const workflow = workflowOf(run);
	return `${workflow.name}@${workflow.version}`;
}
var TURN_DELAY_MS = Number(process.env.FACTORY_TURN_DELAY_MS ?? 40);
function fakeModelTurn(tier, turn, agentIndex = 0) {
	const inputTokens = 3e3 + turn * 1500 + agentIndex * 700;
	const outputTokens = 300 + turn * 50;
	const price = FAKE_PRICE_PER_MTOK[tier];
	return {
		inputTokens,
		outputTokens,
		costUsd: (inputTokens * price.input + outputTokens * price.output) / 1e6
	};
}
var Factory = class {
	dataDir;
	executors;
	defaultConfig;
	runs = /* @__PURE__ */ new Map();
	idempotency = /* @__PURE__ */ new Map();
	timers = /* @__PURE__ */ new Map();
	busy = /* @__PURE__ */ new Set();
	waiters = /* @__PURE__ */ new Map();
	constructor(dataDir, { executors = {}, backend = "delegate" } = {}) {
		this.dataDir = dataDir;
		this.executors = executors;
		this.defaultConfig = backend === "fake" ? FAKE_CONFIG : DEFAULT_CONFIG;
		fs.mkdirSync(path.join(dataDir, "runs"), { recursive: true });
		this.restore();
	}
	restore() {
		const dir = path.join(this.dataDir, "runs");
		for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
			const run = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
			this.runs.set(run.runId, run);
			if (run.idempotencyKey) this.idempotency.set(run.idempotencyKey, run.runId);
			if (run.status === "running" && !ownedByOtherProcess(run)) this.schedule(run);
		}
	}
	checkpoint(run) {
		fs.writeFileSync(path.join(this.dataDir, "runs", `${run.runId}.json`), JSON.stringify(run, null, 2));
		if (run.status !== "running") this.notify(run);
	}
	notify(run) {
		const waiting = this.waiters.get(run.runId);
		if (!waiting) return;
		this.waiters.delete(run.runId);
		for (const resolve of waiting) resolve(run);
	}
	waitForChange(runId, timeoutMs) {
		const run = this.get(runId);
		if (run.status !== "running") return Promise.resolve({
			run,
			timedOut: false
		});
		return new Promise((resolve) => {
			const done = (r) => {
				clearTimeout(timer);
				resolve({
					run: r,
					timedOut: false
				});
			};
			const timer = setTimeout(() => {
				this.waiters.get(runId)?.delete(done);
				resolve({
					run,
					timedOut: true
				});
			}, timeoutMs);
			let waiting = this.waiters.get(runId);
			if (!waiting) {
				waiting = /* @__PURE__ */ new Set();
				this.waiters.set(runId, waiting);
			}
			waiting.add(done);
		});
	}
	appendLedger(run, record) {
		const entry = {
			runId: run.runId,
			workflow: workflowLabel(run),
			at: (/* @__PURE__ */ new Date()).toISOString(),
			...record
		};
		run.ledger.push(entry);
		fs.appendFileSync(path.join(this.dataDir, "ledger.jsonl"), JSON.stringify(entry) + "\n");
		this.event(run, "ledger_record", {
			node: record.nodePath,
			costUsd: record.costUsd,
			costSource: record.costSource
		});
	}
	event(run, type, data = {}) {
		run.events.push({
			at: (/* @__PURE__ */ new Date()).toISOString(),
			type,
			...data
		});
	}
	get(runId) {
		const run = this.runs.get(runId);
		if (!run) throw new Error(`unknown runId ${runId}`);
		return run;
	}
	start(goal, idempotencyKey, { workflow = "hello", input = {} } = {}) {
		const definition = WORKFLOWS[workflow];
		if (!definition) throw new Error(`unknown workflow ${workflow}`);
		const existing = idempotencyKey ? this.idempotency.get(idempotencyKey) : void 0;
		if (existing) return {
			run: this.get(existing),
			reused: true
		};
		const defaults = structuredClone(this.defaultConfig);
		const run = {
			runId: `r-${crypto.randomUUID().slice(0, 8)}`,
			idempotencyKey: idempotencyKey ?? null,
			goal,
			workflow,
			input,
			state: {},
			nodeAgents: {},
			status: "needs_confirmation",
			proposal: {
				...defaults,
				roles: {
					...defaults.roles,
					...definition.roles ?? {}
				}
			},
			config: null,
			cursor: 0,
			nodeTurn: 0,
			steps: 0,
			pendingQuestion: null,
			pendingWork: null,
			answers: {},
			ledger: [],
			events: [],
			thresholdsHit: []
		};
		this.runs.set(run.runId, run);
		if (idempotencyKey) this.idempotency.set(idempotencyKey, run.runId);
		this.event(run, "run_created", { goal });
		this.checkpoint(run);
		return {
			run,
			reused: false
		};
	}
	confirm(runId, overrides = {}) {
		const run = this.get(runId);
		if (run.status !== "needs_confirmation") return run;
		const backend = {
			...run.proposal.backend,
			...overrides.backend ?? {}
		};
		if (backend.kind === "cli" && !(backend.cli && this.executors[backend.cli])) throw new Error(`no executor for cli backend '${backend.cli}' in this factory process`);
		run.config = {
			...run.proposal,
			backend,
			roles: {
				...run.proposal.roles,
				...overrides.roles ?? {}
			},
			tiers: {
				...run.proposal.tiers,
				...overrides.tierModels ?? {}
			},
			budget: {
				...run.proposal.budget,
				...overrides.budget ?? {}
			}
		};
		run.status = "running";
		this.event(run, "run_confirmed", { config: run.config });
		this.checkpoint(run);
		this.schedule(run);
		return run;
	}
	answer(runId, questionId, answer) {
		const run = this.get(runId);
		if (run.answers[questionId] !== void 0) {
			if (run.answers[questionId] === answer) return {
				run,
				duplicate: true
			};
			throw new Error(`question ${questionId} already answered with a different value`);
		}
		const pending = run.pendingQuestion;
		if (!pending || pending.id !== questionId) throw new Error(`no pending question ${questionId}`);
		if (pending.allowed && !pending.allowed.includes(answer)) throw new Error(`invalid answer '${answer}', allowed: ${pending.allowed.join(", ")}`);
		run.answers[questionId] = answer;
		run.pendingQuestion = null;
		run.status = "running";
		this.event(run, "run_resumed", { questionId });
		this.checkpoint(run);
		this.schedule(run);
		return {
			run,
			duplicate: false
		};
	}
	next(runId) {
		const run = this.get(runId);
		return run.status === "waiting_for_client" ? run.pendingWork : null;
	}
	submit(runId, nodePath, output, usage = {}, agentId = void 0) {
		const run = this.get(runId);
		const work = run.pendingWork;
		if (run.status !== "waiting_for_client" || !work || work.nodePath !== nodePath) {
			if (run.ledger.find((r) => r.nodePath === nodePath && r.backend === "delegate" && (!agentId || r.agentId === agentId))) return {
				run,
				duplicate: true
			};
			throw new Error(`no pending work for node ${nodePath}`);
		}
		const inputTokens = Number.isInteger(usage.inputTokens) ? usage.inputTokens : void 0;
		const outputTokens = Number.isInteger(usage.outputTokens) ? usage.outputTokens : void 0;
		const hasSplit = inputTokens !== void 0 && outputTokens !== void 0;
		const tokens = {
			input: hasSplit ? inputTokens : null,
			output: hasSplit ? outputTokens : null,
			cacheRead: usage.cacheReadTokens ?? 0,
			cacheWrite5m: usage.cacheWriteTokens ?? 0,
			cacheWrite1h: 0
		};
		const priced = hasSplit ? priceUsage(usage.model ?? work.model, tokens, false) : {
			costUsd: null,
			costSource: "unknown"
		};
		run.steps += 1;
		this.appendLedger(run, {
			nodePath,
			agentId: work.agentId,
			kind: "llm",
			tier: work.tier,
			model: usage.model ?? work.model,
			backend: "delegate",
			turn: 1,
			inputTokens: tokens.input,
			outputTokens: tokens.output,
			cacheReadTokens: tokens.cacheRead,
			cacheWrite5mTokens: tokens.cacheWrite5m,
			cacheWrite1hTokens: 0,
			totalTokens: usage.totalTokens ?? null,
			childSessionId: usage.childSessionId ?? null,
			costUsd: priced.costUsd,
			costSource: hasSplit ? "reported" : "unknown",
			outputPreview: String(output ?? "").slice(0, 200)
		});
		run.pendingWork = null;
		run.status = "running";
		this.finishAgent(run, nodeAt(run), { backend: "delegate" });
		this.checkpoint(run);
		this.schedule(run);
		return {
			run,
			duplicate: false
		};
	}
	enrichLedger(runId, index, usage) {
		const run = this.get(runId);
		const record = run.ledger[index];
		if (!record) throw new Error(`no ledger record ${index} in run ${runId}`);
		const priced = priceUsage(record.model, usage.tokens, usage.cacheWriteTtlKnown);
		Object.assign(record, {
			inputTokens: usage.tokens.input,
			outputTokens: usage.tokens.output,
			cacheReadTokens: usage.tokens.cacheRead,
			cacheWrite5mTokens: usage.tokens.cacheWrite5m,
			costUsd: priced.costUsd,
			costSource: priced.costSource,
			enrichedFrom: "child-session"
		});
		this.checkpoint(run);
	}
	cancel(runId) {
		const run = this.get(runId);
		if (![
			"done",
			"stopped",
			"failed"
		].includes(run.status)) {
			run.status = "cancelled";
			this.event(run, "run_cancelled");
			this.checkpoint(run);
		}
		return run;
	}
	schedule(run) {
		if (this.timers.has(run.runId) || this.busy.has(run.runId)) return;
		run.ownerPid = process.pid;
		const tick = async () => {
			this.timers.delete(run.runId);
			if (run.status !== "running") return;
			this.busy.add(run.runId);
			try {
				await this.step(run);
			} catch (error) {
				run.status = "failed";
				this.event(run, "run_failed", { error: errorMessage(error) });
			} finally {
				this.busy.delete(run.runId);
			}
			this.checkpoint(run);
			if (run.status === "running") this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
		};
		this.timers.set(run.runId, setTimeout(tick, TURN_DELAY_MS));
	}
	totals(run) {
		return {
			costUsd: run.ledger.reduce((s, r) => s + (r.costUsd ?? 0), 0),
			tokens: run.ledger.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.inputTokens == null ? r.totalTokens ?? 0 : 0), 0),
			steps: run.steps
		};
	}
	checkBudget(run) {
		const { maxCostUsd, infoRatio, pauseRatio } = configOf(run).budget;
		const ratio = this.totals(run).costUsd / maxCostUsd;
		if (ratio >= 1) {
			run.status = "stopped";
			this.event(run, "budget_exceeded", { ratio });
			return false;
		}
		if (ratio >= infoRatio && !run.thresholdsHit.includes("info")) {
			run.thresholdsHit.push("info");
			this.event(run, "budget_threshold", {
				level: "info",
				ratio
			});
		}
		if (ratio >= pauseRatio && !run.thresholdsHit.includes("pause")) {
			run.thresholdsHit.push("pause");
			run.status = "waiting_for_user";
			run.pendingQuestion = {
				id: "q-budget-pause",
				text: `The factory run has used ${Math.round(ratio * 100)}% of its budget. Continue or stop?`,
				allowed: ["continue", "stop"]
			};
			this.event(run, "budget_threshold", {
				level: "pause",
				ratio
			});
			return false;
		}
		return true;
	}
	prompt(run, node) {
		if (typeof node.prompt === "function") return node.prompt({
			goal: run.goal,
			input: run.input,
			state: run.state,
			agent: currentAgent(run, node)
		});
		if (node.prompt === void 0) throw new Error(`node ${node.path} has no prompt`);
		return node.prompt.replace("{goal}", run.goal).replace("{answer}", (node.question && run.answers[node.question.id]) ?? "").replace("{steps}", String(run.steps)).replaceAll("{agent}", currentAgent(run, node).id);
	}
	async step(run) {
		if (run.answers["q-budget-pause"] === "stop") {
			run.status = "stopped";
			return;
		}
		if (!this.checkBudget(run)) return;
		const node = workflowOf(run).nodes[run.cursor];
		if (!node) {
			run.status = "done";
			this.event(run, "run_completed", this.totals(run));
			return;
		}
		if (run.nodeTurn === 0 && !run.events.some((e) => e.type === "node_started" && e.node === node.path && e.cursor === run.cursor)) this.event(run, "node_started", {
			node: node.path,
			cursor: run.cursor
		});
		if (node.kind === "script") {
			run.steps += 1;
			const started = Date.now();
			const result = node.script ? await node.script({
				input: run.input ?? {},
				state: run.state ?? {},
				exec: this.executors.exec
			}) : {
				state: { passed: true },
				output: "verify passed"
			};
			if (run.state) run.state[node.id] = result.state;
			this.appendLedger(run, {
				nodePath: node.path,
				agentId: node.id,
				kind: "script",
				tier: null,
				model: null,
				backend: "script",
				turn: 1,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
				costSource: "measured",
				durationMs: Date.now() - started,
				output: result.output ?? null
			});
			this.event(run, "node_completed", {
				node: node.path,
				result: (String(result.output ?? "").split(/\r?\n/)[0] ?? "").slice(0, 200)
			});
			run.cursor += 1;
			run.nodeTurn = 0;
			return;
		}
		const config = configOf(run);
		const backend = config.backend.kind;
		const askNow = backend === "fake" ? run.nodeTurn === node.askAfterTurn : true;
		if (node.question && askNow && run.answers[node.question.id] === void 0) {
			run.status = "waiting_for_user";
			run.pendingQuestion = {
				...node.question,
				node: node.path
			};
			this.event(run, "needs_input", {
				node: node.path,
				questionId: node.question.id
			});
			return;
		}
		if (node.agentsFrom && run.nodeAgents?.[node.id] === void 0) {
			run.nodeAgents ??= {};
			const selected = node.agentsFrom(run.state);
			run.nodeAgents[node.id] = selected;
			this.event(run, "agents_selected", {
				node: node.path,
				agents: selected.map((a) => a.id)
			});
		}
		if (agentsOf(run, node)?.length === 0 || node.skipIf?.(run.state)) {
			this.event(run, "node_skipped", {
				node: node.path,
				reason: node.skipReason ?? "no work"
			});
			run.cursor += 1;
			run.nodeTurn = 0;
			run.agentIndex = 0;
			return;
		}
		const agent = currentAgent(run, node);
		const tier = tierOf(config, agent);
		if (backend === "cli") return this.runCliNode(run, node, tier);
		if (backend === "delegate") {
			run.pendingWork = {
				nodePath: node.path,
				agentId: agent.id,
				tier,
				model: config.tiers[tier],
				prompt: this.prompt(run, node)
			};
			run.status = "waiting_for_client";
			this.event(run, "work_offered", {
				node: node.path,
				agentId: agent.id,
				tier
			});
			return;
		}
		const turn = run.nodeTurn + 1;
		const usage = fakeModelTurn(tier, turn, run.agentIndex ?? 0);
		run.steps += 1;
		run.nodeTurn = turn;
		this.appendLedger(run, {
			nodePath: node.path,
			agentId: agent.id,
			kind: "llm",
			tier,
			model: config.tiers[tier],
			backend: "fake",
			turn,
			...usage,
			costSource: "measured"
		});
		if (node.turns !== void 0 && turn >= node.turns) this.finishAgent(run, node, { turns: turn });
	}
	finishAgent(run, node, details) {
		const agent = currentAgent(run, node);
		const agents = agentsOf(run, node);
		if (agents) this.event(run, "agent_completed", {
			node: node.path,
			agentId: agent.id,
			...details
		});
		run.nodeTurn = 0;
		if (agents && (run.agentIndex ?? 0) + 1 < agents.length) {
			run.agentIndex = (run.agentIndex ?? 0) + 1;
			return;
		}
		run.agentIndex = 0;
		run.cursor += 1;
		this.event(run, "node_completed", {
			node: node.path,
			...details
		});
	}
	async runCliNode(run, node, tier) {
		const config = configOf(run);
		const { cli } = config.backend;
		const model = config.tiers[tier];
		const agent = currentAgent(run, node);
		const agentId = agent.id;
		const executor = cli ? this.executors[cli] : void 0;
		if (!executor) throw new Error(`no executor for cli backend '${cli}' in this factory process`);
		const result = await executor({
			model,
			prompt: this.prompt(run, node),
			agent: agent.agentName,
			cwd: run.input?.cwd,
			configDir: run.input?.agentConfigDir
		});
		run.steps += 1;
		if (!result.ok) {
			run.status = "failed";
			this.event(run, "node_failed", {
				node: node.path,
				error: result.error
			});
			return;
		}
		for (const u of result.usageByModel ?? []) {
			const priced = priceUsage(u.model, u.tokens, u.cacheWriteTtlKnown);
			this.appendLedger(run, {
				nodePath: node.path,
				agentId,
				kind: "llm",
				tier,
				model: u.model,
				requestedModel: model,
				backend: `cli:${cli}`,
				turn: 1,
				harnessTurns: result.turns,
				inputTokens: u.tokens.input,
				outputTokens: u.tokens.output,
				cacheReadTokens: u.tokens.cacheRead,
				cacheWrite5mTokens: u.tokens.cacheWrite5m,
				cacheWrite1hTokens: u.tokens.cacheWrite1h,
				costUsd: priced.costUsd,
				costSource: priced.costSource,
				harnessCostUsd: u.harnessCostUsd,
				durationMs: result.durationMs,
				outputPreview: String(result.text ?? "").slice(0, 200),
				output: result.text ?? null,
				agentName: agent.agentName ?? null
			});
		}
		if (node.parse && run.state) {
			const previous = run.state[node.id];
			const byAgent = typeof previous === "object" && previous !== null ? previous : {};
			run.state[node.id] = {
				...byAgent,
				[agentId]: node.parse(result.text ?? "")
			};
		}
		this.finishAgent(run, node, { backend: `cli:${cli}` });
	}
	footer(run) {
		const t = this.totals(run);
		const max = run.config?.budget.maxCostUsd ?? run.proposal.budget.maxCostUsd;
		const perNode = {};
		for (const r of run.ledger) perNode[r.nodePath] = round((perNode[r.nodePath] ?? 0) + (r.costUsd ?? 0));
		return {
			costUsd: round(t.costUsd),
			budgetUsd: max,
			budgetRatio: round(t.costUsd / max),
			tokens: t.tokens,
			steps: t.steps,
			perNode,
			source: costSourceSummary(run.ledger),
			warnings: run.thresholdsHit.map((h) => `budget threshold: ${h}`)
		};
	}
	status(run) {
		const node = workflowOf(run).nodes[run.cursor];
		return {
			runId: run.runId,
			status: run.status,
			currentNode: node?.path ?? null,
			pendingQuestion: run.pendingQuestion,
			pendingWork: run.status === "waiting_for_client" ? run.pendingWork : void 0,
			retryAfterMs: run.status === "running" ? 2e3 : null,
			next: nextHint(run),
			proposal: run.status === "needs_confirmation" ? run.proposal : void 0,
			cost: this.footer(run)
		};
	}
	report(run) {
		const byNode = {};
		const byTier = {};
		const byModel = {};
		const byCostSource = {};
		let harnessCostUsd = 0;
		let cacheTokens = 0;
		const coverage = {
			run: {
				llmSteps: 0,
				unknownSteps: 0
			},
			byTier: {},
			byModel: {}
		};
		const count = (target) => {
			target.llmSteps += 1;
		};
		const countUnknown = (target) => {
			target.unknownSteps += 1;
		};
		for (const r of run.ledger) {
			const cache = (r.cacheReadTokens ?? 0) + (r.cacheWrite5mTokens ?? 0) + (r.cacheWrite1hTokens ?? 0);
			cacheTokens += cache;
			const nodeEntry = byNode[r.nodePath] ??= {
				steps: 0,
				llmSteps: 0,
				unknownSteps: 0,
				tokens: 0,
				cacheTokens: 0,
				costUsd: 0,
				tier: r.tier,
				model: r.model ?? null,
				byAgent: {},
				costSource: ""
			};
			nodeEntry.cacheTokens += cache;
			const agentKey = r.agentId ?? r.nodePath.split("/").at(-1) ?? r.nodePath;
			const agentEntry = nodeEntry.byAgent[agentKey] ??= {
				steps: 0,
				llmSteps: 0,
				unknownSteps: 0,
				tokens: 0,
				cacheTokens: 0,
				costUsd: 0,
				tier: r.tier,
				model: r.model ?? null,
				agentName: r.agentName ?? null,
				costSource: "",
				sources: []
			};
			agentEntry.cacheTokens += cache;
			agentEntry.steps += 1;
			agentEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
			agentEntry.costUsd += r.costUsd ?? 0;
			agentEntry.sources?.push(r.costSource);
			nodeEntry.steps += 1;
			nodeEntry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
			nodeEntry.costUsd += r.costUsd ?? 0;
			const tierKey = r.tier ?? "script";
			byTier[tierKey] = (byTier[tierKey] ?? 0) + (r.costUsd ?? 0);
			if (r.kind === "llm") {
				const modelKey = r.model ?? "unknown";
				byModel[modelKey] = (byModel[modelKey] ?? 0) + (r.costUsd ?? 0);
				byCostSource[r.costSource] = (byCostSource[r.costSource] ?? 0) + 1;
				const targets = [
					coverage.run,
					coverage.byTier[tierKey] ??= {
						llmSteps: 0,
						unknownSteps: 0
					},
					coverage.byModel[modelKey] ??= {
						llmSteps: 0,
						unknownSteps: 0
					},
					nodeEntry,
					agentEntry
				];
				targets.forEach(count);
				if (r.costSource === "unknown") targets.forEach(countUnknown);
			}
			harnessCostUsd += r.harnessCostUsd ?? 0;
		}
		for (const [nodePath, entry] of Object.entries(byNode)) {
			entry.costUsd = round(entry.costUsd);
			if (new Set(Object.values(entry.byAgent).map((x) => x.tier)).size > 1) Object.assign(entry, {
				tier: "mixed",
				model: "mixed"
			});
			for (const agentEntry of Object.values(entry.byAgent)) {
				agentEntry.costUsd = round(agentEntry.costUsd);
				agentEntry.costSource = singleOrMixed(new Set(agentEntry.sources));
				delete agentEntry.sources;
			}
			entry.costSource = singleOrMixed(new Set(run.ledger.filter((r) => r.nodePath === nodePath).map((r) => r.costSource)));
		}
		for (const totals of [byTier, byModel]) for (const [key, value] of Object.entries(totals)) totals[key] = round(value);
		return {
			runId: run.runId,
			status: run.status,
			workflow: workflowLabel(run),
			backend: run.config?.backend,
			tierModels: run.config?.tiers,
			synthetic: (run.config ?? run.proposal).backend?.kind === "fake",
			byNode,
			byTier,
			byModel,
			byCostSource,
			coverage,
			cacheTokens,
			harnessCostUsd: round(harnessCostUsd),
			cost: this.footer(run)
		};
	}
	trace(run) {
		const lines = [`run ${run.runId} [${run.status}] ${workflowLabel(run)}  $${round(this.totals(run).costUsd)}`];
		let lastNode = null;
		for (const r of run.ledger) {
			if (r.nodePath !== lastNode) {
				lines.push(`  ${r.nodePath} (${r.tier ?? "script"})`);
				lastNode = r.nodePath;
			}
			lines.push(`    turn ${r.turn}: in=${r.inputTokens} out=${r.outputTokens} $${r.costUsd == null ? "?" : round(r.costUsd)} ${r.costSource}`);
		}
		for (const e of run.events.filter((e) => [
			"needs_input",
			"run_resumed",
			"budget_threshold"
		].includes(e.type))) lines.push(`  event ${e.type} ${e.node ?? e.questionId ?? e.level ?? ""}`);
		return lines.join("\n");
	}
};
function configOf(run) {
	if (!run.config) throw new Error(`run ${run.runId} is not confirmed`);
	return run.config;
}
function nodeAt(run) {
	const node = workflowOf(run).nodes[run.cursor];
	if (!node) throw new Error(`run ${run.runId} has no node at cursor ${run.cursor}`);
	return node;
}
function tierOf(config, agent) {
	const tier = agent.role === void 0 ? void 0 : config.roles[agent.role];
	if (!tier) throw new Error(`no tier for role '${agent.role}'`);
	return tier;
}
function agentsOf(run, node) {
	return run.nodeAgents?.[node.id] ?? node.agents ?? null;
}
function currentAgent(run, node) {
	const agents = agentsOf(run, node);
	if (!agents) return {
		id: node.id,
		role: node.role,
		agentName: node.agent
	};
	const agent = agents[run.agentIndex ?? 0];
	if (!agent) throw new Error(`node ${node.path} has no agent ${run.agentIndex ?? 0}`);
	return {
		...agent,
		role: agent.role ?? node.role,
		agentName: agent.agentName ?? node.agent
	};
}
function singleOrMixed(sources) {
	const [first] = sources;
	return sources.size === 1 && first !== void 0 ? first : "mixed";
}
function costSourceSummary(ledger) {
	const sources = new Set(ledger.filter((r) => r.kind === "llm").map((r) => r.costSource));
	if (sources.size === 0) return "none";
	return singleOrMixed(sources);
}
function nextHint(run) {
	switch (run.status) {
		case "needs_confirmation": return "Show the proposal to the user. After the user replies, call factory_confirm.";
		case "running": return "Call factory_wait. factory_wait returns when the run needs the user, needs your node work in delegate mode, or ends. Do not call factory_status in a loop.";
		case "waiting_for_user": return "Ask the user pendingQuestion.text. Then send the user's answer with factory_answer.";
		case "waiting_for_client": return "Run pendingWork.prompt in a subagent. Use the model in pendingWork.model. Then call factory_submit with the subagent output. If pendingWork has an agentId, pass the same agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), pass it as usage.childSessionId.";
		default: return "The run has ended (done, stopped, cancelled or failed). Call factory_report. Show the user viewerUrl: it shows the whole flow and the cost of each agent. Do not call factory_wait or factory_status again.";
	}
}
function round(v) {
	return Math.round(v * 1e6) / 1e6;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function runReport(run) {
	return Factory.prototype.report.call(Factory.prototype, run);
}
// app/csp.ts
var NONCE_PLACEHOLDER = "FACTORYCSPNONCEPLACEHOLD";
function createNonce() {
	return randomBytes(18).toString("base64");
}
function cspHeader(nonce) {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		`style-src 'self' 'nonce-${nonce}'`,
		"img-src 'self' data:",
		"font-src 'self'",
		"connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'"
	].join("; ");
}
function isHtml(res) {
	return String(res.getHeader("content-type") ?? "").includes("text/html");
}
function cspMiddleware({ nonceFactory = createNonce } = {}) {
	return (_req, res, next) => {
		const nonce = nonceFactory();
		const end = res.end.bind(res);
		res.end = (chunk, ...rest) => {
			if (!chunk || !isHtml(res)) return end(chunk, ...rest);
			const html = (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)).replaceAll(NONCE_PLACEHOLDER, nonce);
			if (!res.headersSent) {
				res.setHeader("Content-Security-Policy", cspHeader(nonce));
				res.removeHeader("Content-Length");
			}
			return end(html, ...rest);
		};
		next();
	};
}
// app/data.ts
var RUN_ID = /^r-[a-f0-9]{8}$/;
function readJson(file) {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}
async function finishFakeRun(factory, goal) {
	const { run } = factory.start(goal);
	factory.confirm(run.runId, { backend: { kind: "fake" } });
	for (;;) {
		const { run: current } = await factory.waitForChange(run.runId, 3e4);
		const question = current.pendingQuestion;
		if (current.status === "waiting_for_user" && question) {
			factory.answer(run.runId, question.id, question.id === "q-budget-pause" ? "continue" : "extend");
			continue;
		}
		if (current.status !== "running") return current;
	}
}
function createDataApi({ factoryDir, dataDir, configFile, demo }) {
	const runsDir = path.join(dataDir, "runs");
	function runFiles() {
		if (!fs.existsSync(runsDir)) return [];
		return fs.readdirSync(runsDir).filter((f) => RUN_ID.test(path.basename(f, ".json")));
	}
	let demoRun = null;
	return {
		dataDir,
		async ensureDemo() {
			if (demoRun) {
				await demoRun;
				return false;
			}
			if (!demo || runFiles().length > 0) return false;
			demoRun = finishFakeRun(new Factory(dataDir, { backend: "fake" }), "add a greeting function (demo run, fake model)").catch((error) => {
				demoRun = null;
				throw error;
			});
			await demoRun;
			return true;
		},
		workflows() {
			const dir = path.join(factoryDir, "workflows");
			return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f)));
		},
		config() {
			return readJson(configFile);
		},
		runs() {
			return runFiles().map((f) => readJson(path.join(runsDir, f))).map((run) => ({
				run,
				report: runReport(run)
			})).map(({ run, report }) => ({
				runId: run.runId,
				goal: run.goal,
				status: run.status,
				createdAt: run.events[0]?.at ?? null,
				costUsd: report.cost.costUsd,
				coverage: report.coverage.run,
				harness: run.config?.backend?.kind === "cli" ? run.config.backend.cli ?? null : run.config?.backend?.kind ?? null,
				synthetic: report.synthetic,
				requestedModels: [...new Set(Object.values(run.config?.tiers ?? {}))],
				usedModels: [...new Set(run.ledger.filter((r) => r.kind === "llm" && r.model).map((r) => r.model ?? ""))]
			})).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
		},
		run(runId) {
			if (!RUN_ID.test(runId)) return null;
			const file = path.join(runsDir, `${runId}.json`);
			if (!fs.existsSync(file)) return null;
			const run = readJson(file);
			const { runId: id, goal, status, config, answers, ledger, events, pendingQuestion } = run;
			return {
				run: {
					runId: id,
					goal,
					status,
					config,
					answers,
					ledger,
					events,
					pendingQuestion
				},
				report: runReport(run)
			};
		}
	};
}
function apiMiddleware(api) {
	return async (req, res, next) => {
		if (req.method !== "GET") return next();
		const url = new URL(req.url ?? "/", "http://localhost");
		const send = (status, body) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
		try {
			if (url.pathname === "/api/workflows") return send(200, api.workflows());
			if (url.pathname === "/api/config") return send(200, api.config());
			if (url.pathname === "/api/runs") {
				await api.ensureDemo();
				return send(200, api.runs());
			}
			const match = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
			if (match?.[1] !== void 0) {
				const detail = api.run(match[1]);
				return detail ? send(200, detail) : send(404, { error: "run not found" });
			}
			return next();
		} catch (error) {
			return send(500, { error: errorMessage(error) });
		}
	};
}
// src/viewer-routes.ts
var PREFIX = "/viewer";
var TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".json": "application/json"
};
function viewerUrlFor(publicUrl, runId) {
	return `${publicUrl.replace(/\/$/, "")}${PREFIX}/?run=${encodeURIComponent(runId)}`;
}
function allowedHostsFor(publicUrl, port) {
	const hosts = /* @__PURE__ */ new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
	hosts.add(new URL(publicUrl).host.toLowerCase());
	return hosts;
}
function staticFile(viewerDir, relativePath) {
	const root = path.resolve(viewerDir);
	const full = path.resolve(root, relativePath === "" ? "index.html" : relativePath);
	if (full !== root && !full.startsWith(root + path.sep)) return null;
	if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
	return full;
}
function viewerHandler({ viewerDir, dataDir, factoryDir, configFile, allowedHosts }) {
	const api = apiMiddleware(createDataApi({
		factoryDir,
		dataDir,
		configFile,
		demo: false
	}));
	const csp = cspMiddleware();
	return (req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
		if (!allowedHosts.has(String(req.headers.host ?? "").toLowerCase())) {
			res.writeHead(403, { "content-type": "text/plain" }).end("forbidden host");
			return true;
		}
		if (req.method !== "GET") {
			res.writeHead(405, { allow: "GET" }).end();
			return true;
		}
		if (url.pathname === PREFIX) {
			res.writeHead(302, { location: `${PREFIX}/${url.search}` }).end();
			return true;
		}
		const relative = decodeURIComponent(url.pathname.slice(8));
		res.setHeader("x-content-type-options", "nosniff");
		res.setHeader("referrer-policy", "no-referrer");
		if (relative.startsWith("api/")) {
			req.url = `/${relative}${url.search}`;
			api(req, res, () => res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" })));
			return true;
		}
		if (!fs.existsSync(path.join(viewerDir, "index.html"))) {
			res.writeHead(503, { "content-type": "text/plain" }).end("viewer is not built; run the factory setup (node factory/setup.ts)");
			return true;
		}
		const file = staticFile(viewerDir, relative);
		if (!file) {
			res.writeHead(404, { "content-type": "text/plain" }).end("not found");
			return true;
		}
		const type = TYPES[path.extname(file)] ?? "application/octet-stream";
		res.setHeader("content-type", type);
		if (type.startsWith("text/html")) {
			res.setHeader("cache-control", "no-store");
			csp(req, res, () => {});
		}
		res.end(fs.readFileSync(file));
		return true;
	};
}
// src/paths.ts
var FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
var VIEWER_HEALTH = "skill-factory-viewer";
var DEFAULT_VIEWER_PORT = 7340;
function defaultDataDir() {
	return process.env.FACTORY_DATA_DIR ?? path.join(os.homedir(), ".skill-factory");
}
function viewerOptions(dataDir) {
	return {
		viewerDir: process.env.FACTORY_VIEWER_DIR ?? path.join(FACTORY_DIR, "app", "dist"),
		dataDir,
		factoryDir: FACTORY_DIR,
		configFile: path.join(FACTORY_DIR, "spec", "examples", "valid", "factory-config.json")
	};
}
export { viewerOptions as a, viewerUrlFor as c, parseBackend as d, defaultDataDir as i, Factory as l, FACTORY_DIR as n, allowedHostsFor as o, VIEWER_HEALTH as r, viewerHandler as s, DEFAULT_VIEWER_PORT as t, errorMessage as u };
