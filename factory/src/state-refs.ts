import Mustache from "mustache";
import { missingField, OPERATION_CONTRACTS, PARSER_CONTRACTS } from "./contract.ts";
import type { WorkflowSpec, WorkflowSpecNode } from "./types.ts";

const CONTEXT_ROOTS = new Set(["answers", "input", "switches"]);
const CONDITION_PATH = /^\s*([a-zA-Z0-9_./-]+)\s*(==|!=|>=|<=|>|<)/;

type Token = [string, string, number, number, Token[]?];

function templateNames(template: string): string[] {
  const names: string[] = [];
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      if (["name", "&", "#", "^"].includes(token[0])) names.push(token[1]);
      if (token[4]) walk(token[4]);
    }
  };
  walk(Mustache.parse(template) as unknown as Token[]);
  return names;
}

function keyOf(node: WorkflowSpecNode): string {
  return node.localId ?? node.id;
}

function nodesInScope(spec: WorkflowSpec, scope: string | undefined): Map<string, WorkflowSpecNode> {
  return new Map(spec.nodes.filter((n) => n.scope === scope).map((n) => [keyOf(n), n]));
}

function agentIds(node: WorkflowSpecNode): string[] | null {
  if (node.agentsFrom) return null;
  if (node.agents?.length) return node.agents.map((a) => a.id);
  return [keyOf(node)];
}

function checkFields(spec: WorkflowSpec, node: WorkflowSpecNode, segments: string[]): string | null {
  if (node.kind === "interrupt") return segments.length === 0 || segments[0] === "answer" ? null : `${keyOf(node)} is a question; it sets only answer`;
  if (node.kind === "call") {
    if (node.scope !== undefined || segments.length === 0) return null;
    const inner = nodesInScope(spec, node.id).get(segments[0]!);
    return inner ? checkFields(spec, inner, segments.slice(1)) : `call ${keyOf(node)} has no step ${segments[0]}`;
  }
  if (node.kind === "llm") {
    if (!node.parse) return `${keyOf(node)} has no parse:, so it stores nothing in state`;
    if (segments.length === 0) return null;
    const ids = agentIds(node);
    if (ids && !ids.includes(segments[0]!)) return `${keyOf(node)} stores results by agent id (${ids.join(", ")}), not ${segments[0]}`;
    const contract = PARSER_CONTRACTS[node.parse];
    const missing = contract ? missingField(contract, segments.slice(1)) : null;
    return missing ? `parser ${node.parse} does not set ${missing}` : null;
  }
  if (node.kind === "script" && node.op) {
    const contract = OPERATION_CONTRACTS[node.op];
    const missing = contract ? missingField(contract, segments) : null;
    return missing ? `operation ${node.op} does not set ${missing}` : null;
  }
  return null;
}

function checkPath(spec: WorkflowSpec, scope: string | undefined, dotted: string): string | null {
  const [root, ...rest] = dotted.split(".");
  if (!root) return null;
  const node = nodesInScope(spec, scope).get(root);
  if (!node) return `no step ${root} in this scope sets state`;
  return checkFields(spec, node, rest);
}

export function stateReferenceErrors(spec: WorkflowSpec): string[] {
  const errors: string[] = [];
  const report = (node: string, where: string, dotted: string, problem: string | null) => {
    if (problem) errors.push(`${spec.name}: ${node} ${where} reads ${dotted}: ${problem}`);
  };
  const templates = (node: WorkflowSpecNode): [string, string][] => [
    ...(node.prompt ? [["prompt", node.prompt] as [string, string]] : []),
    ...(node.question ? [["question", node.question.text] as [string, string], ["question id", node.question.id] as [string, string]] : []),
    ...(node.dirs ?? []).map((d) => ["dirs", d] as [string, string]),
    ...Object.values(node.input ?? {}).map((v) => ["input", v] as [string, string]),
  ];
  for (const node of spec.nodes) {
    for (const [where, template] of templates(node)) {
      let names: string[];
      try {
        names = templateNames(template);
      } catch (error) {
        errors.push(`${spec.name}: ${node.id} ${where}: ${(error as Error).message}`);
        continue;
      }
      for (const name of names.filter((n) => n.startsWith("state."))) report(node.id, where, name, checkPath(spec, node.scope, name.slice("state.".length)));
    }
    for (const [where, dotted] of [["agentsFrom", node.agentsFrom], ["allowedFrom", node.question?.allowedFrom]] as const) {
      if (dotted) report(node.id, where, dotted, checkPath(spec, node.scope, dotted.replace(/^state\./, "")));
    }
  }
  const scopeOf = new Map(spec.nodes.map((n) => [n.id, n.scope]));
  for (const edge of spec.edges) {
    const dotted = edge.when?.match(CONDITION_PATH)?.[1];
    if (!dotted || CONTEXT_ROOTS.has(dotted.split(".")[0]!)) continue;
    report(edge.from, `edge to ${edge.to} (when)`, dotted, checkPath(spec, scopeOf.get(edge.from), dotted));
  }
  return [...new Set(errors)];
}
