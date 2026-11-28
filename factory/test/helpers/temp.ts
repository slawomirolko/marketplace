import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";

const created = new Set<string>();

/** Removes a folder and everything in it. Never throws: a file still held open (Windows) only leaves the folder behind. */
export function removeDir(dir: string | undefined): void {
  if (!dir) {
    return;
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    return;
  }
}

/**
 * The root after hook of the test file that imports this module. It is registered when the module loads,
 * so it runs once after every test of the file, wherever tempDir() was called.
 */
after(() => {
  for (const dir of created) {
    removeDir(dir);
  }
  created.clear();
});

/** A new folder under the system temp folder, removed after the last test of the file. `real` resolves 8.3 names and links (Windows). */
export function tempDir(prefix: string, { real = false }: { real?: boolean } = {}): string {
  const made = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dir = real ? fs.realpathSync.native(made) : made;
  created.add(dir);
  return dir;
}
