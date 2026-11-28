import { O as viewerOptions, T as defaultDataDir, _ as loadFactoryConfig, a as listProjects, b as mustache, d as Factory, g as marketplaceDir, k as writeFileAtomic, l as cliExecutor, n as failRequest, r as viewerHandler, t as allowedHostsFor, u as hostExec, w as VIEWER_HEALTH, x as homeEnvNote } from "./viewer-routes.mjs";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
// src/watch.ts
/**
* Interval watches: a generic trigger that starts workflow runs from a command's output.
*
* A watch runs its command once per project every `everyMinutes`, reads a list of
* items from the command's JSON output, and starts one run of its workflow for each
* item whose key was seen in `stableChecks` consecutive checks. The run starts with
* the watch's backend and stops at its first question, so nothing happens until the
* user answers it. The watch knows no agent or workflow: everything specific lives
* in config/factory.yaml and in the workflow.
*/
function render(template, view) {
	return mustache.render(template, view, {}, { escape: (value) => String(value) });
}
function loadWatches() {
	return loadFactoryConfig().watches;
}
function readJson(file, fallback) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return fallback;
	}
}
function writeJson(file, value) {
	writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}
/** The older list of watched folders, `{ "dirs": [...] }` in the data directory. Registered projects live in the project registry (projects.ts projectsFile()). */
function knownProjectsFile(dataDir) {
	return path.join(dataDir, "projects.json");
}
/** Projects the factory knows: the registered projects, the folders in the data directory's `dirs` list and every run's input.project. */
function knownProjects(dataDir) {
	const file = readJson(knownProjectsFile(dataDir), {});
	const listed = [...listProjects().map((project) => project.path), ...Array.isArray(file.dirs) ? file.dirs : []];
	const dirs = new Set(listed.filter((dir) => typeof dir === "string").map((dir) => path.resolve(dir)));
	const runsDir = path.join(dataDir, "runs");
	if (fs.existsSync(runsDir)) for (const runFile of fs.readdirSync(runsDir).filter((name) => name.endsWith(".json"))) {
		const project = readJson(path.join(runsDir, runFile), {}).input?.project;
		if (typeof project === "string" && project.length > 0) dirs.add(path.resolve(project));
	}
	return [...dirs].sort();
}
function itemsOf(output, dotted) {
	const value = dotted.split(".").reduce((current, key) => current && typeof current === "object" ? current[key] : void 0, output);
	return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === "object") : [];
}
function stateFile(dataDir, watch) {
	return path.join(dataDir, "watches", `${watch.id}.json`);
}
/** One check of one watch over every qualifying project. Returns the ids of the runs it started. */
async function checkWatch(watch, context) {
	const { factory, dataDir, marketplace, exec } = context;
	const log = context.log ?? (() => void 0);
	const file = stateFile(dataDir, watch);
	const previous = readJson(file, { seen: {} });
	const seen = {};
	const started = [];
	for (const project of knownProjects(dataDir)) {
		if (!fs.existsSync(path.join(project, watch.projectsWhen))) continue;
		const view = {
			project,
			projectName: path.basename(project),
			marketplace,
			node: process.execPath
		};
		const [command, ...args] = watch.command.map((part) => render(part, view));
		if (!command) continue;
		const result = await exec(command, args, { cwd: project });
		if (result.code !== 0) {
			log(`watch ${watch.id}: command failed in project ${view.projectName} (exit ${result.code})`);
			continue;
		}
		let output;
		try {
			output = JSON.parse(result.stdout);
		} catch {
			log(`watch ${watch.id}: command output in project ${view.projectName} is not JSON`);
			continue;
		}
		for (const item of itemsOf(output, watch.items)) {
			if (watch.skipWhen.some((field) => Boolean(item[field]))) continue;
			const itemView = {
				...view,
				item: {
					...item,
					files: Array.isArray(item.files) ? item.files.join(", ") : item.files
				}
			};
			const key = `${project}::${render(watch.key, itemView)}`;
			seen[key] = (previous.seen[key] ?? 0) + 1;
			if (seen[key] < watch.stableChecks) continue;
			const input = Object.fromEntries(Object.entries(watch.input).map(([name, template]) => [name, render(template, itemView)]));
			const { run, reused } = factory.start(render(watch.goal, itemView), `watch:${watch.id}:${key}`, {
				workflow: watch.workflow,
				input
			});
			if (reused) continue;
			/** The config never names a model; FACTORY_WATCH_MODEL picks one model for every tier of watch runs. */
			const model = process.env.FACTORY_WATCH_MODEL;
			try {
				factory.confirm(run.runId, {
					backend: watch.backend,
					...model ? { tierModels: {
						low: model,
						medium: model,
						high: model
					} } : {}
				});
			} catch (error) {
				factory.cancel(run.runId);
				log(`watch ${watch.id}: could not confirm run ${run.runId} for project ${view.projectName}, cancelled it: ${error instanceof Error ? error.message : String(error)}`);
				continue;
			}
			started.push(run.runId);
			log(`watch ${watch.id}: started run ${run.runId}`);
		}
	}
	writeJson(file, { seen });
	return started;
}
/** Runs every configured watch now and then every `everyMinutes`. Returns a function that stops them. */
function startWatches(watches, context) {
	context.log?.(watches.length === 0 ? "watches: none started" : `watches: ${watches.map((watch) => `${watch.id} every ${watch.everyMinutes} min`).join(", ")}`);
	const timers = [];
	for (const watch of watches) {
		let running = false;
		const tick = async () => {
			if (running) return;
			running = true;
			try {
				await checkWatch(watch, context);
			} catch (error) {
				context.log?.(`watch ${watch.id} failed: ${error instanceof Error ? error.message : String(error)}`);
			} finally {
				running = false;
			}
		};
		tick();
		const timer = setInterval(() => void tick(), watch.everyMinutes * 6e4);
		/** The watch timers alone never keep the process alive; the viewer's HTTP server does. */
		timer.unref();
		timers.push(timer);
	}
	return () => timers.forEach(clearInterval);
}
// src/viewer-server.ts
var settingsNote = homeEnvNote();
if (settingsNote) console.error(settingsNote);
var PORT = Number(process.env.FACTORY_VIEWER_PORT ?? 7340);
var PUBLIC_URL = `http://127.0.0.1:${PORT}`;
var DATA_DIR = defaultDataDir();
/** The viewer process outlives the harness sessions, so it owns the interval watches and the runs they start; their questions are answered on the run page. */
var WATCHES = process.env.FACTORY_WATCHES === "off" ? [] : loadWatches();
var statusBackend = loadFactoryConfig().projects.statusBackend;
var executors = Object.fromEntries([...WATCHES.map((watch) => watch.backend.cli), ...statusBackend ? [statusBackend.cli] : []].map((cli) => [cli, cliExecutor(cli)]));
var factory = new Factory(DATA_DIR, {
	backend: "delegate",
	executors: {
		exec: hostExec,
		...executors
	}
});
var viewer = viewerHandler({
	...viewerOptions(DATA_DIR),
	allowedHosts: allowedHostsFor(PUBLIC_URL, PORT),
	factory
});
http.createServer((req, res) => {
	try {
		if (req.url === "/health") {
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
				name: VIEWER_HEALTH,
				dataDir: path.resolve(DATA_DIR)
			}));
			return;
		}
		if (viewer(req, res)) return;
		res.writeHead(302, { location: "/viewer/" }).end();
	} catch (error) {
		failRequest(res, error);
	}
}).listen(PORT, "127.0.0.1", () => {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.writeFileSync(path.join(DATA_DIR, "viewer.pid"), String(process.pid));
	startWatches(WATCHES, {
		factory,
		dataDir: DATA_DIR,
		marketplace: marketplaceDir(),
		exec: hostExec,
		log: (message) => console.error(message)
	});
});
export {};
