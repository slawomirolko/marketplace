import { fireEvent, renderFlow, screen, within } from "../testUtils/index.ts";

function group(title: string): HTMLElement {
  const node = screen.getByText(title, { selector: ".card-title" }).closest<HTMLElement>(".group");
  if (!node) throw new Error(`no group titled ${title}`);
  return node;
}

describe("GroupNode", () => {
  test("an expanded team shows its header and draws its members inside", () => {
    renderFlow({ expanded: ["main/team"] });

    const team = group("team");
    expect(within(team).getByText("llm · 2 agents")).toBeInTheDocument();
    expect(within(team).getByRole("button", { name: "▾ collapse" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("one", { selector: ".card-title" })).toBeInTheDocument();
    expect(screen.getByText("two", { selector: ".card-title" })).toBeInTheDocument();
  });

  test("collapse asks the viewer to toggle the team", () => {
    const toggle = vi.fn();
    renderFlow({ expanded: ["main/team"], state: { toggle } });

    fireEvent.click(within(group("team")).getByRole("button", { name: "▾ collapse" }));

    expect(toggle).toHaveBeenCalledWith("main/team");
  });

  test("a collapsed team is a card with an expand button counting its members", () => {
    const toggle = vi.fn();
    renderFlow({ state: { toggle } });

    const expand = screen.getByRole("button", { name: "▸ expand (2)" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);

    expect(toggle).toHaveBeenCalledWith("main/team");
  });

  test("a switched-off step is marked on its card", () => {
    renderFlow({ state: { disabled: ["main/stop"] } });

    const stop = screen.getByText("stop", { selector: ".card-title" }).closest<HTMLElement>(".card");
    expect(stop).toHaveClass("disabled");
    expect(within(stop!).getByText("switched off")).toBeInTheDocument();
  });
});
