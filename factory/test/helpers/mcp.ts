import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { freePort, killViewer } from "./processes.ts";
import { removeDir, tempDir } from "./temp.ts";

export type Payload = Record<string, any>;

/** Calls a factory tool, fails the test on a tool error and returns the structured result. */
export async function callTool<T = Payload>(client: Client, name: string, args: Record<string, unknown>, { timeoutMs }: { timeoutMs?: number } = {}): Promise<T> {
  const result = (await client.callTool({ name, arguments: args }, undefined, timeoutMs === undefined ? undefined : { timeout: timeoutMs })) as CallToolResult;
  assert.ok(!result.isError, JSON.stringify(result.content));
  return result.structuredContent as T;
}

export interface StdioSession {
  client: Client;
  dataDir: string;
  viewerPort: number;
  /** Closes the client, ends the run page the session started and removes the temp data and home folders. Never throws. */
  close(): Promise<void>;
}

export interface StdioOptions {
  /** The stdio entry: src/stdio.ts or the bundled dist/stdio.mjs. */
  entry: string;
  /** Extra variables for the factory process. */
  env?: Record<string, string>;
  clientName?: string;
}

/**
 * Starts the factory over stdio with its own temp data folder, a temp FACTORY_HOME_DIR (never the real
 * ~/.skill-factory), a free run page port and no interval watches. A failed connect does not leak the child.
 */
export async function startStdio({ entry, env = {}, clientName = "claude-code" }: StdioOptions): Promise<StdioSession> {
  const dataDir = tempDir("factory-stdio-data-");
  const homeDir = tempDir("factory-stdio-home-");
  const viewerPort = await freePort();
  const childEnv = { ...process.env, FACTORY_DATA_DIR: dataDir, FACTORY_HOME_DIR: homeDir, FACTORY_VIEWER_PORT: String(viewerPort), FACTORY_WATCHES: "off", ...env } as Record<string, string>;
  const client = new Client({ name: clientName, version: "0.0.0" });
  const close = async (): Promise<void> => {
    await client.close().catch(() => undefined);
    killViewer(dataDir);
    removeDir(dataDir);
    removeDir(homeDir);
  };
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(entry)], env: childEnv, stderr: "pipe" }));
  } catch (error) {
    await close();
    throw error;
  }
  return { client, dataDir, viewerPort, close };
}
