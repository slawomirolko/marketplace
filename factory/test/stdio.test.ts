import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { callTool, startStdio } from "./helpers/mcp.ts";
import { until } from "./helpers/poll.ts";

const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.resolve(factoryDir, process.env.FACTORY_STDIO_ENTRY ?? "dist/stdio.mjs");
/** The run page is a detached process started by the stdio server; it may need a few seconds to listen. */
const VIEWER_START_TIMEOUT_MS = 15000;

type Payload = Record<string, unknown> & { runId?: string; status?: string; viewerUrl?: string; pendingQuestion?: { id: string } };

async function waitUntil(client: Client, runId: string, status: string): Promise<Payload> {
  for (let i = 0; i < 20; i += 1) {
    const payload = await callTool<Payload>(client, "factory_wait", { runId, timeoutSec: 10 });
    if (payload.status === status) return payload;
  }
  throw new Error(`run did not reach ${status}`);
}

test("a harness starts the factory over stdio, runs a flow and gets a working run page link", { skip: process.env.FACTORY_SKIP_STDIO === "1" && "FACTORY_SKIP_STDIO=1" }, async () => {
  assert.ok(fs.existsSync(entry), `missing ${entry}: run the bundle build, or set FACTORY_SKIP_STDIO=1 to skip this test`);
  const session = await startStdio({ entry, env: { FACTORY_BACKEND: "fake", FACTORY_TURN_DELAY_MS: "0" } });
  const { client, viewerPort: port } = session;
  const call = (name: string, args: Record<string, unknown>) => callTool<Payload>(client, name, args);
  try {
    const started = await call("factory_start", { goal: "hello", idempotencyKey: "stdio-1" });
    assert.ok(started.runId);
    const runId = started.runId;
    await call("factory_confirm", { runId });
    const waiting = await waitUntil(client, runId, "waiting_for_user");
    await call("factory_answer", { runId, questionId: waiting.pendingQuestion?.id, answer: "extend" });
    const done = await waitUntil(client, runId, "done");
    assert.equal(done.viewerUrl, `http://127.0.0.1:${port}/viewer/?run=${runId}`);

    const page = await until(() => fetch(done.viewerUrl!).catch(() => undefined), "the run page to listen", { timeoutMs: VIEWER_START_TIMEOUT_MS, intervalMs: 100 });
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'nonce-/);
    const data = (await (await fetch(`http://127.0.0.1:${port}/viewer/api/runs/${runId}`)).json()) as { report: { status: string; synthetic: boolean } };
    assert.equal(data.report.status, "done");
    assert.equal(data.report.synthetic, true);

    const guide = await call("factory_install_guide", {});
    assert.equal(guide.harness, "claude-code");
    assert.equal(guide.detectedFrom, "claude-code");
    assert.deepEqual(guide.commands, [`claude mcp add --scope user factory -- node ${path.join(factoryDir, "dist", "stdio.mjs").replaceAll("\\", "/")}`]);
    const opencode = await call("factory_install_guide", { harness: "opencode" });
    assert.match(String((opencode.commands as string[])[0]), /install-opencode.mjs$/);
  } finally {
    await session.close();
  }
});
