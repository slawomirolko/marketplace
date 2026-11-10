import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const specDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec");
const SCHEMAS = ["factory-config", "workflow", "usage-record", "cost-footer"];

function createValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const validators = {};
  for (const name of SCHEMAS) {
    const schema = JSON.parse(fs.readFileSync(path.join(specDir, `${name}.schema.json`), "utf8"));
    validators[name] = ajv.compile(schema);
  }
  return validators;
}

const validators = createValidators();

export function validate(schemaName, value) {
  const validator = validators[schemaName];
  if (!validator) throw new Error(`unknown schema ${schemaName}`);
  const valid = validator(value);
  const errors = valid ? [] : validator.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
  if (valid && schemaName === "workflow") errors.push(...workflowGraphErrors(value));
  if (valid && schemaName === "factory-config") errors.push(...configRoleErrors(value));
  return { valid: errors.length === 0, errors };
}

function workflowGraphErrors(workflow) {
  const ids = new Set(workflow.nodes.map((n) => n.id));
  const errors = [];
  if (ids.size !== workflow.nodes.length) errors.push("node ids must be unique");
  if (!ids.has(workflow.entry)) errors.push(`entry '${workflow.entry}' is not a node`);
  const pairs = new Set();
  for (const edge of workflow.edges) {
    if (!ids.has(edge.from)) errors.push(`edge from unknown node '${edge.from}'`);
    if (edge.to !== "END" && !ids.has(edge.to)) errors.push(`edge to unknown node '${edge.to}'`);
    const pair = `${edge.from}->${edge.to}`;
    if (pairs.has(pair)) errors.push(`more than one edge ${pair}; merge their conditions into one edge`);
    pairs.add(pair);
  }
  if (!workflow.edges.some((e) => e.to === "END")) errors.push("no edge reaches END");
  return errors;
}

function configRoleErrors(config) {
  const tiers = new Set(config.tiers);
  return Object.entries(config.roles)
    .filter(([, tier]) => !tiers.has(tier))
    .map(([role, tier]) => `role '${role}' uses unknown tier '${tier}'`);
}
