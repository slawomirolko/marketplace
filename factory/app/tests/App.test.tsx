import { http, HttpResponse } from "msw";
import { App } from "../src/App.tsx";
import { READ_ONLY_NOTE } from "../src/api.ts";
import type { RunDetail, RunListItem } from "../src/types.ts";
import { act, API, deferred, findCard, fireEvent, render, report, run, RUN_ID, runDetail, runListItem, screen, server, settleNetwork, userEvent, waitFor, within } from "./test-utils/index.ts";

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

const OTHER_ID = "r-0000bbbb";
const otherItem: RunListItem = { ...runListItem, runId: OTHER_ID, goal: "the other run" };
const otherDetail: RunDetail = { ...runDetail, run: { ...run, runId: OTHER_ID, goal: "the other run" }, report: { ...report, runId: OTHER_ID } };
const liveDetail: RunDetail = { ...runDetail, run: { ...run, status: "running" } };

function runPicker(): HTMLSelectElement {
  const select = screen.getByRole("option", { name: "no run (structure only)" }).closest("select");
  if (!select) throw new Error("no run picker");
  return select;
}

function serveRuns(list: RunListItem[], details: Record<string, () => Response | Promise<Response>>): void {
  server.use(
    http.get(API.runs, () => HttpResponse.json(list)),
    ...Object.entries(details).map(([id, respond]) => http.get(API.run(id), respond)),
  );
}

/** Records the text of every heading drawn from now on, so a heading shown only for a moment is not missed. */
function headingsShown(): { seen: string[]; stop: () => void } {
  const seen: string[] = [];
  const observer = new MutationObserver(() => {
    for (const heading of document.querySelectorAll("h1, h2, h3")) {
      seen.push(heading.textContent ?? "");
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}

describe("App in runs mode", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  test("a run that fails to load is reported next to the run picker and the next run clears it", async () => {
    serveRuns([runListItem, otherItem], { [RUN_ID]: () => HttpResponse.json({ error: "broken run file" }, { status: 500 }), [OTHER_ID]: () => HttpResponse.json(otherDetail) });
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(`/runs/${RUN_ID}: 500 (broken run file)`);
    expect(screen.getByRole("radio", { name: "Workflows (config)" })).toBeInTheDocument();

    fireEvent.change(runPicker(), { target: { value: OTHER_ID } });

    expect(await screen.findByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a failed run list is reported without hiding the viewer", async () => {
    server.use(http.get(API.runs, () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("/runs: 502");
    expect(screen.getByRole("radio", { name: "Projects" })).toBeInTheDocument();
  });

  test("while the next run loads the previous one is not shown and no default workflow is drawn", async () => {
    const release = deferred();
    serveRuns([runListItem, otherItem], {
      [RUN_ID]: () => HttpResponse.json(runDetail),
      [OTHER_ID]: async () => {
        await release.promise;
        return HttpResponse.json(otherDetail);
      },
    });
    render(<App />);
    await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

    fireEvent.change(runPicker(), { target: { value: OTHER_ID } });

    expect(await screen.findByText("Loading run…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: `Run ${RUN_ID}` })).not.toBeInTheDocument();
    act(() => release.resolve());
    expect(await screen.findByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
  });

  test("without runs nothing fabricated is drawn", async () => {
    server.use(http.get(API.runs, () => HttpResponse.json([])));
    render(<App />);

    expect(await screen.findByText(/No run selected\. Pick a run/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not draw this run/)).not.toBeInTheDocument();
  });

  test("a run id is sent as one path segment", async () => {
    const odd = "r-odd/../x";
    serveRuns([{ ...runListItem, runId: odd }], { [odd]: () => HttpResponse.json({ ...runDetail, report: { ...report, runId: odd } }) });
    render(<App />);

    expect(await screen.findByRole("heading", { name: `Run ${odd}` })).toBeInTheDocument();
  });

  describe("with a live run", () => {
    /** A short live refresh interval, so the tests use real timers and RTL's waitFor keeps polling. */
    const REFRESH_MS = 20;

    test("a refresh that returns after a switch to another run does not replace it", async () => {
      const release = deferred();
      let liveCalls = 0;
      let liveAnswered = 0;
      serveRuns([runListItem, otherItem], {
        [RUN_ID]: async () => {
          liveCalls += 1;
          if (liveCalls > 1) {
            await release.promise;
          }
          liveAnswered += 1;
          return HttpResponse.json(liveDetail);
        },
        [OTHER_ID]: () => HttpResponse.json(otherDetail),
      });
      render(<App liveRefreshMs={REFRESH_MS} />);
      await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

      await waitFor(() => expect(liveCalls).toBeGreaterThan(1));
      fireEvent.change(runPicker(), { target: { value: OTHER_ID } });
      await screen.findByRole("heading", { name: `Run ${OTHER_ID}` });
      const headings = headingsShown();
      try {
        act(() => release.resolve());
        await waitFor(() => expect(liveAnswered).toBe(liveCalls));
        await settleNetwork();
      } finally {
        headings.stop();
      }

      expect(headings.seen).not.toContain(`Run ${RUN_ID}`);
      expect(screen.getByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
    });

    test("a failed refresh is shown in the live bar instead of looking live", async () => {
      let calls = 0;
      serveRuns([runListItem], {
        [RUN_ID]: () => {
          calls += 1;
          return calls > 1 ? HttpResponse.json({ error: "gone" }, { status: 500 }) : HttpResponse.json(liveDetail);
        },
      });
      render(<App liveRefreshMs={REFRESH_MS} />);
      await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

      expect(await screen.findByText(/refresh failed/)).toHaveTextContent(`refresh failed: /runs/${RUN_ID}: 500 (gone)`);
    });
  });

  test("a run opened from a pending decision stays selected, whatever filter was set", async () => {
    window.history.replaceState(null, "", "/?mode=workflows&workflow=main&project=sample-app");
    serveRuns([runListItem, otherItem], { [RUN_ID]: () => HttpResponse.json(runDetail), [OTHER_ID]: () => HttpResponse.json(otherDetail) });
    server.use(http.get(API.pending, () => HttpResponse.json([{ runId: OTHER_ID, goal: "the other run", workflow: "main", questionId: "q", text: "Go on?", allowed: ["yes"] }])));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: OTHER_ID }));

    expect(await screen.findByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
    await settleNetwork();
    expect(runPicker().value).toBe(OTHER_ID);
    expect(screen.getByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
  });
});

describe("App load notes", () => {
  beforeEach(() => window.history.replaceState(null, "", "/?mode=workflows&workflow=main"));

  test("agents, projects and changed sources that fail to load are named, not shown as none", async () => {
    window.history.replaceState(null, "", "/");
    server.use(
      http.get(API.agents, () => HttpResponse.json({ error: "no marketplace" }, { status: 500 })),
      http.get(API.projects, () => HttpResponse.json({ error: "bad registry" }, { status: 500 })),
      http.get(API.stale, () => HttpResponse.json({ error: "no lock" }, { status: 500 })),
    );
    render(<App />);

    expect(await screen.findByText(/Could not load agents: \/agents: 500 \(no marketplace\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not load projects: \/projects: 500 \(bad registry\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not check changed sources: \/stale: 500 \(no lock\)/)).toBeInTheDocument();
  });

  test("an update that fails with an HTML page shows its status", async () => {
    server.use(http.post(API.update, () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Update from marketplace" }));

    expect(await screen.findByText("update failed: 502")).toBeInTheDocument();
  });

  test("an update refused for the missing token says that the viewer is read-only", async () => {
    server.use(http.post(API.update, () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Update from marketplace" }));

    expect(await screen.findByText(READ_ONLY_NOTE)).toBeInTheDocument();
  });
});
