import assert from "node:assert/strict";
import type { Factory as FactoryClass } from "../../src/engine.ts";
import { sleep } from "./poll.ts";
import { tempDir } from "./temp.ts";

type Factory = InstanceType<typeof FactoryClass>;
export type PlanRun = ReturnType<Factory["get"]>;

/** Three backticks: scripted replies end with a fenced json block the workflow parsers read. */
export const FENCE = "`".repeat(3);
/** Run statuses after which nothing changes any more. */
export const ENDED = new Set(["done", "stopped", "cancelled", "failed"]);
/** The usage every scripted reply reports. */
export const SCRIPTED_USAGE = { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 10 };
/** Pause while the engine is busy between two offers. */
const DRIVE_INTERVAL_MS = 5;
/** How long a scripted run may take before the driver gives up and returns the run as it is. */
const DRIVE_TIMEOUT_MS = 30000;

/** One piece of offered work as the reply function sees it. `visit` counts offers under the same visit key, starting at 1. */
export interface ScriptedWork {
  nodePath: string;
  step: string;
  visit: number;
  agentId?: string;
  prompt: string;
}

export interface DriveHandlers {
  /** The scripted output for an offer, or undefined when the test has none (fails the test). */
  reply: (work: ScriptedWork) => string | undefined;
  /** The answer to a question; without it a question fails the test. */
  answer?: (questionId: string, question: { id: string; text: string }) => string;
  /** Groups offers for `visit` and `prompts`; the node id by default. */
  visitKey?: (work: { nodePath: string; step: string; agentId?: string }) => string;
  /** The usage submitted with every reply; SCRIPTED_USAGE by default. */
  usage?: Record<string, unknown>;
  /** The ended run is pushed here, for the edge coverage check at the end of a file. */
  runs?: PlanRun[];
}

export interface DriveResult {
  factory: Factory;
  done: PlanRun;
  /** Prompts per visit key, in offer order. */
  prompts: Record<string, string[]>;
  /** Agent ids per node id, in offer order. */
  agents: Record<string, string[]>;
  /** Question ids in the order they were asked. */
  asked: string[];
  /** Node ids in offer order. */
  order: string[];
}

export interface DriveStart extends DriveHandlers {
  workflow: string;
  goal: string;
  input: Record<string, unknown>;
  /** Prefix of the temp data folder. */
  tempPrefix: string;
}

function lastSegment(nodePath: string): string {
  return nodePath.split("/").pop() ?? nodePath;
}

/** Answers every offer of a started, confirmed run with scripted replies until the run ends. */
export async function driveRun(factory: Factory, runId: string, { reply, answer, visitKey = (work) => work.step, usage = SCRIPTED_USAGE, runs }: DriveHandlers): Promise<DriveResult> {
  const prompts: Record<string, string[]> = {};
  const agents: Record<string, string[]> = {};
  const asked: string[] = [];
  const order: string[] = [];
  const deadline = Date.now() + DRIVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const view = factory.status(factory.get(runId));
    if (ENDED.has(view.status)) {
      break;
    }
    if (view.status === "waiting_for_user") {
      const question = view.pendingQuestion!;
      assert.ok(answer, `the run asked the user: ${JSON.stringify(question)}`);
      asked.push(question.id);
      factory.answer(runId, question.id, answer(question.id, question));
      continue;
    }
    if (view.status !== "waiting_for_client") {
      await sleep(DRIVE_INTERVAL_MS);
      continue;
    }
    for (const work of view.pendingWorkItems ?? []) {
      const step = lastSegment(work.nodePath);
      const key = visitKey({ nodePath: work.nodePath, step, agentId: work.agentId });
      const visit = (prompts[key] ??= []).push(work.prompt);
      (agents[step] ??= []).push(String(work.agentId));
      order.push(step);
      const output = reply({ nodePath: work.nodePath, step, visit, agentId: work.agentId, prompt: work.prompt });
      if (output === undefined) {
        throw new Error(`unexpected step ${work.nodePath}`);
      }
      factory.submit(runId, work.nodePath, output, usage, work.agentId);
    }
  }
  const done = factory.get(runId);
  runs?.push(done);
  return { factory, done, prompts, agents, asked, order };
}

/** Starts and confirms a delegate-mode run of `workflow` in a temp data folder and drives it with scripted replies. */
export async function driveWorkflow({ workflow, goal, input, tempPrefix, ...handlers }: DriveStart): Promise<DriveResult> {
  const { Factory } = await import("../../src/engine.ts");
  const factory = new Factory(tempDir(tempPrefix), { backend: "delegate" });
  const { run } = factory.start(goal, undefined, { workflow, input });
  factory.confirm(run.runId);
  return driveRun(factory, run.runId, handlers);
}

/** True when the run failed with an error matching `reason`. */
export function stoppedBy(run: { status: string; events: { error?: unknown }[] }, reason: RegExp): boolean {
  return run.status === "failed" && run.events.some((event) => reason.test(String(event.error ?? "")));
}

/** A scripted reply: a lead line, then `body` as a fenced json block. */
export function fencedJson(body: unknown, lead = "Reply."): string {
  return `${lead}\n${FENCE}json\n${JSON.stringify(body)}\n${FENCE}`;
}

/** A grill batch of `count` numbered questions, each with keep (recommended), change and drop. */
export function questions(prefix: string, count: number): string {
  const items = Array.from({ length: count }, (_, index) => ({ text: `${prefix} ${index + 1}\n1. keep (recommended)\n2. change\n3. drop` }));
  return fencedJson({ questions: items }, "Batch.");
}

/** An apply reply listing the changes made and the areas they touch. */
export function applied(changes: string[], areas: string[]): string {
  return fencedJson({ changes, areas }, "Applied.");
}
