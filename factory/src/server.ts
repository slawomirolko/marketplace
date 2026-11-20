import http from "node:http";
import type { IncomingMessage } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Factory, errorMessage, parseBackend, parseCli } from "./engine.ts";
import { cliExecutor, hostExec } from "./cli-backend.ts";
import type { CliName, Executors } from "./types.ts";
import type { DefaultBackend } from "./engine.ts";
import { allowedHostsFor, viewerHandler } from "./viewer-routes.ts";
import { registerDataSource } from "./paths.ts";
import { createFactoryTools } from "./tools.ts";

const PORT = Number(process.env.FACTORY_PORT ?? 7340);
const HOST = process.env.FACTORY_HOST ?? "127.0.0.1";
const TOKEN = process.env.FACTORY_TOKEN;
const DATA_DIR = process.env.FACTORY_DATA_DIR ?? "/data";
const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_URL = process.env.FACTORY_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`;
const viewer = viewerHandler({
  viewerDir: process.env.FACTORY_VIEWER_DIR ?? path.join(FACTORY_DIR, "app", "dist"),
  dataDir: DATA_DIR,
  factoryDir: FACTORY_DIR,
  configFile: path.join(FACTORY_DIR, "spec", "examples", "valid", "factory-config.json"),
  allowedHosts: allowedHostsFor(PUBLIC_URL, PORT),
});

if (!TOKEN) {
  console.error("FACTORY_TOKEN is required");
  process.exit(1);
}

let DEFAULT_BACKEND: DefaultBackend;
let CLI: CliName | undefined;
try {
  DEFAULT_BACKEND = parseBackend(process.env.FACTORY_BACKEND);
  if (DEFAULT_BACKEND === "cli") CLI = parseCli(process.env.FACTORY_CLI);
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}

const executors: Executors = { exec: hostExec, ...(CLI ? { [CLI]: cliExecutor(CLI) } : {}) };
registerDataSource(DATA_DIR);
const factory = new Factory(DATA_DIR, { backend: DEFAULT_BACKEND, executors, ...(CLI ? { cli: CLI } : {}) });
const tools = createFactoryTools(factory, PUBLIC_URL);

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (error) {
        reject(error);
      }
    });
  });
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/metrics" && req.headers.authorization === `Bearer ${TOKEN}`) {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(tools.metrics()));
    return;
  }
  if (viewer(req, res)) return;
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (req.url !== "/mcp") {
    res.writeHead(404).end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" }).end();
    return;
  }
  try {
    const body = await readBody(req);
    const server = tools.buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) res.writeHead(500).end(JSON.stringify({ error: errorMessage(error) }));
  }
});

httpServer.listen(PORT, HOST, () => console.log(`skill-factory-poc listening on http://${HOST}:${PORT}/mcp, viewer ${PUBLIC_URL}/viewer/`));
