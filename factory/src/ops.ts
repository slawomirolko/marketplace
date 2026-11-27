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

/** Counts the items of a list per value (or per the `by` field of each item), most frequent first; ties keep first-seen order. */
const listCount: Operation = async ({ state, args }) => {
  if (typeof args.over !== "string") throw new Error("with.over must be a state path");
  const list = readState(state, args.over);
  if (!Array.isArray(list)) throw new Error(`state.${args.over} is not a list`);
  const by = typeof args.by === "string" ? args.by : undefined;
  const tally = new Map<string, number>();
  for (const item of list) {
    const value = String(by && item && typeof item === "object" ? (item as Record<string, unknown>)[by] : item);
    tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  const counts = [...tally].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  return { state: { counts, total: list.length }, metrics: { total: list.length, values: counts.length }, output: `${list.length} items, ${counts.length} distinct values.` };
};

/** Keeps the items of a fixed list whose `id` is named in the `ids` state list; when `ids` is not a list, keeps every item. */
const listPick: Operation = async ({ state, args }) => {
  if (!Array.isArray(args.items)) throw new Error("with.items must be a list");
  if (typeof args.ids !== "string") throw new Error("with.ids must be a state path");
  const ids = readState(state, args.ids);
  const items = Array.isArray(ids) ? args.items.filter((item) => ids.includes((item as { id?: unknown }).id)) : args.items;
  return { state: { items, count: items.length }, metrics: { count: items.length }, output: `${items.length} of ${args.items.length} items picked.` };
};

/**
 * Runs one command without a shell. `with.command` is a list of Mustache templates over
 * input, state and answers; `{{node}}` is this Node binary. `with.cwd` sets the directory,
 * `with.okCodes` the accepted exit codes (default [0]) and `with.parse: json` parses stdout.
 */
const execCommand: Operation = async ({ args, state, input, answers, exec, cwd }) => {
  if (!Array.isArray(args.command) || args.command.length === 0) throw new Error("with.command must be a non-empty list");
  if (!exec) throw new Error("this factory process has no host exec");
  const view = { ...withEach({ state, input, answers }), node: process.execPath };
  const render = (template: unknown) => Mustache.render(String(template), view, {}, { escape: (value: unknown) => String(value) });
  const [command, ...rest] = args.command.map(render);
  const okCodes = Array.isArray(args.okCodes) ? args.okCodes.map(Number) : [0];
  const result = await exec(command as string, rest, { cwd: typeof args.cwd === "string" ? render(args.cwd) : cwd });
  const stdout = result.stdout.trim();
  if (!okCodes.includes(Number(result.code))) throw new Error(`command exited ${result.code}: ${result.stderr.trim().slice(-300)}`);
  const json = args.parse === "json" && stdout ? (JSON.parse(stdout) as unknown) : null;
  return { state: { code: result.code, stdout: stdout.slice(0, 20_000), json }, metrics: { code: Number(result.code) }, output: stdout.split(/\r?\n/)[0]?.slice(0, 200) ?? "" };
};

/** Adds the values of the `from` state list to this node's list once each; a value already kept is never removed, even when a later `from` list leaves it out. */
const listMerge: Operation = async ({ state, args, nodeId }) => {
  if (typeof args.from !== "string") throw new Error("with.from must be a state path");
  const incoming = readState(state, args.from);
  const previous = (nodeId ? (state[nodeId] as { items?: unknown[] } | undefined)?.items : undefined) ?? [];
  const items = [...previous];
  for (const value of Array.isArray(incoming) ? incoming : []) if (!items.includes(value)) items.push(value);
  const added = items.length - previous.length;
  return { state: { items, count: items.length, added }, metrics: { count: items.length, added }, output: `${added} added, ${items.length} kept.` };
};

/** Counts consecutive visits on which `when` holds; a visit where it does not hold resets the count, and the visit after the count reached `limit` starts again from zero. */
const streak: Operation = async ({ state, args, nodeId }) => {
  if (typeof args.when !== "string") throw new Error("with.when must be a condition");
  if (typeof args.limit !== "number" || args.limit < 1) throw new Error("with.limit must be a positive number");
  const previous = nodeId ? (state[nodeId] as { count?: number; reached?: boolean } | undefined) : undefined;
  const base = previous?.reached ? 0 : (previous?.count ?? 0);
  const count = evaluateWhen(args.when, state) ? base + 1 : 0;
  const reached = count >= args.limit;
  return { state: { count, reached }, metrics: { count }, output: reached ? `Streak ${count} reached the limit ${args.limit}.` : `Streak ${count}.` };
};

export const OPERATIONS: Record<string, Operation> = {
  "builtin.exec": execCommand,
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
  "list.count": listCount,
  "list.pick": listPick,
  "list.merge": listMerge,
  "builtin.streak": streak,
};

export function operationNamed(name: string): Operation | undefined {
  return OPERATIONS[name];
}
