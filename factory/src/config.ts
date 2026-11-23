import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { FACTORY_DIR } from "./paths.ts";
import { validate } from "./spec.ts";
import type { ProjectsConfig, Tier } from "./types.ts";
import type { WatchSpec } from "./watch.ts";

export interface FactoryConfig {
  roles: Record<string, Tier>;
  budget: { maxCostUsd: number; infoRatio: number; pauseRatio: number };
  switches: Record<string, boolean>;
  memoryLayer: string;
  projects: Required<ProjectsConfig>;
  watches: WatchSpec[];
}

export const DEFAULT_MEMORY_LAYER = "olko-memory-layer";
export const DEFAULT_PROJECTS: Required<ProjectsConfig> = { markers: [".agents/skill-config.md", ".agents/skills", ".opencode/agents", ".claude/skills", ".claude/agents"], maxDepth: 3, statusWorkflow: "olko-project-status" };

/** Project discovery settings from a parsed config file, with defaults. */
export function projectsOf(raw: { projects?: ProjectsConfig } | null | undefined): Required<ProjectsConfig> {
  return { ...DEFAULT_PROJECTS, ...(raw?.projects ?? {}) };
}

/** The marketplace skill that gives an agent persistent memory, from a parsed config file. */
export function memoryLayerOf(raw: { memoryLayer?: string } | null | undefined): string {
  return raw?.memoryLayer ?? DEFAULT_MEMORY_LAYER;
}

export function configFile(): string {
  return process.env.FACTORY_CONFIG ?? path.join(FACTORY_DIR, "config", "factory.yaml");
}

export function loadFactoryConfig(file = configFile()): FactoryConfig {
  const raw = parseYaml(fs.readFileSync(file, "utf8")) as { roles: Record<string, Tier>; budget: { maxCostUsd: number; infoRatio?: number; pauseRatio?: number }; switches?: Record<string, boolean>; memoryLayer?: string; watches?: (Omit<WatchSpec, "stableChecks" | "skipWhen"> & { stableChecks?: number; skipWhen?: string[] })[]; projects?: ProjectsConfig };
  const result = validate("factory-config", raw);
  if (!result.valid) throw new Error(`${file}: ${result.errors.join("; ")}`);
  return {
    roles: raw.roles,
    budget: { maxCostUsd: raw.budget.maxCostUsd, infoRatio: raw.budget.infoRatio ?? 0.5, pauseRatio: raw.budget.pauseRatio ?? 0.8 },
    switches: raw.switches ?? {},
    memoryLayer: memoryLayerOf(raw),
    projects: projectsOf(raw),
    watches: (raw.watches ?? []).map((watch) => ({ ...watch, stableChecks: watch.stableChecks ?? 2, skipWhen: watch.skipWhen ?? [] })),
  };
}
