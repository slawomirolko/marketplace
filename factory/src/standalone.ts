import fs from "node:fs";
import path from "node:path";
import type { WorkflowSpec } from "./types.ts";

const AGENT_FILE = /(agents\/opencode\/[a-z0-9-]+\.md|plugins\/[a-z0-9-]+\/agents\/[a-z0-9-]+\.md)/;

export function sourceAgentFile(spec: Pick<WorkflowSpec, "source">): string | null {
  return spec.source?.match(AGENT_FILE)?.[1] ?? null;
}

export function invokable(agentFile: string, marketplace: string): boolean {
  if (agentFile.startsWith("plugins/")) return true;
  const file = path.join(marketplace, agentFile);
  if (!fs.existsSync(file)) return false;
  const mode = fs.readFileSync(file, "utf8").match(/^---[\s\S]*?^mode:\s*([a-z]+)/m)?.[1] ?? "all";
  return mode === "primary" || mode === "all";
}

export function standaloneNames(specs: WorkflowSpec[], marketplace: string): Set<string> {
  const owner = new Map(specs.map((s) => [s.name, sourceAgentFile(s)]));
  const inner = new Set<string>();
  for (const spec of specs) {
    for (const node of spec.nodes) {
      if (node.workflow && owner.get(node.workflow) !== null && owner.get(node.workflow) === owner.get(spec.name)) inner.add(node.workflow);
    }
  }
  return new Set(specs.filter((s) => {
    const agent = owner.get(s.name);
    return agent !== null && agent !== undefined && !inner.has(s.name) && invokable(agent, marketplace);
  }).map((s) => s.name));
}
