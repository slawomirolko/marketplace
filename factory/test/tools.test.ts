// The MCP tool descriptions promise only what the factory does.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Factory } from "../src/engine.ts";
import { createFactoryTools } from "../src/tools.ts";

test("factory_submit asks for the token numbers instead of promising to read them from the child session", async () => {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-tools-")), { backend: "delegate" });
  const server = createFactoryTools(factory, "http://127.0.0.1:7340").buildServer();
  const client = new Client({ name: "tools-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    const description = tools.find((tool) => tool.name === "factory_submit")?.description ?? "";
    assert.doesNotMatch(description, /reads the exact token usage/);
    assert.match(description, /token numbers/);
  } finally {
    await client.close();
    await server.close();
  }
});
