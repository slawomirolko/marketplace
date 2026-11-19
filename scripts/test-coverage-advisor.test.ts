import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(root, "skills", "testing", "olko-test-coverage-advisor");

function read(file: string): string {
  return fs.readFileSync(path.join(skillDir, file), "utf8");
}

const severities: Record<string, string> = {
  TP6: "high",
  TP9: "high",
  TP4: "high",
  TP3: "medium",
  TP7: "medium",
  TP10: "medium",
  TP1: "low",
  TP2: "low",
  TP5: "low",
  TP12: "low",
};

test("skill frontmatter names the skill and version 1.0.0", () => {
  const text = read("SKILL.md");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(match, "frontmatter block");
  const front = match[1];
  assert.match(front, /^name: olko-test-coverage-advisor$/m);
  assert.match(front, /^description: \S/m);
  assert.match(front, /^version: 1\.0\.0$/m);
});

test("overview lists exactly the selected principles with their severity", () => {
  const text = read("overview.md");
  for (const [id, severity] of Object.entries(severities)) {
    const pattern = new RegExp(String.raw`\b${id}\b`);
    const row = text.split("\n").find((line) => pattern.test(line) && line.includes("|"));
    assert.ok(row, `${id} row`);
    assert.ok(row.includes(severity), `${id} severity ${severity}`);
  }
  assert.doesNotMatch(text, /\bTP8\b/);
  assert.doesNotMatch(text, /\bTP11\b/);
});

test("examples give one TypeScript sketch per principle in erasable syntax", () => {
  const text = read("examples.md");
  const sections = text.split(/^## /m).slice(1);
  for (const id of Object.keys(severities)) {
    const section = sections.find((s) => s.startsWith(`${id} `));
    assert.ok(section, `${id} heading`);
    const blocks = [...section.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
    assert.equal(blocks.length, 1, `${id} has one ts block`);
    assert.match(blocks[0], /from "node:test"/, `${id} imports node:test`);
  }
  for (const m of text.matchAll(/```ts\r?\n([\s\S]*?)```/g)) {
    assert.doesNotMatch(m[1], /\benum\b|\bnamespace\b/);
  }
});

test("edge cases cover a prompt-only artifact and an artifact without tests", () => {
  const text = read("edge-cases.md");
  for (const word of ["prompt-only", "n/a", "no tests", "missing", "todo"]) {
    assert.ok(text.includes(word), word);
  }
});

test("registry lists the skill in category testing", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "registry.json"), "utf8"));
  const entry = registry.skills.find((s: { name: string }) => s.name === "olko-test-coverage-advisor");
  assert.ok(entry, "registry entry");
  assert.equal(entry.category, "testing");
  assert.equal(entry.version, "1.0.0");
});
