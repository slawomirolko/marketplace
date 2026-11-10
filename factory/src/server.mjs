import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Factory } from "./engine.mjs";

const PORT = Number(process.env.FACTORY_PORT ?? 7340);
const HOST = process.env.FACTORY_HOST ?? "127.0.0.1";
const TOKEN = process.env.FACTORY_TOKEN;
const DATA_DIR = process.env.FACTORY_DATA_DIR ?? "/data";

if (!TOKEN) {
  console.error("FACTORY_TOKEN is required");
  process.exit(1);
}

const MIN_STATUS_INTERVAL_MS = Number(process.env.FACTORY_MIN_STATUS_INTERVAL_MS ?? 500);
const DEFAULT_WAIT_SEC = 20;
const MAX_WAIT_SEC = 50;

const factory = new Factory(DATA_DIR);
const lastStatusAt = new Map();
let statusCalls = 0;
const lastIdleWaitAt = new Map();
let throttledCalls = 0;
let waitCalls = 0;
let throttledWaitCalls = 0;

async function delayIfTooSoon(lastCallAt, runId) {
  const now = Date.now();
  const earliest = (lastCallAt.get(runId) ?? 0) + MIN_STATUS_INTERVAL_MS;
  const delay = Math.max(0, earliest - now);
  lastCallAt.set(runId, now + delay);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  return delay > 0;
}

async function throttle(runId) {
  statusCalls += 1;
  if (await delayIfTooSoon(lastStatusAt, runId)) throttledCalls += 1;
}

function reply(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

function fail(message) {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
}

function guarded(handler) {
  return async (args) => {
    try {
      return reply(await handler(args));
    } catch (error) {
      return fail(error.message);
    }
  };
}

function buildServer() {
  const server = new McpServer({ name: "skill-factory-poc", version: "0.1.0" });

  server.registerTool(
    "factory_start",
    {
      description: "Create a factory run for a goal. The result contains proposed settings. Show the proposal to the user. After the user replies, call factory_confirm.",
      inputSchema: { goal: z.string().min(1), idempotencyKey: z.string().optional() },
    },
    guarded(({ goal, idempotencyKey }) => {
      const { run, reused } = factory.start(goal, idempotencyKey);
      return { ...factory.status(run), reused, next: "Show the proposal to the user. After the user replies, call factory_confirm." };
    }),
  );

  server.registerTool(
    "factory_confirm",
    {
      description: "Confirm the proposed role-to-tier mapping and budget, and start the run. To change a proposed value, put it in overrides. The run continues in the background; this call does not wait for it.",
      inputSchema: {
        runId: z.string(),
        overrides: z
          .object({
            roles: z.record(z.enum(["low", "medium", "high"])).optional(),
            budget: z.object({ maxCostUsd: z.number().positive() }).partial().optional(),
            backend: z.object({ kind: z.enum(["fake", "cli", "delegate"]), cli: z.enum(["claude", "opencode"]).optional() }).optional(),
            tierModels: z.object({ low: z.string(), medium: z.string(), high: z.string() }).partial().optional(),
          })
          .optional(),
      },
    },
    guarded(({ runId, overrides }) => factory.status(factory.confirm(runId, overrides))),
  );

  server.registerTool(
    "factory_next",
    {
      description: "Delegate mode only. Get pendingWork: the node work that you must run now (prompt, tier and model). The result is null when there is no work.",
      inputSchema: { runId: z.string() },
    },
    guarded(({ runId }) => ({ pendingWork: factory.next(runId), ...factory.status(factory.get(runId)) })),
  );

  server.registerTool(
    "factory_submit",
    {
      description:
        "Delegate mode only. Submit the output of pendingWork and the usage of the subagent that ran it. If pendingWork has an agentId, pass the same agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), always pass it as usage.childSessionId. The factory reads the exact token usage from that session. Add token numbers only if you saw them. Do not send token numbers that you did not see.",
      inputSchema: {
        runId: z.string(),
        nodePath: z.string(),
        agentId: z.string().optional(),
        output: z.string(),
        usage: z
          .object({
            model: z.string().optional(),
            totalTokens: z.number().int().nonnegative().optional(),
            inputTokens: z.number().int().nonnegative().optional(),
            outputTokens: z.number().int().nonnegative().optional(),
            cacheReadTokens: z.number().int().nonnegative().optional(),
            cacheWriteTokens: z.number().int().nonnegative().optional(),
            childSessionId: z.string().optional(),
          })
          .optional(),
      },
    },
    guarded(({ runId, nodePath, agentId, output, usage }) => {
      const { run, duplicate } = factory.submit(runId, nodePath, output, usage, agentId);
      return { ...factory.status(run), duplicate };
    }),
  );

  server.registerTool(
    "factory_status",
    {
      description:
        "Get the current status of a factory run. This call returns immediately. The cost fields show the cost and budget of this factory run, not of your own session. The run has ended when status is done, stopped, cancelled or failed. To wait for progress, call factory_wait. Do not call factory_status in a loop. The server delays calls that come sooner than the minimum interval.",
      inputSchema: { runId: z.string() },
    },
    guarded(async ({ runId }) => {
      await throttle(runId);
      return factory.status(factory.get(runId));
    }),
  );

  server.registerTool(
    "factory_wait",
    {
      description:
        "Wait until the run needs the user (waiting_for_user), needs you to run node work in delegate mode (waiting_for_client), the run ends, or timeoutSec passes. Use this tool instead of polling. The run has ended when status is done, stopped, cancelled or failed. After that, stop calling factory_wait. On waiting_for_user, ask the user pendingQuestion.text. Then send the user's answer with factory_answer. On waiting_for_client, run pendingWork and call factory_submit. If the result has status 'running' and timedOut is true, call factory_wait again. When the run is not running, the server delays calls that come sooner than the minimum interval.",
      inputSchema: { runId: z.string(), timeoutSec: z.number().int().min(1).max(MAX_WAIT_SEC).optional() },
    },
    guarded(async ({ runId, timeoutSec }) => {
      if (factory.get(runId).status !== "running" && (await delayIfTooSoon(lastIdleWaitAt, runId))) throttledWaitCalls += 1;
      const { run, timedOut } = await factory.waitForChange(runId, (timeoutSec ?? DEFAULT_WAIT_SEC) * 1000);
      waitCalls += 1;
      return { ...factory.status(run), timedOut };
    }),
  );

  server.registerTool(
    "factory_answer",
    {
      description: "Send the user's answer to the pending question of a factory run (pendingQuestion). If you send the same questionId and answer again, the call has no new effect and returns duplicate: true.",
      inputSchema: { runId: z.string(), questionId: z.string(), answer: z.string() },
    },
    guarded(({ runId, questionId, answer }) => {
      const { run, duplicate } = factory.answer(runId, questionId, answer);
      return { ...factory.status(run), duplicate };
    }),
  );

  server.registerTool(
    "factory_report",
    { description: "Get the steps, tokens and cost of a factory run for each node, agent, tier and model. The cost is the factory run cost, not the cost of your own session. Call this tool after the run has ended.", inputSchema: { runId: z.string() } },
    guarded(({ runId }) => factory.report(factory.get(runId))),
  );

  server.registerTool(
    "factory_trace",
    { description: "Get the trace tree of a factory run: nodes, turns, tokens, factory run cost and events.", inputSchema: { runId: z.string() } },
    guarded(({ runId }) => {
      const run = factory.get(runId);
      return { trace: factory.trace(run), cost: factory.footer(run) };
    }),
  );

  server.registerTool(
    "factory_cancel",
    { description: "Cancel a factory run. Call this tool when the user asks to stop the run.", inputSchema: { runId: z.string() } },
    guarded(({ runId }) => factory.status(factory.cancel(runId))),
  );

  return server;
}

function readBody(req) {
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
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ statusCalls, throttledCalls, waitCalls, throttledWaitCalls }));
    return;
  }
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
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) res.writeHead(500).end(JSON.stringify({ error: error.message }));
  }
});

httpServer.listen(PORT, HOST, () => console.log(`skill-factory-poc listening on http://${HOST}:${PORT}/mcp`));
