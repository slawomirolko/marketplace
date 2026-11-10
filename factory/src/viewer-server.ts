import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { allowedHostsFor, viewerHandler } from "./viewer-routes.ts";
import { DEFAULT_VIEWER_PORT, VIEWER_HEALTH, defaultDataDir, viewerOptions } from "./paths.ts";

const port = Number(process.env.FACTORY_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
const publicUrl = `http://127.0.0.1:${port}`;
const dataDir = defaultDataDir();
const viewer = viewerHandler({ ...viewerOptions(dataDir), allowedHosts: allowedHostsFor(publicUrl, port) });

http
  .createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" }).end(VIEWER_HEALTH);
      return;
    }
    if (viewer(req, res)) return;
    res.writeHead(302, { location: "/viewer/" }).end();
  })
  .listen(port, "127.0.0.1", () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "viewer.pid"), String(process.pid));
  });
