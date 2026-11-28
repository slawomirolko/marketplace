import { useState } from "react";
import type { PendingItem } from "./types.ts";

export const NO_ITEMS = "none";

/** The answer of a multiple question: the checked item ids joined by commas, or `none`. */
export function answerOf(items: PendingItem[], checked: Set<string>): string {
  const ids = items.filter((item) => checked.has(item.id)).map((item) => item.id);
  return ids.length ? ids.join(",") : NO_ITEMS;
}

/** One checkbox per item, started as the item says, with its detail in an expandable element; Apply selected and Apply none answer. */
export function ItemChoice({ items, busy, onAnswer }: { items: PendingItem[]; busy: boolean; onAnswer: (answer: string) => void }) {
  const [checked, setChecked] = useState(() => new Set(items.filter((item) => item.checked).map((item) => item.id)));
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  return (
    <div className="pending-items">
      <ul className="pending-choices">
        {items.map((item) => (
          <li key={item.id}>
            <label>
              <input type="checkbox" data-testid={`merge-item-${item.id}`} checked={checked.has(item.id)} disabled={busy} onChange={() => toggle(item.id)} /> {item.label}
            </label>
            {item.detail && (
              <details>
                <summary>Details</summary>
                <pre className="question-text">{item.detail}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="pending-actions">
        <button type="button" data-testid="apply-selected" disabled={busy} onClick={() => onAnswer(answerOf(items, checked))}>
          Apply selected
        </button>
        <button type="button" data-testid="apply-none" disabled={busy} onClick={() => onAnswer(NO_ITEMS)}>
          Apply none
        </button>
      </div>
    </div>
  );
}
