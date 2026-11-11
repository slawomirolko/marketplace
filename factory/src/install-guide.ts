import os from "node:os";
import path from "node:path";
import { FACTORY_DIR } from "./paths.ts";

export const HARNESSES = ["claude-code", "opencode", "codex", "other"] as const;
export type Harness = (typeof HARNESSES)[number];

export interface InstallGuide {
  harness: Harness;
  detectedFrom: string | null;
  serverName: "factory";
  command: string;
  args: string[];
  steps: string[];
  commands: string[];
  config: { file: string; content: unknown } | null;
  verify: string;
  afterInstall: string;
  otherHarnesses: Harness[];
}

export function harnessFromClient(clientName: string | undefined): Harness | null {
  const name = (clientName ?? "").toLowerCase();
  if (name.includes("opencode")) return "opencode";
  if (name.includes("codex")) return "codex";
  if (name.includes("claude-code") || name === "claude") return "claude-code";
  return null;
}

export function installGuide(requested: Harness | undefined, clientName: string | undefined): InstallGuide {
  const detected = harnessFromClient(clientName);
  const harness = requested ?? detected ?? "other";
  const entry = path.join(FACTORY_DIR, "dist", "stdio.mjs").replaceAll("\\", "/");
  const installer = path.join(FACTORY_DIR, "dist", "install-opencode.mjs").replaceAll("\\", "/");
  const base = {
    harness,
    detectedFrom: requested ? null : (clientName ?? null),
    serverName: "factory" as const,
    command: "node",
    args: [entry],
    afterInstall: "Each new session starts the factory by itself. After a run ends, show the user viewerUrl: a local page with the whole flow and the cost of each agent.",
    otherHarnesses: HARNESSES.filter((h) => h !== harness),
  };

  if (harness === "claude-code" && process.env.CLAUDE_PLUGIN_ROOT) {
    return {
      ...base,
      steps: ["Nothing to do: Claude Code already starts the factory from the skill-factory plugin in every session."],
      commands: [],
      config: null,
      verify: "Run `/plugin` in Claude Code. skill-factory is enabled.",
    };
  }
  if (harness === "claude-code") {
    return {
      ...base,
      steps: ["Run the command below in a shell. It adds the factory for all projects of this user.", "Start a new Claude Code session."],
      commands: [`claude mcp add --scope user factory -- node ${entry}`],
      config: null,
      verify: "Run `claude mcp list`. The list shows factory as connected.",
    };
  }
  if (harness === "opencode") {
    const file = path.join(os.homedir(), ".config", "opencode", "opencode.json").replaceAll("\\", "/");
    return {
      ...base,
      steps: [
        "Run the command below in a shell. It adds a local server named factory to the global OpenCode config, keeps a backup copy of the file, and changes nothing when the entry is already there.",
        "Restart OpenCode.",
      ],
      commands: [`node ${installer}`],
      config: { file, content: { mcp: { servers: { factory: { type: "local", command: ["node", entry] } } } } },
      verify: "In a new OpenCode session the factory_* tools are available.",
    };
  }
  if (harness === "codex") {
    return {
      ...base,
      steps: ["Run the command below in a shell.", "Start a new Codex session."],
      commands: [`codex mcp add factory -- node ${entry}`],
      config: { file: path.join(os.homedir(), ".codex", "config.toml").replaceAll("\\", "/"), content: `[mcp_servers.factory]\ncommand = "node"\nargs = ["${entry}"]` },
      verify: "Run `codex mcp list`. The list shows factory.",
    };
  }
  return {
    ...base,
    steps: [
      "Add a stdio MCP server named factory to the MCP configuration of your client, with the command and args below.",
      "Restart the client.",
    ],
    commands: [],
    config: { file: "the MCP configuration file of your client", content: { mcpServers: { factory: { command: "node", args: [entry] } } } },
    verify: "The client lists the factory_* tools.",
  };
}
