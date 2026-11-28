import { homeEnvNote } from "./home-env.ts";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Factory, parseBackend, parseCli } from "./engine.ts";
import { errorMessage } from "./errors.ts";
import { cliExecutor, hostExec } from "./cli-backend.ts";
import type { CliName, Executors } from "./types.ts";
import type { DefaultBackend } from "./engine.ts";
import { allowedHostsFor, failRequest, viewerHandler } from "./viewer-routes.ts";
import { bearerMatches } from "./bearer.ts";
import { DEFAULT_VIEWER_PORT, registerDataSource, viewerOptions } from "./paths.ts";
import { createFactoryTools } from "./tools.ts";
import { loadFactoryConfig } from "./config.ts";

const settingsNote = homeEnvNote();
if (settingsNote) {
  console.error(settingsNote);
}

const PORT = Number(process.env.FACTORY_PORT ?? DEFAULT_VIEWER_PORT);
const HOST = process.env.FACTORY_HOST ?? "127.0.0.1";
const TOKEN = process.env.FACTORY_TOKEN;
const DATA_DIR = process.env.FACTORY_DATA_DIR ?? "/data";
const PUBLIC_URL = process.env.FACTORY_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
/** Beyond loopback anyone on the network can reach the viewer, so its POST actions (update, projects, answer) need the bearer token there. */
const VIEWER_CHANGES_NEED_TOKEN = !LOOPBACK_HOSTS.has(HOST);
/** The page never gets the token (anyone who can load it would have it), so on such a server the viewer is read-only. */
const VIEWER_READ_ONLY = "this viewer is read-only on this address: changes need the factory token, which the page does not get; use the factory tools or the viewer on the factory machine";
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

const STATUS_CLI = loadFactoryConfig().projects.statusBackend?.cli;
const executors: Executors = { exec: hostExec, ...(STATUS_CLI ? { [STATUS_CLI]: cliExecutor(STATUS_CLI) } : {}), ...(CLI ? { [CLI]: cliExecutor(CLI) } : {}) };
registerDataSource(DATA_DIR);
const factory = new Factory(DATA_DIR, { backend: DEFAULT_BACKEND, executors, ...(CLI ? { cli: CLI } : {}) });
const viewer = viewerHandler({
  ...viewerOptions(DATA_DIR),
  allowedHosts: allowedHostsFor(PUBLIC_URL, PORT),
  factory,
});
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

function isAuthorized(req: IncomingMessage): boolean {
  return bearerMatches(req.headers.authorization, TOKEN as string);
}

function isUnauthorizedViewerChange(req: IncomingMessage): boolean {
  return VIEWER_CHANGES_NEED_TOKEN && req.method === "POST" && (req.url ?? "").startsWith("/viewer/") && !isAuthorized(req);
}

function sendUnauthorized(res: ServerResponse, error = "unauthorized"): void {
  res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error }));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  if (req.url === "/metrics" && isAuthorized(req)) {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(tools.metrics()));
    return;
  }
  if (isUnauthorizedViewerChange(req)) {
    sendUnauthorized(res, VIEWER_READ_ONLY);
    return;
  }
  if (viewer(req, res)) {
    return;
  }
  if (!isAuthorized(req)) {
    sendUnauthorized(res);
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
    console.error(`/mcp request failed: ${errorMessage(error)}`);
    if (!res.headersSent) res.writeHead(500).end(JSON.stringify({ error: errorMessage(error) }));
  }
}

const httpServer = http.createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => failRequest(res, error));
});

httpServer.listen(PORT, HOST, () => console.log(`skill-factory-poc listening on http://${HOST}:${PORT}/mcp, viewer ${PUBLIC_URL}/viewer/`));
