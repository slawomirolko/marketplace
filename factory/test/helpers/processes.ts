import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

/** How long a started server may take to print its ready line. */
export const SERVER_START_TIMEOUT_MS = 15000;
/** How long a stopped server may take to exit before it is killed hard. */
export const SERVER_STOP_TIMEOUT_MS = 5000;
/** Start attempts when the free port was taken between probing and binding it. */
const START_ATTEMPTS = 3;
/** Identity for commits the tests make, so they never depend on the developer's git config. */
export const GIT_IDENTITY = ["-c", "user.name=factory-test", "-c", "user.email=factory-test@example.invalid"];

export interface RunningServer {
  port: number;
  child: ChildProcess;
  /** Everything the server wrote to stderr so far. */
  stderr(): string;
}

export interface StartServerOptions {
  /** Arguments for node, the script first. */
  args: string[];
  /** The child environment for the port the server should listen on. */
  envFor: (port: number) => Record<string, string | undefined>;
  /** Text on stdout that says the server is ready. */
  ready: string;
  timeoutMs?: number;
}

/**
 * A port that was free a moment ago. Another process can still take it before the caller binds it,
 * so startServer() retries on EADDRINUSE; servers that can listen on port 0 should do that instead.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

function startOnce(port: number, { args, envFor, ready, timeoutMs = SERVER_START_TIMEOUT_MS }: StartServerOptions): Promise<RunningServer> {
  const child = spawn(process.execPath, args, { env: envFor(port), stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
    errors += chunk;
  });
  const server: RunningServer = { port, child, stderr: () => errors };
  return new Promise<RunningServer>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not print "${ready}" within ${timeoutMs} ms: ${errors}`));
    }, timeoutMs);
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
      if (output.includes(ready)) {
        clearTimeout(timer);
        child.stdout?.resume();
        resolve(server);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`server exited ${code} before it was ready: ${errors}`), { stderr: errors }));
    });
  });
}

/** Starts a node server on a free port, waits for its ready line (with a time limit) and keeps reading its stderr. */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    try {
      return await startOnce(await freePort(), options);
    } catch (error) {
      lastError = error;
      if (!String((error as { stderr?: string }).stderr ?? "").includes("EADDRINUSE")) {
        throw error;
      }
    }
  }
  throw lastError;
}

/** Stops a server and waits until the process has exited; kills it hard after SERVER_STOP_TIMEOUT_MS. */
export async function stopServer(server: RunningServer | ChildProcess | undefined): Promise<void> {
  const child = server && "child" in server ? server.child : server;
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  const timer = setTimeout(() => child.kill("SIGKILL"), SERVER_STOP_TIMEOUT_MS);
  await exited;
  clearTimeout(timer);
}

/** Ends the run page process whose pid is in `<dataDir>/viewer.pid`. Never throws: a missing file, a bad pid or a process that is gone are fine. */
export function killViewer(dataDir: string | undefined): void {
  if (!dataDir) {
    return;
  }
  try {
    const pid = Number(fs.readFileSync(path.join(dataDir, "viewer.pid"), "utf8").trim());
    if (Number.isInteger(pid) && pid > 0) {
      process.kill(pid);
    }
  } catch {
    return;
  }
}

/** Runs git in `cwd` and returns its trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}
