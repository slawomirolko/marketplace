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

const agentFile = path.join(root, "agents", "opencode", "olko-test-coverage-advisor.md");

function readAgent(): { front: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(fs.readFileSync(agentFile, "utf8"));
  assert.ok(match, "agent frontmatter block");
  return { front: match[1], body: match[2] };
}

function block(front: string, name: string): string[] {
  const lines = front.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.ok(start >= 0, `${name} block`);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("    ")) break;
    out.push(line.trim());
  }
  return out;
}

test("advisor agent is a hidden subagent that loads only its skill", () => {
  const { front } = readAgent();
  assert.match(front, /^mode: subagent$/m);
  assert.match(front, /^hidden: true$/m);
  const skills = block(front, "skill");
  assert.ok(skills.includes('"*": deny'));
  assert.ok(skills.includes("olko-test-coverage-advisor: allow"));
  assert.equal(skills.filter((line) => line.endsWith(": allow")).length, 1);
});

test("advisor agent cannot delegate, browse, commit, push, or call gh", () => {
  const { front } = readAgent();
  assert.match(front, /^ {2}task: deny$/m);
  assert.match(front, /^ {2}webfetch: deny$/m);
  assert.match(front, /^ {2}websearch: deny$/m);
  const bash = block(front, "bash");
  for (const rule of [
    '"*": deny',
    '"node --test *": allow',
    '"git grep *": allow',
    '"git diff *": allow',
    '"git commit *": deny',
    '"git push *": deny',
    '"gh *": deny',
  ]) {
    assert.ok(bash.includes(rule), rule);
  }
});

test("advisor agent defines both modes and both JSON contracts", () => {
  const { body } = readAgent();
  const words = [
    "suggest", "apply", "testsRoot", "artifact", "suggestions", "id", "principle", "status",
    "severity", "evidence", "scenario", "targetFile", "sketch", "covered", "notApplicable",
    "reason", "written", "results", "vacuityChecked", "todo", "vacuity", "restore",
  ];
  for (const word of words) {
    assert.ok(body.includes(word), word);
  }
});

test("advisor agent edits only test files", () => {
  const { body } = readAgent();
  const rule = body
    .split(/\r?\n/)
    .find((line) => line.includes("test files") && line.includes("fixtures") && /never/i.test(line) && line.includes("production code"));
  assert.ok(rule, "hard rule line");
});

test("manifest lists the advisor as an auditor with its skill", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "agents", "opencode", "index.json"), "utf8"));
  const entry = manifest.agents.find((a: { name: string }) => a.name === "olko-test-coverage-advisor");
  assert.ok(entry, "manifest entry");
  assert.equal(entry.version, "1.0.0");
  assert.equal(entry.role, "auditor");
  assert.equal(entry.stack, "cross-stack");
  assert.deepEqual(entry.skills, ["olko-test-coverage-advisor"]);
});

const syncFile = path.join(root, "agents", "opencode", "olko-marketplace-skill-sync-manager.md");

function readSync(): { front: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(fs.readFileSync(syncFile, "utf8"));
  assert.ok(match, "sync manager frontmatter block");
  return { front: match[1], body: match[2].replace(/\r\n/g, "\n") };
}

function phase(body: string, label: string): string {
  const match = new RegExp(`${label} \\S+ [\\s\\S]*?(?=\\nPhase \\d|\\nAfter both|$)`).exec(body);
  assert.ok(match, label);
  return match[0].replace(/\s+/g, " ");
}

test("sync manager may run the advisor", () => {
  const { front } = readSync();
  const task = block(front, "task");
  assert.ok(task.includes("olko-test-coverage-advisor: allow"));
  assert.ok(task.includes('"*": deny'));
  assert.ok(task.includes("olko-marketplace-skill-sync-comparator: allow"));
});

test("sync manager runs suggest in phase 2, shows tests in phase 3, applies accepted ids in phase 4", () => {
  const { body } = readSync();
  const two = phase(body, "Phase 2");
  assert.ok(two.includes("olko-test-coverage-advisor") && two.includes("`suggest`"));
  const three = phase(body, "Phase 3");
  assert.ok(three.includes("`tests`") && three.includes("high/medium/low"));
  assert.ok(three.includes("one extra question") && three.includes("`none`"));
  const four = phase(body, "Phase 4");
  assert.ok(four.includes("`apply`") && four.includes("accepted suggestion ids"));
  assert.ok(/tests[^.]*no version bump/i.test(body), "tests cause no version bump");
});

test("sync manager version is 2.6.0", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "agents", "opencode", "index.json"), "utf8"));
  const entry = manifest.agents.find((a: { name: string }) => a.name === "olko-marketplace-skill-sync-manager");
  assert.equal(entry.version, "2.6.0");
});
