import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validate } from "./spec.ts";
import { loadWorkflowDir } from "./workflow-yaml.ts";
import { describeAgent } from "./marketplace-agents.ts";
import { OPERATIONS, PARSERS } from "./ops.ts";
import type { WorkflowSpec } from "./types.ts";

export interface WorkflowCheck {
  ok: boolean;
  errors: string[];
  workflows: number;
}

export function checkWorkflows(dir: string, agentExists: (name: string) => boolean = (name) => describeAgent(name) !== null): WorkflowCheck {
  const errors: string[] = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  const specs: WorkflowSpec[] = [];
  for (const file of files) {
    try {
      const spec = parseYaml(fs.readFileSync(path.join(dir, file), "utf8")) as WorkflowSpec;
      const result = validate("workflow", spec);
      if (!result.valid) errors.push(...result.errors.map((e) => `${file}: ${e}`));
      if (spec.name !== file.replace(/\.yaml$/, "")) errors.push(`${file}: name ${spec.name} does not match the file name`);
      if (!spec.description) errors.push(`${file}: workflow has no description`);
      for (const node of spec.nodes ?? []) {
        if (!node.description) errors.push(`${file}: node ${node.id} has no description`);
        if (node.op && !OPERATIONS[node.op]) errors.push(`${file}: node ${node.id}: unknown op ${node.op} (needs engine op)`);
        if (node.parse && !PARSERS[node.parse]) errors.push(`${file}: node ${node.id}: unknown parser ${node.parse} (needs engine parser)`);
        for (const name of [node.agent, node.skill, ...(node.agents ?? []).map((a) => a.agent)]) {
          if (typeof name === "string" && !agentExists(name)) errors.push(`${file}: node ${node.id}: agent or skill ${name} is not in the marketplace`);
        }
      }
      for (const edge of spec.edges ?? []) {
        const branching = (spec.edges ?? []).filter((e) => e.from === edge.from).length > 1;
        if (branching && !edge.description) errors.push(`${file}: edge ${edge.from} -> ${edge.to} branches without a description`);
      }
      specs.push(spec);
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    loadWorkflowDir(dir);
  } catch (error) {
    errors.push(`load: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: errors.length === 0, errors, workflows: specs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "workflows"));
  const result = checkWorkflows(dir);
  for (const error of result.errors) console.error(error);
  console.log(result.ok ? `workflows ok: ${result.workflows} files in ${dir}` : `${result.errors.length} problems in ${dir}`);
  process.exitCode = result.ok ? 0 : 1;
}
