import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.resolve(factoryDir, process.env.FACTORY_STDIO_ENTRY ?? "dist/stdio.mjs");
const port = 7351;

type Payload = Record<string, unknown> & { runId?: string; status?: string; viewerUrl?: string; pendingQuestion?: { id: string } };

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Payload> {
  const res = (await client.callTool({ name, arguments: args })) as CallToolResult;
  assert.ok(!res.isError, JSON.stringify(res.content));
  return res.structuredContent as Payload;
}

async function waitUntil(client: Client, runId: string, status: string): Promise<Payload> {
  for (let i = 0; i < 20; i += 1) {
    const payload = await call(client, "factory_wait", { runId, timeoutSec: 10 });
    if (payload.status === status) return payload;
  }
  throw new Error(`run did not reach ${status}`);
}

test("a harness starts the factory over stdio, runs a flow and gets a working run page link", { skip: !fs.existsSync(entry) && `missing ${entry}` }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-stdio-"));
  const env = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_BACKEND: "fake", FACTORY_VIEWER_PORT: String(port), FACTORY_TURN_DELAY_MS: "0" } as Record<string, string>;
  const client = new Client({ name: "stdio-test", version: "0.1.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry], env, stderr: "pipe" }));
  try {
    const started = await call(client, "factory_start", { goal: "hello", idempotencyKey: "stdio-1" });
    assert.ok(started.runId);
    const runId = started.runId;
    await call(client, "factory_confirm", { runId });
    const waiting = await waitUntil(client, runId, "waiting_for_user");
    await call(client, "factory_answer", { runId, questionId: waiting.pendingQuestion?.id, answer: "extend" });
    const done = await waitUntil(client, runId, "done");
    assert.equal(done.viewerUrl, `http://127.0.0.1:${port}/viewer/?run=${runId}`);

    const page = await fetch(done.viewerUrl);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'nonce-/);
    const data = (await (await fetch(`http://127.0.0.1:${port}/viewer/api/runs/${runId}`)).json()) as { report: { status: string; synthetic: boolean } };
    assert.equal(data.report.status, "done");
    assert.equal(data.report.synthetic, true);
  } finally {
    await client.close();
    const pidFile = path.join(dataDir, "viewer.pid");
    if (fs.existsSync(pidFile)) process.kill(Number(fs.readFileSync(pidFile, "utf8")));
  }
});
