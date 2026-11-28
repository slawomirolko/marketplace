import { isGroup, isWithin } from "./tree.ts";
import type { FactoryConfig, Item, Level, RunData, RunEvent } from "./types.ts";

/** The text the engine puts in the result of a node it skipped because a switch turned it off. */
export const SWITCH_OFF_MARKER = "skipped: switch off";

export function isSwitchedOffEvent(event: RunEvent): boolean {
  return event.type === "node_completed" && typeof event.result === "string" && event.result.includes(SWITCH_OFF_MARKER);
}

/**
 * The engine's result text when a switch turned off this graph node or a node it is nested in; null when none did.
 * A team member (`node#agent`) is not matched; the details of its team show the status.
 */
export function switchedOffResult(run: RunData | null, key: string): string | null {
  const event = run?.events.find((candidate) => isSwitchedOffEvent(candidate) && candidate.node !== undefined && (key === candidate.node || key.startsWith(`${candidate.node}/`)));
  return event?.result ?? null;
}

export function disabledKeys(run: RunData | null): string[] {
  if (!run) {
    return [];
  }
  return run.events.filter(isSwitchedOffEvent).map((event) => String(event.node));
}

export function configDisabledKeys(level: Level | null, config: FactoryConfig | null): string[] {
  const switches = config?.switches ?? {};
  const keys: string[] = [];
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (item.kind === "terminal" || item.kind === "agent") {
        continue;
      }
      const when = item.node.enabledWhen?.match(/^switches\.([a-z0-9-]+)\s*(==|!=)\s*(true|false)$/);
      if (when) {
        const value = switches[when[1]!] ?? true;
        const holds = when[2] === "==" ? String(value) === when[3] : String(value) !== when[3];
        if (!holds) {
          keys.push(item.key);
        }
      }
      if (isGroup(item)) {
        walk(item.inner.items);
      }
    }
  };
  if (level) {
    walk(level.items);
  }
  return keys;
}

export function isDisabled(key: string, disabled: string[]): boolean {
  return disabled.some((disabledKey) => isWithin(key, disabledKey));
}
