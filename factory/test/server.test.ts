/**
 * The HTTP server (src/server.ts) and the viewer routes: a malformed path cannot crash the process,
 * the viewer API cannot change anything without the token when the server listens beyond loopback,
 * and the bearer token is compared in constant time.
 */
import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { withEnv } from "./helpers/env.ts";
import { startServer, stopServer, type RunningServer } from "./helpers/processes.ts";
import { tempDir } from "./helpers/temp.ts";
import { parse as parseYaml } from "yaml";
import { bearerMatches } from "../src/bearer.ts";
import { viewerHandler } from "../src/viewer-routes.ts";

const factoryDir = path.join(import.meta.dirname, "..");
const TOKEN = "server-test-token";

/** Starts src/server.ts with temp data and home folders on a free port, the fake backend and the test token. */
function startFactoryServer(host: string): Promise<RunningServer> {
  const dataDir = tempDir("factory-server-data-");
  const homeDir = tempDir("factory-server-home-");
  return startServer({
    args: [path.join(factoryDir, "src", "server.ts")],
    envFor: (port) => ({ ...process.env, FACTORY_HOST: host, FACTORY_PORT: String(port), FACTORY_TOKEN: TOKEN, FACTORY_DATA_DIR: dataDir, FACTORY_HOME_DIR: homeDir, FACTORY_BACKEND: "fake", FACTORY_PUBLIC_URL: `http://127.0.0.1:${port}` }),
    ready: "listening",
  });
}

function request(port: number, method: string, urlPath: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers: { host: `127.0.0.1:${port}`, ...headers } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("the bearer token matches only the exact header", () => {
  assert.equal(bearerMatches(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(bearerMatches(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(bearerMatches(`Bearer server-test-tokeX`, TOKEN), false, "same length, different token");
  assert.equal(bearerMatches(TOKEN, TOKEN), false);
  assert.equal(bearerMatches(undefined, TOKEN), false);
});

test("a malformed escape in a viewer path is a 400, not a crash", async () => {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const handle = viewerHandler({ viewerDir: factoryDir, dataDir: tempDir("factory-viewer-"), factoryDir, configFile: path.join(factoryDir, "config", "factory.yaml"), allowedHosts: new Set([`127.0.0.1:${port}`]) });
  server.on("request", (req, res) => {
    if (!handle(req, res)) {
      res.writeHead(404).end();
    }
  });
  try {
    assert.equal(await request(port, "GET", "/viewer/%E0"), 400);
    assert.equal(await request(port, "GET", "/viewer/api/runs/%E0%A4%A"), 400);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the HTTP server on a non-loopback address survives a malformed path and needs the token for viewer changes", async () => {
  const server = await startFactoryServer("0.0.0.0");
  const { port } = server;
  try {
    assert.equal(await request(port, "GET", "/viewer/%E0"), 400);
    assert.equal(await request(port, "GET", "/health"), 200, "the server is still up");
    const action = { "x-factory-action": "projects", "content-type": "application/json" };
    assert.equal(await request(port, "POST", "/viewer/api/projects", action), 401, "no token, no change");
    assert.equal(await request(port, "POST", "/viewer/api/runs/r-1/answer?question=q&answer=yes", { "x-factory-action": "answer" }), 401);
    assert.notEqual(await request(port, "POST", "/viewer/api/projects", { ...action, authorization: `Bearer ${TOKEN}` }), 401, "with the token the API answers");
    assert.equal(await request(port, "GET", "/viewer/api/workflows"), 200, "reading stays open for the run page");
    assert.equal(await request(port, "GET", "/metrics", { authorization: "Bearer server-test-tokeX" }), 401);
    assert.equal(await request(port, "GET", "/metrics", { authorization: `Bearer ${TOKEN}` }), 200);
  } finally {
    await stopServer(server);
  }
});

test("the HTTP server on loopback keeps the viewer actions as the run page process does", async () => {
  const server = await startFactoryServer("127.0.0.1");
  const { port } = server;
  try {
    assert.notEqual(await request(port, "POST", "/viewer/api/projects", { "x-factory-action": "projects", "content-type": "application/json" }), 401);
  } finally {
    await stopServer(server);
  }
});

function requestJson(port: number, urlPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path: urlPath, headers: { host: `127.0.0.1:${port}` } }, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve(JSON.parse(body)));
      })
      .on("error", reject);
  });
}

test("the HTTP server's run page reads the same factory config as the run page process", async () => {
  const server = await startFactoryServer("127.0.0.1");
  const { port } = server;
  try {
    const expected = parseYaml(fs.readFileSync(path.join(factoryDir, "config", "factory.yaml"), "utf8")) as unknown;
    assert.deepEqual(await requestJson(port, "/viewer/api/config"), expected);
  } finally {
    await stopServer(server);
  }
});

function requestText(port: number, method: string, urlPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers: { host: `127.0.0.1:${port}`, ...headers } }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

async function listen(handle: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

test("viewer actions are accepted only from the viewer's own host and port", async () => {
  let handle: ReturnType<typeof viewerHandler> = () => false;
  const server = await listen((req, res) => {
    if (!handle(req, res)) {
      res.writeHead(404).end();
    }
  });
  handle = viewerHandler({ viewerDir: factoryDir, dataDir: tempDir("factory-viewer-"), factoryDir, configFile: path.join(factoryDir, "config", "factory.yaml"), allowedHosts: new Set([`127.0.0.1:${server.port}`]) });
  try {
    const action = { "x-factory-action": "projects", "content-type": "application/json" };
    assert.equal(await request(server.port, "POST", "/viewer/api/projects", { ...action, origin: "http://localhost:5173" }), 403, "another local dev server");
    assert.equal(await request(server.port, "POST", "/viewer/api/projects", { ...action, origin: `http://127.0.0.1:${server.port + 1}` }), 403, "another port");
    assert.equal(await request(server.port, "POST", "/viewer/api/update", { "x-factory-action": "update", origin: "http://127.0.0.1" }), 403);
    assert.equal(await request(server.port, "POST", "/viewer/api/runs/r-00000001/answer?question=q&answer=a", { "x-factory-action": "answer", origin: "null" }), 403);
    assert.notEqual(await request(server.port, "POST", "/viewer/api/projects", { ...action, origin: `http://127.0.0.1:${server.port}` }), 403, "the viewer page itself");
  } finally {
    await server.close();
  }
});

test("the HTTP server beyond loopback says that viewer changes are read-only without the token", async () => {
  const server = await startFactoryServer("0.0.0.0");
  const { port } = server;
  try {
    const refused = await requestText(port, "POST", "/viewer/api/update", { "x-factory-action": "update" });
    assert.equal(refused.status, 401);
    assert.match((JSON.parse(refused.body) as { error: string }).error, /read-only/);
  } finally {
    await stopServer(server);
  }
});

interface DevMiddleware {
  (req: http.IncomingMessage, res: http.ServerResponse, next: () => void): void;
}

test("the dev server goes through the viewer handler with its guards and reads the real factory config", async () => {
  await withEnv({ FACTORY_DATA_DIR: tempDir("factory-dev-data-") }, async () => {
    const { default: viteConfig } = await import("../app/vite.config.ts");
    const resolved = (typeof viteConfig === "function" ? viteConfig({ command: "serve", mode: "development" }) : viteConfig) as { base: string; server: { port: number }; plugins: unknown[] };
    assert.equal(resolved.base, "/viewer/", "dev serves the API under the same prefix as production");
    const plugin = resolved.plugins.flat().find((entry) => (entry as { name?: string } | null)?.name === "factory-data") as { configureServer: (server: unknown) => void };
    const middlewares: DevMiddleware[] = [];
    plugin.configureServer({ middlewares: { use: (middleware: DevMiddleware) => middlewares.push(middleware) }, httpServer: null });
    const devPort = resolved.server.port;
    const server = await listen((req, res) => {
      const run = (index: number): void => {
        const middleware = middlewares[index];
        if (!middleware) {
          res.writeHead(404).end("vite");
          return;
        }
        middleware(req, res, () => run(index + 1));
      };
      run(0);
    });
    try {
      const devHost = { host: `127.0.0.1:${devPort}` };
      const config = await requestText(server.port, "GET", "/viewer/api/config", devHost);
      assert.equal(config.status, 200);
      assert.deepEqual(JSON.parse(config.body), parseYaml(fs.readFileSync(path.join(factoryDir, "config", "factory.yaml"), "utf8")) as unknown);
      assert.equal((await requestText(server.port, "GET", "/viewer/api/config", { host: `rebound.example:${devPort}` })).status, 403, "host allow-list");
      assert.equal((await requestText(server.port, "DELETE", "/viewer/api/runs", devHost)).status, 405, "POST guard");
      assert.equal((await requestText(server.port, "POST", "/viewer/api/projects", { ...devHost, "x-factory-action": "projects", origin: "http://localhost:5173" })).status, 403, "origin of another local server");
      assert.equal((await requestText(server.port, "GET", "/viewer/src/main.tsx", devHost)).body, "vite", "the page and its modules stay with vite");
    } finally {
      await server.close();
    }
  });
});
