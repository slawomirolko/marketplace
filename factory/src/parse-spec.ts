import { z } from "zod";

export type ParseSpec = "text" | { json: string[] } | { line: string[] };

function fieldName(field: string): { name: string; optional: boolean } {
  return field.endsWith("?") ? { name: field.slice(0, -1), optional: true } : { name: field, optional: false };
}

function lastJson(text: string): unknown {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = blocks.at(-1)?.[1] ?? text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("the agent output has no ```json block");
  }
}

function lastLine(text: string, count: number): string[] {
  const line = text.split(/\r?\n/).map((l) => l.trim().replace(/^`+|`+$/g, "")).reverse().find((l) => l.split("|").length >= count);
  if (!line) throw new Error(`the agent output has no result line with ${count} fields separated by |`);
  const parts = line.split("|").map((p) => p.trim());
  return [...parts.slice(0, count - 1), parts.slice(count - 1).join(" | ")];
}

export function isParseSpec(value: unknown): value is ParseSpec {
  if (value === "text") return true;
  if (typeof value !== "object" || value === null) return false;
  const list = (value as { json?: unknown; line?: unknown }).json ?? (value as { line?: unknown }).line;
  return Array.isArray(list) && list.length > 0 && list.every((f) => typeof f === "string" && /^[a-zA-Z][a-zA-Z0-9]*\??$/.test(f));
}

export function buildParser(spec: ParseSpec): (text: string) => unknown {
  if (spec === "text") return (text) => String(text).trim();
  if ("json" in spec) {
    const fields = spec.json.map(fieldName);
    return (text) => {
      const data = lastJson(String(text));
      if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("the agent JSON is not an object");
      const missing = fields.filter((f) => !f.optional && !(f.name in data)).map((f) => f.name);
      if (missing.length) throw new Error(`the agent JSON has no ${missing.join(", ")}`);
      return { ...Object.fromEntries(fields.filter((f) => f.optional).map((f) => [f.name, null])), ...data, text: String(text) };
    };
  }
  const fields = spec.line.map((f) => fieldName(f).name);
  return (text) => {
    const parts = lastLine(String(text), fields.length);
    return { ...Object.fromEntries(fields.map((f, i) => [f, parts[i] ?? ""])), text: String(text) };
  };
}

export function parseContract(spec: ParseSpec): z.ZodType {
  if (spec === "text") return z.string();
  const list = "json" in spec ? spec.json : spec.line;
  const value = "json" in spec ? z.any() : z.string();
  return z.object({ ...Object.fromEntries(list.map((f) => [fieldName(f).name, value])), text: z.string() });
}
