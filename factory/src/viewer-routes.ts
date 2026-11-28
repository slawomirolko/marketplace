import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { cspMiddleware } from "../app/csp.ts";
import { apiMiddleware, createDataApi } from "../app/data.ts";
import type { Factory } from "./engine.ts";

export interface ViewerOptions {
  viewerDir: string;
  dataDir: string;
  factoryDir: string;
  configFile: string;
  allowedHosts: Set<string>;
  factory?: Factory;
}

const PREFIX = "/viewer";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

export function viewerUrlFor(publicUrl: string, runId: string): string {
  return `${publicUrl.replace(/\/$/, "")}${PREFIX}/?run=${encodeURIComponent(runId)}`;
}

export function allowedHostsFor(publicUrl: string, port: number): Set<string> {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  hosts.add(new URL(publicUrl).host.toLowerCase());
  return hosts;
}

function staticFile(viewerDir: string, relativePath: string): string | null {
  const root = path.resolve(viewerDir);
  const full = path.resolve(root, relativePath === "" ? "index.html" : relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

/** Ends a request whose handler threw: a 500 when nothing was sent yet, otherwise the connection is dropped; the process keeps serving. */
export function failRequest(res: ServerResponse, error: unknown): void {
  console.error(`request failed: ${error instanceof Error ? error.message : String(error)}`);
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "internal error" }));
}

const POST_PATHS = [/^\/viewer\/api\/update$/, /^\/viewer\/api\/projects$/, /^\/viewer\/api\/runs\/[^/]+\/answer$/];

export function viewerHandler({ viewerDir, dataDir, factoryDir, configFile, allowedHosts, factory }: ViewerOptions): (req: IncomingMessage, res: ServerResponse) => boolean {
  const api = apiMiddleware(createDataApi({ factoryDir, dataDir, configFile, demo: false, ...(factory ? { factory } : {}) }));
  const csp = cspMiddleware();

  return (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
    if (!allowedHosts.has(String(req.headers.host ?? "").toLowerCase())) {
      res.writeHead(403, { "content-type": "text/plain" }).end("forbidden host");
      return true;
    }
    if (req.method !== "GET" && !(req.method === "POST" && POST_PATHS.some((p) => p.test(url.pathname)))) {
      res.writeHead(405, { allow: "GET" }).end();
      return true;
    }
    if (url.pathname === PREFIX) {
      res.writeHead(302, { location: `${PREFIX}/${url.search}` }).end();
      return true;
    }
    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname.slice(PREFIX.length + 1));
    } catch {
      res.writeHead(400, { "content-type": "text/plain" }).end("malformed path");
      return true;
    }
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
