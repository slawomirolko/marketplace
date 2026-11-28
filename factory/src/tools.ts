import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadedWorkflows } from "./engine.ts";
import { errorMessage } from "./errors.ts";
import type { Factory } from "./engine.ts";
import { viewerUrlFor } from "./viewer-routes.ts";
import { HARNESSES, installGuide } from "./install-guide.ts";
import { projectScopedInput, projectsAction } from "./projects.ts";
import { longPath } from "./paths.ts";
import { definedFields } from "./fields.ts";

export interface ToolMetrics {
  statusCalls: number;
  throttledCalls: number;
  waitCalls: number;
  throttledWaitCalls: number;
  failedCalls: number;
}

export interface FactoryTools {
  buildServer(): McpServer;
  metrics(): ToolMetrics;
}

const DEFAULT_MIN_STATUS_INTERVAL_MS = 500;
const MIN_STATUS_INTERVAL_MS = Number(process.env.FACTORY_MIN_STATUS_INTERVAL_MS ?? DEFAULT_MIN_STATUS_INTERVAL_MS);
/** The longest free text a run input field (criteria, idea) takes. */
const MAX_TEXT_INPUT_CHARS = 20_000;
const DEFAULT_WAIT_SEC = 20;
const MAX_WAIT_SEC = 50;

const START_DESCRIPTION = "Create a factory run for a goal. workflow names a factory workflow; input holds its parameters, listed below for each workflow that declares them. projectId names a registered project (see factory_projects): the factory sets input.project to its folder and keeps the id on the run. The result contains proposed settings. Show the proposal to the user. After the user replies, call factory_confirm.";

/** The factory_start description: the generic text, then the input help that each workflow YAML declares in `inputs`. */
function startDescription(): string {
  const inputs = [...loadedWorkflows().values()].filter((workflow) => workflow.inputs).map((workflow) => `- ${workflow.name}: ${workflow.inputs}`);
  return inputs.length === 0 ? START_DESCRIPTION : `${START_DESCRIPTION}\nInputs by workflow:\n${inputs.join("\n")}`;
}

export function createFactoryTools(factory: Factory, publicUrl: string): FactoryTools {
  const lastStatusAt = new Map<string, number>();
  let statusCalls = 0;
  const lastIdleWaitAt = new Map<string, number>();
  let throttledCalls = 0;
  let waitCalls = 0;
  let throttledWaitCalls = 0;
  let failedCalls = 0;

  async function delayIfTooSoon(lastCallAt: Map<string, number>, runId: string): Promise<boolean> {
    const now = Date.now();
    const earliest = (lastCallAt.get(runId) ?? 0) + MIN_STATUS_INTERVAL_MS;
    const delay = Math.max(0, earliest - now);
    lastCallAt.set(runId, now + delay);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return delay > 0;
  }

  async function throttle(runId: string): Promise<void> {
    statusCalls += 1;
    if (await delayIfTooSoon(lastStatusAt, runId)) throttledCalls += 1;
  }

  function reply(payload: object): CallToolResult {
    const structured: Record<string, unknown> = { ...payload };
    if (typeof structured.runId === "string" && structured.runId && !structured.viewerUrl) structured.viewerUrl = viewerUrlFor(publicUrl, structured.runId);
    return { content: [{ type: "text", text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
  }

  function fail(message: string): CallToolResult {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }

  /** Wraps a tool handler: its result becomes the reply, and a thrown error becomes an error reply that is counted and logged with the tool name. */
  function guarded<A>(toolName: string, handler: (args: A) => object | Promise<object>): (args: A) => Promise<CallToolResult> {
    return async (args) => {
      try {
        return reply(await handler(args));
      } catch (error) {
        failedCalls += 1;
        console.error(`tool ${toolName} failed: ${errorMessage(error)}`);
        return fail(errorMessage(error));
      }
    };
  }

  function buildServer(): McpServer {
    const server = new McpServer({ name: "skill-factory-poc", version: "0.1.0" });

    server.registerTool(
      "factory_start",
      {
        description: startDescription(),
        inputSchema: {
          goal: z.string().min(1),
          workflow: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
          input: z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional(), pr: z.number().int().positive().optional(), fresh: z.boolean().optional(), plan: z.string().regex(/^[\w./-]+$/).optional(), criteria: z.string().max(MAX_TEXT_INPUT_CHARS).optional(), project: z.string().min(1).optional(), marketplace: z.string().min(1).optional(), artifacts: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1).optional(), target: z.string().min(1).optional(), targetName: z.string().regex(/^[a-z0-9-]+$/).optional(), olko: z.string().min(1).optional(), user: z.string().min(1).optional(), stateDir: z.string().min(1).optional(), switches: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.boolean()).optional(), idea: z.string().max(MAX_TEXT_INPUT_CHARS).optional(), route: z.enum(["discovery", "planning", "both"]).optional(), featureId: z.string().regex(/^[a-z0-9-]+$/).optional(), base: z.string().regex(/^[\w./-]+$/).optional(), taskId: z.string().regex(/^[\w.-]+$/).optional(), adopt: z.boolean().optional(), workflowsDir: z.string().min(1).optional() }).strict().optional(),
          projectId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
          idempotencyKey: z.string().optional(),
        },
      },
      guarded("factory_start", ({ goal, workflow, input, projectId, idempotencyKey }) => {
        const runInput = definedFields({
          ...input,
          project: input?.project && longPath(input.project),
          marketplace: input?.marketplace && longPath(input.marketplace),
          target: input?.target && longPath(input.target),
          olko: input?.olko && longPath(input.olko),
          user: input?.user && longPath(input.user),
          stateDir: input?.stateDir && path.resolve(input.stateDir),
          workflowsDir: input?.workflowsDir && longPath(input.workflowsDir),
        });
        const { run, reused } = factory.start(goal, idempotencyKey, { ...definedFields({ workflow }), input: projectScopedInput(projectId, runInput) });
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
              roles: z.record(z.string(), z.enum(["low", "medium", "high"])).optional(),
              budget: z.object({ maxCostUsd: z.number().positive() }).partial().optional(),
              backend: z.object({ kind: z.enum(["fake", "cli", "delegate"]), cli: z.enum(["claude", "opencode"]).optional() }).optional(),
              tierModels: z.object({ low: z.string(), medium: z.string(), high: z.string() }).partial().optional(),
            })
            .optional(),
        },
      },
      guarded("factory_confirm", ({ runId, overrides }) => factory.status(factory.confirm(runId, overrides))),
    );

    server.registerTool(
      "factory_next",
      {
        description: "Delegate mode only. Get pendingWork: the node work that you must run now (prompt, tier and model). The result is null when there is no work.",
        inputSchema: { runId: z.string() },
      },
      guarded("factory_next", ({ runId }) => ({ pendingWork: factory.next(runId), ...factory.status(factory.get(runId)) })),
    );

    server.registerTool(
      "factory_submit",
      {
        description:
          "Delegate mode only. Submit the output of pendingWork and the usage of the subagent that ran it. If pendingWork has an agentId, pass the same agentId. If the subagent result shows a session id (for example <subagent sessionID=\"ses_...\">), pass it as usage.childSessionId; the factory stores it with the ledger record and does not read usage from it. Report the token numbers you saw in usage, because the cost of the step comes only from them. Do not send token numbers that you did not see.",
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
      guarded("factory_submit", ({ runId, nodePath, agentId, output, usage }) => {
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
      guarded("factory_status", async ({ runId }) => {
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
      guarded("factory_wait", async ({ runId, timeoutSec }) => {
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
      guarded("factory_answer", ({ runId, questionId, answer }) => {
        const { run, duplicate } = factory.answer(runId, questionId, answer);
        return { ...factory.status(run), duplicate };
      }),
    );

    server.registerTool(
      "factory_report",
      { description: "Get the steps, tokens and cost of a factory run for each node, agent, tier and model. The cost is the factory run cost, not the cost of your own session. Call this tool after the run has ended. The result has viewerUrl: a local page that shows the whole flow and the cost of each agent. Show viewerUrl to the user.", inputSchema: { runId: z.string() } },
      guarded("factory_report", ({ runId }) => factory.report(factory.get(runId))),
    );

    server.registerTool(
      "factory_trace",
      { description: "Get the trace tree of a factory run: nodes, turns, tokens, factory run cost and events.", inputSchema: { runId: z.string() } },
      guarded("factory_trace", ({ runId }) => {
        const run = factory.get(runId);
        return { trace: factory.trace(run), events: run.events, cost: factory.footer(run) };
      }),
    );

    server.registerTool(
      "factory_install_guide",
      {
        description:
          "Get the steps to install this factory permanently in a harness, so that every new session starts it. Call this tool when the user asks how to install, add or set up the factory. Without harness, the tool uses the harness that is connected now. Show the steps to the user. Run the commands only after the user agrees, because they change the user's harness configuration.",
        inputSchema: { harness: z.enum(HARNESSES).optional() },
      },
      guarded("factory_install_guide", ({ harness }) => installGuide(harness, server.server.getClientVersion()?.name)),
    );

    server.registerTool(
      "factory_projects",
      {
        description: "List, add or remove the local projects that use the marketplace, manage the root folders that discovery searches, or discover candidate projects under them. Discovery only proposes candidates; add one to register it. The list lives in the user's factory home, outside every repository.",
        inputSchema: {
          action: z.enum(["list", "add", "remove", "add_root", "remove_root", "discover"]),
          path: z.string().min(1).optional(),
          id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
          marketplace: z.string().min(1).optional(),
        },
      },
      guarded("factory_projects", ({ action, path: dir, id, marketplace }) => projectsAction({ action, ...definedFields({ path: dir, id, marketplace }) })),
    );

    server.registerTool(
      "factory_cancel",
      { description: "Cancel a factory run. Call this tool when the user asks to stop the run.", inputSchema: { runId: z.string() } },
      guarded("factory_cancel", ({ runId }) => factory.status(factory.cancel(runId))),
    );

    return server;
  }

  return { buildServer, metrics: () => ({ statusCalls, throttledCalls, waitCalls, throttledWaitCalls, failedCalls }) };
}
