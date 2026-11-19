import Mustache from "mustache";
import { evaluateWhen, withEach } from "./workflow-yaml.ts";
import type { Operation } from "./types.ts";

const pass: Operation = async () => ({ state: { passed: true }, output: "verify passed" });

function readState(state: Record<string, unknown>, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), state);
}

const listNext: Operation = async ({ state, args, nodeId }) => {
  if (typeof args.over !== "string") throw new Error("with.over must be a state path");
  const list = readState(state, args.over);
  if (!Array.isArray(list)) throw new Error(`state.${args.over} is not a list`);
  const previous = nodeId ? (state[nodeId] as { index?: number; done?: boolean } | undefined) : undefined;
  const index = previous?.index === undefined || previous.done ? 0 : previous.index + 1;
  const done = index >= list.length;
  return { state: { index, number: index + 1, total: list.length, item: done ? null : list[index], done }, metrics: { index, total: list.length }, output: done ? `All ${list.length} items handled.` : `Item ${index + 1} of ${list.length}.` };
};

/** Appends one item built from state paths to this node's list; `restartWhen` starts a new list, for example at the first question of a batch. */
const listAppend: Operation = async ({ state, args, nodeId }) => {
  if (!args.values || typeof args.values !== "object" || Array.isArray(args.values)) throw new Error("with.values must map names to state paths");
  const restart = typeof args.restartWhen === "string" && evaluateWhen(args.restartWhen, state);
  const previous = restart || !nodeId ? [] : ((state[nodeId] as { items?: unknown[] } | undefined)?.items ?? []);
  const item = { number: previous.length + 1, ...Object.fromEntries(Object.entries(args.values).map(([name, dotted]) => [name, readState(state, String(dotted))])) };
  const items = [...previous, item];
  return { state: { items, count: items.length }, metrics: { count: items.length }, output: `${items.length} items collected.` };
};

export const OPERATIONS: Record<string, Operation> = {
  "builtin.pass": pass,
  "builtin.count": async ({ state, nodeId }) => {
    const count = ((nodeId ? (state[nodeId] as { count?: number } | undefined)?.count : 0) ?? 0) + 1;
    return { state: { count }, metrics: { count }, output: `Round ${count}.` };
  },
  "builtin.stop": async ({ args, state, input, answers }) => {
    throw new Error(Mustache.render(String(args.reason ?? "stopped by the user"), withEach({ state, input, answers })).trim());
  },
  "builtin.values": async ({ args }) => {
    if (!Array.isArray(args.values)) throw new Error("with.values must be a list");
    return { state: { values: args.values }, metrics: { values: args.values.length }, output: `${args.values.length} values.` };
  },
  "builtin.gate": async ({ state, input, args }) => {
    const when = String(args.when);
    const enabled = evaluateWhen(when, { ...state, input, switches: input.switches ?? {} });
    const required = args.required === true;
    const skipped = `Subgraph ${String(args.subgraph)} skipped: switch off (${when} is false).${required ? " WARNING: required step switched off; the source agent says it must never be skipped." : ""}`;
    return { state: { enabled, required }, metrics: { enabled: enabled ? 1 : 0, requiredOff: required && !enabled ? 1 : 0 }, output: enabled ? `Subgraph ${String(args.subgraph)} runs (${when}).` : skipped };
  },
  "list.next": listNext,
  "list.append": listAppend,
};

export function operationNamed(name: string): Operation | undefined {
  return OPERATIONS[name];
}
