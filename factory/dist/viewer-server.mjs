import { C as viewerOptions, _ as homeEnvNote, b as VIEWER_HEALTH, c as Factory, f as marketplaceDir, g as mustache, n as viewerHandler, o as cliExecutor, p as loadFactoryConfig, s as hostExec, t as allowedHostsFor, x as defaultDataDir } from "./viewer-routes.mjs";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
// src/watch.ts
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
function projectsFile(dataDir) {
	return path.join(dataDir, "projects.json");
}
/** Projects the factory knows: the ones listed in projects.json (`dirs`, or the registry's `projects[].path`) and every run's input.project. */
function knownProjects(dataDir) {
	const file = readJson(projectsFile(dataDir), {});
	const listed = [...Array.isArray(file.dirs) ? file.dirs : [], ...Array.isArray(file.projects) ? file.projects.map((p) => p && typeof p === "object" ? p.path : void 0) : []];
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
			log(`watch ${watch.id}: command failed in a project (exit ${result.code})`);
			continue;
		}
		let output;
		try {
			output = JSON.parse(result.stdout);
		} catch {
			log(`watch ${watch.id}: command output is not JSON`);
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
			const model = process.env.FACTORY_WATCH_MODEL;
			factory.confirm(run.runId, {
				backend: watch.backend,
				...model ? { tierModels: {
					low: model,
					medium: model,
					high: model
				} } : {}
			});
			started.push(run.runId);
			log(`watch ${watch.id}: started run ${run.runId}`);
		}
	}
	writeJson(file, { seen });
	return started;
}
/** Runs every configured watch now and then every `everyMinutes`. Returns a function that stops them. */
function startWatches(watches, context) {
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
	if (req.url === "/health") {
		res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
			name: VIEWER_HEALTH,
			dataDir: path.resolve(dataDir)
		}));
		return;
	}
	if (viewer(req, res)) return;
	res.writeHead(302, { location: "/viewer/" }).end();
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
