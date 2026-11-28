import { http, HttpResponse } from "msw";
import type { HttpResponseResolver } from "msw";
import { App } from "../src/App.tsx";
import { Projects } from "../src/Projects.tsx";
import type { ProjectOverview, ProjectStatusView } from "../src/types.ts";
import { API, artifact, deferred, fireEvent, listOf, projectList as list, projectStatus as status, REMOTE_REF as remoteRef, render, screen, server, settleNetwork, STATUS_WORKFLOW, uncheckedProject, userEvent, waitFor, within, withData } from "./test-utils/index.ts";

type Posted = Record<string, string>;

/** The started status run every analyze action answers with. */
const STARTED_RUN = "r-0000000s";

/** The started merge run every merge action answers with. */
const MERGE_RUN = "r-0000000m";

/** The answer of each project action; an action not listed answers with an empty root list. */
const actionReplies: Record<string, (body: Posted) => Response> = {
  discover: () => HttpResponse.json({ candidates: [{ path: "/src/sample-new", suggestedId: "sample-new", markers: [".agents/skills"] }] }),
  add: (body) => HttpResponse.json({ project: { id: body.id || "sample-x", path: body.path } }),
  remove: (body) => HttpResponse.json({ project: { id: body.id } }),
  analyze: () => HttpResponse.json({ runId: STARTED_RUN, status: "running", reused: false }),
  merge: () => HttpResponse.json({ runId: MERGE_RUN, status: "running", reused: false }),
};

interface ServeOptions {
  /** Collects every posted action body, in order. */
  posted?: Posted[];
  /** The status view of each project id; null answers 404. */
  statuses?: Record<string, ProjectStatusView | null>;
  projects?: ProjectOverview;
}

/** Serves the project list, the status of each project and the project actions, guarded by the action header. */
function serve({ posted = [], statuses = { "sample-app": status, "sample-web": null }, projects = list }: ServeOptions = {}): Posted[] {
  server.use(
    http.get(API.projects, () => HttpResponse.json(projects)),
    http.get(API.projectStatus, ({ params }) => {
      const view = statuses[String(params.id)];
      return view ? HttpResponse.json(view) : HttpResponse.json({ error: "none" }, { status: 404 });
    }),
    http.post(API.projects, async ({ request }) => {
      if (request.headers.get("x-factory-action") !== "projects") {
        return HttpResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const body = (await request.json()) as Posted;
      posted.push(body);
      return actionReplies[body.action ?? ""]?.(body) ?? HttpResponse.json({ roots: [] });
    }),
  );
  return posted;
}

/** A project action handler that answers `action` for project or path `target` with a 400 error, and the usual reply otherwise. */
function failingAction(action: string, field: "id" | "path", target: string, error: string): HttpResponseResolver {
  return async ({ request }) => {
    const body = (await request.clone().json()) as Posted;
    if (body.action === action && body[field] === target) {
      return HttpResponse.json({ error }, { status: 400 });
    }
    return undefined;
  };
}

/** Renders the projects page with the sample list and waits for the status table of the selected sample-app. */
async function renderSelected(): Promise<{ posted: Posted[]; table: HTMLElement; user: ReturnType<typeof userEvent.setup> }> {
  const posted = serve();
  const user = userEvent.setup();
  render(<Projects onShowRuns={() => {}} />);
  const table = await screen.findByRole("table");
  return { posted, table, user };
}

describe("Projects", () => {
  test("the selected project shows its verdict and what the status run compared", async () => {
    await renderSelected();
    expect(within(screen.getByRole("region", { name: "Verdict" })).getByText("2 of 3 differ from the marketplace: 1 outdated · 1 missing.")).toBeInTheDocument();
    expect(screen.getByText(/run r-0000000a · compared with marketplace 9f8e7d6 · harnesses: opencode/)).toBeInTheDocument();
    expect(screen.getByText(/Factory workflows that run an installed skill or agent: sample-flow/)).toBeInTheDocument();
  });

  test("the status table has one row per artifact with its version change, dependants and action", async () => {
    const { table } = await renderSelected();
    expect(screen.getByRole("heading", { name: "Skills and agents" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Skill / agent" })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("1.0.0 → 1.2.0")).toBeInTheDocument();
    expect(within(table).getByText("needed by agent:sample-agent")).toBeInTheDocument();
    expect(within(table).getByText("Nothing to do.")).toBeInTheDocument();
    expect(within(table).getByText("Update to 1.2.0 (olko-marketplace-skill-sync).")).toBeInTheDocument();
    expect(within(table).getByText("Install it (olko-marketplace-skill-sync); needed by agent:sample-agent.")).toBeInTheDocument();
  });

  test("the project list shows a badge per project, and the state filter narrows the table", async () => {
    const { user } = await renderSelected();
    const projectList = screen.getByRole("region", { name: "Projects" });
    expect(screen.getByText("folder missing", { exact: false })).toBeInTheDocument();
    expect(within(projectList).getByText("2 to change")).toBeInTheDocument();
    expect(within(projectList).getByText("not checked yet")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "1 missing" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: "all 3" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });

  test("the project controls are reachable by test id", async () => {
    const { posted, user } = await renderSelected();

    await user.click(screen.getByTestId("state-filter-missing"));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByTestId("check-status")).toHaveTextContent("Re-check status");

    await user.click(screen.getByTestId("project-select-sample-web"));
    expect(await screen.findByTestId("check-status")).toHaveTextContent("Check status");
    expect(screen.getByTestId("check-status")).toBeDisabled();
    expect(screen.getByTestId("project-runs")).toBeDisabled();

    await user.type(screen.getByTestId("project-path-input"), "/src/sample-x");
    await user.click(screen.getByTestId("add-project"));

    expect(await screen.findByText("Added sample-x.")).toBeInTheDocument();
    expect(posted).toEqual([{ action: "add", path: "/src/sample-x" }]);
  });

  test("a project without a finished status run offers Check status, disabled while its folder is missing", async () => {
    const { user } = await renderSelected();
    expect(screen.getByRole("button", { name: "Re-check status" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /sample-web/ }));

    expect(await screen.findByText("Not checked yet. Check status compares the installed skills and agents with the marketplace.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Runs (0)" })).toBeDisabled();
  });

  test("Check status starts the status workflow, shows its progress and reloads the status when the run finishes", async () => {
    const posted = serve();
    const statusRelease = deferred();
    let statusCalls = 0;
    let runCalls = 0;
    server.use(
      http.get(API.projectStatus, async () => {
        statusCalls += 1;
        if (statusCalls > 1) {
          await statusRelease.promise;
        }
        return HttpResponse.json(status);
      }),
      http.get(API.anyRun, ({ params }) => {
        runCalls += 1;
        return HttpResponse.json({ run: { runId: params.runId, status: runCalls < 2 ? "running" : "done" } });
      }),
    );
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await screen.findByRole("table");
    expect(statusCalls).toBe(1);

    await user.click(screen.getByRole("button", { name: "Re-check status" }));

    expect(await screen.findByText(`Started the status check of sample-app (run ${STARTED_RUN}).`)).toBeInTheDocument();
    expect(posted).toEqual([{ action: "analyze", id: "sample-app" }]);
    expect(screen.getByRole("button", { name: /^Checking…/ })).toBeDisabled();
    statusRelease.resolve();
    expect(await screen.findByText("Status check of sample-app finished: 2 of 3 differ from the marketplace: 1 outdated · 1 missing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-check status" })).toBeEnabled();
    await waitFor(() => expect(statusCalls).toBe(3));
    expect(runCalls).toBe(2);
  });

  test("Merge updates is enabled only with mergeable rows", async () => {
    const mergeable = [
      withData({ artifacts: [artifact({ state: "outdated" })] }),
      withData({ artifacts: [artifact({ state: "modified", upstreamMoved: true })] }),
    ];
    for (const view of mergeable) {
      serve({ statuses: { "sample-app": view, "sample-web": null } });
      const { unmount } = render(<Projects onShowRuns={() => {}} />);
      await screen.findByRole("table");
      expect(screen.getByTestId("merge-updates")).toBeEnabled();
      unmount();
    }
    const notMergeable = [
      withData({ artifacts: [artifact({ state: "modified" })] }),
      withData({ artifacts: [artifact({ state: "current" })] }),
    ];
    for (const view of notMergeable) {
      serve({ statuses: { "sample-app": view, "sample-web": null } });
      const { unmount } = render(<Projects onShowRuns={() => {}} />);
      await screen.findByRole("table");
      const button = screen.getByTestId("merge-updates");
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", expect.stringMatching(/./));
      unmount();
    }
  });

  test("Merge updates is enabled for a marketplace source checkout behind its remote or changed locally, and says why not when in sync", async () => {
    const sourceRows = [
      withData({ artifacts: [artifact({ harness: "source", state: "outdated" })] }),
      withData({ artifacts: [artifact({ harness: "source", state: "missing" })] }),
      withData({ artifacts: [artifact({ harness: "source", state: "modified" })] }),
      withData({ artifacts: [artifact({ harness: "source", state: "local-only" })] }),
    ];
    for (const view of sourceRows) {
      serve({ statuses: { "sample-app": view, "sample-web": null } });
      const { unmount } = render(<Projects onShowRuns={() => {}} />);
      await screen.findByRole("table");
      expect(screen.getByTestId("merge-updates")).toBeEnabled();
      unmount();
    }
    serve({ statuses: { "sample-app": withData({ artifacts: [artifact({ harness: "source", state: "current" })] }), "sample-web": null } });
    render(<Projects onShowRuns={() => {}} />);
    await screen.findByRole("table");
    const button = screen.getByTestId("merge-updates");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/source checkout is in sync with its remote/));
  });

  test("Merge updates of a source checkout follows its commits behind and its local changes, and the title states the counts", async () => {
    const source = { marketplaceSource: true, upstreamRef: "origin/main" };
    const enabled = [
      withData({ ...source, behind: 2, ahead: 0, localWorkflows: [], artifacts: [artifact({ harness: "source", state: "current" })] }),
      withData({ ...source, behind: 0, ahead: 1, localWorkflows: ["sample-flow"], artifacts: [artifact({ harness: "source", state: "current" })] }),
      withData({ ...source, behind: 0, ahead: 0, localWorkflows: [], artifacts: [artifact({ harness: "source", state: "modified" })] }),
    ];
    for (const view of enabled) {
      serve({ statuses: { "sample-app": view, "sample-web": null } });
      const { unmount } = render(<Projects onShowRuns={() => {}} />);
      await screen.findByRole("table");
      expect(screen.getByTestId("merge-updates")).toBeEnabled();
      unmount();
    }
    serve({ statuses: { "sample-app": withData({ ...source, behind: 0, ahead: 3, localWorkflows: [], artifacts: [artifact({ harness: "source", state: "outdated" })] }), "sample-web": null } });
    render(<Projects onShowRuns={() => {}} />);
    await screen.findByRole("table");
    const button = screen.getByTestId("merge-updates");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/0 commits behind and 3 commits ahead of origin\/main/));
  });

  test("Merge updates starts the merge workflow and re-checks the status when the run finishes", async () => {
    const posted = serve();
    let runCalls = 0;
    server.use(
      http.get(API.anyRun, ({ params }) => {
        runCalls += 1;
        return HttpResponse.json({ run: { runId: params.runId, status: runCalls < 2 ? "running" : "done" } });
      }),
    );
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await screen.findByRole("table");

    await user.click(screen.getByTestId("merge-updates"));

    expect(await screen.findByText(`Started the merge of sample-app (run ${MERGE_RUN}).`)).toBeInTheDocument();
    expect(screen.getByTestId("merge-updates")).toBeDisabled();
    await waitFor(() => expect(posted).toEqual([{ action: "merge", id: "sample-app" }, { action: "analyze", id: "sample-app" }]));
    expect(await screen.findByText(`Started the status check of sample-app (run ${STARTED_RUN}).`)).toBeInTheDocument();
  });

  test("a status run already in progress keeps Check status disabled, and a failed run is reported", async () => {
    serve({ statuses: { "sample-busy": null }, projects: listOf(uncheckedProject("sample-busy", "r-0000000t")) });
    server.use(http.get(API.anyRun, () => HttpResponse.json({ error: "gone" }, { status: 404 })));
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    expect(await screen.findByRole("button", { name: /^Checking…/ })).toBeDisabled();
    expect(screen.queryByText("Not checked yet. Check status compares the installed skills and agents with the marketplace.")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Checking… (unknown)" })).toBeDisabled();
    server.use(http.get(API.anyRun, () => HttpResponse.json({ run: { status: "failed" } })));
    expect(await screen.findByText("Status check of sample-busy failed (run r-0000000t).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
  });

  test("leaving the page while a finished check reads its status reloads nothing afterwards", async () => {
    serve({ statuses: { "sample-busy": null }, projects: listOf(uncheckedProject("sample-busy", "r-0000000t")) });
    const release = deferred();
    let statusAsked = false;
    let statusAnswered = false;
    let listCalls = 0;
    server.use(
      http.get(API.anyRun, () => HttpResponse.json({ run: { status: "done" } })),
      http.get(API.projectStatus, async () => {
        statusAsked = true;
        await release.promise;
        statusAnswered = true;
        return HttpResponse.json({ error: "none" }, { status: 404 });
      }),
      http.get(API.projects, () => {
        listCalls += 1;
        return HttpResponse.json(listOf(uncheckedProject("sample-busy", "r-0000000t")));
      }),
    );
    const { unmount } = render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await waitFor(() => expect(statusAsked).toBe(true));
    const callsBefore = listCalls;
    unmount();
    release.resolve();
    await waitFor(() => expect(statusAnswered).toBe(true));
    await settleNetwork();
    expect(listCalls).toBe(callsBefore);
  });

  test("an already running status check is reused", async () => {
    serve({ statuses: { "sample-busy": null }, projects: listOf(uncheckedProject("sample-busy", null)) });
    server.use(
      http.get(API.anyRun, () => HttpResponse.json({ run: { status: "running" } })),
      http.post(API.projects, () => HttpResponse.json({ runId: STARTED_RUN, status: "running", reused: true })),
    );
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await user.click(await screen.findByRole("button", { name: "Check status" }));
    expect(await screen.findByText(`Status check of sample-busy is already running (run ${STARTED_RUN}).`)).toBeInTheDocument();
  });

  test("a status check that cannot start shows the error", async () => {
    const badFolder = "project sample-bad: folder /x does not exist";
    serve({ statuses: { "sample-bad": null }, projects: listOf(uncheckedProject("sample-bad", null, { path: "/x", runs: 0 })) });
    server.use(http.post(API.projects, failingAction("analyze", "id", "sample-bad", badFolder)));
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await user.click(await screen.findByRole("button", { name: "Check status" }));
    expect(await screen.findByText(badFolder)).toBeInTheDocument();
  });

  test("without the status workflow, Check status is replaced by a note", async () => {
    serve({ projects: { ...list, statusWorkflowInstalled: false } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/workflow is not installed, so the project status cannot be checked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check status/i })).not.toBeInTheDocument();
  });

  test("in a viewer that cannot start runs, Check status is replaced by a note naming the project id", async () => {
    serve({ projects: { ...list, canAnalyze: false } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/This viewer cannot start runs/)).toBeInTheDocument();
    expect(screen.getByText("projectId: sample-app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check status/i })).not.toBeInTheDocument();
  });

  test("adds a project by folder and id", async () => {
    const { posted, user } = await renderSelected();
    await user.type(screen.getByLabelText(/^Folder/), "/src/sample-new-app");
    await user.type(screen.getByLabelText(/^Id/), "sample-new-app");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Added sample-new-app.")).toBeInTheDocument();
    expect(posted).toEqual([{ action: "add", path: "/src/sample-new-app", id: "sample-new-app" }]);
  });

  test("discovers candidates under the roots and adds one with its suggested id", async () => {
    const { posted, user } = await renderSelected();
    await user.click(screen.getByRole("button", { name: "Discover" }));
    const found = await screen.findByRole("list", { name: "Discovered projects" });
    await user.click(within(found).getByRole("button", { name: "Add as sample-new" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Discovered projects" })).not.toBeInTheDocument());
    expect(posted).toEqual([{ action: "discover" }, { action: "add", path: "/src/sample-new", id: "sample-new" }]);
  });

  test("adds and removes root folders", async () => {
    const { posted, user } = await renderSelected();
    await user.type(screen.getByLabelText("Root folder"), "/other");
    await user.click(screen.getByRole("button", { name: "Add root" }));
    await user.click(screen.getByRole("button", { name: "Remove root /src" }));
    await waitFor(() => expect(posted.map((body) => body.action)).toEqual(["add_root", "remove_root"]));
  });

  test("a project that cannot be added shows the error", async () => {
    const notAFolder = "project /bad is not a folder";
    const { user } = await renderSelected();
    server.use(http.post(API.projects, failingAction("add", "path", "/bad", notAFolder)));
    await user.type(screen.getByLabelText(/^Folder/), "/bad");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(notAFolder)).toBeInTheDocument();
  });

  test("the Runs button opens the runs of the selected project", async () => {
    serve();
    const onShowRuns = vi.fn();
    const user = userEvent.setup();
    render(<Projects onShowRuns={onShowRuns} />);
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Runs (2)" }));
    expect(onShowRuns).toHaveBeenCalledWith("sample-app");
  });

  test("removes a project only after confirmation", async () => {
    const { posted, user } = await renderSelected();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(posted).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Removed sample-app.")).toBeInTheDocument();
    expect(posted).toEqual([{ action: "remove", id: "sample-app" }]);
    confirm.mockRestore();
  });

  test("an empty list invites adding a project, and discovery needs a root", async () => {
    server.use(http.get(API.projects, () => HttpResponse.json({ ...listOf(), roots: [], statusWorkflow: STATUS_WORKFLOW })));
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/No project yet/)).toBeInTheDocument();
    expect(screen.getByText("Select a project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discover" })).toBeDisabled();
  });

  test("a project with nothing installed says so instead of showing an empty table", async () => {
    const empty: ProjectStatusView = { ...status, data: { head: "9f8e7d6c5b", harnesses: [{ id: "agents-md", markers: ["AGENTS.md"] }], artifacts: [], counts: { current: 0, outdated: 0 }, workflows: [], summary: "no marketplace artifacts installed" } };
    const projects = listOf(uncheckedProject("sample-app", null, { status: { runId: "r-0000000a", createdAt: null, summary: "no marketplace artifacts installed", counts: { current: 0 } } }));
    serve({ statuses: { "sample-app": empty }, projects });
    render(<Projects onShowRuns={() => {}} />);
    const verdict = await screen.findByRole("region", { name: "Verdict" });
    expect(verdict).toHaveClass("verdict-empty");
    expect(within(verdict).getByText("No marketplace skill or agent is installed in this project.")).toBeInTheDocument();
    expect(within(verdict).getByText(/looks for skills in \.agents\/skills, \.claude\/skills/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Filter by state" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Projects" })).getByText("nothing installed")).toBeInTheDocument();
  });

  test("a marketplace source checkout is compared with its remote like any project", async () => {
    const source: ProjectStatusView = {
      ...status,
      data: {
        head: "4034143aa",
        ref: remoteRef,
        fetched: true,
        fetchError: null,
        harnesses: [],
        artifacts: [
          artifact({ id: "skill:sample-old", name: "sample-old", harness: "source", location: "skills/demo/sample-old", state: "outdated", installed: "1.0.0", current: "1.1.0" }),
          artifact({ id: "skill:sample-edit", name: "sample-edit", harness: "source", location: "skills/demo/sample-edit", state: "modified" }),
          artifact({ id: "skill:sample-new", name: "sample-new", harness: "source", location: "skills/demo/sample-new", state: "local-only" }),
          artifact({ harness: "source", location: "skills/demo/sample-skill" }),
        ],
        counts: { current: 1, outdated: 1, modified: 1, "local-only": 1 },
        workflows: [],
        summary: "1 current, 1 outdated, 1 modified, 1 local-only",
      },
    };
    serve({ statuses: { "sample-app": source } });
    render(<Projects onShowRuns={() => {}} />);
    const verdict = await screen.findByRole("region", { name: "Verdict" });
    expect(verdict).toHaveClass("verdict-change");
    expect(within(verdict).getByText("2 of 4 differ from origin/main: 1 outdated · 1 modified.")).toBeInTheDocument();
    expect(screen.getByText(/compared with origin\/main 4034143 · harnesses: none found/)).toBeInTheDocument();
    expect(screen.getByText("Pull the remote (git pull, or Update from marketplace).")).toBeInTheDocument();
    expect(screen.getByText("Local change not on the remote: commit and push it in a PR, or discard it.")).toBeInTheDocument();
    expect(screen.getByText("New here, not on the remote: commit and push it in a PR.")).toBeInTheDocument();
  });

  test.each([
    { fetchError: "could not resolve host", shown: /compared with origin\/main 9f8e7d6 \(fetch failed: could not resolve host\)/ },
    { fetchError: null, shown: /compared with origin\/main 9f8e7d6 \(last fetch\)/ },
  ])("an unfetched remote ref says why: fetch error $fetchError", async ({ fetchError, shown }) => {
    serve({ statuses: { "sample-app": withData({ ref: remoteRef, fetched: false, fetchError }) } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(shown)).toBeInTheDocument();
  });

  test("a project in sync gets a green verdict", async () => {
    const synced: ProjectStatusView = withData({ artifacts: [artifact({}), artifact({ id: "skill:sample-local", name: "sample-local", state: "local-only" })], counts: { current: 1, "local-only": 1 }, workflows: [] });
    serve({ statuses: { "sample-app": synced } });
    render(<Projects onShowRuns={() => {}} />);
    const verdict = await screen.findByRole("region", { name: "Verdict" });
    expect(verdict).toHaveClass("verdict-ok");
    expect(within(verdict).getByText("In sync with the marketplace: 2 skills and agents, nothing to change.")).toBeInTheDocument();
    expect(screen.queryByText(/Factory workflows that run/)).not.toBeInTheDocument();
  });

  test("a finished check whose status cannot be read still reports the run", async () => {
    serve({ statuses: { "sample-app": null }, projects: listOf(uncheckedProject("sample-app", "r-0000000u")) });
    server.use(
      http.get(API.anyRun, () => HttpResponse.json({ run: { status: "done" } })),
      http.get(API.projectStatus, () => HttpResponse.json({ error: "broken" }, { status: 500 })),
    );
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    expect(await screen.findByText("Status check of sample-app finished (run r-0000000u); its status could not be read: /projects/sample-app/status: 500 (broken).")).toBeInTheDocument();
  });

  test("a project action that fails with an HTML page shows its status", async () => {
    serve();
    server.use(http.post(API.projects, () => new HttpResponse("<html>bad gateway</html>", { status: 502 })));
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} />);

    await user.click(await screen.findByRole("button", { name: "Discover" }));

    expect(await screen.findByText("projects failed: 502")).toBeInTheDocument();
  });

  test("an action between two polls of a running check keeps the poll that is under way", async () => {
    const analyzing = listOf(uncheckedProject("sample-busy", "r-0000000t"));
    serve({ statuses: { "sample-busy": null }, projects: analyzing });
    let polls = 0;
    let listCalls = 0;
    const started = deferred();
    const release = deferred();
    server.use(
      http.get(API.projects, () => {
        listCalls += 1;
        return HttpResponse.json(analyzing);
      }),
      http.get(API.anyRun, async () => {
        polls += 1;
        started.resolve();
        await release.promise;
        return HttpResponse.json({ run: { status: "failed" } });
      }),
    );
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await started.promise;
    const listedBefore = listCalls;

    fireEvent.change(screen.getByRole("textbox", { name: "Root folder" }), { target: { value: "/more" } });
    fireEvent.click(screen.getByRole("button", { name: "Add root" }));
    await waitFor(() => {
      expect(listCalls).toBe(listedBefore + 1);
      expect(screen.getByRole("button", { name: "Remove root /src" })).toBeEnabled();
    });
    release.resolve();

    expect(await screen.findByText("Status check of sample-busy failed (run r-0000000t).")).toBeInTheDocument();
    expect(polls).toBe(1);
  });

  test("a missing status file is reported", async () => {
    serve({ statuses: { "sample-app": { ...status, data: null } } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText("The status file of run r-0000000a is missing.")).toBeInTheDocument();
  });

  test("a failed project list load is shown", async () => {
    server.use(http.get(API.projects, () => HttpResponse.json({ error: "x" }, { status: 500 })));
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText("/projects: 500 (x)")).toBeInTheDocument();
  });
});

describe("App projects mode", () => {
  test("the Projects view opens from the header, and its Runs button filters runs by project", async () => {
    serve();
    window.history.replaceState(null, "", "/?mode=workflows&workflow=main");
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("radio", { name: "Projects" }));
    expect(window.location.search).toBe("?mode=projects");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Runs (2)" }));
    const project = await screen.findByRole("combobox", { name: /Project/ });
    expect(project).toHaveValue("sample-app");
    await waitFor(() => expect(window.location.search).toContain("project=sample-app"));
    expect(screen.getByRole("option", { name: "no run of project sample-app" })).toBeInTheDocument();
  });
});
