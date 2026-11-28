import { useState } from "react";
import { Panel, ViewportPortal } from "@xyflow/react";
import "./supervisor.css";
import { supervisorRing } from "./supervisor.ts";
import type { SupervisorData } from "./types.ts";
import type { Bounds } from "./types.ts";

export const RING_GAP = 40;

export function ringBounds(bounds: Bounds | null): Bounds | null {
  return bounds && { x: bounds.x - RING_GAP, y: bounds.y - RING_GAP, width: bounds.width + 2 * RING_GAP, height: bounds.height + 2 * RING_GAP };
}

export function SupervisorRing({ supervisor, bounds }: { supervisor: SupervisorData | null | undefined; bounds: Bounds | null }) {
  const view = supervisorRing(supervisor);
  const [open, setOpen] = useState(false);
  const ring = ringBounds(bounds);
  if (!ring) return null;
  const box = { transform: `translate(${ring.x}px, ${ring.y}px)`, width: ring.width, height: ring.height };
  return (
    <>
      <ViewportPortal>
        <div className={`supervisor-ring tone-${view.tone}`} data-testid="supervisor-ring" style={box}>
          <button type="button" className="supervisor-badge nopan" aria-expanded={open} disabled={!view.text} onClick={() => setOpen((o) => !o)} title={view.text ? "Show the full supervisor report" : view.headline}>
            <strong>Supervisor</strong>
            <span className="supervisor-agent">{view.agent}</span>
            <span className="supervisor-status">{view.status}</span>
            {view.cost && <span className="supervisor-cost">{view.cost}</span>}
            <span className="supervisor-headline">{view.headline}</span>
          </button>
        </div>
      </ViewportPortal>
      {open && view.text && (
        <Panel position="top-right">
          <section className={`supervisor-panel tone-${view.tone}`} aria-label="Supervisor report">
            <header>
              <span>
                {view.agent}
                {view.model ? ` · ${view.model}` : ""}
                {view.cost ? ` · ${view.cost}` : ""}
              </span>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </header>
            <pre>{view.text}</pre>
          </section>
        </Panel>
      )}
    </>
  );
}
