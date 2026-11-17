import { Details } from "../src/Details.tsx";
import { buildLevel, findItem } from "../src/tree.ts";
import type { Item } from "../src/types.ts";
import { mainWorkflow, renderWithViewer, screen, within } from "./testUtils/index.ts";

function item(key: string): Item {
  const found = findItem(buildLevel([mainWorkflow], "main"), key);
  if (!found) throw new Error(`no item ${key}`);
  return found;
}

function row(label: string): HTMLElement {
  const cell = screen.getByText(label);
  const line = cell.parentElement;
  if (!line) throw new Error(`no row ${label}`);
  return line;
}

describe("Details", () => {
  test("names a script step an engine script and shows its operation", () => {
    renderWithViewer(<Details item={item("main/stop")} />);

    expect(screen.getByRole("heading", { name: "stop" })).toBeInTheDocument();
    expect(within(row("Kind")).getByText("engine script")).toBeInTheDocument();
    expect(within(row("Operation")).getByText("builtin.stop")).toBeInTheDocument();
  });

  test("shows the agent of an llm step with the skills it may use", () => {
    renderWithViewer(<Details item={item("main/run")} />);

    expect(screen.getByRole("heading", { name: "Agent: syncer" })).toBeInTheDocument();
    expect(screen.getByText("syncer description")).toBeInTheDocument();
    expect(screen.getByText("sync", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/keeps sources in sync/)).toBeInTheDocument();
  });

  test("says when an agent declares no skills", () => {
    renderWithViewer(<Details item={item("main/team#two")} />);

    expect(screen.getByRole("heading", { name: "two (agent of team)" })).toBeInTheDocument();
    expect(screen.getByText("None declared.")).toBeInTheDocument();
  });

  test("shows the question an interrupt asks", () => {
    renderWithViewer(<Details item={item("main/ask")} />);

    expect(screen.getByRole("heading", { name: "Question to the user" })).toBeInTheDocument();
    expect(screen.getByText("Continue?")).toBeInTheDocument();
  });

  test("without a selected node summarizes the workflow configuration", () => {
    renderWithViewer(<Details item={null} />);

    expect(screen.getByRole("heading", { name: "main" })).toBeInTheDocument();
    expect(screen.getByText("Configuration only: no run, no cost.")).toBeInTheDocument();
  });
});
