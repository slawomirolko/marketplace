import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanTmp } from "../src/clean-tmp.ts";

function makeDir(root: string, name: string, ageMinutes: number): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "file.json"), "{}");
  const time = new Date(Date.now() - ageMinutes * 60000);
  fs.utimesSync(dir, time, time);
  return dir;
}

test("old factory temp folders are removed; recent ones and folders of other tools stay", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-tmp-root-"));
  const oldAgent = makeDir(root, "factory-agent-abc123", 120);
  const oldClone = makeDir(root, "factory-sync-apply-1xci6jcs", 120);
  const oldHarness = makeDir(root, "harness-agent-Zx81Qa", 120);
  const recent = makeDir(root, "factory-opencode-k2j3h4", 5);
  const foreign = makeDir(root, "other-tool-abc123", 120);
  const prefixOnly = makeDir(root, "factory-notes", 120);

  const result = cleanTmp({ root, maxAgeMinutes: 60 });

  assert.deepEqual(result.removed.sort(), [oldAgent, oldClone, oldHarness].sort());
  for (const kept of [recent, foreign, prefixOnly]) assert.ok(fs.existsSync(kept), kept);
  for (const gone of result.removed) assert.ok(!fs.existsSync(gone), gone);
});

test("a dry run lists what it would remove and removes nothing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-tmp-root-"));
  const old = makeDir(root, "factory-py-ovwnbz1s", 120);
  const result = cleanTmp({ root, maxAgeMinutes: 60, dryRun: true });
  assert.deepEqual(result.removed, [old]);
  assert.ok(fs.existsSync(old));
});
