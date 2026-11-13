import { useState } from "react";
import type { ReactNode } from "react";
import "./supervisor.css";
import { supervisorRing } from "./supervisor.ts";
import type { SupervisorData } from "./supervisor.ts";

export function SupervisorRing({ supervisor, children }: { supervisor: SupervisorData | null | undefined; children: ReactNode }) {
  const view = supervisorRing(supervisor);
  const [open, setOpen] = useState(false);
  return (
    <div className={`supervisor-ring tone-${view.tone}`} data-testid="supervisor-ring">
      <div className="supervisor-bar">
        <button type="button" className="supervisor-badge" aria-expanded={open} disabled={!view.text} onClick={() => setOpen((o) => !o)} title={view.text ? "Show the full supervisor report" : view.headline}>
          <strong>Supervisor</strong>
          <span className="supervisor-status">{view.status}</span>
          {view.cost && <span className="supervisor-cost">{view.cost}</span>}
          <span className="supervisor-headline">{view.headline}</span>
        </button>
      </div>
      <div className="supervisor-body">{children}</div>
      {open && view.text && (
        <section className="supervisor-panel" aria-label="Supervisor report">
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
      )}
    </div>
  );
}
