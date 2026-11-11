import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FACTORY_DIR } from "./paths.ts";
import type { AgentTool } from "./types.ts";

const AGENT_NAME = /^[a-z0-9-]+$/;
const CLAUDE_TOOLS: Record<AgentTool, string[]> = { read: ["Read", "Grep", "Glob"], edit: ["Edit", "Write"], bash: ["Bash"] };
const CLAUDE_ALL_TOOLS = ["Read", "Grep", "Glob", "Skill", "Edit", "Write", "Bash", "WebFetch", "WebSearch", "Agent", "Task", "NotebookEdit"];

export interface MarketplaceSkill {
  name: string;
  file: string;
}

export interface MarketplaceAgent {
  name: string;
  description: string;
  prompt: string;
  file: string;
  frontmatter: string;
  skills: MarketplaceSkill[];
  dirs: string[];
  skillDir?: string;
}

interface Frontmatter {
  description?: string;
  permission?: { skill?: Record<string, string> };
}

export function marketplaceDir(): string {
  return process.env.FACTORY_MARKETPLACE_DIR ?? path.join(FACTORY_DIR, "..");
}

function readFrontmatter(file: string): { front: Frontmatter; raw: string; body: string } {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) throw new Error(`${file}: no frontmatter`);
  return { front: parseYaml(match[1]) as Frontmatter, raw: match[1], body: match[2].trim() };
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

function declaredSkills(name: string, front: Frontmatter): string[] {
  const allowed = Object.entries(front.permission?.skill ?? {}).filter(([skill, rule]) => skill !== "*" && rule === "allow").map(([skill]) => skill);
  const manifest = path.join(marketplaceDir(), "agents", "opencode", "index.json");
  const listed = fs.existsSync(manifest) ? ((JSON.parse(fs.readFileSync(manifest, "utf8")).agents as { name: string; skills?: string[] }[]).find((a) => a.name === name)?.skills ?? []) : [];
  return [...new Set([...allowed, ...listed])];
}

function skillsSection(skills: MarketplaceSkill[], missing: string[]): string {
  if (!skills.length && !missing.length) return "";
  const lines = skills.map((s) => `- ${s.name}: ${s.file}`);
  const absent = missing.length ? `\nNot in the marketplace, so not available in this run: ${missing.join(", ")}.` : "";
  return `\n\nSkills: when these instructions load a skill, read its SKILL.md from the marketplace path below and follow it, not through the Skill tool and not from an installed copy. Files a skill names are next to its SKILL.md.\n${lines.join("\n")}${absent}`;
}

export function readMarketplaceAgent(name: string): MarketplaceAgent {
  if (!AGENT_NAME.test(name)) throw new Error(`invalid agent name ${name}`);
  const file = path.join(marketplaceDir(), "agents", "opencode", `${name}.md`);
  if (fs.existsSync(file)) {
    const { front, raw, body } = readFrontmatter(file);
    const names = declaredSkills(name, front);
    const skills = names.flatMap((skill) => {
      const found = findSkill(skill);
      return found ? [{ name: skill, file: found }] : [];
    });
    const missing = names.filter((skill) => !skills.some((s) => s.name === skill));
    return { name, description: front.description ?? name, prompt: body + skillsSection(skills, missing), file, frontmatter: raw, skills, dirs: skills.map((s) => path.dirname(s.file)) };
  }
  const skillFile = findSkill(name);
  if (!skillFile) throw new Error(`agent or skill ${name} is not in the marketplace (${file})`);
  const skillDir = path.dirname(skillFile);
  const { front, body } = readFrontmatter(skillFile);
  const prompt = `Follow the skill ${name} below for the task in the user message. The skill directory is ${skillDir}; read the files it names from there.\n\n${body}`;
  return { name, description: front.description ?? name, prompt, file: skillFile, frontmatter: "", skills: [], dirs: [skillDir], skillDir };
}

export function claudeTools(tools: AgentTool[]): { allowed: string[]; disallowed: string[] } {
  const allowed = [...new Set(tools.flatMap((t) => CLAUDE_TOOLS[t]))];
  return { allowed, disallowed: CLAUDE_ALL_TOOLS.filter((t) => !allowed.includes(t)) };
}

function freshDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function claudeAgentsFile(name: string, tools: AgentTool[] = ["read"]): string {
  const agent = readMarketplaceAgent(name);
  const file = path.join(freshDir("factory-agent-"), `claude-${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ [name]: { description: agent.description, prompt: agent.prompt, tools: claudeTools(tools).allowed } }));
  return file;
}

export function opencodeConfigDir(name: string, tools: AgentTool[] = ["read"]): string {
  const agent = readMarketplaceAgent(name);
  const dir = freshDir("factory-opencode-");
  const target = path.join(dir, "agents", `${name}.md`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (agent.skillDir) {
    const allow = (tool: AgentTool) => (tools.includes(tool) ? "allow" : "deny");
    const front = { description: agent.description, mode: "subagent", permission: { edit: allow("edit"), bash: allow("bash"), task: "deny", webfetch: "deny", websearch: "deny", external_directory: "allow" } };
    fs.writeFileSync(target, `---\n${JSON.stringify(front)}\n---\n\n${agent.prompt}\n`);
  } else {
    fs.writeFileSync(target, `---\n${agent.frontmatter}\n---\n\n${agent.prompt}\n`);
  }
  return dir;
}
