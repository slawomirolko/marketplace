import { Details } from "../src/Details.tsx";
import { buildLevel, findItem } from "../src/tree.ts";
import type { Item, Workflow } from "../src/types.ts";
import { mainWorkflow, renderWithViewer, report, run, screen, within } from "./test-utils/index.ts";

const wrapperWorkflow: Workflow = { name: "wrap", version: "1.0.0", entry: "inner", nodes: [{ id: "inner", kind: "subgraph", workflow: "main" }], edges: [{ from: "inner", to: "END" }] };

function item(key: string, workflows: Workflow[] = [mainWorkflow], root = "main"): Item {
  const found = findItem(buildLevel(workflows, root), key);
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
  test("keeps the raw error text of a failed step next to its short form", () => {
    const raw = '{"type":"http","status":429,"message":"rate limited","retryAfter":30}';
    renderWithViewer(<Details item={item("main/run")} />, { mode: "runs", run: { ...run, status: "failed", events: [...run.events, { at: run.events[0]!.at, type: "node_failed", node: "main/run", error: raw }] } });

    expect(screen.getByText("Failed: http 429: rate limited")).toHaveAttribute("title", raw);
  });

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

  test("shows the active time of a step from the report and keeps the user wait apart", () => {
    renderWithViewer(<Details item={item("main/ask")} />, { mode: "runs", run, report });

    expect(within(row("Total")).getByText("1s")).toBeInTheDocument();
    const cells = within(screen.getByRole("columnheader", { name: "Waiting for answer" }).closest("table")!).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent).slice(2)).toEqual(["done", "1s", "1m 00s"]);
  });

  test("shows a team's wall time from the report, not the sum of its agents", () => {
    renderWithViewer(<Details item={item("main/team")} />, { mode: "runs", run, report });

    expect(within(row("Total")).getByText("29s")).toBeInTheDocument();
  });

  test("shows a subgraph's cost and time as the report sums them", () => {
    const bySubgraph = { "wrap/inner": { costUsd: 0.35, tokens: 3600, cacheTokens: 0, steps: 3, llmSteps: 3, unknownSteps: 1, costSource: "mixed" } };
    const passes = report.passes.map((pass) => ({ ...pass, node: pass.node.replace("main/", "wrap/inner/") }));
    renderWithViewer(<Details item={item("wrap/inner", [wrapperWorkflow, mainWorkflow], "wrap")} />, { mode: "runs", run, report: { ...report, bySubgraph, passes } });

    expect(within(row("Cost")).getByText("≥ $0.350000 (partial, 1 of 3 LLM steps unknown)")).toBeInTheDocument();
    expect(within(row("Steps")).getByText("3")).toBeInTheDocument();
    expect(within(row("Cost source")).getByText("mixed")).toBeInTheDocument();
    expect(within(row("Total")).getByText("1m 00s over 4 step runs inside")).toBeInTheDocument();
    expect(within(row("Waiting for answers")).getByText("1m 00s (not counted)")).toBeInTheDocument();
  });

  test("without a selected node summarizes the workflow configuration", () => {
    renderWithViewer(<Details item={null} />);

    expect(screen.getByRole("heading", { name: "main" })).toBeInTheDocument();
    expect(screen.getByText("Configuration only: no run, no cost.")).toBeInTheDocument();
  });
});
