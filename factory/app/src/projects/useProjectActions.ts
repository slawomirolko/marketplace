import { useCallback, useState } from "react";
import { API, messageOf, postAction } from "../api.ts";

/** Posts one project action; `done` turns the result into the note to show (null for none), then the list reloads. */
export type ProjectAction = <T>(body: Record<string, string>, done: (result: T) => string | null) => Promise<void>;

function postProjects<T>(body: Record<string, string>): Promise<T> {
  return postAction<T>(`${API}/projects`, "projects", body);
}

/** The project actions and whether one is running; a failed action shows its error as the note. */
export function useProjectActions(load: () => Promise<void>, setNote: (note: string | null) => void): { busy: boolean; act: ProjectAction } {
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async <T,>(body: Record<string, string>, done: (result: T) => string | null) => {
      setBusy(true);
      setNote(null);
      try {
        const result = await postProjects<T>(body);
        setNote(done(result));
        await load();
      } catch (error) {
        setNote(messageOf(error));
      } finally {
        setBusy(false);
      }
    },
    [load, setNote],
  );
  return { busy, act };
}
