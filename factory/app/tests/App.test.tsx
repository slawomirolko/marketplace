import { http, HttpResponse } from "msw";
import { App } from "../src/App.tsx";
import { API, findCard, fireEvent, render, screen, server, userEvent, within } from "./testUtils/index.ts";

function openWorkflow(name: string): void {
  window.history.replaceState(null, "", `/?mode=workflows&workflow=${name}`);
}

describe("App", () => {
  beforeEach(() => openWorkflow("main"));

  test("loads the workflow and draws the agent's scripts inside its card", async () => {
    render(<App />);

    const run = await findCard("run");
    const scripts = await within(run).findByRole("list", { name: "scripts of this agent" });
    expect(within(scripts).getAllByRole("listitem")).toHaveLength(2);
    expect(within(await findCard("stop")).getByText("engine script · builtin.stop")).toBeInTheDocument();
  });

  test("the agents-only switch lists the scripts by name and keeps the engine script", async () => {
    const user = userEvent.setup();
    render(<App />);
    await findCard("ask");

    await user.click(screen.getByRole("checkbox", { name: "Agents only" }));

    expect(within(await findCard("run")).getByText("scripts: sync.mjs, watch.mjs")).toBeInTheDocument();
    expect(await findCard("stop")).toBeInTheDocument();
    expect(screen.queryByText("ask", { selector: ".card-title" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("factory-viewer.agents-only")).toBe("1");
  });

  test("clicking an engine script shows its details", async () => {
    render(<App />);

    fireEvent.click(await findCard("stop"));

    expect(await screen.findByRole("heading", { name: "stop" })).toBeInTheDocument();
    expect(screen.getByText("builtin.stop", { selector: "aside *" })).toBeInTheDocument();
  });

  test("reports when the factory data cannot be loaded", async () => {
    server.use(http.get(API.workflows, () => HttpResponse.json({ error: "boom" }, { status: 500 })));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load factory data: /workflows: 500");
  });

  test("in runs mode without runs shows the empty run summary", async () => {
    window.history.replaceState(null, "", "/");
    server.use(http.get(API.runs, () => HttpResponse.json([])));
    render(<App />);

    expect(await screen.findByText("No run selected. Roles and tiers come from the factory config.")).toBeInTheDocument();
  });

  test("the header controls are reachable by test id", async () => {
    const user = userEvent.setup();
    render(<App />);
    await findCard("run");

    expect(screen.getByTestId("view-mode-workflows")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("workflow-select")).toHaveValue("main");
    await user.click(screen.getByTestId("show-numbers"));
    expect(window.localStorage.getItem("factory-viewer.show-numbers")).toBe("1");
    await user.click(screen.getByTestId("details-tab-calls"));
    expect(screen.getByTestId("details-tab-calls")).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByTestId("view-mode-runs"));

    expect(screen.getByTestId("view-mode-runs")).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByTestId("run-select")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-filter")).toHaveValue("");
    expect(screen.queryByTestId("workflow-select")).not.toBeInTheDocument();
  });

  describe("in runs mode", () => {
    beforeEach(() => window.history.replaceState(null, "", "/"));

    test("opens the latest run and summarizes its cost", async () => {
      render(<App />);

      expect(await screen.findByRole("heading", { name: "Run r-0000aaaa" })).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent("Fake test model: costs are synthetic");
      expect(screen.getByText("sync the sources")).toBeInTheDocument();
      expect(within(await findCard("run")).getByText("$0.250000")).toBeInTheDocument();
      expect(within(await findCard("stop")).getByText("engine script · no model cost")).toBeInTheDocument();
    });

    test("show numbers puts the run count and time next to each step", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole("heading", { name: "Run r-0000aaaa" });

      await user.click(screen.getByRole("checkbox", { name: "Show numbers" }));

      expect(await screen.findByLabelText("ran 1 time in this run, 30s in total")).toBeInTheDocument();
    });

    test("the all-calls tab lists the calls and selects a node on a click", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole("heading", { name: "Run r-0000aaaa" });

      await user.click(screen.getByRole("tab", { name: "All calls" }));
      const table = await screen.findByRole("table");
      expect(within(table).getAllByRole("row")).toHaveLength(6);

      await user.click(within(table).getByText("run").closest("tr")!);
      await user.click(screen.getByRole("tab", { name: "Node" }));
      expect(screen.getByRole("heading", { name: "run" })).toBeInTheDocument();
      expect(screen.getByText("synced 3 sources")).toBeInTheDocument();
    });

    test("a call row selects its node through its test id", async () => {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole("heading", { name: "Run r-0000aaaa" });
      expect(screen.getByTestId("run-select")).toHaveValue("r-0000aaaa");

      await user.click(screen.getByTestId("details-tab-calls"));
      await user.click(await screen.findByTestId("call-row-0"));

      expect(screen.getByTestId("call-row-0")).toHaveAttribute("aria-selected", "true");
    });

    test("the human icon of a step opens its questions and answers", async () => {
      render(<App />);
      await screen.findByRole("heading", { name: "Run r-0000aaaa" });

      fireEvent.click(within(await findCard("run")).getByRole("button", { name: /^Asks you: ask/ }));

      expect(await screen.findByRole("heading", { name: "Questions of run" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Questions" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Node" })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByText("Allowed answers: yes, no")).toBeInTheDocument();
      expect(screen.getByText("Your answer:").parentElement).toHaveTextContent("Your answer: yes");
    });
  });
});
