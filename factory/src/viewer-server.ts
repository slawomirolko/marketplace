import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { allowedHostsFor, viewerHandler } from "./viewer-routes.ts";
import { DEFAULT_VIEWER_PORT, VIEWER_HEALTH, defaultDataDir, viewerOptions } from "./paths.ts";
import { Factory } from "./engine.ts";
import { cliExecutor, hostExec } from "./cli-backend.ts";
import { marketplaceDir } from "./marketplace-agents.ts";
import { loadWatches, startWatches } from "./watch.ts";

const port = Number(process.env.FACTORY_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
const publicUrl = `http://127.0.0.1:${port}`;
const dataDir = defaultDataDir();
// The viewer process outlives the harness sessions, so it owns the interval watches and
// the runs they start; their questions are answered on the run page.
const watches = process.env.FACTORY_WATCHES === "off" ? [] : loadWatches();
const executors = Object.fromEntries(watches.map((watch) => [watch.backend.cli, cliExecutor(watch.backend.cli)]));
const factory = new Factory(dataDir, { backend: "delegate", executors: { exec: hostExec, ...executors } });
const viewer = viewerHandler({ ...viewerOptions(dataDir), allowedHosts: allowedHostsFor(publicUrl, port), factory });

http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: VIEWER_HEALTH, dataDir: path.resolve(dataDir) }));
      return;
    }
    if (viewer(req, res)) return;
    res.writeHead(302, { location: "/viewer/" }).end();
  })
  .listen(port, "127.0.0.1", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "viewer.pid"), String(process.pid));
    startWatches(watches, { factory, dataDir, marketplace: marketplaceDir(), exec: hostExec, log: (message) => console.error(message) });
  });
