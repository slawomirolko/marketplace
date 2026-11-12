import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { OPERATIONS, PARSERS } from "./ops.ts";
import { validate } from "./spec.ts";
import type { Agent, PromptContext, Tier, Workflow, WorkflowNode, WorkflowSpec, WorkflowSpecNode, WorkflowState } from "./types.ts";

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

function literal(text: string): string | number | boolean {
  const trimmed = text.trim();
  const quoted = trimmed.match(/^(["'])(.*)\1$/);
  if (quoted?.[2] !== undefined) return quoted[2];
  if (trimmed === "true" || trimmed === "false") return trimmed === "true";
  const number = Number(trimmed);
  if (Number.isNaN(number)) throw new Error(`condition value ${trimmed} is not a number, boolean or quoted string`);
  return number;
}

export function evaluateWhen(when: string, state: Record<string, unknown>): boolean {
  const match = when.trim().match(CONDITION);
  if (!match?.[1] || !match[2] || match[3] === undefined) throw new Error(`condition '${when}' must be '<state path> <operator> <value>'`);
  const raw = readPath(state, match[1]);
  if (raw === undefined) throw new Error(`condition '${when}': ${match[1]} is not set`);
  const left = Array.isArray(raw) ? raw.length : raw;
  const right = literal(match[3]);
  switch (match[2]) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
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

function agentsFromPath(dotted: string): (state: WorkflowState | undefined) => Agent[] {
  const statePath = dotted.replace(/^state\./, "");
  return (state) => {
    const agents = readPath(state ?? {}, statePath);
    if (!Array.isArray(agents)) throw new Error(`agentsFrom ${dotted} is not a list`);
    return agents as Agent[];
  };
}

function render(template: string): (context: PromptContext) => string {
  Mustache.parse(template);
  return (context) => Mustache.render(template, context);
}

function buildNode(workflow: WorkflowSpec, spec: WorkflowSpecNode): WorkflowNode {
  if (spec.kind === "call") {
    const inputs = Object.fromEntries(Object.entries(spec.input ?? {}).map(([k, v]) => { Mustache.parse(v); return [k, v]; }));
    return { id: spec.id, path: `${workflow.name}/${spec.id}`, kind: "script", enterScope: { workflow: spec.workflow ?? "", input: inputs }, ...(spec.maxVisits ? { maxVisits: spec.maxVisits } : {}) };
  }
  if (spec.kind === "subgraph" || spec.kind === "map") throw new Error(`node ${spec.id}: ${spec.kind} ${spec.workflow ?? ""} is not expanded; load it with its workflow directory`);
  const node: WorkflowNode = { id: spec.id, path: `${workflow.name}/${spec.id}`, kind: spec.kind as WorkflowNode["kind"] };
  if (spec.scope) node.scope = spec.scope;
  if (spec.localId) node.localId = spec.localId;
  if (spec.role) node.role = spec.role;
  if (spec.agent) node.agent = spec.agent;
  if (spec.skill) node.agent = spec.skill;
  if (spec.tools) node.tools = spec.tools;
  if (spec.dirs) {
    const dirs = spec.dirs.map(render);
    node.dirs = (context) => dirs.map((dir) => dir(context)).filter(Boolean);
  }
  if (spec.agents) node.agents = spec.agents.map((a) => ({ id: a.id, ...(a.role ? { role: a.role } : {}), ...(a.agent ? { agentName: a.agent } : {}) }));
  if (spec.question) node.question = spec.question;
  if (spec.turns) node.turns = spec.turns;
  if (spec.askAfterTurn) node.askAfterTurn = spec.askAfterTurn;
  if (spec.maxVisits) node.maxVisits = spec.maxVisits;
  if (spec.parallel) node.parallel = spec.parallel;
  if (spec.prompt) node.prompt = render(spec.prompt);
  if (spec.agentsFrom) node.agentsFrom = agentsFromPath(spec.agentsFrom);
  if (spec.parse) {
    const parser = PARSERS[spec.parse];
    if (!parser) throw new Error(`node ${spec.id}: unknown parser ${spec.parse}`);
    node.parse = parser;
  }
  if (spec.op) {
    const operation = OPERATIONS[spec.op];
    if (!operation) throw new Error(`node ${spec.id}: unknown operation ${spec.op}`);
    const args = spec.with ?? {};
    node.script = (context) => operation({ ...context, args });
  }
  return node;
}

function readSpec(file: string): WorkflowSpec {
  let spec: WorkflowSpec;
  try {
    spec = parseYaml(fs.readFileSync(file, "utf8")) as WorkflowSpec;
  } catch (error) {
    if (error instanceof YAMLParseError) throw new Error(`${file}: invalid YAML: ${error.message}`);
    throw error;
  }
  const result = validate("workflow", spec);
  if (!result.valid) throw new Error(`${file}: ${result.errors.join("; ")}`);
  for (const node of spec.nodes) {
    if (node.kind === "llm" && node.role && !(spec.roles ?? {})[node.role]) throw new Error(`${file}: node ${node.id}: role ${node.role} has no tier in roles`);
    for (const agent of node.agents ?? []) {
      if (agent.role && !(spec.roles ?? {})[agent.role]) throw new Error(`${file}: node ${node.id}: role ${agent.role} has no tier in roles`);
    }
  }
  return spec;
}

export function negateWhen(when: string): string {
  const match = when.match(/^(\S+)\s*(==|!=)\s*(.+)$/);
  if (!match) throw new Error(`enabledWhen '${when}' must use == or !=`);
  return `${match[1]} ${match[2] === "==" ? "!=" : "=="} ${match[3]}`;
}

function expandSubgraphs(spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, seen: string[] = []): WorkflowSpec {
  if (seen.includes(spec.name)) throw new Error(`subgraph cycle: ${[...seen, spec.name].join(" -> ")}`);
  let nodes: WorkflowSpecNode[] = [];
  let edges = [...spec.edges];
  let entry = spec.entry;
  const roles = { ...(spec.roles ?? {}) };
  for (const node of spec.nodes) {
    if (node.kind !== "subgraph" && node.kind !== "call") {
      nodes.push(node);
      continue;
    }
    const subSpec = node.workflow ? specs.get(node.workflow) : undefined;
    if (!subSpec) throw new Error(`node ${node.id}: unknown subgraph workflow ${node.workflow}`);
    const sub = expandSubgraphs(subSpec, specs, [...seen, spec.name]);
    const prefix = (id: string) => `${node.id}/${id}`;
    const scoped = node.kind === "call";
    nodes = nodes.concat(sub.nodes.map((n) => ({ ...n, id: prefix(n.id), ...(scoped ? { scope: n.scope ? prefix(n.scope) : node.id, localId: n.localId ?? n.id } : {}) })));
    for (const [role, tier] of Object.entries(sub.roles ?? {})) roles[role] ??= tier;
    const exits = edges.filter((e) => e.from === node.id);
    if (node.enabledWhen) {
      if (exits.some((x) => x.when)) throw new Error(`subgraph ${node.id}: a switched subgraph (enabledWhen) needs exits without conditions`);
      nodes.push({ id: node.id, kind: "script", op: "builtin.gate", with: { subgraph: node.workflow, when: node.enabledWhen } });
    }
    const inner = sub.edges.flatMap((e) => {
      if (e.to !== "END") return [{ ...e, from: prefix(e.from), to: prefix(e.to) }];
      return exits.map((x) => {
        if (e.when && x.when) throw new Error(`subgraph ${node.id}: both the inner edge and the outer edge have a condition`);
        const when = e.when ?? x.when;
        return { from: prefix(e.from), to: x.to, ...(when ? { when } : {}) };
      });
    });
    if (scoped) {
      if (exits.some((x) => x.when)) throw new Error(`call ${node.id}: its exits need no condition`);
      nodes.push({ id: node.id, kind: "call", workflow: node.workflow!, input: node.input ?? {}, ...(node.maxVisits ? { maxVisits: node.maxVisits } : {}) });
      edges = edges.filter((e) => e.from !== node.id).concat([{ from: node.id, to: prefix(sub.entry) }], inner);
      continue;
    }
    if (node.enabledWhen) {
      const gate = [{ from: node.id, to: prefix(sub.entry), when: node.enabledWhen }, ...exits.map((x) => ({ from: node.id, to: x.to, when: negateWhen(node.enabledWhen!) }))];
      edges = edges.filter((e) => e.from !== node.id).concat(gate, inner);
      continue;
    }
    edges = edges.filter((e) => e.from !== node.id).map((e) => (e.to === node.id ? { ...e, to: prefix(sub.entry) } : e)).concat(inner);
    if (entry === node.id) entry = prefix(sub.entry);
  }
  return { ...spec, roles, entry, nodes, edges };
}

function buildWorkflow(spec: WorkflowSpec, file: string): Workflow {
  let nodes: WorkflowNode[];
  try {
    nodes = spec.nodes.map((n) => buildNode(spec, n));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`);
  }
  return {
    name: spec.name,
    version: spec.version,
    entry: spec.entry,
    nodes,
    edges: spec.edges,
    maxCycleIterations: spec.limits?.maxCycleIterations ?? 3,
    ...(spec.source ? { source: spec.source } : {}),
    ...(spec.roles ? { roles: spec.roles as Record<string, Tier> } : {}),
  };
}

export function loadWorkflowFile(file: string): Workflow {
  return buildWorkflow(readSpec(file), file);
}

export function loadWorkflowDir(dir: string): Map<string, Workflow> {
  const specs = new Map<string, WorkflowSpec>();
  const files = new Map<string, string>();
  for (const file of fs.readdirSync(dir).filter((f) => /.ya?ml$/.test(f)).sort()) {
    const full = path.join(dir, file);
    const spec = readSpec(full);
    if (specs.has(spec.name)) throw new Error(`${file}: workflow name ${spec.name} is used twice`);
    specs.set(spec.name, spec);
    files.set(spec.name, full);
  }
  const workflows = new Map<string, Workflow>();
  for (const [name, spec] of specs) workflows.set(name, buildWorkflow(expandSubgraphs(spec, specs), files.get(name) ?? name));
  return workflows;
}

export function loadWorkflowSpecs(dir: string): WorkflowSpec[] {
  return fs.readdirSync(dir).filter((f) => /.ya?ml$/.test(f)).sort().map((f) => readSpec(path.join(dir, f)));
}
