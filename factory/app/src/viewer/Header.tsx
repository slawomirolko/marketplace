import type { ReactNode } from "react";
import { ModeSwitch } from "./ModeSwitch.tsx";
import type { StaleWorkflow } from "../types.ts";
import type { ViewMode } from "./view-mode.ts";

export interface HeaderProps {
  showCounts: boolean;
  onShowCounts: (value: boolean) => void;
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  /** The workflows whose source changed; their count is shown at the end of the header. */
  stale: Record<string, StaleWorkflow>;
  /** The controls of the current view, after the view switch. */
  children: ReactNode;
}

export function Header({ showCounts, onShowCounts, mode, onMode, stale, children }: HeaderProps) {
  const staleCount = Object.keys(stale).length;
  return (
    <header>
      <label className="show-numbers" title="Show on every node how many times it ran in the selected run">
        <input type="checkbox" data-testid="show-numbers" checked={showCounts} onChange={(event) => onShowCounts(event.target.checked)} /> Show numbers
      </label>
      <h1>Factory viewer</h1>
      <ModeSwitch mode={mode} onMode={onMode} />
      {children}
      <span className="update">{staleCount > 0 && <span className="stale-count">⚠ {staleCount} workflows: source changed</span>}</span>
    </header>
  );
}
