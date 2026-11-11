import { d as defaultDataDir, f as viewerOptions, n as viewerHandler, t as allowedHostsFor, u as VIEWER_HEALTH } from "./viewer-routes.mjs";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
// src/viewer-server.ts
var port = Number(process.env.FACTORY_VIEWER_PORT ?? 7340);
var publicUrl = `http://127.0.0.1:${port}`;
var dataDir = defaultDataDir();
var viewer = viewerHandler({
	...viewerOptions(dataDir),
	allowedHosts: allowedHostsFor(publicUrl, port)
});
http.createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200, { "content-type": "text/plain" }).end(VIEWER_HEALTH);
		return;
	}
	if (viewer(req, res)) return;
	res.writeHead(302, { location: "/viewer/" }).end();
}).listen(port, "127.0.0.1", () => {
	fs.mkdirSync(dataDir, { recursive: true });
	fs.writeFileSync(path.join(dataDir, "viewer.pid"), String(process.pid));
});
export {};
