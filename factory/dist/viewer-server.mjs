import { C as VIEWER_HEALTH, E as viewerOptions, a as listProjects, b as homeEnvNote, c as cliExecutor, g as loadFactoryConfig, h as marketplaceDir, l as hostExec, n as failRequest, r as viewerHandler, t as allowedHostsFor, u as Factory, w as defaultDataDir, y as mustache } from "./viewer-routes.mjs";
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
var RENDER = (template, view) => mustache.render(template, view, {}, { escape: (value) => String(value) });
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
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.tmp`;
	fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
	fs.renameSync(temp, file);
}
/** The older list of watched folders, `{ "dirs": [...] }` in the data directory. Registered projects live in the project registry (projects.ts projectsFile()). */
function knownProjectsFile(dataDir) {
	return path.join(dataDir, "projects.json");
}
/** Projects the factory knows: the registered projects, the folders in the data directory's `dirs` list and every run's input.project. */
function knownProjects(dataDir) {
	const file = readJson(knownProjectsFile(dataDir), {});
	const listed = [...listProjects().map((project) => project.path), ...Array.isArray(file.dirs) ? file.dirs : []];
	const dirs = new Set(listed.filter((d) => typeof d === "string").map((d) => path.resolve(d)));
	const runsDir = path.join(dataDir, "runs");
	if (fs.existsSync(runsDir)) for (const file of fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"))) {
		const project = readJson(path.join(runsDir, file), {}).input?.project;
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
		const [command, ...args] = watch.command.map((part) => RENDER(part, view));
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
			const key = `${project}::${RENDER(watch.key, itemView)}`;
			seen[key] = (previous.seen[key] ?? 0) + 1;
			if (seen[key] < watch.stableChecks) continue;
			const input = Object.fromEntries(Object.entries(watch.input).map(([name, template]) => [name, RENDER(template, itemView)]));
			const { run, reused } = factory.start(RENDER(watch.goal, itemView), `watch:${watch.id}:${key}`, {
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
var port = Number(process.env.FACTORY_VIEWER_PORT ?? 7340);
var publicUrl = `http://127.0.0.1:${port}`;
var dataDir = defaultDataDir();
/** The viewer process outlives the harness sessions, so it owns the interval watches and the runs they start; their questions are answered on the run page. */
var watches = process.env.FACTORY_WATCHES === "off" ? [] : loadWatches();
var statusBackend = loadFactoryConfig().projects.statusBackend;
var executors = Object.fromEntries([...watches.map((watch) => watch.backend.cli), ...statusBackend ? [statusBackend.cli] : []].map((cli) => [cli, cliExecutor(cli)]));
var factory = new Factory(dataDir, {
	backend: "delegate",
	executors: {
		exec: hostExec,
		...executors
	}
});
var viewer = viewerHandler({
	...viewerOptions(dataDir),
	allowedHosts: allowedHostsFor(publicUrl, port),
	factory
});
http.createServer((req, res) => {
	try {
		if (req.url === "/health") {
			res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
				name: VIEWER_HEALTH,
				dataDir: path.resolve(dataDir)
			}));
			return;
		}
		if (viewer(req, res)) return;
		res.writeHead(302, { location: "/viewer/" }).end();
	} catch (error) {
		failRequest(res, error);
	}
}).listen(port, "127.0.0.1", () => {
	fs.mkdirSync(dataDir, { recursive: true });
	fs.writeFileSync(path.join(dataDir, "viewer.pid"), String(process.pid));
	startWatches(watches, {
		factory,
		dataDir,
		marketplace: marketplaceDir(),
		exec: hostExec,
		log: (message) => console.error(message)
	});
});
export {};
