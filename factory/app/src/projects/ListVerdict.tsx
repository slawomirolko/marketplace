import { countsText, verdictOf } from "./status-text.ts";

export function ListVerdict({ counts }: { counts: Record<string, number> | null }) {
  const verdict = verdictOf(counts);
  return (
    <span className="small">
      <span className={`verdict-badge verdict-${verdict.level}`}>{verdict.badge}</span> {countsText(counts)}
    </span>
  );
}
