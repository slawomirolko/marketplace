import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const FACTORY_DIR = path.resolve(import.meta.dirname, "..");

/** The source paths of every COPY line of the Dockerfile (all words but the last, the destination). */
function copySources(): string[] {
  const dockerfile = fs.readFileSync(path.join(FACTORY_DIR, "Dockerfile"), "utf8");
  return dockerfile
    .split(/\r?\n/)
    .filter((line) => line.startsWith("COPY "))
    .flatMap((line) => line.split(/\s+/).slice(1, -1));
}

function copied(file: string, sources: string[]): boolean {
  return sources.some((source) => file === source || file.startsWith(`${source.replace(/\/$/, "")}/`));
}

test("every path the Dockerfile copies exists in the factory folder", () => {
  const missing = copySources().filter((source) => !fs.existsSync(path.join(FACTORY_DIR, source)));
  assert.deepEqual(missing, []);
});

test("the image holds every test script run-tests.sh runs, with the test modules they import", () => {
  const sources = copySources();
  const scripts = [...fs.readFileSync(path.join(FACTORY_DIR, "run-tests.sh"), "utf8").matchAll(/node (test\/[\w.-]+\.ts)/g)].map((match) => match[1]!);
  assert.ok(scripts.length > 0, "run-tests.sh runs test scripts");
  const needed = new Set(scripts);
  for (const script of scripts) {
    const body = fs.readFileSync(path.join(FACTORY_DIR, script), "utf8");
    for (const [, specifier] of body.matchAll(/^import (?!type ).*from "(\.\/[^"]+)";$/gm)) {
      needed.add(path.posix.join(path.posix.dirname(script), specifier!));
    }
  }
  assert.deepEqual([...needed].filter((file) => !copied(file, sources)), []);
});
