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

async function toolDescription(name: string): Promise<string> {
  const factory = new Factory(fs.mkdtempSync(path.join(os.tmpdir(), "factory-tools-")), { backend: "delegate" });
  const server = createFactoryTools(factory, "http://127.0.0.1:7340").buildServer();
  const client = new Client({ name: "tools-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    return tools.find((tool) => tool.name === name)?.description ?? "";
  } finally {
    await client.close();
    await server.close();
  }
}

test("factory_submit asks for the token numbers instead of promising to read them from the child session", async () => {
  const description = await toolDescription("factory_submit");
  assert.doesNotMatch(description, /reads the exact token usage/);
  assert.match(description, /token numbers/);
});

test("factory_start names no workflow itself and lists the inputs each workflow YAML declares", async () => {
  const description = await toolDescription("factory_start");
  const [generic = "", ...perWorkflow] = description.split("\nInputs by workflow:\n");
  assert.doesNotMatch(generic, /olko-/);
  assert.match(perWorkflow.join(""), /^- olko-review: repo, owner\/name, and pr, the PR number/m);
  assert.match(perWorkflow.join(""), /^- olko-marketplace-skill-sync: project, the absolute path of the local project/m);
  assert.match(perWorkflow.join(""), /^- olko-claude-sync: target and targetName/m);
});
