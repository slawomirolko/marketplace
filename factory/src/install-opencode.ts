import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface McpEntry {
  type: "local";
  command: string[];
}

type OpencodeConfig = Record<string, unknown> & { mcp?: Record<string, unknown> & { servers?: Record<string, unknown> } };

const self = fileURLToPath(import.meta.url);
const stdioEntry = path.join(path.dirname(self), `stdio${path.extname(self)}`).replaceAll("\\", "/");
const configFile = process.argv[2] ?? process.env.OPENCODE_CONFIG ?? path.join(os.homedir(), ".config", "opencode", "opencode.json");
const entry: McpEntry = { type: "local", command: ["node", stdioEntry] };

const config: OpencodeConfig = fs.existsSync(configFile) ? (JSON.parse(fs.readFileSync(configFile, "utf8")) as OpencodeConfig) : {};
const mcp = (config.mcp ??= {});
const usesServers = mcp.servers !== undefined || Object.keys(mcp).length === 0;
const servers = usesServers ? (mcp.servers ??= {}) : mcp;

if (JSON.stringify(servers.factory) === JSON.stringify(entry)) {
  console.log(`OpenCode already starts the factory from ${stdioEntry} (${configFile})`);
} else {
  if (fs.existsSync(configFile)) fs.copyFileSync(configFile, `${configFile}.bak-${Date.now()}`);
  servers.factory = entry;
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`OpenCode now starts the factory from ${stdioEntry} (${configFile}); restart OpenCode to load it`);
}
