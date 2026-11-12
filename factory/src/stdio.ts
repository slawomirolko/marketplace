import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Factory, parseBackend, parseCli } from "./engine.ts";
import { cliExecutor, hostExec } from "./cli-backend.ts";
import { createFactoryTools } from "./tools.ts";
import { DEFAULT_VIEWER_PORT, VIEWER_HEALTH, defaultDataDir, registerDataSource } from "./paths.ts";

const firstPort = Number(process.env.FACTORY_VIEWER_PORT ?? DEFAULT_VIEWER_PORT);
const dataDir = defaultDataDir();
const PORTS_TO_TRY = 10;

async function viewerOn(port: number): Promise<"ours" | "other" | "free"> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
    const body = (await response.json()) as { name?: string; dataDir?: string };
    return body.name === VIEWER_HEALTH && body.dataDir === path.resolve(dataDir) ? "ours" : "other";
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code === "ECONNREFUSED" ? "free" : "other";
  }
}

function startViewer(port: number): void {
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

async function ensureViewer(): Promise<number> {
  for (let port = firstPort; port < firstPort + PORTS_TO_TRY; port += 1) {
    const state = await viewerOn(port);
    if (state === "ours") return port;
    if (state === "free") {
      startViewer(port);
      return port;
    }
  }
  console.error(`no free port for the run page in ${firstPort}-${firstPort + PORTS_TO_TRY - 1}`);
  return firstPort;
}

const backend = parseBackend(process.env.FACTORY_BACKEND);
const cli = backend === "cli" ? parseCli(process.env.FACTORY_CLI) : undefined;
registerDataSource(dataDir);
const factory = new Factory(dataDir, { backend, executors: { exec: hostExec, ...(cli ? { [cli]: cliExecutor(cli) } : {}) }, ...(cli ? { cli } : {}) });
const port = await ensureViewer();
const server = createFactoryTools(factory, `http://127.0.0.1:${port}`).buildServer();
const transport = new StdioServerTransport();
transport.onclose = () => process.exit(0);
await server.connect(transport);
