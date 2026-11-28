import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { GH_READ_TOKEN_VARIABLE, sandboxEnv } from "./delegate-subagent.ts";
import { withEnv } from "./helpers/env.ts";
import { tempDir } from "./helpers/temp.ts";

function fakeLogin(): string {
  const dir = tempDir("factory-fake-login-");
  fs.writeFileSync(path.join(dir, ".credentials.json"), "{}");
  fs.mkdirSync(path.join(dir, "skills", "private-skill"), { recursive: true });
  fs.writeFileSync(path.join(dir, "settings.json"), "{}");
  return dir;
}

test("a test subagent gets no GitHub identity, no credential prompts and its own sync and config folders by default", () => {
  const root = tempDir("factory-sandbox-");
  const env = withEnv({ GH_TOKEN: "developer-token", GITHUB_TOKEN: "developer-token", GH_HOST: undefined }, () => sandboxEnv(root, { loginFrom: fakeLogin() }));
  assert.equal(env.GH_HOST, "github.invalid");
  assert.equal(env.GH_TOKEN, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  for (const name of ["OLKO_SYNC_HOME", "CLAUDE_CONFIG_DIR", "GH_CONFIG_DIR"]) {
    assert.ok(env[name]?.startsWith(root), `${name} is under the sandbox root: ${env[name]}`);
  }
  assert.deepEqual(fs.readdirSync(env.CLAUDE_CONFIG_DIR!), [".credentials.json"], "only the login, no user skills or settings");
  assert.deepEqual(fs.readdirSync(env.GH_CONFIG_DIR!), [], "no stored gh login");
});

test("GitHub reads are an explicit opt-in that needs a separate read-only token", () => {
  const root = tempDir("factory-sandbox-");
  assert.throws(() => withEnv({ [GH_READ_TOKEN_VARIABLE]: undefined }, () => sandboxEnv(root, { network: "github-read", loginFrom: fakeLogin() })), new RegExp(GH_READ_TOKEN_VARIABLE));
  const env = withEnv({ [GH_READ_TOKEN_VARIABLE]: "read-only-token", GH_TOKEN: "developer-token" }, () => sandboxEnv(root, { network: "github-read", loginFrom: fakeLogin() }));
  assert.equal(env.GH_TOKEN, "read-only-token");
  assert.equal(env.GH_HOST, undefined);
  assert.ok(env.GH_CONFIG_DIR?.startsWith(root));
});
