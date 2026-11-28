import { useCallback, useState } from "react";

export type NoteLoad = (topic: string, note: string | null) => void;

/** One note per data source that failed to load; a null note clears the topic after a later load works. */
export function useLoadNotes(): { loadNotes: Record<string, string>; noteLoad: NoteLoad } {
  const [loadNotes, setLoadNotes] = useState<Record<string, string>>({});
  const noteLoad = useCallback((topic: string, note: string | null) => {
    setLoadNotes((current) => {
      if (note !== null) {
        return { ...current, [topic]: note };
      }
      if (!(topic in current)) {
        return current;
      }
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== topic));
    });
  }, []);
  return { loadNotes, noteLoad };
}
