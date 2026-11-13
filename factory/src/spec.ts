import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import addFormatsPlugin from "ajv-formats";
import type { FactoryConfigFile, WorkflowSpec } from "./types.ts";

export type SchemaName = "factory-config" | "workflow" | "usage-record" | "cost-footer";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const specDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec");
const SCHEMAS: SchemaName[] = ["factory-config", "workflow", "usage-record", "cost-footer"];
const addFormats = addFormatsPlugin.default;

function createValidators(): Map<string, ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const validators = new Map<string, ValidateFunction>();
  for (const name of SCHEMAS) {
    const schema = JSON.parse(fs.readFileSync(path.join(specDir, `${name}.schema.json`), "utf8")) as object;
    validators.set(name, ajv.compile(schema));
  }
  return validators;
}

const validators = createValidators();

export function validate(schemaName: string, value: unknown): ValidationResult {
  const validator = validators.get(schemaName);
  if (!validator) throw new Error(`unknown schema ${schemaName}`);
  const valid = validator(value);
  const errors = valid ? [] : (validator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`);
  if (valid && schemaName === "workflow") errors.push(...workflowGraphErrors(value as WorkflowSpec));
  if (valid && schemaName === "factory-config") errors.push(...configRoleErrors(value as FactoryConfigFile));
  return { valid: errors.length === 0, errors };
}

function workflowGraphErrors(workflow: WorkflowSpec): string[] {
  const ids = new Set(workflow.nodes.map((n) => n.id));
  const errors: string[] = [];
  if (ids.size !== workflow.nodes.length) errors.push("node ids must be unique");
  if (!ids.has(workflow.entry)) errors.push(`entry '${workflow.entry}' is not a node`);
  const pairs = new Set<string>();
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from)) errors.push(`edge from unknown node '${edge.from}'`);
    if (edge.to !== "END" && edge.to !== "FINISH" && !ids.has(edge.to)) errors.push(`edge to unknown node '${edge.to}'`);
    const pair = `${edge.from}->${edge.to}`;
    if (pairs.has(pair)) errors.push(`more than one edge ${pair}; merge their conditions into one edge`);
    pairs.add(pair);
  }
  if (!workflow.edges.some((e) => e.to === "END")) errors.push("no edge reaches END");
  return errors;
}

function configRoleErrors(config: FactoryConfigFile): string[] {
  const tiers = new Set(config.tiers);
  return Object.entries(config.roles)
    .filter(([, tier]) => !tiers.has(tier))
    .map(([role, tier]) => `role '${role}' uses unknown tier '${tier}'`);
}
