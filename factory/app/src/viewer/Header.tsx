import type { ReactNode } from "react";
import { ModeSwitch } from "./ModeSwitch.tsx";
import { UpdateControl } from "./UpdateControl.tsx";
import type { UpdateControlProps } from "./UpdateControl.tsx";
import type { ViewMode } from "./view-mode.ts";

export interface HeaderProps {
  showCounts: boolean;
  onShowCounts: (value: boolean) => void;
  mode: ViewMode;
  onMode: (mode: ViewMode) => void;
  updater: UpdateControlProps;
  /** The controls of the current view, between the view switch and the update button. */
  children: ReactNode;
}

export function Header({ showCounts, onShowCounts, mode, onMode, updater, children }: HeaderProps) {
  return (
    <header>
      <label className="show-numbers" title="Show on every node how many times it ran in the selected run">
        <input type="checkbox" data-testid="show-numbers" checked={showCounts} onChange={(event) => onShowCounts(event.target.checked)} /> Show numbers
      </label>
      <h1>Factory viewer</h1>
      <ModeSwitch mode={mode} onMode={onMode} />
      {children}
      <UpdateControl {...updater} />
    </header>
  );
}
