import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWER_HEALTH = "skill-factory-viewer";
export const DEFAULT_VIEWER_PORT = 7340;

export function defaultDataDir(): string {
  return process.env.FACTORY_DATA_DIR ?? homeDataDir();
}

export function homeDataDir(): string {
  return path.join(os.homedir(), ".skill-factory");
}

export function sourcesFile(): string {
  return path.join(homeDataDir(), "sources.json");
}

export function readSources(): string[] {
  try {
    const dirs = (JSON.parse(fs.readFileSync(sourcesFile(), "utf8")) as { dirs?: unknown }).dirs;
    return Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function registerDataSource(dataDir: string): void {
  const dir = path.resolve(dataDir);
  if (dir === path.resolve(homeDataDir())) return;
  const dirs = readSources().filter((d) => fs.existsSync(d));
  if (!dirs.includes(dir)) dirs.push(dir);
  fs.mkdirSync(homeDataDir(), { recursive: true });
  fs.writeFileSync(sourcesFile(), `${JSON.stringify({ dirs }, null, 2)}\n`);
}

export function viewerOptions(dataDir: string) {
  return {
    viewerDir: process.env.FACTORY_VIEWER_DIR ?? path.join(FACTORY_DIR, "app", "dist"),
    dataDir,
    factoryDir: FACTORY_DIR,
    configFile: process.env.FACTORY_CONFIG ?? path.join(FACTORY_DIR, "config", "factory.yaml"),
  };
}
