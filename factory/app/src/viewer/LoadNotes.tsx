export function LoadNotes({ notes }: { notes: Record<string, string> }) {
  if (Object.keys(notes).length === 0) {
    return null;
  }
  return (
    <div className="load-notes">
      {Object.entries(notes).map(([topic, note]) => (
        <p key={topic} className="error" role="status">
          {note}
        </p>
      ))}
    </div>
  );
}
