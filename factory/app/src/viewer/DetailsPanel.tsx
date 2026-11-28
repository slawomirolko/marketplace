import { CallsList } from "../Calls.tsx";
import { Details } from "../Details.tsx";
import { QuestionsList } from "../Questions.tsx";
import type { Item } from "../types.ts";

export type DetailsTab = "node" | "calls" | "questions";

const TABS: { id: DetailsTab; label: string }[] = [
  { id: "node", label: "Node" },
  { id: "calls", label: "All calls" },
  { id: "questions", label: "Questions" },
];

export interface DetailsPanelProps {
  tab: DetailsTab;
  onTab: (tab: DetailsTab) => void;
  selected: Item | null;
  teamNodes: Set<string>;
  onSelectKey: (key: string) => void;
}

function TabContent({ tab, selected, teamNodes, onSelectKey }: Omit<DetailsPanelProps, "onTab">) {
  switch (tab) {
    case "node":
      return <Details item={selected} />;
    case "calls":
      return <CallsList selectedKey={selected?.key ?? null} teamNodes={teamNodes} onSelect={onSelectKey} />;
    case "questions":
      return <QuestionsList item={selected} />;
  }
}

/** The side panel: the selected node, every call of the run, or the questions of the selected node. */
export function DetailsPanel({ tab, onTab, selected, teamNodes, onSelectKey }: DetailsPanelProps) {
  return (
    <aside>
      <div className="tabs" role="tablist" aria-label="Details">
        {TABS.map(({ id, label }) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className={tab === id ? "active" : ""} onClick={() => onTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <TabContent tab={tab} selected={selected} teamNodes={teamNodes} onSelectKey={onSelectKey} />
      </div>
    </aside>
  );
}
