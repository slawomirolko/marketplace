import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FACTORY_DIR } from "./paths.ts";
import type { AgentTool } from "./types.ts";

const AGENT_NAME = /^[a-z0-9-]+$/;
const CLAUDE_TOOLS: Record<AgentTool, string[]> = { read: ["Read", "Grep", "Glob", "Skill"], edit: ["Edit", "Write"], bash: ["Bash"] };
const CLAUDE_ALL_TOOLS = ["Read", "Grep", "Glob", "Skill", "Edit", "Write", "Bash", "WebFetch", "WebSearch", "Agent", "Task", "NotebookEdit"];

export interface MarketplaceAgent {
  name: string;
  description: string;
  prompt: string;
  file: string;
  skillDir?: string;
}

export function marketplaceDir(): string {
  return process.env.FACTORY_MARKETPLACE_DIR ?? path.join(FACTORY_DIR, "..");
}

function readFrontmatter(file: string): { front: { description?: string }; body: string } {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) throw new Error(`${file}: no frontmatter`);
  return { front: parseYaml(match[1]) as { description?: string }, body: match[2].trim() };
}

function findSkill(name: string): string | undefined {
  const root = path.join(marketplaceDir(), "skills");
  if (!fs.existsSync(root)) return undefined;
  for (const category of fs.readdirSync(root)) {
    const file = path.join(root, category, name, "SKILL.md");
    if (fs.existsSync(file)) return file;
  }
  return undefined;
}

export function readMarketplaceAgent(name: string): MarketplaceAgent {
  if (!AGENT_NAME.test(name)) throw new Error(`invalid agent name ${name}`);
  const file = path.join(marketplaceDir(), "agents", "opencode", `${name}.md`);
  if (fs.existsSync(file)) {
    const { front, body } = readFrontmatter(file);
    return { name, description: front.description ?? name, prompt: body, file };
  }
  const skillFile = findSkill(name);
  if (!skillFile) throw new Error(`agent or skill ${name} is not in the marketplace (${file})`);
  const skillDir = path.dirname(skillFile);
  const { front, body } = readFrontmatter(skillFile);
  const prompt = `Follow the skill ${name} below for the task in the user message. The skill directory is ${skillDir}; read the files it names from there.\n\n${body}`;
  return { name, description: front.description ?? name, prompt, file: skillFile, skillDir };
}

export function claudeTools(tools: AgentTool[]): { allowed: string[]; disallowed: string[] } {
  const allowed = [...new Set(tools.flatMap((t) => CLAUDE_TOOLS[t]))];
  return { allowed, disallowed: CLAUDE_ALL_TOOLS.filter((t) => !allowed.includes(t)) };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agents-"));

export function claudeAgentsFile(name: string, tools: AgentTool[] = ["read"]): string {
  const file = path.join(scratch, `claude-${name}-${[...tools].sort().join("-")}.json`);
  if (!fs.existsSync(file)) {
    const agent = readMarketplaceAgent(name);
    fs.writeFileSync(file, JSON.stringify({ [name]: { description: agent.description, prompt: agent.prompt, tools: claudeTools(tools).allowed } }));
  }
  return file;
}

export function opencodeConfigDir(name: string, tools: AgentTool[] = ["read"]): string {
  const dir = path.join(scratch, "opencode");
  const target = path.join(dir, "agents", `${name}.md`);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const agent = readMarketplaceAgent(name);
    if (agent.skillDir) {
      const allow = (tool: AgentTool) => (tools.includes(tool) ? "allow" : "deny");
      const front = { description: agent.description, mode: "subagent", permission: { edit: allow("edit"), bash: allow("bash"), task: "deny", webfetch: "deny", websearch: "deny", external_directory: "allow" } };
      fs.writeFileSync(target, `---\n${JSON.stringify(front)}\n---\n\n${agent.prompt}\n`);
    } else {
      fs.copyFileSync(agent.file, target);
    }
  }
  return dir;
}
