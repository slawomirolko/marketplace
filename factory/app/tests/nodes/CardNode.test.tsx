import { card, renderFlow, screen, within } from "../testUtils/index.ts";

describe("CardNode", () => {
  test("draws one box per script of the agent inside the agent's card", () => {
    renderFlow();

    const scripts = within(card("run")).getByRole("list", { name: "scripts of this agent" });
    const boxes = within(scripts).getAllByRole("listitem");
    expect(boxes.map((box) => box.textContent)).toEqual(["sync.mjs · sync", "watch.mjs · sync"]);
    expect(boxes[0]).toHaveAttribute("title", "skills/demo/sync/scripts/sync.mjs");
  });

  test("lists the script names in the agent's card in the agents-only view", () => {
    renderFlow({ state: { onlyAgents: true } });

    const run = card("run");
    expect(within(run).getByText("scripts: sync.mjs, watch.mjs")).toBeInTheDocument();
    expect(within(run).queryByRole("list", { name: "scripts of this agent" })).not.toBeInTheDocument();
  });

  test("shows no script area for an agent without scripts", () => {
    renderFlow({ expanded: ["main/team"] });

    expect(within(card("two")).queryByRole("list", { name: "scripts of this agent" })).not.toBeInTheDocument();
    expect(within(card("two")).queryByText(/^scripts:/)).not.toBeInTheDocument();
  });

  test("draws a team member's scripts inside that member's card", () => {
    renderFlow({ expanded: ["main/team"] });

    const scripts = within(card("one")).getByRole("list", { name: "scripts of this agent" });
    expect(within(scripts).getAllByRole("listitem")).toHaveLength(2);
  });

  test("labels a script step as an engine script with its operation and gives it no agent scripts", () => {
    renderFlow();

    const stop = card("stop");
    expect(stop).toHaveClass("node-script");
    expect(within(stop).getByText("engine script · builtin.stop")).toBeInTheDocument();
    expect(within(stop).queryByRole("list", { name: "scripts of this agent" })).not.toBeInTheDocument();
  });

  test("keeps the engine script in the agents-only view and hides the question", () => {
    renderFlow({ state: { onlyAgents: true } });

    expect(card("stop")).toBeInTheDocument();
    expect(screen.queryByText("ask", { selector: ".card-title" })).not.toBeInTheDocument();
  });

  test("shows the agent and its description on an llm card", () => {
    renderFlow();

    const run = card("run");
    expect(within(run).getByText("llm · syncer")).toBeInTheDocument();
    expect(within(run).getByText("syncs the sources")).toBeInTheDocument();
  });
});
