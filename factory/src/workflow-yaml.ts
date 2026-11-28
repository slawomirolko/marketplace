import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { operationNamed } from "./ops.ts";
import { buildParser, isParseSpec } from "./parse-spec.ts";
import { validate } from "./spec.ts";
import type { Agent, AskedBy, AskedByRef, AskedByStep, PromptContext, Tier, Workflow, WorkflowNode, WorkflowSpec, WorkflowSpecNode, WorkflowState } from "./types.ts";

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

function agentsFromPath(dotted: string): (state: WorkflowState | undefined) => Agent[] {
  const statePath = dotted.replace(/^state\./, "");
  return (state) => {
    const agents = readPath(state ?? {}, statePath);
    if (!Array.isArray(agents)) throw new Error(`agentsFrom ${dotted} is not a list`);
    return agents as Agent[];
  };
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

function render(template: string): (context: PromptContext) => string {
  Mustache.parse(template);
  return (context) => Mustache.render(template, withEach(context));
}

export function askedByRefs(askedBy: AskedBy | undefined): AskedByRef[] {
  if (askedBy === undefined) return [];
  return Array.isArray(askedBy) ? askedBy : [askedBy];
}

function isOwnStep(ref: AskedByRef): ref is string {
  return typeof ref === "string";
}

/** Rewrites the askedBy of an inlined node: its own step ids get the inlining prefix, steps of other workflows wait for a workflow that inlines them. */
function prefixAskedBy(node: WorkflowSpecNode, prefix: (id: string) => string): WorkflowSpecNode {
  if (node.askedBy === undefined) return node;
  return { ...node, askedBy: askedByRefs(node.askedBy).map((ref) => (isOwnStep(ref) ? prefix(ref) : ref)) };
}

/** The step id, in this workflow's own id space, of a step of another workflow: this workflow itself, or a subgraph, call or group of it that inlines that workflow. */
function resolveStep(spec: WorkflowSpec, ref: AskedByStep): string | null {
  if (spec.name === ref.workflow) return ref.step;
  const inliner = spec.nodes.find((n) => (n.kind === "subgraph" || n.kind === "call" || n.kind === "group") && n.workflow === ref.workflow);
  if (!inliner) return null;
  return inliner.kind === "group" ? ref.step : `${inliner.id}/${ref.step}`;
}

function resolveAskedBy(node: WorkflowSpecNode, spec: WorkflowSpec): WorkflowSpecNode {
  if (node.askedBy === undefined) return node;
  return { ...node, askedBy: askedByRefs(node.askedBy).map((ref) => (isOwnStep(ref) ? ref : (resolveStep(spec, ref) ?? ref))) };
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
  if (spec.workspace) node.workspace = render(spec.workspace);
  if (spec.agents) node.agents = spec.agents.map((a) => ({ id: a.id, ...(a.role ? { role: a.role } : {}), ...(a.agent ? { agentName: a.agent } : {}) }));
  if (spec.question) node.question = spec.question;
  const askedBy = askedByRefs(spec.askedBy).filter(isOwnStep);
  if (askedBy.length) node.askedBy = askedBy.map((id) => `${workflow.name}/${id}`);
  if (spec.turns) node.turns = spec.turns;
  if (spec.askAfterTurn) node.askAfterTurn = spec.askAfterTurn;
  if (spec.maxVisits) node.maxVisits = spec.maxVisits;
  if (spec.parallel) node.parallel = spec.parallel;
  if (spec.prompt) node.prompt = render(spec.prompt);
  if (spec.agentsFrom) node.agentsFrom = agentsFromPath(spec.agentsFrom);
  if (spec.freshResults) node.freshResults = true;
  if (isParseSpec(spec.parse)) node.parse = buildParser(spec.parse);
  else if (spec.parse) throw new Error(`node ${spec.id}: unknown parser ${JSON.stringify(spec.parse)}; use text, {json: [...]} or {line: [...]}`);
  if (spec.op) {
    const operation = operationNamed(spec.op);
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
    if (node.askedBy !== undefined) {
      if (node.kind !== "interrupt") throw new Error(`${file}: node ${node.id}: askedBy is only for interrupt steps`);
      for (const ref of askedByRefs(node.askedBy).filter(isOwnStep)) {
        if (spec.nodes.find((n) => n.id === ref)?.kind !== "llm") throw new Error(`${file}: node ${node.id}: askedBy ${ref} is not an llm step of this workflow`);
      }
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
    if (node.kind !== "subgraph" && node.kind !== "call" && node.kind !== "group") {
      nodes.push(node);
      continue;
    }
    if (node.kind === "group") {
      const groupSpec = node.workflow ? specs.get(node.workflow) : undefined;
      if (!groupSpec) throw new Error(`node ${node.id}: unknown group workflow ${node.workflow}`);
      const group = expandSubgraphs(groupSpec, specs, [...seen, spec.name]);
      const clash = group.nodes.find((n) => spec.nodes.some((o) => o.id === n.id) || nodes.some((o) => o.id === n.id));
      if (clash) throw new Error(`group ${node.id}: node id ${clash.id} is used twice; a group keeps its node ids`);
      nodes = nodes.concat(group.nodes);
      for (const [role, tier] of Object.entries(group.roles ?? {})) roles[role] ??= tier;
      const exits = edges.filter((e) => e.from === node.id);
      const inner = group.edges.flatMap((e) => {
        if (e.to !== "END") return [e];
        return exits.map((x) => {
          if (e.when && x.when) throw new Error(`group ${node.id}: both the inner edge from ${e.from} and the outer edge to ${x.to} have a condition`);
          const when = e.when ?? x.when;
          return { from: e.from, to: x.to, ...(when ? { when } : {}) };
        });
      });
      edges = edges.filter((e) => e.from !== node.id).map((e) => (e.to === node.id ? { ...e, to: group.entry } : e)).concat(inner);
      if (entry === node.id) entry = group.entry;
      continue;
    }
    const subSpec = node.workflow ? specs.get(node.workflow) : undefined;
    if (!subSpec) throw new Error(`node ${node.id}: unknown subgraph workflow ${node.workflow}`);
    const sub = expandSubgraphs(subSpec, specs, [...seen, spec.name]);
    const prefix = (id: string) => `${node.id}/${id}`;
    const scoped = node.kind === "call";
    if (!scoped) {
      const clash = sub.nodes.find((n) => !n.scope && (spec.nodes.some((o) => o.id === (n.localId ?? n.id)) || nodes.some((o) => !o.scope && (o.localId ?? o.id) === (n.localId ?? n.id))));
      if (clash) throw new Error(`subgraph ${node.id}: step ${clash.localId ?? clash.id} is used twice; a subgraph shares its state keys with its parent`);
    }
    nodes = nodes.concat(sub.nodes.map((n) => ({ ...prefixAskedBy(n, prefix), id: prefix(n.id), ...(scoped ? { scope: n.scope ? prefix(n.scope) : node.id } : {}), ...(scoped || !n.scope ? { localId: n.localId ?? n.id } : {}) })));
    for (const [role, tier] of Object.entries(sub.roles ?? {})) roles[role] ??= tier;
    const exits = edges.filter((e) => e.from === node.id);
    if (node.enabledWhen) {
      if (exits.some((x) => x.when)) throw new Error(`subgraph ${node.id}: a switched subgraph (enabledWhen) needs exits without conditions`);
      nodes.push({ id: node.id, kind: "script", op: "builtin.gate", with: { subgraph: node.workflow, when: node.enabledWhen, ...(node.required ? { required: true } : {}) } });
    }
    const inner = sub.edges.flatMap((e) => {
      if (e.to === "FINISH" && !scoped) return [{ ...e, from: prefix(e.from) }];
      if (e.to !== "END" && e.to !== "FINISH") return [{ ...e, from: prefix(e.from), to: prefix(e.to) }];
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
  return { ...spec, roles, entry, nodes: nodes.map((n) => resolveAskedBy(n, spec)), edges };
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
    edges: spec.edges.map((e) => (e.to === "FINISH" ? { ...e, to: "END" } : e)),
    maxCycleIterations: spec.limits?.maxCycleIterations ?? 3,
    ...(spec.source ? { source: spec.source } : {}),
    ...(spec.roles ? { roles: spec.roles as Record<string, Tier> } : {}),
  };
}

export function loadWorkflowFile(file: string): Workflow {
  return buildWorkflow(readSpec(file), file);
}

/** The workflow files of a folder, sorted: names ending in .yaml or .yml. */
export function listWorkflowFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).sort();
}

function readSpecDir(dir: string): { specs: Map<string, WorkflowSpec>; files: Map<string, string> } {
  const specs = new Map<string, WorkflowSpec>();
  const files = new Map<string, string>();
  for (const file of listWorkflowFiles(dir)) {
    const full = path.join(dir, file);
    const spec = readSpec(full);
    if (specs.has(spec.name)) throw new Error(`${file}: workflow name ${spec.name} is used twice`);
    specs.set(spec.name, spec);
    files.set(spec.name, full);
  }
  for (const [name, spec] of specs) {
    for (const node of spec.nodes) {
      for (const ref of askedByRefs(node.askedBy)) {
        if (isOwnStep(ref)) continue;
        const target = specs.get(ref.workflow);
        if (!target) throw new Error(`${path.basename(files.get(name) ?? name)}: node ${node.id}: askedBy names unknown workflow ${ref.workflow}`);
        if (target.nodes.find((n) => n.id === ref.step)?.kind !== "llm") throw new Error(`${path.basename(files.get(name) ?? name)}: node ${node.id}: askedBy ${ref.workflow}/${ref.step} is not an llm step of that workflow`);
      }
    }
  }
  return { specs, files };
}

export function expandWorkflowDir(dir: string): Map<string, WorkflowSpec> {
  const { specs } = readSpecDir(dir);
  return new Map([...specs].map(([name, spec]) => [name, expandSubgraphs(spec, specs)]));
}

export function loadWorkflowDir(dir: string): Map<string, Workflow> {
  const { specs, files } = readSpecDir(dir);
  const workflows = new Map<string, Workflow>();
  for (const [name, spec] of specs) workflows.set(name, buildWorkflow(expandSubgraphs(spec, specs), files.get(name) ?? name));
  return workflows;
}

export function loadWorkflowSpecs(dir: string): WorkflowSpec[] {
  return listWorkflowFiles(dir).map((f) => readSpec(path.join(dir, f)));
}
