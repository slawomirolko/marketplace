import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const OPERATION_CONTRACTS: Record<string, z.ZodType> = {
  "builtin.gate": z.object({ enabled: z.boolean(), required: z.boolean() }),
  "list.count": z.object({ counts: z.array(z.object({ value: z.string(), count: z.number() })), total: z.number() }),
};

export function contractJson(): { operations: Record<string, unknown> } {
  const toJson = (contracts: Record<string, z.ZodType>) => Object.fromEntries(Object.entries(contracts).map(([name, schema]) => [name, z.toJSONSchema(schema, { unrepresentable: "any" })]));
  return { operations: toJson(OPERATION_CONTRACTS) };
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
