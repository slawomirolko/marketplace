// Sanitize gate (scripts/olko-sanitize.mjs): fail closed, name variants, binary
// and non-regular files, secret patterns, and output that never echoes a value.
//
// All terms and secrets here are made up. Secret-shaped values are built at
// run time, so this file holds no string a secret scanner would flag.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const sanitizeScript = path.join(scriptsDir, "olko-sanitize.mjs");
const BLOCKED = 2;
const FAILED = 1;
const ORG = "tapirorg";
const REPO = "billing-portal";

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sanitize-${prefix}-`));
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** A git project in a folder named `folder`, with an origin remote unless `remote` is null. */
function project({ folder = "quiet-meadow", remote = `https://git.example.invalid/${ORG}/${REPO}.git` } = {}) {
  const root = path.join(tmp("project"), folder);
  fs.mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  if (remote) {
    git(root, "remote", "add", "origin", remote);
  }
  return root;
}

function stage(files) {
  const root = tmp("stage");
  for (const [name, content] of Object.entries(files)) {
    write(path.join(root, name), content);
  }
  return root;
}

function termsFile(config = { leakTerms: ["placeholderterm"] }) {
  const file = path.join(tmp("terms"), "terms.json");
  fs.writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config));
  return file;
}

/** Runs the gate with a private home, so the caller's real configuration never takes part. */
function run(args, env = {}) {
  const home = tmp("home");
  const environment = { ...process.env, OLKO_SYNC_HOME: home, ...env };
  if (!("FACTORY_LEAK_TERMS" in env)) {
    delete environment.FACTORY_LEAK_TERMS;
  }
  return spawnSync(process.execPath, [sanitizeScript, ...args], { encoding: "utf8", env: environment });
}

function gate(stageDir, projectDir, { config, args = [], env } = {}) {
  return run(["--path", stageDir, "--project", projectDir, "--terms-file", termsFile(config), "--json", ...args], env);
}

function output(result) {
  return `${result.stdout}${result.stderr}`.toLowerCase();
}

test("fails closed when the project is not a git repository, unless --allow-no-config", () => {
  const plain = path.join(tmp("plain"), "quiet-meadow");
  fs.mkdirSync(plain);
  const staged = stage({ "SKILL.md": "Clean text.\n" });
  const refused = gate(staged, plain);
  assert.equal(refused.status, FAILED);
  assert.match(refused.stderr, /E_NO_TERMS/);
  assert.match(refused.stderr, /remote/);
  assert.equal(gate(staged, plain, { args: ["--allow-no-config"] }).status, 0);
});

test("fails closed when a git repository has no usable remote term", () => {
  const result = gate(stage({ "SKILL.md": "Clean text.\n" }), project({ remote: null }));
  assert.equal(result.status, FAILED);
  assert.match(result.stderr, /remote/);
});

test("fails closed without private configuration and names the empty source, not a value", () => {
  const staged = stage({ "SKILL.md": "Clean text.\n" });
  const root = project();
  const refused = run(["--path", staged, "--project", root, "--json"]);
  assert.equal(refused.status, FAILED);
  assert.match(refused.stderr, /E_NO_TERMS/);
  assert.match(refused.stderr, /config/);
  assert.equal(output(refused).includes("billing"), false);
  assert.equal(run(["--path", staged, "--project", root, "--json", "--allow-no-config"]).status, 0);
  assert.equal(run(["--path", staged, "--project", root, "--json"], { FACTORY_LEAK_TERMS: "placeholderterm" }).status, 0);
});

test("matches spelling variants of a derived name: case, separators, camelCase, zero-width and full-width characters", () => {
  const root = project();
  for (const variant of ["BillingPortal", "billing_portal", "billing portal", "billing.portal", "billing​portal", "ｂｉｌｌｉｎｇ-portal"]) {
    const result = gate(stage({ "SKILL.md": `Run the ${variant} checks.\n` }), root);
    assert.equal(result.status, BLOCKED, `variant ${JSON.stringify(variant)} passed`);
  }
});

test("blocks split parts of the project folder name", () => {
  const result = gate(stage({ "SKILL.md": "Ask the Meadow team.\n" }), project({ folder: "quiet-meadow" }));
  assert.equal(result.status, BLOCKED);
});

test("blocks the repository name of a worktree, not only the worktree folder name", () => {
  const base = tmp("repo");
  const main = path.join(base, "kiwiledger");
  fs.mkdirSync(main);
  git(main, "init", "-q", "-b", "main");
  git(main, "remote", "add", "origin", "https://git.example.invalid/someorg/otherthing.git");
  git(main, "commit", "-q", "--allow-empty", "-m", "init");
  const worktree = path.join(base, "wt-folder");
  git(main, "worktree", "add", "-q", worktree);
  const result = gate(stage({ "SKILL.md": "Part of KiwiLedger.\n" }), worktree);
  assert.equal(result.status, BLOCKED);
});

test("blocks every non-generic remote URL segment and the host", () => {
  const root = project({ remote: "https://code.marmothost.invalid/tapirorg/beaverproject/_git/otterrepo" });
  for (const word of ["tapirorg", "beaverproject", "otterrepo", "marmothost"]) {
    assert.equal(gate(stage({ "SKILL.md": `See ${word}.\n` }), root).status, BLOCKED, `${word.length}-char segment passed`);
  }
});

test("warns when a derived term is too short to check, without printing it", () => {
  const result = gate(stage({ "SKILL.md": "Clean text.\n" }), project({ folder: "ox-meadow" }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /warning: 1 derived term\(s\) from folder/);
});

test("blocks configured terms inside longer tokens and multi-word terms across separators", () => {
  const root = project();
  const config = { leakTerms: ["placeholderterm"], forbiddenTerms: ["red panda"] };
  for (const text of ["superredpandas", "Red-Panda", "RedPanda"]) {
    assert.equal(gate(stage({ "SKILL.md": `${text}\n` }), root, { config }).status, BLOCKED, `${text.length}-char text passed`);
  }
});

test("blocks binary files", () => {
  const result = gate(stage({ "logo.bin": Buffer.from([0x89, 0x50, 0x00, 0x01]) }), project());
  assert.equal(result.status, BLOCKED);
  assert.deepEqual(JSON.parse(result.stdout).hits.map((hit) => hit.term), ["#binary"]);
});

test("decodes UTF-16 by its byte order mark and scans it", () => {
  const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  assert.equal(gate(stage({ "notes.txt": utf16("billing-portal notes\n") }), project()).status, BLOCKED);
  assert.equal(gate(stage({ "notes.txt": utf16("clean notes\n") }), project()).status, 0);
});

test("blocks symlinks and other non-regular entries in the stage", (context) => {
  const staged = stage({ "SKILL.md": "Clean text.\n" });
  const target = tmp("target");
  try {
    fs.symlinkSync(target, path.join(staged, "linked"), "junction");
  } catch {
    context.skip("this system cannot create a link");
    return;
  }
  const result = gate(staged, project());
  assert.equal(result.status, BLOCKED);
  assert.deepEqual(JSON.parse(result.stdout).hits.map((hit) => hit.term), ["#non-regular"]);
});

test("blocks secret patterns with a label and never prints the value", () => {
  const secrets = {
    "github-token": `gh${"p"}_${"A1b2C3d4".repeat(5)}`,
    "github-pat": `github${"_pat_"}${"A1b2C3d4E5".repeat(3)}`,
    "aws-access-key": `AK${"IA"}${"QWERTYUIOPASDFGH"}`,
    "slack-token": `xo${"xb"}-${"1234567890"}-abcdefghij`,
    "private-key": `-----BEGIN RSA PRIVATE ${"KEY"}-----`,
    jwt: `ey${"J"}${"a".repeat(12)}.ey${"J"}${"b".repeat(12)}.${"c".repeat(12)}`,
    "connection-string": `postgres://admin:${"s3cr3tvalue"}@db.example.com/app`,
    email: `jane.doe@${"corpmail"}.io`,
    "internal-host": `build01.${"corp"}`,
  };
  const root = project();
  for (const [label, value] of Object.entries(secrets)) {
    const result = gate(stage({ "SKILL.md": `Use ${value} here.\n` }), root);
    assert.equal(result.status, BLOCKED, `${label} passed`);
    assert.ok(JSON.parse(result.stdout).hits.some((hit) => hit.term === `#secret:${label}`), `${label} not labelled`);
    assert.equal(output(result).includes(value.toLowerCase()), false, `${label} value printed`);
  }
});

test("passes documentation placeholders that only look like secrets", () => {
  const text = "Mail user@example.com, clone git@github.com:owner/repo.git, keep settings.local.json, .env.local and *.local.* files, call host.docker.internal, set Password=<your password>.\n";
  const result = gate(stage({ "SKILL.md": text }), project());
  assert.equal(result.status, 0, result.stdout);
});

test("errors print a fixed code, never the input that caused them", () => {
  const root = project();
  const staged = stage({ "SKILL.md": "Clean text.\n" });
  const invalid = run(["--path", staged, "--project", root, "--terms-file", termsFile("quokkasecret is not json"), "--json"]);
  assert.equal(invalid.status, FAILED);
  assert.match(invalid.stderr, /^sanitize failed: E_[A-Z_]+/);
  assert.equal(output(invalid).includes("quokkasecret"), false);

  const missing = run(["--path", path.join(staged, "quokkafolder"), "--project", root, "--terms-file", termsFile(), "--json"]);
  assert.equal(missing.status, FAILED);
  assert.equal(output(missing).includes("quokkafolder"), false);

  const unknown = run(["--quokkaflag"]);
  assert.equal(unknown.status, FAILED);
  assert.equal(output(unknown).includes("quokkaflag"), false);
});

test("the JSON report indexes a file whose name holds a hit instead of printing the name", () => {
  const result = gate(stage({ "billing-portal-notes.md": "Clean text.\nbilling portal\n" }), project());
  assert.equal(result.status, BLOCKED);
  assert.equal(output(result).includes("notes"), false);
  const hits = JSON.parse(result.stdout).hits;
  assert.deepEqual([...new Set(hits.map((hit) => `${hit.file}:${hit.line}`))], ["#file1:0", "#file1:2"]);
});
