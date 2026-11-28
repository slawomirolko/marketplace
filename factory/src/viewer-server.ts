import { homeEnvNote } from "./home-env.ts";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { allowedHostsFor, failRequest, viewerHandler } from "./viewer-routes.ts";
import { DEFAULT_VIEWER_PORT, VIEWER_HEALTH, defaultDataDir, viewerOptions } from "./paths.ts";
import { Factory } from "./engine.ts";
import { cliExecutor, hostExec } from "./cli-backend.ts";
import { marketplaceDir } from "./marketplace-agents.ts";
import { loadWatches, startWatches } from "./watch.ts";
import { loadFactoryConfig } from "./config.ts";

const settingsNote = homeEnvNote();
if (settingsNote) {
  console.error(settingsNote);
}

const PORT = Number(process.env.FACTORY_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
const PUBLIC_URL = `http://127.0.0.1:${PORT}`;
const DATA_DIR = defaultDataDir();
/** The viewer process outlives the harness sessions, so it owns the interval watches and the runs they start; their questions are answered on the run page. */
const WATCHES = process.env.FACTORY_WATCHES === "off" ? [] : loadWatches();
const statusBackend = loadFactoryConfig().projects.statusBackend;
const executors = Object.fromEntries([...WATCHES.map((watch) => watch.backend.cli), ...(statusBackend ? [statusBackend.cli] : [])].map((cli) => [cli, cliExecutor(cli)]));
const factory = new Factory(DATA_DIR, { backend: "delegate", executors: { exec: hostExec, ...executors } });
const viewer = viewerHandler({ ...viewerOptions(DATA_DIR), allowedHosts: allowedHostsFor(PUBLIC_URL, PORT), factory });

http
  .createServer((req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: VIEWER_HEALTH, dataDir: path.resolve(DATA_DIR) }));
        return;
      }
      if (viewer(req, res)) {
        return;
      }
      res.writeHead(302, { location: "/viewer/" }).end();
    } catch (error) {
      failRequest(res, error);
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, "viewer.pid"), String(process.pid));
    startWatches(WATCHES, { factory, dataDir: DATA_DIR, marketplace: marketplaceDir(), exec: hostExec, log: (message) => console.error(message) });
  });
