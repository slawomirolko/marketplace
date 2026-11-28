import fs from "node:fs";
import path from "node:path";
import Mustache from "mustache";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { operationNamed } from "./ops.ts";
import { buildParser, isParseSpec } from "./parse-spec.ts";
import { validate } from "./spec.ts";
import { readPath, withEach } from "./when.ts";
import type { Agent, AskedBy, AskedByRef, AskedByStep, PromptContext, Tier, Workflow, WorkflowNode, WorkflowSpec, WorkflowSpecEdge, WorkflowSpecNode, WorkflowState } from "./types.ts";

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
    return buildCallNode(workflow, spec);
  }
  if (spec.kind === "subgraph" || spec.kind === "map") {
    throw new Error(`node ${spec.id}: ${spec.kind} ${spec.workflow ?? ""} is not expanded; load it with its workflow directory`);
  }
  const node: WorkflowNode = { id: spec.id, path: `${workflow.name}/${spec.id}`, kind: spec.kind as WorkflowNode["kind"] };
  applyOptionalFields(node, workflow, spec);
  return node;
}

/** A call step runs as a script step that enters the called workflow's scope; its input templates are parsed now so a bad template fails at load time. */
function buildCallNode(workflow: WorkflowSpec, spec: WorkflowSpecNode): WorkflowNode {
  const inputs = Object.fromEntries(Object.entries(spec.input ?? {}).map(([key, template]) => {
    Mustache.parse(template);
    return [key, template];
  }));
  return { id: spec.id, path: `${workflow.name}/${spec.id}`, kind: "script", enterScope: { workflow: spec.workflow ?? "", input: inputs }, ...(spec.maxVisits ? { maxVisits: spec.maxVisits } : {}) };
}

function applyOptionalFields(node: WorkflowNode, workflow: WorkflowSpec, spec: WorkflowSpecNode): void {
  if (spec.scope) {
    node.scope = spec.scope;
  }
  if (spec.localId) {
    node.localId = spec.localId;
  }
  if (spec.role) {
    node.role = spec.role;
  }
  if (spec.agent) {
    node.agent = spec.agent;
  }
  if (spec.skill) {
    node.agent = spec.skill;
  }
  if (spec.tools) {
    node.tools = spec.tools;
  }
  if (spec.dirs) {
    const dirs = spec.dirs.map(render);
    node.dirs = (context) => dirs.map((dir) => dir(context)).filter(Boolean);
  }
  if (spec.workspace) {
    node.workspace = render(spec.workspace);
  }
  if (spec.agents) {
    node.agents = spec.agents.map((agent) => ({ id: agent.id, ...(agent.role ? { role: agent.role } : {}), ...(agent.agent ? { agentName: agent.agent } : {}) }));
  }
  if (spec.question) {
    node.question = spec.question;
  }
  const askedBy = askedByRefs(spec.askedBy).filter(isOwnStep);
  if (askedBy.length) {
    node.askedBy = askedBy.map((id) => `${workflow.name}/${id}`);
  }
  if (spec.turns) {
    node.turns = spec.turns;
  }
  if (spec.askAfterTurn) {
    node.askAfterTurn = spec.askAfterTurn;
  }
  if (spec.maxVisits) {
    node.maxVisits = spec.maxVisits;
  }
  if (spec.parallel) {
    node.parallel = spec.parallel;
  }
  if (spec.prompt) {
    node.prompt = render(spec.prompt);
  }
  if (spec.agentsFrom) {
    node.agentsFrom = agentsFromPath(spec.agentsFrom);
  }
  if (spec.freshResults) {
    node.freshResults = true;
  }
  if (isParseSpec(spec.parse)) {
    node.parse = buildParser(spec.parse);
  } else if (spec.parse) {
    throw new Error(`node ${spec.id}: unknown parser ${JSON.stringify(spec.parse)}; use text, {json: [...]} or {line: [...]}`);
  }
  if (spec.op) {
    const operation = operationNamed(spec.op);
    if (!operation) {
      throw new Error(`node ${spec.id}: unknown operation ${spec.op}`);
    }
    const args = spec.with ?? {};
    node.script = (context) => operation({ ...context, args });
  }
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

/** The nodes, edges, entry and roles of a workflow while its subgraph, call and group steps are inlined one by one. */
interface Expansion {
  nodes: WorkflowSpecNode[];
  edges: WorkflowSpecEdge[];
  entry: string;
  roles: Record<string, string>;
}

/** What inlining a subgraph or call leaves for the caller to wire: the prefixed sub-entry, the outer exits of the step and the inner edges already joined to them. */
interface InlinedSteps {
  subEntry: string;
  exits: WorkflowSpecEdge[];
  inner: WorkflowSpecEdge[];
}

function expandSubgraphs(spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, seen: string[] = []): WorkflowSpec {
  if (seen.includes(spec.name)) {
    throw new Error(`subgraph cycle: ${[...seen, spec.name].join(" -> ")}`);
  }
  const expansion: Expansion = { nodes: [], edges: [...spec.edges], entry: spec.entry, roles: { ...(spec.roles ?? {}) } };
  const chain = [...seen, spec.name];
  for (const node of spec.nodes) {
    switch (node.kind) {
      case "group":
        expandGroup(node, spec, specs, chain, expansion);
        break;
      case "call":
        expandCall(node, spec, specs, chain, expansion);
        break;
      case "subgraph":
        expandSubgraph(node, spec, specs, chain, expansion);
        break;
      default:
        expansion.nodes.push(node);
    }
  }
  return { ...spec, roles: expansion.roles, entry: expansion.entry, nodes: expansion.nodes.map((inlined) => resolveAskedBy(inlined, spec)), edges: expansion.edges };
}

/** A group inlines another workflow with its node ids unchanged and its END edges joined to the group step's exits. */
function expandGroup(node: WorkflowSpecNode, spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, chain: string[], expansion: Expansion): void {
  const groupSpec = node.workflow ? specs.get(node.workflow) : undefined;
  if (!groupSpec) {
    throw new Error(`node ${node.id}: unknown group workflow ${node.workflow}`);
  }
  const group = expandSubgraphs(groupSpec, specs, chain);
  const clash = group.nodes.find((inner) => spec.nodes.some((other) => other.id === inner.id) || expansion.nodes.some((other) => other.id === inner.id));
  if (clash) {
    throw new Error(`group ${node.id}: node id ${clash.id} is used twice; a group keeps its node ids`);
  }
  expansion.nodes = expansion.nodes.concat(group.nodes);
  adoptRoles(expansion.roles, group.roles);
  const exits = expansion.edges.filter((edge) => edge.from === node.id);
  const inner = group.edges.flatMap((edge) => {
    if (edge.to !== "END") {
      return [edge];
    }
    return joinExits(edge, edge.from, exits, (exit) => `group ${node.id}: both the inner edge from ${edge.from} and the outer edge to ${exit.to} have a condition`);
  });
  expansion.edges = expansion.edges.filter((edge) => edge.from !== node.id).map((edge) => (edge.to === node.id ? { ...edge, to: group.entry } : edge)).concat(inner);
  if (expansion.entry === node.id) {
    expansion.entry = group.entry;
  }
}

/** A call inlines another workflow in its own state scope; the call step stays in place to enter that scope. */
function expandCall(node: WorkflowSpecNode, spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, chain: string[], expansion: Expansion): void {
  const { subEntry, exits, inner } = inlineSteps(node, spec, specs, chain, expansion, true);
  if (exits.some((exit) => exit.when)) {
    throw new Error(`call ${node.id}: its exits need no condition`);
  }
  expansion.nodes.push({ id: node.id, kind: "call", workflow: node.workflow!, input: node.input ?? {}, ...(node.maxVisits ? { maxVisits: node.maxVisits } : {}) });
  expansion.edges = expansion.edges.filter((edge) => edge.from !== node.id).concat([{ from: node.id, to: subEntry }], inner);
}

/** A subgraph inlines another workflow that shares its parent's state keys; with enabledWhen the subgraph step stays as a gate that enters or skips it. */
function expandSubgraph(node: WorkflowSpecNode, spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, chain: string[], expansion: Expansion): void {
  const { subEntry, exits, inner } = inlineSteps(node, spec, specs, chain, expansion, false);
  if (node.enabledWhen) {
    const gate = [{ from: node.id, to: subEntry, when: node.enabledWhen }, ...exits.map((exit) => ({ from: node.id, to: exit.to, when: negateWhen(node.enabledWhen!) }))];
    expansion.edges = expansion.edges.filter((edge) => edge.from !== node.id).concat(gate, inner);
    return;
  }
  expansion.edges = expansion.edges.filter((edge) => edge.from !== node.id).map((edge) => (edge.to === node.id ? { ...edge, to: subEntry } : edge)).concat(inner);
  if (expansion.entry === node.id) {
    expansion.entry = subEntry;
  }
}

/** Adds the prefixed nodes of a subgraph or call to the expansion and joins its END (and, for a call, FINISH) edges to the step's exits. */
function inlineSteps(node: WorkflowSpecNode, spec: WorkflowSpec, specs: Map<string, WorkflowSpec>, chain: string[], expansion: Expansion, scoped: boolean): InlinedSteps {
  const subSpec = node.workflow ? specs.get(node.workflow) : undefined;
  if (!subSpec) {
    throw new Error(`node ${node.id}: unknown subgraph workflow ${node.workflow}`);
  }
  const sub = expandSubgraphs(subSpec, specs, chain);
  const prefix = (id: string) => `${node.id}/${id}`;
  if (!scoped) {
    const clash = sub.nodes.find((inner) => !inner.scope && (spec.nodes.some((other) => other.id === (inner.localId ?? inner.id)) || expansion.nodes.some((other) => !other.scope && (other.localId ?? other.id) === (inner.localId ?? inner.id))));
    if (clash) {
      throw new Error(`subgraph ${node.id}: step ${clash.localId ?? clash.id} is used twice; a subgraph shares its state keys with its parent`);
    }
  }
  expansion.nodes = expansion.nodes.concat(sub.nodes.map((inner) => ({ ...prefixAskedBy(inner, prefix), id: prefix(inner.id), ...(scoped ? { scope: inner.scope ? prefix(inner.scope) : node.id } : {}), ...(scoped || !inner.scope ? { localId: inner.localId ?? inner.id } : {}) })));
  adoptRoles(expansion.roles, sub.roles);
  const exits = expansion.edges.filter((edge) => edge.from === node.id);
  if (node.enabledWhen) {
    if (exits.some((exit) => exit.when)) {
      throw new Error(`subgraph ${node.id}: a switched subgraph (enabledWhen) needs exits without conditions`);
    }
    expansion.nodes.push({ id: node.id, kind: "script", op: "builtin.gate", with: { subgraph: node.workflow, when: node.enabledWhen, ...(node.required ? { required: true } : {}) } });
  }
  const inner = sub.edges.flatMap((edge) => {
    if (edge.to === "FINISH" && !scoped) {
      return [{ ...edge, from: prefix(edge.from) }];
    }
    if (edge.to !== "END" && edge.to !== "FINISH") {
      return [{ ...edge, from: prefix(edge.from), to: prefix(edge.to) }];
    }
    return joinExits(edge, prefix(edge.from), exits, () => `subgraph ${node.id}: both the inner edge and the outer edge have a condition`);
  });
  return { subEntry: prefix(sub.entry), exits, inner };
}

/** Replaces an inner edge that leaves the inlined workflow by one edge per outer exit; only one of the two may carry a condition. */
function joinExits(innerEdge: WorkflowSpecEdge, from: string, exits: WorkflowSpecEdge[], conflict: (exit: WorkflowSpecEdge) => string): WorkflowSpecEdge[] {
  return exits.map((exit) => {
    if (innerEdge.when && exit.when) {
      throw new Error(conflict(exit));
    }
    const when = innerEdge.when ?? exit.when;
    return { from, to: exit.to, ...(when ? { when } : {}) };
  });
}

/** Inlined roles never override a role the inlining workflow already has. */
function adoptRoles(roles: Record<string, string>, inlined: Record<string, string> | undefined): void {
  for (const [role, tier] of Object.entries(inlined ?? {})) {
    roles[role] ??= tier;
  }
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
    ...(spec.inputs ? { inputs: spec.inputs } : {}),
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
