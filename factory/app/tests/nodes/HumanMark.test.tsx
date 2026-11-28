import { askingWorkflow, fireEvent, nodeTitled, renderFlow, screen, within } from "../testUtils/index.ts";

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
