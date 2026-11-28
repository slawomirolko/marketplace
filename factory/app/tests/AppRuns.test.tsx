import { http, HttpResponse } from "msw";
import { App } from "../src/App.tsx";
import { READ_ONLY_NOTE } from "../src/api.ts";
import type { RunDetail, RunListItem } from "../src/types.ts";
import { act, API, deferred, fireEvent, render, report, run, RUN_ID, runDetail, runListItem, screen, server, settleNetwork, userEvent, waitFor } from "./testUtils/index.ts";

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
