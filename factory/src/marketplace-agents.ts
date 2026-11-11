import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FACTORY_DIR } from "./paths.ts";

const AGENT_NAME = /^[a-z0-9-]+$/;
const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "Skill"];

export interface MarketplaceAgent {
  name: string;
  description: string;
  prompt: string;
  file: string;
}

export function marketplaceDir(): string {
  return process.env.FACTORY_MARKETPLACE_DIR ?? path.join(FACTORY_DIR, "..");
}

export function readMarketplaceAgent(name: string): MarketplaceAgent {
  if (!AGENT_NAME.test(name)) throw new Error(`invalid agent name ${name}`);
  const file = path.join(marketplaceDir(), "agents", "opencode", `${name}.md`);
  if (!fs.existsSync(file)) throw new Error(`agent ${name} is not in the marketplace (${file})`);
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) throw new Error(`${file}: no frontmatter`);
  const front = parseYaml(match[1]) as { description?: string };
  return { name, description: front.description ?? name, prompt: match[2].trim(), file };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "factory-agents-"));

export function claudeAgentsFile(name: string): string {
  const file = path.join(scratch, `claude-${name}.json`);
  if (!fs.existsSync(file)) {
    const agent = readMarketplaceAgent(name);
    fs.writeFileSync(file, JSON.stringify({ [name]: { description: agent.description, prompt: agent.prompt, tools: READ_ONLY_TOOLS } }));
  }
  return file;
}

export function opencodeConfigDir(name: string): string {
  const dir = path.join(scratch, "opencode");
  const target = path.join(dir, "agents", `${name}.md`);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(readMarketplaceAgent(name).file, target);
  }
  return dir;
}
