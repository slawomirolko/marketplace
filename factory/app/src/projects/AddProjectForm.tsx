export interface AddProjectFormProps {
  path: string;
  onPath: (path: string) => void;
  id: string;
  onId: (id: string) => void;
  busy: boolean;
  onAdd: (path: string, id: string) => void;
}

export function AddProjectForm({ path, onPath, id, onId, busy, onAdd }: AddProjectFormProps) {
  return (
    <form
      className="project-add"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(path.trim(), id.trim());
      }}
    >
      <h3>Add a project</h3>
      <label>
        Folder <input data-testid="project-path-input" value={path} onChange={(event) => onPath(event.target.value)} placeholder="C:\src\sample-app" required />
      </label>
      <label>
        Id (optional) <input data-testid="project-id-input" value={id} onChange={(event) => onId(event.target.value)} placeholder="sample-app" pattern="[a-z0-9][a-z0-9-]*" />
      </label>
      <button type="submit" data-testid="add-project" disabled={busy || !path.trim()}>Add</button>
    </form>
  );
}
