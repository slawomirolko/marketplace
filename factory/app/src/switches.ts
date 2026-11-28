import { isGroup } from "./tree.ts";
import type { FactoryConfig, Item, Level, RunData } from "./types.ts";

export function disabledKeys(run: RunData | null): string[] {
  if (!run) return [];
  return run.events.filter((e) => e.type === "node_completed" && typeof e.result === "string" && e.result.includes("skipped: switch off")).map((e) => String(e.node));
}

export function configDisabledKeys(level: Level | null, config: FactoryConfig | null): string[] {
  const switches = config?.switches ?? {};
  const keys: string[] = [];
  const walk = (items: Item[]) => {
    for (const item of items) {
      if (item.kind === "terminal" || item.kind === "agent") continue;
      const when = item.node.enabledWhen?.match(/^switches\.([a-z0-9-]+)\s*(==|!=)\s*(true|false)$/);
      if (when) {
        const value = switches[when[1]!] ?? true;
        const holds = when[2] === "==" ? String(value) === when[3] : String(value) !== when[3];
        if (!holds) keys.push(item.key);
      }
      if (isGroup(item)) walk(item.inner.items);
    }
  };
  if (level) walk(level.items);
  return keys;
}

export function isDisabled(key: string, disabled: string[]): boolean {
  return disabled.some((d) => key === d || key.startsWith(`${d}/`) || key.startsWith(`${d}#`));
}
