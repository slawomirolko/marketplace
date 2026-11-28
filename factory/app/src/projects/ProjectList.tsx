import type { ProjectSummary } from "../types.ts";
import { ListVerdict } from "./ListVerdict.tsx";

export function ProjectList({ projects, selectedId, onSelect }: { projects: ProjectSummary[]; selectedId: string | null; onSelect: (projectId: string) => void }) {
  return (
    <>
      {projects.length === 0 && <p className="muted">No project yet. Add a folder or discover projects under a root folder.</p>}
      <ul>
        {projects.map((project) => (
          <li key={project.id}>
            <button type="button" className={project.id === selectedId ? "active" : ""} aria-current={project.id === selectedId} onClick={() => onSelect(project.id)}>
              <strong>{project.id}</strong>
              {!project.exists && <span className="warn"> · folder missing</span>}
              {project.status ? <ListVerdict counts={project.status.counts} /> : <span className="muted small">not checked yet</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
