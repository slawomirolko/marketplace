import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Factory, parseBackend } from "./engine.ts";
import { createFactoryTools } from "./tools.ts";
import { DEFAULT_VIEWER_PORT, VIEWER_HEALTH, defaultDataDir } from "./paths.ts";

const port = Number(process.env.FACTORY_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
const publicUrl = `http://127.0.0.1:${port}`;
const dataDir = defaultDataDir();

async function viewerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${publicUrl}/health`, { signal: AbortSignal.timeout(1000) });
    return (await response.text()) === VIEWER_HEALTH;
  } catch {
    return false;
  }
}

async function ensureViewer(): Promise<void> {
  if (await viewerRunning()) return;
  const self = fileURLToPath(import.meta.url);
  const script = path.join(path.dirname(self), `viewer-server${path.extname(self)}`);
  const child = spawn(process.execPath, [script], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_VIEWER_PORT: String(port) },
  });
  child.on("error", (error) => console.error(`run page did not start: ${error.message}`));
  child.unref();
}

const factory = new Factory(dataDir, { backend: parseBackend(process.env.FACTORY_BACKEND) });
const server = createFactoryTools(factory, publicUrl).buildServer();
const transport = new StdioServerTransport();
transport.onclose = () => process.exit(0);
await ensureViewer();
await server.connect(transport);
