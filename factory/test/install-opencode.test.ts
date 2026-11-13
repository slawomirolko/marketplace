import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "install-opencode.ts");

function install(file: string): Record<string, unknown> {
  execFileSync(process.execPath, [script, file]);
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

test("installer adds the factory next to existing servers in the shape the file already uses, keeps a backup, and is idempotent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-install-"));
  const flat = path.join(dir, "flat.json");
  fs.writeFileSync(flat, JSON.stringify({ model: "x", mcp: { playwright: { type: "local", command: ["npx", "pw"] } } }));
  const updated = install(flat) as { model: string; mcp: Record<string, { command: string[] }> };
  assert.equal(updated.model, "x");
  assert.deepEqual(updated.mcp.playwright?.command, ["npx", "pw"]);
  assert.match(updated.mcp.factory?.command[1] ?? "", /\/src\/stdio\.ts$/);
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith("flat.json.bak-")).length, 1);
  install(flat);
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith("flat.json.bak-")).length, 1);

  const fresh = path.join(dir, "new", "opencode.json");
  const created = install(fresh) as { mcp: { servers: Record<string, { type: string }> } };
  assert.equal(created.mcp.servers.factory?.type, "local");
});
