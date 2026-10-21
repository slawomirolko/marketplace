import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateDir = process.env.OLKO_SYNC_HOME ? path.resolve(process.env.OLKO_SYNC_HOME) : path.join(os.homedir(), ".olko-sync");
const targetsPath = path.join(stateDir, "targets.json");

function leakTerms(targets) {
  const terms = new Set(targets.leakTerms ?? []);
  for (const target of Object.values(targets.targets ?? {})) {
    terms.add(target.path);
    terms.add(target.path.replace(/\\/g, "/"));
    terms.add(path.basename(target.path));
  }
  return [...terms].filter((term) => typeof term === "string" && term.trim().length >= 4).map((term) => term.toLowerCase());
}

test("no tracked file mentions a local sync target or leak term", { skip: !fs.existsSync(targetsPath) && "no local ~/.olko-sync/targets.json" }, () => {
  const terms = leakTerms(JSON.parse(fs.readFileSync(targetsPath, "utf8")));
  const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);

  const hits = [];
  for (const file of listed.stdout.split("\0").filter(Boolean)) {
    const absolute = path.join(repoRoot, file);
    if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) {
      continue;
    }
    const content = fs.readFileSync(absolute, "utf8").toLowerCase();
    terms.forEach((term, index) => {
      if (content.includes(term)) {
        hits.push(`${file}: leak term #${index + 1}`);
      }
    });
  }

  assert.deepEqual(hits, []);
});
