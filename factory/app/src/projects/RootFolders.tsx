import { useState } from "react";
import type { ProjectCandidate } from "../types.ts";
import type { ProjectAction } from "./useProjectActions.ts";

export interface RootFoldersProps {
  roots: string[];
  candidates: ProjectCandidate[] | null;
  busy: boolean;
  act: ProjectAction;
  onDiscover: () => void;
  onAddCandidate: (path: string, id: string) => void;
}

/** The root folders searched for projects, with the discovered candidates that can be added. */
export function RootFolders({ roots, candidates, busy, act, onDiscover, onAddCandidate }: RootFoldersProps) {
  const [newRoot, setNewRoot] = useState("");
  return (
    <div className="project-roots">
      <h3>Root folders</h3>
      <ul>
        {roots.map((root, index) => (
          <li key={root}>
            <code>{root}</code>{" "}
            <button type="button" data-testid={`remove-root-${index}`} disabled={busy} onClick={() => void act({ action: "remove_root", path: root }, () => null)} aria-label={`Remove root ${root}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act({ action: "add_root", path: newRoot.trim() }, () => {
            setNewRoot("");
            return null;
          });
        }}
      >
        <input data-testid="root-folder-input" value={newRoot} onChange={(event) => setNewRoot(event.target.value)} placeholder="C:\src" aria-label="Root folder" />
        <button type="submit" data-testid="add-root" disabled={busy || !newRoot.trim()}>Add root</button>
      </form>
      <button type="button" data-testid="discover-projects" onClick={onDiscover} disabled={busy || roots.length === 0} title="Search the root folders for projects with marketplace markers. Nothing is added until you add a candidate.">
        Discover
      </button>
      {candidates && candidates.length > 0 && (
        <ul className="candidates" aria-label="Discovered projects">
          {candidates.map((candidate) => (
            <li key={candidate.path}>
              <code>{candidate.path}</code> <span className="muted small">{candidate.markers.join(", ")}</span>{" "}
              <button type="button" data-testid={`add-candidate-${candidate.suggestedId}`} disabled={busy} onClick={() => onAddCandidate(candidate.path, candidate.suggestedId)}>
                Add as {candidate.suggestedId}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
