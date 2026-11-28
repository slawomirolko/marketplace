// Shell-free start of the agent CLIs: Windows npm .cmd shims run through cmd.exe with every
// argument escaped, so paths with spaces stay one argument and metacharacters stay text.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { escapeCmdArgument, escapeCmdCommand, escapeShimArgument, resolveExecutable, spawnPlan } from "../src/win-spawn.ts";

const NASTY_ARGUMENTS = [
  "C:\\Program Files\\My Project",
  "a&b",
  "a|b",
  "a^b",
  "%PATH%",
  "%OS%",
  'say "hi"',
  "trailing\\",
  'quote at end\\"',
  "a & calc.exe",
  "x\" & echo injected & \"",
  "(paren) <in> >out",
  "!bang!",
  "",
  "plain",
];

test("an argument is quoted for the C runtime and every cmd.exe metacharacter gets a caret", () => {
  assert.equal(escapeCmdArgument("plain"), '^"plain^"');
  assert.equal(escapeCmdArgument("a b"), '^"a^ b^"');
  assert.equal(escapeCmdArgument("a&b|c"), '^"a^&b^|c^"');
  assert.equal(escapeCmdArgument("a^b"), '^"a^^b^"');
  assert.equal(escapeCmdArgument("%PATH%"), '^"^%PATH^%^"');
  assert.equal(escapeCmdArgument('say "hi"'), '^"say^ \\^"hi\\^"^"');
  assert.equal(escapeCmdArgument("dir\\"), '^"dir\\\\^"', "a trailing backslash is doubled so it cannot escape the closing quote");
  assert.equal(escapeCmdArgument('a\\"b'), '^"a\\\\\\^"b^"', "backslashes before a quote are doubled");
  assert.equal(escapeCmdArgument(""), '^"^"');
});

test("a shim argument is escaped twice, because the shim's %* is parsed by cmd.exe a second time", () => {
  assert.equal(escapeShimArgument("a&b"), '^^^"a^^^&b^^^"');
  assert.equal(escapeShimArgument('x" & y'), '^^^"x\\^^^"^^^ ^^^&^^^ y^^^"');
});

test("an argument with a line break is refused, because cmd.exe ends the command there", () => {
  assert.throws(() => escapeCmdArgument("a\nb"), /line break/);
  assert.throws(() => escapeCmdArgument("a\rb"), /line break/);
  assert.throws(() => escapeCmdCommand("C:\\a\nb.cmd"), /line break/);
});

test("the program path gets carets but no quotes", () => {
  assert.equal(escapeCmdCommand("C:\\Program Files\\nodejs\\opencode.cmd"), "C:\\Program^ Files\\nodejs\\opencode.cmd");
});

test("off Windows the command runs directly with its arguments untouched", () => {
  assert.deepEqual(spawnPlan("opencode", ["run", "a & b"], {}, "linux"), { file: "opencode", args: ["run", "a & b"], windowsVerbatimArguments: false });
});

test("on Windows a command is found on PATH in PATHEXT order; an .exe runs directly and a .cmd shim through cmd.exe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-win-spawn-"));
  try {
    fs.writeFileSync(path.join(dir, "tool.cmd"), "@echo off\n");
    fs.writeFileSync(path.join(dir, "native.exe"), "");
    fs.writeFileSync(path.join(dir, "native.cmd"), "@echo off\n");
    const env = { PATH: dir, PATHEXT: ".COM;.EXE;.BAT;.CMD", ComSpec: "C:\\Windows\\system32\\cmd.exe" };
    assert.equal(resolveExecutable("tool", env), path.join(dir, "tool.cmd"));
    assert.equal(resolveExecutable("native", env), path.join(dir, "native.exe"), ".EXE comes before .CMD in PATHEXT");
    assert.equal(resolveExecutable("missing", env), "missing");
    assert.equal(resolveExecutable("C:\\bin\\tool", env), "C:\\bin\\tool", "a path is not looked up");
    assert.deepEqual(spawnPlan("native", ["a b"], env, "win32"), { file: path.join(dir, "native.exe"), args: ["a b"], windowsVerbatimArguments: false });
    const plan = spawnPlan("tool", ["--add-dir", "C:\\My Dir & more"], env, "win32");
    assert.equal(plan.file, "C:\\Windows\\system32\\cmd.exe");
    assert.equal(plan.windowsVerbatimArguments, true);
    assert.deepEqual(plan.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.equal(plan.args[3], `"${escapeCmdCommand(path.join(dir, "tool.cmd"))} ${escapeShimArgument("--add-dir")} ${escapeShimArgument("C:\\My Dir & more")}"`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const NPM_SHIM = ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", '"%NODE_EXE%" "%dp0%\\print-args.js" %*', ""].join("\r\n");
const LEGACY_NPM_SHIM = ["@IF EXIST \"%~dp0\\node.exe\" (", '  "%~dp0\\node.exe" "%~dp0\\print-args.js" %*', ") ELSE (", "  @SETLOCAL", '  "%NODE_EXE%" "%~dp0\\print-args.js" %*', ")", ""].join("\r\n");

for (const [style, shim] of [["current", NPM_SHIM], ["legacy", LEGACY_NPM_SHIM]] as const) {
  test(`on Windows a ${style} npm shim in a folder with a space receives every argument unchanged`, { skip: process.platform !== "win32" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory win spawn "));
    try {
      fs.writeFileSync(path.join(dir, "print-args.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
      fs.writeFileSync(path.join(dir, "print-args.cmd"), shim);
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== "path"));
      const env = { ...inherited, PATH: `${dir}${path.delimiter}${process.env.PATH ?? ""}`, NODE_EXE: process.execPath };
      const plan = spawnPlan("print-args", NASTY_ARGUMENTS, env);
      const result = spawnSync(plan.file, plan.args, { env, encoding: "utf8", windowsVerbatimArguments: plan.windowsVerbatimArguments, shell: false });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), NASTY_ARGUMENTS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
