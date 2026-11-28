import { useCallback, useEffect, useMemo, useState } from "react";
import { liveAncestors, liveState } from "../live.ts";
import type { LiveState } from "../live.ts";
import type { Level, RunData } from "../types.ts";

export interface LiveExpansion {
  expanded: Set<string>;
  /** The group whose toggle was used last; its button keeps the focus after the graph is laid out again. */
  focusKey: string | null;
  toggle: (key: string) => void;
  expand: (keys: string[]) => void;
  live: LiveState;
  showCurrent: () => void;
}

/** The expanded groups of the graph, and the live state of a running run with the groups that hold its current step. */
export function useLiveExpansion(level: Level | null, run: RunData | null): LiveExpansion {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setFocusKey(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expand = useCallback((keys: string[]) => {
    setExpanded((current) => new Set([...current, ...keys]));
  }, []);

  const live = useMemo(() => liveState(run), [run]);
  const showCurrent = useCallback(() => {
    if (!level) {
      return;
    }
    expand(liveAncestors(level, live));
  }, [level, live, expand]);

  const liveKey = `${live.node ?? ""}|${live.agents.join(",")}`;
  /**
   * Expands the groups that hold the current step when the live step or agents change, or when the graph first
   * exists. `showCurrent` is left out of the dependencies on purpose: it changes with every refreshed run and every
   * new level, and running on each of those would expand again the groups the user has just collapsed.
   */
  useEffect(() => {
    if (live.node || live.agents.length) {
      showCurrent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, level !== null]);

  return { expanded, focusKey, toggle, expand, live, showCurrent };
}
