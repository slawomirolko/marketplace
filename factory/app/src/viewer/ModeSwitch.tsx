import { VIEW_MODE_LABELS, VIEW_MODES } from "./view-mode.ts";
import type { ViewMode } from "./view-mode.ts";

export function ModeSwitch({ mode, onMode }: { mode: ViewMode; onMode: (mode: ViewMode) => void }) {
  return (
    <div className="mode" role="radiogroup" aria-label="View">
      {VIEW_MODES.map((option) => (
        <button key={option} type="button" role="radio" aria-checked={mode === option} className={mode === option ? "active" : ""} onClick={() => onMode(option)}>
          {VIEW_MODE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
