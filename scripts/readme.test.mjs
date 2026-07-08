import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("README command examples reference implemented scripts", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const commandMatches = [...readme.matchAll(/node scripts\/([a-z0-9-]+\.mjs)/g)];
  const scripts = commandMatches.map((match) => match[1]);

  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    assert.equal(fs.existsSync(path.join(repoRoot, "scripts", script)), true, `${script} should exist`);
  }
});
