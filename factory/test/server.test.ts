// The HTTP server (src/server.ts) and the viewer routes: a malformed path cannot crash the process,
// the viewer API cannot change anything without the token when the server listens beyond loopback,
// and the bearer token is compared in constant time.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bearerMatches } from "../src/bearer.ts";
import { viewerHandler } from "../src/viewer-routes.ts";

const factoryDir = path.join(import.meta.dirname, "..");
const TOKEN = "server-test-token";

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = http.createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function startServer(host: string): Promise<{ port: number; child: ChildProcess }> {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-server-data-"));
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-server-home-"));
  const child = spawn(process.execPath, ["--experimental-strip-types", path.join(factoryDir, "src", "server.ts")], {
    env: { ...process.env, FACTORY_HOST: host, FACTORY_PORT: String(port), FACTORY_TOKEN: TOKEN, FACTORY_DATA_DIR: dataDir, FACTORY_HOME_DIR: homeDir, FACTORY_BACKEND: "fake", FACTORY_PUBLIC_URL: `http://127.0.0.1:${port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        resolve();
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  return { port, child };
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
  const handle = viewerHandler({ viewerDir: factoryDir, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "factory-viewer-")), factoryDir, configFile: path.join(factoryDir, "config", "factory.yaml"), allowedHosts: new Set([`127.0.0.1:${port}`]) });
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
  const { port, child } = await startServer("0.0.0.0");
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
    child.kill();
  }
});

test("the HTTP server on loopback keeps the viewer actions as the run page process does", async () => {
  const { port, child } = await startServer("127.0.0.1");
  try {
    assert.notEqual(await request(port, "POST", "/viewer/api/projects", { "x-factory-action": "projects", "content-type": "application/json" }), 401);
  } finally {
    child.kill();
  }
});
