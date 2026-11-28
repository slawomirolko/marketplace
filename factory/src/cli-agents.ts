/** How each agent CLI receives a neutral agent definition: Claude Code as an --agents JSON file, OpenCode as an agent Markdown file in its own config folder. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentDefinition } from "./marketplace-agents.ts";
import type { AgentDefinition } from "./marketplace-agents.ts";
import type { AgentTool } from "./types.ts";

/** The Claude Code tools behind each neutral agent tool. */
const CLAUDE_TOOLS: Record<AgentTool, string[]> = { read: ["Read", "Grep", "Glob"], edit: ["Edit", "Write"], bash: ["Bash"] };
const CLAUDE_ALL_TOOLS = ["Read", "Grep", "Glob", "Skill", "Edit", "Write", "Bash", "WebFetch", "WebSearch", "Agent", "Task", "NotebookEdit"];

export function claudeTools(tools: AgentTool[]): { allowed: string[]; disallowed: string[] } {
  const allowed = [...new Set(tools.flatMap((tool) => CLAUDE_TOOLS[tool]))];
  return { allowed, disallowed: CLAUDE_ALL_TOOLS.filter((tool) => !allowed.includes(tool)) };
}

export function claudeAgentsFile(agent: string | AgentDefinition, tools: AgentTool[] = ["read"]): string {
  const definition = agentDefinition(agent);
  const file = path.join(freshDir("factory-agent-"), `claude-${definition.name}.json`);
  fs.writeFileSync(file, JSON.stringify({ [definition.name]: { description: definition.description, prompt: definition.prompt, tools: claudeTools(tools).allowed } }));
  return file;
}

export function opencodeConfigDir(agent: string | AgentDefinition, tools: AgentTool[] = ["read"], dirs: string[] = []): string {
  const definition = agentDefinition(agent);
  const dir = freshDir("factory-opencode-");
  const target = path.join(dir, "agents", `${definition.name}.md`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (definition.skillDir || definition.pluginRoot || !definition.frontmatter) {
    const allow = (tool: AgentTool) => (tools.includes(tool) ? "allow" : "deny");
    const front = { description: definition.description, mode: "subagent", permission: { edit: allow("edit"), bash: allow("bash"), task: "deny", webfetch: "deny", websearch: "deny", external_directory: externalDirectoryPermission(dirs) } };
    fs.writeFileSync(target, `---\n${JSON.stringify(front)}\n---\n\n${definition.prompt}\n`);
  } else {
    fs.writeFileSync(target, `---\n${definition.frontmatter}\n---\n\n${definition.prompt}\n`);
  }
  return dir;
}

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** OpenCode access outside the workspace: denied, except inside the node's extra directories (the same folders the Claude backend passes as --add-dir). */
function externalDirectoryPermission(dirs: string[]): string | Record<string, string> {
  if (dirs.length === 0) {
    return "deny";
  }
  return { "*": "deny", ...Object.fromEntries(dirs.map((dir) => [path.join(dir, "*"), "allow"])) };
}
