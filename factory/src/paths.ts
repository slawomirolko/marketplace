import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FACTORY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWER_HEALTH = "skill-factory-viewer";
export const DEFAULT_VIEWER_PORT = 7340;

export function defaultDataDir(): string {
  return process.env.FACTORY_DATA_DIR ?? path.join(os.homedir(), ".skill-factory");
}

export function viewerOptions(dataDir: string) {
  return {
    viewerDir: process.env.FACTORY_VIEWER_DIR ?? path.join(FACTORY_DIR, "app", "dist"),
    dataDir,
    factoryDir: FACTORY_DIR,
    configFile: path.join(FACTORY_DIR, "spec", "examples", "valid", "factory-config.json"),
  };
}
