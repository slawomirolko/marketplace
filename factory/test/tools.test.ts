// The MCP tool descriptions promise only what the factory does.
import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { tempDir } from "./helpers/temp.ts";
import { Factory } from "../src/engine.ts";
import { createFactoryTools } from "../src/tools.ts";

async function toolDescription(name: string): Promise<string> {
  const factory = new Factory(tempDir("factory-tools-"), { backend: "delegate" });
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

test("a tool call that fails is counted in the metrics and logged with the tool name", async () => {
  const factory = new Factory(tempDir("factory-tools-"), { backend: "delegate" });
  const tools = createFactoryTools(factory, "http://127.0.0.1:7340");
  const server = tools.buildServer();
  const client = new Client({ name: "tools-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const lines: string[] = [];
  const original = console.error;
  console.error = (...parts: unknown[]) => {
    lines.push(parts.map(String).join(" "));
  };
  try {
    const result = await client.callTool({ name: "factory_cancel", arguments: { runId: "r-missing" } });
    assert.equal(result.isError, true);
  } finally {
    console.error = original;
    await client.close();
    await server.close();
  }
  assert.equal(tools.metrics().failedCalls, 1);
  assert.deepEqual(lines, ["tool factory_cancel failed: unknown runId r-missing"]);
});
