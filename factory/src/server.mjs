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
let throttledCalls = 0;
let waitCalls = 0;

async function throttle(runId) {
  statusCalls += 1;
  const now = Date.now();
  const earliest = (lastStatusAt.get(runId) ?? 0) + MIN_STATUS_INTERVAL_MS;
  const delay = Math.max(0, earliest - now);
  lastStatusAt.set(runId, now + delay);
  if (delay > 0) {
    throttledCalls += 1;
    await new Promise((r) => setTimeout(r, delay));
  }
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
      description: "Create a factory run for a goal. Returns proposed settings that must be confirmed with factory_confirm after asking the user.",
      inputSchema: { goal: z.string().min(1), idempotencyKey: z.string().optional() },
    },
    guarded(({ goal, idempotencyKey }) => {
      const { run, reused } = factory.start(goal, idempotencyKey);
      return { ...factory.status(run), reused, next: "Show the proposal to the user, then call factory_confirm." };
    }),
  );

  server.registerTool(
    "factory_confirm",
    {
      description: "Confirm (optionally override) the proposed role-to-tier mapping and budget, then start the run asynchronously.",
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
      description: "In delegate mode: the node work the client should run now (prompt, tier, model), or null.",
      inputSchema: { runId: z.string() },
    },
    guarded(({ runId }) => ({ pendingWork: factory.next(runId), ...factory.status(factory.get(runId)) })),
  );

  server.registerTool(
    "factory_submit",
    {
      description:
        "In delegate mode: submit the output of pendingWork (pass its agentId when it has one) and the usage of the subagent that ran it. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), always pass it as usage.childSessionId: the factory reads the exact token usage from that session. Add token numbers only if you actually observed them; omit the rest.",
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
        "Current status of a factory run (returns immediately). The cost fields are the cost and budget of this factory run, not of your own session. To wait for progress, call factory_wait. Do not call factory_status in a loop: the server delays calls closer than the minimum interval.",
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
        "Block until the run needs the user (waiting_for_user), finishes, or timeoutSec passes. Use this instead of polling. On waiting_for_user, ask the user pendingQuestion.text and send the user's answer with factory_answer. If it returns status 'running' (timedOut), call it again.",
      inputSchema: { runId: z.string(), timeoutSec: z.number().int().min(1).max(MAX_WAIT_SEC).optional() },
    },
    guarded(async ({ runId, timeoutSec }) => {
      const { run, timedOut } = await factory.waitForChange(runId, (timeoutSec ?? DEFAULT_WAIT_SEC) * 1000);
      waitCalls += 1;
      return { ...factory.status(run), timedOut };
    }),
  );

  server.registerTool(
    "factory_answer",
    {
      description: "Send the user's answer to the pending question of a factory run (pendingQuestion). Idempotent for the same questionId and answer.",
      inputSchema: { runId: z.string(), questionId: z.string(), answer: z.string() },
    },
    guarded(({ runId, questionId, answer }) => {
      const { run, duplicate } = factory.answer(runId, questionId, answer);
      return { ...factory.status(run), duplicate };
    }),
  );

  server.registerTool(
    "factory_report",
    { description: "Steps, tokens and cost of a factory run per node, agent, tier and model. This is the factory run cost, not the cost of your own session. Call it when the run has ended.", inputSchema: { runId: z.string() } },
    guarded(({ runId }) => factory.report(factory.get(runId))),
  );

  server.registerTool(
    "factory_trace",
    { description: "Trace tree of a factory run: nodes, turns, tokens, factory run cost and events.", inputSchema: { runId: z.string() } },
    guarded(({ runId }) => {
      const run = factory.get(runId);
      return { trace: factory.trace(run), cost: factory.footer(run) };
    }),
  );

  server.registerTool(
    "factory_cancel",
    { description: "Cancel a factory run. Call it when the user asks to stop the run.", inputSchema: { runId: z.string() } },
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
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ statusCalls, throttledCalls, waitCalls }));
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
