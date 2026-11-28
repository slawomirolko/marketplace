import { http, HttpResponse, delay } from "msw";
import { App } from "../src/App.tsx";
import { READ_ONLY_NOTE } from "../src/api.ts";
import type { RunDetail, RunListItem } from "../src/types.ts";
import { act, fireEvent, render, report, run, RUN_ID, runDetail, runListItem, screen, server, userEvent, waitFor } from "./testUtils/index.ts";

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
    http.get("/api/runs", () => HttpResponse.json(list)),
    ...Object.entries(details).map(([id, respond]) => http.get(`/api/runs/${encodeURIComponent(id)}`, respond)),
  );
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    server.use(http.get("/api/runs", () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("/runs: 502");
    expect(screen.getByRole("radio", { name: "Projects" })).toBeInTheDocument();
  });

  test("while the next run loads the previous one is not shown and no default workflow is drawn", async () => {
    serveRuns([runListItem, otherItem], {
      [RUN_ID]: () => HttpResponse.json(runDetail),
      [OTHER_ID]: async () => {
        await delay(200);
        return HttpResponse.json(otherDetail);
      },
    });
    render(<App />);
    await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

    fireEvent.change(runPicker(), { target: { value: OTHER_ID } });

    expect(await screen.findByText("Loading run…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: `Run ${RUN_ID}` })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
  });

  test("without runs nothing fabricated is drawn", async () => {
    server.use(http.get("/api/runs", () => HttpResponse.json([])));
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
    afterEach(() => vi.useRealTimers());

    test("a refresh that returns after a switch to another run does not replace it", async () => {
      let release: () => void = () => {};
      let liveCalls = 0;
      serveRuns([runListItem, otherItem], {
        [RUN_ID]: async () => {
          liveCalls += 1;
          if (liveCalls > 1) {
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return HttpResponse.json(liveDetail);
        },
        [OTHER_ID]: () => HttpResponse.json(otherDetail),
      });
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      render(<App />);
      await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      await waitFor(() => expect(liveCalls).toBe(2));
      fireEvent.change(runPicker(), { target: { value: OTHER_ID } });
      await screen.findByRole("heading", { name: `Run ${OTHER_ID}` });
      act(() => release());

      await pause(50);
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
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      render(<App />);
      await screen.findByRole("heading", { name: `Run ${RUN_ID}` });

      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      expect(await screen.findByText(/refresh failed/)).toHaveTextContent(`refresh failed: /runs/${RUN_ID}: 500 (gone)`);
    });
  });

  test("a run opened from a pending decision stays selected, whatever filter was set", async () => {
    window.history.replaceState(null, "", "/?mode=workflows&workflow=main&project=sample-app");
    serveRuns([runListItem, otherItem], { [RUN_ID]: () => HttpResponse.json(runDetail), [OTHER_ID]: () => HttpResponse.json(otherDetail) });
    server.use(http.get("/api/pending", () => HttpResponse.json([{ runId: OTHER_ID, goal: "the other run", workflow: "main", questionId: "q", text: "Go on?", allowed: ["yes"] }])));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: OTHER_ID }));

    expect(await screen.findByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
    await pause(50);
    expect(runPicker().value).toBe(OTHER_ID);
    expect(screen.getByRole("heading", { name: `Run ${OTHER_ID}` })).toBeInTheDocument();
  });
});

describe("App load notes", () => {
  beforeEach(() => window.history.replaceState(null, "", "/?mode=workflows&workflow=main"));

  test("agents, projects and changed sources that fail to load are named, not shown as none", async () => {
    window.history.replaceState(null, "", "/");
    server.use(
      http.get("/api/agents", () => HttpResponse.json({ error: "no marketplace" }, { status: 500 })),
      http.get("/api/projects", () => HttpResponse.json({ error: "bad registry" }, { status: 500 })),
      http.get("/api/stale", () => HttpResponse.json({ error: "no lock" }, { status: 500 })),
    );
    render(<App />);

    expect(await screen.findByText(/Could not load agents: \/agents: 500 \(no marketplace\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not load projects: \/projects: 500 \(bad registry\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Could not check changed sources: \/stale: 500 \(no lock\)/)).toBeInTheDocument();
  });

  test("an update that fails with an HTML page shows its status", async () => {
    server.use(http.post("/api/update", () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Update from marketplace" }));

    expect(await screen.findByText("update failed: 502")).toBeInTheDocument();
  });

  test("an update refused for the missing token says that the viewer is read-only", async () => {
    server.use(http.post("/api/update", () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Update from marketplace" }));

    expect(await screen.findByText(READ_ONLY_NOTE)).toBeInTheDocument();
  });
});
