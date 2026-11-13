import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FACTORY_DIR } from "./paths.ts";
import { validate } from "./spec.ts";
import type { Tier } from "./types.ts";

export interface FactoryConfig {
  roles: Record<string, Tier>;
  budget: { maxCostUsd: number; infoRatio: number; pauseRatio: number };
  switches: Record<string, boolean>;
}

export function configFile(): string {
  return process.env.FACTORY_CONFIG ?? path.join(FACTORY_DIR, "config", "factory.yaml");
}

export function loadFactoryConfig(file = configFile()): FactoryConfig {
  const raw = parseYaml(fs.readFileSync(file, "utf8")) as { roles: Record<string, Tier>; budget: { maxCostUsd: number; infoRatio?: number; pauseRatio?: number }; switches?: Record<string, boolean> };
  const result = validate("factory-config", raw);
  if (!result.valid) throw new Error(`${file}: ${result.errors.join("; ")}`);
  return {
    roles: raw.roles,
    budget: { maxCostUsd: raw.budget.maxCostUsd, infoRatio: raw.budget.infoRatio ?? 0.5, pauseRatio: raw.budget.pauseRatio ?? 0.8 },
    switches: raw.switches ?? {},
  };
}
