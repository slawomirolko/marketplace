import { LIVE_REFRESH_MS } from "../api.ts";
import type { LiveState } from "../live.ts";
import { shortPath } from "../tree.ts";

const MS_PER_SECOND = 1000;

export function LiveBar({ live, refreshedAt, refreshError, onShowCurrent }: { live: LiveState; refreshedAt: Date | null; refreshError: string | null; onShowCurrent: () => void }) {
  return (
    <span className="live-bar" role="status">
      <span className="live-dot" aria-hidden="true" />
      {live.waiting ? "Waiting for your answer" : "Running"}
      {live.node ? ` · now: ${shortPath(live.node)}` : ""}
      {live.agents.length ? ` · ${live.agents.length} agent${live.agents.length === 1 ? "" : "s"} working` : ""}
      {` · refreshes every ${LIVE_REFRESH_MS / MS_PER_SECOND} s${refreshedAt ? `, last ${refreshedAt.toLocaleTimeString()}` : ""}`}
      {refreshError && <span className="pending-error">{refreshError}</span>}
      <button type="button" data-testid="show-current-step" onClick={onShowCurrent}>Show current step</button>
    </span>
  );
}
