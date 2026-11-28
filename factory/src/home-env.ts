import path from "node:path";
import { homeDataDir, loadHomeEnv } from "./paths.ts";

/**
 * Device settings from the factory home's .env. Every entry module imports this module first:
 * ES modules run in import order, so modules that read process.env when they load see these values.
 */
export const homeEnv = { file: path.join(homeDataDir(), ".env"), loaded: loadHomeEnv() };

/** One line for the start-up log: setting names only, never their values. */
export function homeEnvNote(): string | null {
  return homeEnv.loaded.length ? `factory settings from ${homeEnv.file}: ${homeEnv.loaded.join(", ")}` : null;
}
