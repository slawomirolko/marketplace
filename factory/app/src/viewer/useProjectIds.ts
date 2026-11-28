import { useEffect, useState } from "react";
import { getJson, messageOf } from "../api.ts";
import type { ProjectOverview } from "../types.ts";
import type { NoteLoad } from "./useLoadNotes.ts";
import type { ViewMode } from "./view-mode.ts";

/** The ids of the registered projects for the project filter, reloaded each time the runs view opens. */
export function useProjectIds(mode: ViewMode, noteLoad: NoteLoad): string[] {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  useEffect(() => {
    if (mode !== "runs") {
      return;
    }
    getJson<ProjectOverview>("/projects")
      .then((projectList) => {
        setProjectIds(projectList.projects.map((project) => project.id));
        noteLoad("projects", null);
      })
      .catch((loadError: unknown) => {
        setProjectIds([]);
        noteLoad("projects", `Could not load projects: ${messageOf(loadError)}`);
      });
  }, [mode, noteLoad]);
  return projectIds;
}
