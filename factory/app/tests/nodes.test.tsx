import { askingWorkflow, card, fireEvent, group, nodeTitled, renderFlow, screen, within } from "./test-utils/index.ts";

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

const CLICK = "Click to see the questions and your answers in this run";

function icon(title: string): HTMLElement | null {
  return within(nodeTitled(title)).queryByRole("button", { name: new RegExp(CLICK) });
}

function flow(options: Parameters<typeof renderFlow>[0] = {}) {
  return renderFlow({ workflows: [askingWorkflow], root: "asking", ...options });
}

describe("HumanMark", () => {
  test("a step that asks gets a green icon naming every question it asks", () => {
    flow();

    const plan = icon("plan");
    expect(plan).toHaveClass("human-icon", "human-asks");
    const label = `Asks you: q-plan (through plan), q-confirm (through confirm). ${CLICK}`;
    expect(plan).toHaveAccessibleName(label);
    expect(plan).toHaveAttribute("title", label);
  });

  test("the interrupt that passes a question on gets a black icon naming its source", () => {
    flow();

    const confirm = icon("confirm");
    expect(confirm).toHaveClass("human-relays");
    expect(confirm).toHaveAccessibleName(`Passes on a question to you from: plan. ${CLICK}`);
  });

  test("an interrupt naming several steps makes each of them ask, and names a step this diagram does not draw", () => {
    const listed = {
      ...askingWorkflow,
      nodes: askingWorkflow.nodes.map((n) => (n.id === "confirm" ? { ...n, askedBy: ["plan", { workflow: "elsewhere", step: "rows" }] } : n)),
    };
    renderFlow({ workflows: [listed], root: "asking" });

    expect(icon("plan")).toHaveClass("human-asks");
    expect(icon("confirm")).toHaveAccessibleName(`Passes on a question to you from: plan, elsewhere/rows (not in this diagram). ${CLICK}`);
  });

  test("an interrupt without askedBy and an engine script get no icon", () => {
    flow();

    expect(icon("note")).toBeNull();
    expect(icon("done")).toBeNull();
  });

  test("a collapsed team holding an asking agent relays its question", () => {
    flow();

    const team = icon("team");
    expect(team).toHaveClass("human-relays");
    expect(team).toHaveAccessibleName(`Passes on a question to you from: one. ${CLICK}`);
  });

  test("an expanded team relays in its header and the asking member asks through its own permission", () => {
    flow({ expanded: ["asking/team"] });

    expect(nodeTitled("team")).toHaveClass("group");
    expect(icon("team")).toHaveClass("human-relays");
    const one = icon("one");
    expect(one).toHaveClass("human-asks");
    expect(one).toHaveAccessibleName(`May ask you itself (question: allow). ${CLICK}`);
    expect(icon("two")).toBeNull();
  });

  test("the agents-only view hides the interrupts and keeps the icons of the kept steps", () => {
    flow({ state: { onlyAgents: true } });

    expect(screen.queryByText("confirm", { selector: ".card-title" })).not.toBeInTheDocument();
    expect(screen.queryByText("note", { selector: ".card-title" })).not.toBeInTheDocument();
    expect(icon("plan")).toHaveClass("human-asks");
    expect(icon("team")).toHaveClass("human-relays");
  });

  test("a click on the icon opens the questions of the step without the card's own click", () => {
    const openQuestions = vi.fn();
    const onNodeClick = vi.fn();
    flow({ state: { openQuestions }, onNodeClick });

    fireEvent.click(icon("plan")!);

    expect(openQuestions).toHaveBeenCalledTimes(1);
    expect(openQuestions.mock.calls[0]![0]).toMatchObject({ key: "asking/plan" });
    expect(onNodeClick).not.toHaveBeenCalled();
  });

  test("a click on the card itself selects the node and opens no questions", () => {
    const openQuestions = vi.fn();
    const onNodeClick = vi.fn();
    flow({ state: { openQuestions }, onNodeClick });

    fireEvent.click(nodeTitled("plan"));

    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(openQuestions).not.toHaveBeenCalled();
  });
});
