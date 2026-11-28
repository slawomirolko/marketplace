import { CallsList } from "../src/Calls.tsx";
import { fireEvent, renderWithViewer, report, run, screen, within } from "./test-utils/index.ts";

const teamNodes = new Set(["main/team"]);

describe("CallsList", () => {
  test("asks for a run outside the runs mode", () => {
    renderWithViewer(<CallsList selectedKey={null} teamNodes={teamNodes} onSelect={() => {}} />);

    expect(screen.getByText("Pick a run to see its calls.")).toBeInTheDocument();
  });

  test("says when no step has started yet", () => {
    renderWithViewer(<CallsList selectedKey={null} teamNodes={teamNodes} onSelect={() => {}} />, { mode: "runs", run: { ...run, events: [], ledger: [] }, report: { ...report, passes: [], calls: [] } });

    expect(screen.getByText("No step has started in this run yet.")).toBeInTheDocument();
  });

  test("lists one row per call, a team call per agent, with cost, status and active time", () => {
    renderWithViewer(<CallsList selectedKey="main/team#one" teamNodes={teamNodes} onSelect={() => {}} />, { mode: "runs", run, report });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[1]!.textContent)).toEqual(["run", "team", "team", "ask", "stop"]);
    expect(rows[0]).toHaveTextContent("$0.250000");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(within(rows[2]!).getByText("unknown")).toHaveClass("cost-unknown");
    expect(within(rows[3]!).getByText(/⏸/)).toHaveAttribute("title", "plus 1m 00s waiting for a user answer, not counted");
  });

  test("selects the node of a row by click or keyboard", () => {
    const onSelect = vi.fn();
    renderWithViewer(<CallsList selectedKey={null} teamNodes={teamNodes} onSelect={onSelect} />, { mode: "runs", run, report });
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);

    fireEvent.click(rows[0]!);
    fireEvent.keyDown(rows[2]!, { key: "Enter" });
    fireEvent.keyDown(rows[4]!, { key: "Escape" });

    expect(onSelect.mock.calls).toEqual([["main/run"], ["main/team#two"]]);
  });
});
