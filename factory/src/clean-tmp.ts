import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWNED = /^(factory-[a-z-]+|harness-agent|workflow-yaml)-[A-Za-z0-9_]{6,}$/;

export interface CleanOptions {
  root?: string;
  maxAgeMinutes?: number;
  dryRun?: boolean;
}

export function cleanTmp({ root = os.tmpdir(), maxAgeMinutes = 60, dryRun = false }: CleanOptions = {}): { removed: string[]; failed: string[] } {
  const cutoff = Date.now() - maxAgeMinutes * 60000;
  const removed: string[] = [];
  const failed: string[] = [];
  for (const name of fs.readdirSync(root)) {
    if (!OWNED.test(name)) continue;
    const dir = path.join(root, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!stat.isDirectory() || stat.mtimeMs > cutoff) continue;
    if (dryRun) {
      removed.push(dir);
      continue;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      removed.push(dir);
    } catch {
      failed.push(dir);
    }
  }
  return { removed, failed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const age = args.indexOf("--max-age-min");
  const maxAgeMinutes = age >= 0 ? Number(args[age + 1]) : 60;
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 0) throw new Error("--max-age-min needs a number of minutes");
  const result = cleanTmp({ maxAgeMinutes, dryRun: args.includes("--dry-run") });
  console.log(`${args.includes("--dry-run") ? "Would remove" : "Removed"} ${result.removed.length} factory temp folders older than ${maxAgeMinutes} min from ${os.tmpdir()}.${result.failed.length ? ` Could not remove ${result.failed.length} (in use): ${result.failed.join(", ")}` : ""}`);
}
