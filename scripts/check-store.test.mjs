import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDigest, checkStore, globToRegExp, globsCover, globsOverlap, loadStore, parseFrontMatter } from "../skills/project/olko-init-project-docs/check-store.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "skills", "project", "olko-init-project-docs", "check-store.mjs");

function adr({ status = "Accepted", topic, scope, decision, overrides, supersedes, enforcedBy = "none", consequences = [] }) {
  const lines = ["---", `status: ${status}`, `topic: ${topic}`, `scope: [${scope.map((s) => `"${s}"`).join(", ")}]`, `decision: "${decision}"`];
  if (overrides) lines.push(`overrides: [${overrides.join(", ")}]`);
  if (supersedes) lines.push("supersedes:", ...supersedes.map((s) => `  - ${s}`));
  lines.push(`enforcedBy: ${enforcedBy}`, "---", "", "# Title", "", "## Context", "", "Long context that agents do not need.", "", "## Consequences", "", ...consequences.map((c) => `- ${c}`), "- Trade-offs: none.", "");
  return lines.join("\n");
}

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

const LOG_HEADER = "| ADR | Title | Status | Topic | Scope |\n|---|---|---|---|---|\n";

function validStore() {
  return project({
    "docs/adr/README.md": `${LOG_HEADER}| 0001 | UTC | Accepted | time.storage | \`src/**\` |\n| 0004 | EF Core | Accepted | persistence.orm | \`src/**\` |\n| 0007 | Dapper in reports | Accepted | persistence.orm | \`src/Reports/**\` |\n| 0011 | ADO.NET | Superseded by 0004 | persistence.orm | \`src/**\` |\n`,
    "docs/adr/0001-utc.md": adr({ topic: "time.storage", scope: ["src/**"], decision: "Store every timestamp in UTC.", consequences: ["Persistence code MUST NOT store local time."] }),
    "docs/adr/0004-ef-core.md": adr({ topic: "persistence.orm", scope: ["src/**"], decision: "Use EF Core for data access.", supersedes: ["ADR-0011"], consequences: ["Handlers MUST use repositories."] }),
    "docs/adr/0007-dapper.md": adr({ topic: "persistence.orm", scope: ["src/Reports/**"], decision: "Reports read data with Dapper.", overrides: ["ADR-0004"], enforcedBy: "archtest", consequences: ["Reports MUST NOT reference EF Core."] }),
    "docs/adr/0011-ado.md": adr({ status: "Superseded", topic: "persistence.orm", scope: ["src/**"], decision: "Use raw ADO.NET.", consequences: ["Code MUST use ADO.NET."] }),
    "docs/rules/README.md": "| File | Scope | Summary |\n|---|---|---|\n| api.md | `src/Api/**` | API rules. |\n",
    "docs/rules/api.md": '---\nscope: ["src/Api/**"]\nsummary: API rules.\n---\n\n- Endpoints MUST return problem details on errors.\n- Plain note without a keyword.\n',
  });
}

test("parseFrontMatter reads inline lists, block lists and quoted values", () => {
  const { front, body } = parseFrontMatter('---\nstatus: Accepted\nscope: ["a/**", b/*]\nsupersedes:\n  - ADR-0001\ndecision: "One line."\n---\nbody\n');
  assert.deepEqual(front, { status: "Accepted", scope: ["a/**", "b/*"], supersedes: ["ADR-0001"], decision: "One line." });
  assert.equal(body, "body\n");
  assert.equal(parseFrontMatter("# no front matter\n").front, null);
});

test("globs match paths and overlap by literal prefix", () => {
  assert.ok(globToRegExp("src/**").test("src/a/b.cs"));
  assert.ok(globToRegExp("src/**/Persistence/**").test("src/Orders/Persistence/Repo.cs"));
  assert.ok(globToRegExp("**").test("anything/at/all.ts"));
  assert.ok(!globToRegExp("src/*.cs").test("src/a/b.cs"));
  assert.ok(globToRegExp("web/{a,b}/*.ts").test("web/b/x.ts"));
  assert.ok(globsOverlap(["src/**"], ["src/Reports/**"]));
  assert.ok(!globsOverlap(["src/Api/**"], ["web/**"]));
  assert.ok(globsCover(["src/**"], ["src/Reports/**"]));
  assert.ok(!globsCover(["src/Reports/**"], ["src/**"]));
});

test("a store with overrides and supersedes is valid", () => {
  const result = checkStore(loadStore(validStore()));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.groups, []);
});

test("two Accepted ADRs with one topic and overlapping scopes and no link are an error and a group", () => {
  const dir = project({
    "docs/adr/README.md": `${LOG_HEADER}| 0001 | A | Accepted | logging.format | \`src/**\` |\n| 0002 | B | Accepted | logging.format | \`src/Api/**\` |\n| 0003 | C | Accepted | logging.format | \`src/Api/Admin/**\` |\n`,
    "docs/adr/0001-a.md": adr({ topic: "logging.format", scope: ["src/**"], decision: "JSON logs." }),
    "docs/adr/0002-b.md": adr({ topic: "logging.format", scope: ["src/Api/**"], decision: "Plain logs in the API." }),
    "docs/adr/0003-c.md": adr({ topic: "logging.format", scope: ["src/Api/Admin/**"], decision: "No logs in admin." }),
  });
  const result = checkStore(loadStore(dir));
  assert.equal(result.errors.filter((e) => e.includes("no overrides link")).length, 3);
  assert.deepEqual(result.groups, [{ topic: "logging.format", adrs: ["ADR-0001", "ADR-0002", "ADR-0003"] }]);
});

test("broken relations, log mismatches and missing keys are errors; legacy ADRs are listed as missing", () => {
  const dir = project({
    "docs/adr/README.md": `${LOG_HEADER}| 0001 | A | Accepted | a.b | \`src/**\` |\n| 0002 | B | Proposed | a.b | \`src/**\` |\n| 0003 | Legacy | Accepted |  | \`src/**\` |\n`,
    "docs/adr/0001-a.md": adr({ topic: "a.b", scope: ["src/**"], decision: "A.", supersedes: ["ADR-0009"] }),
    "docs/adr/0002-b.md": adr({ topic: "a.b", scope: ["src/X/**"], decision: "B.", overrides: ["ADR-0001"], enforcedBy: "maybe" }),
    "docs/adr/0003-legacy.md": "# 3. Legacy\n\nStatus: Accepted\n",
    "docs/adr/0005-no-log.md": "---\nstatus: Accepted\ntopic: c.d\n---\n",
  });
  const { errors, missing } = checkStore(loadStore(dir));
  const has = (text) => assert.ok(errors.some((e) => e.includes(text)), `expected an error with "${text}" in:\n${errors.join("\n")}`);
  has("supersedes ADR-0009, which does not exist");
  has("status Accepted differs from the log (Proposed)");
  has("enforcedBy must be one of");
  has("scope differs from the log");
  has("0005-no-log.md: no row in the ADR log");
  has("0005-no-log.md: missing front matter scope, decision, enforcedBy");
  assert.deepEqual(missing.map((m) => m.id), ["ADR-0003", "ADR-0005"]);
});

test("digest: the narrower ADR binds where it overrides, enforced ADRs keep only their decision, superseded ADRs never appear", () => {
  const store = loadStore(validStore());
  const reports = buildDigest(store, ["src/Reports/Daily.cs"]);
  assert.deepEqual(reports.blocked, []);
  assert.deepEqual(reports.digest.map((d) => `${d.source}: ${d.line}`), ["ADR-0001: Store every timestamp in UTC.", "ADR-0001: Persistence code MUST NOT store local time.", "ADR-0007: Reports read data with Dapper."]);
  assert.deepEqual(reports.enforced, [{ source: "ADR-0007", by: "archtest" }]);

  const api = buildDigest(store, ["src/Api/Orders.cs"]);
  assert.deepEqual(api.digest.map((d) => d.source), ["ADR-0001", "ADR-0001", "ADR-0004", "ADR-0004", "rules/api.md"]);
  assert.ok(api.digest.every((d) => !d.line.includes("Long context") && !d.line.includes("ADO.NET") && !d.line.includes("Plain note")));
});

test("digest: an unresolved collision is blocked, never guessed", () => {
  const dir = project({
    "docs/adr/README.md": `${LOG_HEADER}| 0001 | A | Accepted | logging.format | \`src/**\` |\n| 0002 | B | Accepted | logging.format | \`src/Api/**\` |\n`,
    "docs/adr/0001-a.md": adr({ topic: "logging.format", scope: ["src/**"], decision: "JSON logs." }),
    "docs/adr/0002-b.md": adr({ topic: "logging.format", scope: ["src/Api/**"], decision: "Plain logs." }),
  });
  const result = buildDigest(loadStore(dir), ["src/Api/A.cs", "src/Core/B.cs"]);
  assert.deepEqual(result.blocked, [{ topic: "logging.format", adrs: ["ADR-0001", "ADR-0002"], paths: ["src/Api/A.cs"] }]);
  assert.deepEqual(result.digest.map((d) => d.line), ["JSON logs."]);
});

test("digest without a store reports noStore", () => {
  const dir = project({ "README.md": "x" });
  assert.equal(buildDigest(loadStore(dir), ["a.ts"]).noStore, true);
});

test("the store directories come from .agents/skill-config.md", () => {
  const dir = project({
    ".agents/skill-config.md": "# Config\n\n- `adrDirectory`: `architecture/decisions`\n",
    "architecture/decisions/README.md": `${LOG_HEADER}| 0001 | A | Accepted | a.b | \`src/**\` |\n`,
    "architecture/decisions/0001-a.md": adr({ topic: "a.b", scope: ["src/**"], decision: "A." }),
  });
  const store = loadStore(dir);
  assert.equal(store.adrs.length, 1);
  assert.deepEqual(checkStore(store).errors, []);
});

test("CLI exit codes: 0 for a valid store, 1 for errors, 2 for usage; --digest prints JSON", () => {
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
    } catch (error) {
      return { code: error.status, out: String(error.stdout) };
    }
  };
  const valid = validStore();
  assert.equal(run([valid]).code, 0);
  const digest = JSON.parse(run([valid, "--digest", "src/Reports/A.cs"]).out);
  assert.equal(digest.noStore, false);
  const invalid = project({ "docs/adr/0001-a.md": adr({ topic: "a.b", scope: ["src/**"], decision: "A." }) });
  const failed = run([invalid]);
  assert.equal(failed.code, 1);
  assert.match(failed.out, /To fix: run the factory workflow olko-adr-store-reconcile/);
  assert.doesNotMatch(run([valid]).out, /To fix/);
  assert.equal(run([]).code, 2);
  const json = JSON.parse(run([invalid, "--json"]).out);
  assert.ok(json.errors.some((e) => e.includes("the ADR log is missing")));
});

test("brace alternatives use the same glob rules as the rest of the pattern", () => {
  assert.ok(globToRegExp("src/{*.ts,*.js}").test("src/a.ts"));
  assert.ok(globToRegExp("src/{*.ts,*.js}").test("src/b.js"));
  assert.ok(!globToRegExp("src/{*.ts,*.js}").test("src/deep/b.js"));
  assert.ok(globToRegExp("{src,web}/**/x?.cs").test("web/a/b/x1.cs"));
  assert.ok(globToRegExp("src/{a,{b,c}}/*.ts").test("src/c/x.ts"));
  assert.ok(!globToRegExp("src/{a,{b,c}}/*.ts").test("src/d/x.ts"));
});

test("scope overlap and cover compare on path segment boundaries", () => {
  assert.ok(!globsOverlap(["src/api"], ["src/apidocs/**"]));
  assert.ok(!globsOverlap(["src/api*"], ["src/apidocs/**"]));
  assert.ok(globsOverlap(["src/api*"], ["src/apidocs.md"]));
  assert.ok(globsOverlap(["src/api**"], ["src/apidocs/**"]));
  assert.ok(!globsCover(["src/api*"], ["src/apidocs/**"]));
  assert.ok(!globsCover(["src/api/**"], ["src/apidocs/**"]));
  assert.ok(globsCover(["src/api/**"], ["src/api/v1/**"]));
});

test("the CLI does not cut off a large digest", () => {
  const files = { "docs/adr/README.md": `${LOG_HEADER}| 0001 | A | Accepted | a.b | \`src/**\` |\n` };
  files["docs/adr/0001-a.md"] = adr({ topic: "a.b", scope: ["src/**"], decision: "A.", consequences: Array.from({ length: 4000 }, (_, index) => `Code MUST follow consequence number ${index} with a long explanatory sentence.`) });
  const dir = project(files);
  const out = execFileSync(process.execPath, [script, dir, "--digest", ...Array.from({ length: 5 }, (_, index) => `src/F${index}.cs`)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(JSON.parse(out).digest.filter((entry) => entry.line.includes("consequence number")).length, 4000);
});
