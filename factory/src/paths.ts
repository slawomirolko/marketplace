import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWER_HEALTH = "skill-factory-viewer";
export const DEFAULT_VIEWER_PORT = 7340;

export function defaultDataDir(): string {
  return process.env.FACTORY_DATA_DIR ?? homeDataDir();
}

export function homeDataDir(): string {
  return process.env.FACTORY_HOME_DIR ?? path.join(os.homedir(), ".skill-factory");
}

/** Device settings: KEY=value lines in the factory home's .env, never in a repository. Variables already set in the environment win. Returns the names it set. */
export function loadHomeEnv(file = path.join(homeDataDir(), ".env")): string[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  const values = parseEnv(fs.readFileSync(file, "utf8"));
  const loaded = Object.keys(values).filter((name) => process.env[name] === undefined);
  for (const name of loaded) {
    process.env[name] = values[name];
  }
  return loaded;
}

export function sourcesFile(): string {
  return path.join(homeDataDir(), "sources.json");
}

/** The parsed JSON of a file, or undefined when the file does not exist. Any other read or parse failure throws with the file name. */
export function readJsonFile<T>(file: string): T | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The registered data folders; a missing list is empty, and a list that cannot be parsed throws, so registerDataSource never overwrites it. */
export function readSources(): string[] {
  const dirs = readJsonFile<{ dirs?: unknown }>(sourcesFile())?.dirs;
  return Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === "string") : [];
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
