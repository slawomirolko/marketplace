import Mustache from "mustache";

/** Prompts and conditions are plain text, never HTML: Mustache must not escape values. */
Mustache.escape = (text: string) => text;

const CONDITION = /^([a-zA-Z0-9_./-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/;

export function readPath(state: Record<string, unknown>, dotted: string): unknown {
  let value: unknown = state;
  for (const key of dotted.split(".")) {
    if (value === null || typeof value !== "object" || !(key in value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function literal(text: string): string | number | boolean | null {
  const trimmed = text.trim();
  const quoted = trimmed.match(/^(["'])(.*)\1$/);
  if (quoted?.[2] !== undefined) return quoted[2];
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  if (trimmed === "null") return null;
  const number = Number(trimmed);
  if (Number.isNaN(number)) throw new Error(`condition value ${trimmed} is not a number, boolean, null or quoted string`);
  return number;
}

function compare(clause: string, state: Record<string, unknown>): boolean {
  const match = clause.trim().match(CONDITION);
  if (!match?.[1] || !match[2] || match[3] === undefined) throw new Error(`condition '${clause}' must be '<state path> <operator> <value>'`);
  const raw = readPath(state, match[1]) ?? null;
  const left = Array.isArray(raw) ? raw.length : raw;
  const right = literal(match[3]);
  if (match[2] === "==") return left === right;
  if (match[2] === "!=") return left !== right;
  if (left === null || right === null) return false;
  switch (match[2]) {
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    default:
      return Number(left) <= Number(right);
  }
}

export function whenClauses(when: string): string[] {
  return when.split(/\|\||&&/).map((c) => c.trim());
}

export function evaluateWhen(when: string, state: Record<string, unknown>): boolean {
  return when.split("||").some((any) => any.split("&&").every((all) => compare(all, state)));
}

function eachView(value: Record<string, unknown>): unknown {
  const entries = Object.entries(value).map(([key, entry]) => ({ key, value: entry }));
  return new Proxy(entries, {
    get: (target, key) => (key in target ? Reflect.get(target, key) : view(value[key as string])),
    has: (target, key) => key in target || key in value,
  });
}

function view(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? eachView(value as Record<string, unknown>) : value;
}

export function withEach<T extends object>(context: T): T & { each: unknown } {
  return { ...context, each: eachView(context as Record<string, unknown>) };
}
