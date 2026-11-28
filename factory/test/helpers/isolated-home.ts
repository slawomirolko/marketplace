import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Import this module first (before any src module) in a test file, or preload it with `node --import`.
 * It points FACTORY_HOME_DIR at a fresh temp folder before src/home-env.ts runs, so tests never read the real
 * ~/.skill-factory/.env or write the real sources.json and projects.json. Child processes inherit the folder;
 * the process that created it removes it on exit.
 */
const MARKER = "FACTORY_TEST_HOME";

if (!process.env[MARKER] || process.env.FACTORY_HOME_DIR !== process.env[MARKER]) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "factory-test-home-"));
  process.env.FACTORY_HOME_DIR = home;
  process.env[MARKER] = home;
  process.on("exit", () => {
    try {
      fs.rmSync(home, { recursive: true, force: true });
    } catch {
      return;
    }
  });
}

export const testHomeDir = process.env.FACTORY_HOME_DIR;
