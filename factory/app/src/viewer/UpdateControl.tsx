import type { StaleWorkflow } from "../types.ts";

export interface UpdateControlProps {
  marketplace: string;
  updating: boolean;
  updateNote: string | null;
  stale: Record<string, StaleWorkflow>;
  onUpdate: () => void;
}

export function UpdateControl({ marketplace, updating, updateNote, stale, onUpdate }: UpdateControlProps) {
  const staleCount = Object.keys(stale).length;
  return (
    <span className="update">
      <button type="button" onClick={onUpdate} disabled={updating} title={`git fetch and fast-forward of ${marketplace || "the marketplace checkout"} (only when it is clean and on main), then reload agents, skills and workflows`}>
        {updating ? "Updating…" : "Update from marketplace"}
      </button>
      {staleCount > 0 && <span className="stale-count">⚠ {staleCount} workflows: source changed</span>}
      {updateNote && <span className="muted" role="status"> {updateNote}</span>}
    </span>
  );
}
