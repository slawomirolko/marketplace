import "./helpers/isolated-home.ts";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("a test process uses a temp factory home, never the real ~/.skill-factory", async () => {
  const { homeDataDir } = await import("../src/paths.ts");
  const home = path.resolve(homeDataDir());
  assert.notEqual(home, path.resolve(os.homedir(), ".skill-factory"));
  assert.ok(home.startsWith(path.resolve(os.tmpdir())), `${home} is under the temp folder`);
});
