import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
// src/install-opencode.ts
var self = fileURLToPath(import.meta.url);
var stdioEntry = path.join(path.dirname(self), `stdio${path.extname(self)}`).replaceAll("\\", "/");
var configFile = process.argv[2] ?? process.env.OPENCODE_CONFIG ?? path.join(os.homedir(), ".config", "opencode", "opencode.json");
var entry = {
	type: "local",
	command: ["node", stdioEntry]
};
var config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
var mcp = config.mcp ??= {};
var servers = mcp.servers !== void 0 || Object.keys(mcp).length === 0 ? mcp.servers ??= {} : mcp;
if (JSON.stringify(servers.factory) === JSON.stringify(entry)) console.log(`OpenCode already starts the factory from ${stdioEntry} (${configFile})`);
else {
	if (fs.existsSync(configFile)) fs.copyFileSync(configFile, `${configFile}.bak-${Date.now()}`);
	servers.factory = entry;
	fs.mkdirSync(path.dirname(configFile), { recursive: true });
	fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
	console.log(`OpenCode now starts the factory from ${stdioEntry} (${configFile}); restart OpenCode to load it`);
}
export {};
