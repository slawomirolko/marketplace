import type { Tier } from "./types.ts";

/** The model ids the factory knows by name: the short aliases a harness accepts and the default tier models. */
export const HAIKU_MODEL = "claude-haiku-5-5";
export const SONNET_MODEL = "claude-sonnet-5-5";
export const OPUS_MODEL = "claude-opus-5-5";

/** The short model names and the full model id each one stands for. */
export const MODEL_ALIASES: Record<string, string> = { haiku: HAIKU_MODEL, sonnet: SONNET_MODEL, opus: OPUS_MODEL };

/** The proposed model of every tier for a real backend; the user can change each one at confirmation. */
export const DEFAULT_TIER_MODELS: Record<Tier, string> = { low: HAIKU_MODEL, medium: HAIKU_MODEL, high: HAIKU_MODEL };

/** The model names of the fake backend, one per tier. */
export const FAKE_TIER_MODELS: Record<Tier, string> = { low: "fake-low", medium: "fake-medium", high: "fake-high" };
