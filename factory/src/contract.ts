import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const line = z.object({ verdict: z.string(), detail: z.string(), fields: z.array(z.string()), text: z.string() });
const verdictLine = z.object({ pass: z.boolean(), count: z.number(), detail: z.string() });
const list = z.array(z.unknown());

export const PARSER_CONTRACTS: Record<string, z.ZodType> = {
  "text.raw": z.string(),
  "review.findings": z.array(z.object({ location: z.string(), ruleId: z.string(), sev: z.string(), problem: z.string(), fix: z.string(), line: z.string() })),
  "review.verdicts": list,
  "review.rulesCheck": z.object({ noStore: z.boolean(), violations: list, verdicts: list }),
  "sync.comparison": z.object({ classification: z.string(), marketplaceVersion: z.string(), bump: z.string(), nextVersion: z.string(), action: z.string(), report: z.string() }),
  "sync.prLine": z.object({ url: z.string(), branch: z.string(), commit: z.string() }),
  "sync.applied": z.object({ files: z.array(z.string()), version: z.string() }),
  "csync.capabilities": z.object({ capabilities: list, probable: z.array(z.object({ id: z.string(), evidence: z.string() })) }),
  "csync.inventory": z.object({ rows: list }),
  "csync.verdict": z.object({ verdict: z.string(), bump: z.string(), nextVersion: z.string(), action: z.string(), report: z.string() }),
  "csync.staged": z.object({ name: z.string(), stagedPath: z.string(), findings: list, missing: list, entry: z.unknown(), category: z.unknown(), blockers: z.array(z.string()) }),
  "csync.suggestions": z.object({ suggestions: z.array(z.object({ items: z.array(z.string()), verdict: z.string(), evidence: z.string(), loses: z.string(), line: z.string() })) }),
  "plan.draft": z.object({ questions: z.array(z.string()), feature: z.object({ title: z.string(), goal: z.string(), criteria: z.array(z.string()) }).nullable(), tasks: list, text: z.string() }),
  "plan.grill": z.object({ questions: list }),
  "plan.consistency": verdictLine,
  "plan.findings": verdictLine,
  "impl.preflight": line,
  "impl.tests": line,
  "impl.chunks": z.object({ chunks: z.array(z.object({ stack: z.string(), title: z.string(), files: z.array(z.string()), brief: z.string() })) }),
  "impl.chunk": line,
  "impl.dispute": line,
  "impl.style": line,
  "impl.docker": line,
  "impl.runtime": line,
  "impl.delivery": line,
  "wfsync.mapping": line,
  "wfsync.verify": line,
};

export const OPERATION_CONTRACTS: Record<string, z.ZodType> = {
  "builtin.gate": z.object({ enabled: z.boolean(), required: z.boolean() }),
};

export function contractJson(): { parsers: Record<string, unknown>; operations: Record<string, unknown> } {
  const toJson = (contracts: Record<string, z.ZodType>) => Object.fromEntries(Object.entries(contracts).map(([name, schema]) => [name, z.toJSONSchema(schema, { unrepresentable: "any" })]));
  return { parsers: toJson(PARSER_CONTRACTS), operations: toJson(OPERATION_CONTRACTS) };
}

function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) current = current.unwrap() as z.ZodType;
  return current;
}

export function missingField(schema: z.ZodType, segments: string[]): string | null {
  let current = unwrap(schema);
  for (const [index, segment] of segments.entries()) {
    if (current instanceof z.ZodObject) {
      const next = (current.shape as Record<string, z.ZodType>)[segment];
      if (!next) return segments.slice(0, index + 1).join(".");
      current = unwrap(next);
    } else if (current instanceof z.ZodArray) {
      if (segment === "length") return null;
      if (!/^\d+$/.test(segment)) return segments.slice(0, index + 1).join(".");
      current = unwrap(current.element as z.ZodType);
    } else if (current instanceof z.ZodString) {
      return segment === "length" ? null : segments.slice(0, index + 1).join(".");
    } else if (current instanceof z.ZodBoolean || current instanceof z.ZodNumber) {
      return segments.slice(0, index + 1).join(".");
    } else {
      return null;
    }
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(contractJson(), null, 2));
}
