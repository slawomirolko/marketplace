export interface UpdateControlProps {
  marketplace: string;
  updating: boolean;
  updateNote: string | null;
  onUpdate: () => void;
}

/** The Update from marketplace button with the note of its last result; it sits in the project action row. */
export function UpdateControl({ marketplace, updating, updateNote, onUpdate }: UpdateControlProps) {
  return (
    <span className="update-control">
      <button type="button" data-testid="update-marketplace" onClick={onUpdate} disabled={updating} title={`git fetch and fast-forward of ${marketplace || "the marketplace checkout"} (only when it is clean and on main), then reload agents, skills and workflows`}>
        {updating ? "Updating…" : "Update from marketplace"}
      </button>
      {updateNote && <span className="muted" role="status"> {updateNote}</span>}
    </span>
  );
}
