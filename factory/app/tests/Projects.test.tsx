import { http, HttpResponse } from "msw";
import { App } from "../src/App.tsx";
import { Projects, actionOf, countsText, verdictOf, versionText } from "../src/Projects.tsx";
import type { ProjectArtifact, ProjectList, ProjectStatusView } from "../src/Projects.tsx";
import { render, screen, server, userEvent, waitFor, within } from "./testUtils/index.ts";

const artifact = (extra: Partial<ProjectArtifact>): ProjectArtifact => ({ id: "skill:sample-skill", kind: "skill", name: "sample-skill", harness: "agents", location: ".agents/skills/sample-skill", state: "current", installed: "1.0.0", current: "1.0.0", files: [], workflows: [], ...extra });

const list: ProjectList = {
  roots: ["/src"],
  statusWorkflow: "olko-project-status",
  statusWorkflowInstalled: true,
  canAnalyze: true,
  projects: [
    { id: "sample-app", path: "/src/sample-app", exists: true, runs: 2, analyzing: null, status: { runId: "r-0000000a", createdAt: null, summary: "1 current", counts: { current: 1, outdated: 1, missing: 1 } } },
    { id: "sample-web", path: "/src/sample-web", exists: false, runs: 0, analyzing: null, status: null },
  ],
};

const status: ProjectStatusView = {
  runId: "r-0000000a",
  status: "done",
  createdAt: "2026-11-20T10:00:00.000Z",
  data: {
    head: "9f8e7d6c5b",
    harnesses: [{ id: "opencode", markers: [".opencode"] }],
    counts: { current: 1, outdated: 1, missing: 1 },
    workflows: ["sample-flow"],
    summary: "1 current, 1 outdated, 1 missing",
    artifacts: [
      artifact({ workflows: ["sample-flow"] }),
      artifact({ id: "skill:sample-old", name: "sample-old", state: "outdated", installed: "1.0.0", current: "1.2.0", files: ["SKILL.md"] }),
      artifact({ id: "agent:sample-helper", kind: "agent", name: "sample-helper", harness: null, location: null, state: "missing", installed: null, current: null, requiredBy: ["agent:sample-agent"] }),
    ],
  },
};

type Posted = Record<string, string>;

function serve(posted: Posted[] = [], statuses: Record<string, ProjectStatusView | null> = { "sample-app": status, "sample-web": null }, projects: ProjectList = list) {
  server.use(
    http.get("/api/projects", () => HttpResponse.json(projects)),
    http.get("/api/projects/:id/status", ({ params }) => {
      const view = statuses[String(params.id)];
      return view ? HttpResponse.json(view) : HttpResponse.json({ error: "none" }, { status: 404 });
    }),
    http.post("/api/projects", async ({ request }) => {
      if (request.headers.get("x-factory-action") !== "projects") return HttpResponse.json({ error: "forbidden" }, { status: 403 });
      const body = (await request.json()) as Posted;
      posted.push(body);
      if (body.action === "discover") return HttpResponse.json({ candidates: [{ path: "/src/sample-new", suggestedId: "sample-new", markers: [".agents/skills"] }] });
      if (body.action === "add" && body.path === "/bad") return HttpResponse.json({ error: "project /bad is not a folder" }, { status: 400 });
      if (body.action === "add") return HttpResponse.json({ project: { id: body.id || "sample-x", path: body.path } });
      if (body.action === "remove") return HttpResponse.json({ project: { id: body.id } });
      if (body.action === "analyze" && body.id === "sample-bad") return HttpResponse.json({ error: "project sample-bad: folder /x does not exist" }, { status: 400 });
      if (body.action === "analyze") return HttpResponse.json({ runId: "r-0000000s", status: "running", reused: body.id === "sample-busy" });
      return HttpResponse.json({ roots: [] });
    }),
  );
  return posted;
}

describe("Projects", () => {
  test("lists projects and shows the status table of the selected one, filtered by state", async () => {
    serve();
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} />);

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(screen.getByRole("region", { name: "Verdict" })).getByText("2 of 3 differ from the marketplace: 1 outdated · 1 missing.")).toBeInTheDocument();
    expect(screen.getByText(/run r-0000000a · compared with marketplace 9f8e7d6 · harnesses: opencode/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skills and agents" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Skill / agent" })).toBeInTheDocument();
    expect(within(table).getByText("1.0.0 → 1.2.0")).toBeInTheDocument();
    expect(within(table).getByText("needed by agent:sample-agent")).toBeInTheDocument();
    expect(within(table).getByText("Nothing to do.")).toBeInTheDocument();
    expect(within(table).getByText("Update to 1.2.0 (olko-marketplace-skill-sync).")).toBeInTheDocument();
    expect(within(table).getByText("Install it (olko-marketplace-skill-sync); needed by agent:sample-agent.")).toBeInTheDocument();
    expect(screen.getByText(/Factory workflows that run an installed skill or agent: sample-flow/)).toBeInTheDocument();
    expect(screen.getByText("folder missing", { exact: false })).toBeInTheDocument();
    const projectList = screen.getByRole("region", { name: "Projects" });
    expect(within(projectList).getByText("2 to change")).toBeInTheDocument();
    expect(within(projectList).getByText("not checked yet")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "1 missing" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: "all 3" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });

  test("a project without a finished status run offers Check status, disabled while its folder is missing", async () => {
    serve();
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} />);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Re-check status" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /sample-web/ }));

    expect(await screen.findByText("Not checked yet. Check status compares the installed skills and agents with the marketplace.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Runs (0)" })).toBeDisabled();
  });

  test("Check status starts the status workflow, shows its progress and reloads the status when the run finishes", async () => {
    const posted = serve();
    let statusCalls = 0;
    let runCalls = 0;
    server.use(
      http.get("/api/projects/:id/status", async () => {
        statusCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(status);
      }),
      http.get("/api/runs/:runId", ({ params }) => {
        runCalls += 1;
        return HttpResponse.json({ run: { runId: params.runId, status: runCalls < 2 ? "running" : "done" } });
      }),
    );
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await screen.findByRole("table");
    expect(statusCalls).toBe(1);

    await user.click(screen.getByRole("button", { name: "Re-check status" }));

    expect(await screen.findByText("Started the status check of sample-app (run r-0000000s).")).toBeInTheDocument();
    expect(posted).toEqual([{ action: "analyze", id: "sample-app" }]);
    expect(screen.getByRole("button", { name: /^Checking…/ })).toBeDisabled();
    expect(await screen.findByText("Status check of sample-app finished: 2 of 3 differ from the marketplace: 1 outdated · 1 missing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-check status" })).toBeEnabled();
    await waitFor(() => expect(statusCalls).toBe(3));
    expect(runCalls).toBe(2);
  });

  test("a status run already in progress keeps Check status disabled, and a failed run is reported", async () => {
    serve([], { "sample-busy": null }, { ...list, projects: [{ id: "sample-busy", path: "/src/sample-busy", exists: true, runs: 1, analyzing: "r-0000000t", status: null }] });
    server.use(http.get("/api/runs/:runId", () => HttpResponse.json({ error: "gone" }, { status: 404 })));
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    expect(await screen.findByRole("button", { name: /^Checking…/ })).toBeDisabled();
    expect(screen.queryByText("Not checked yet. Check status compares the installed skills and agents with the marketplace.")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Checking… (unknown)" })).toBeDisabled();
    server.use(http.get("/api/runs/:runId", () => HttpResponse.json({ run: { status: "failed" } })));
    expect(await screen.findByText("Status check of sample-busy failed (run r-0000000t).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check status" })).toBeEnabled();
  });

  test("an already running status check is reused, and a start error is shown", async () => {
    const projects = { ...list, projects: [{ id: "sample-busy", path: "/src/sample-busy", exists: true, runs: 1, analyzing: null, status: null }, { id: "sample-bad", path: "/x", exists: true, runs: 0, analyzing: null, status: null }] };
    serve([], { "sample-busy": null, "sample-bad": null }, projects);
    server.use(http.get("/api/runs/:runId", () => HttpResponse.json({ run: { status: "running" } })));
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    await user.click(await screen.findByRole("button", { name: "Check status" }));
    expect(await screen.findByText("Status check of sample-busy is already running (run r-0000000s).")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sample-bad/ }));
    await user.click(await screen.findByRole("button", { name: "Check status" }));
    expect(await screen.findByText("project sample-bad: folder /x does not exist")).toBeInTheDocument();
  });

  test("without the status workflow or a run-capable viewer, Check status is replaced by a note", async () => {
    serve([], undefined, { ...list, statusWorkflowInstalled: false });
    const { unmount } = render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/workflow is not installed, so the project status cannot be checked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check status/i })).not.toBeInTheDocument();
    unmount();

    serve([], undefined, { ...list, canAnalyze: false });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/This viewer cannot start runs/)).toBeInTheDocument();
    expect(screen.getByText("projectId: sample-app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check status/i })).not.toBeInTheDocument();
  });

  test("adds a project, discovers candidates and adds one, manages roots, and shows errors", async () => {
    const posted = serve();
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} />);
    await screen.findByRole("table");

    await user.type(screen.getByLabelText(/^Folder/), "/src/sample-new-app");
    await user.type(screen.getByLabelText(/^Id/), "sample-new-app");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Added sample-new-app.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discover" }));
    const found = await screen.findByRole("list", { name: "Discovered projects" });
    await user.click(within(found).getByRole("button", { name: "Add as sample-new" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Discovered projects" })).not.toBeInTheDocument());

    await user.type(screen.getByLabelText("Root folder"), "/other");
    await user.click(screen.getByRole("button", { name: "Add root" }));
    await user.click(screen.getByRole("button", { name: "Remove root /src" }));

    await user.type(screen.getByLabelText(/^Folder/), "/bad");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("project /bad is not a folder")).toBeInTheDocument();

    expect(posted.map((p) => p.action)).toEqual(["add", "discover", "add", "add_root", "remove_root", "add"]);
    expect(posted[0]).toEqual({ action: "add", path: "/src/sample-new-app", id: "sample-new-app" });
    expect(posted[2]).toEqual({ action: "add", path: "/src/sample-new", id: "sample-new" });
  });

  test("removes a project only after confirmation and opens its runs", async () => {
    const posted = serve();
    const onShowRuns = vi.fn();
    const user = userEvent.setup();
    render(<Projects onShowRuns={onShowRuns} />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Runs (2)" }));
    expect(onShowRuns).toHaveBeenCalledWith("sample-app");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(posted).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Removed sample-app.")).toBeInTheDocument();
    expect(posted).toEqual([{ action: "remove", id: "sample-app" }]);
    confirm.mockRestore();
  });

  test("an empty list invites adding a project, and discovery needs a root", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json({ roots: [], projects: [], statusWorkflow: "olko-project-status", statusWorkflowInstalled: true, canAnalyze: true })));
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/No project yet/)).toBeInTheDocument();
    expect(screen.getByText("Select a project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discover" })).toBeDisabled();
  });

  test("a project with nothing installed says so instead of showing an empty table", async () => {
    const empty: ProjectStatusView = { ...status, data: { head: "9f8e7d6c5b", harnesses: [{ id: "agents-md", markers: ["AGENTS.md"] }], artifacts: [], counts: { current: 0, outdated: 0 }, workflows: [], summary: "no marketplace artifacts installed" } };
    const projects = { ...list, projects: [{ id: "sample-app", path: "/src/sample-app", exists: true, runs: 1, analyzing: null, status: { runId: "r-0000000a", createdAt: null, summary: "no marketplace artifacts installed", counts: { current: 0 } } }] };
    serve([], { "sample-app": empty }, projects);
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
        ref: "origin/main",
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
    serve([], { "sample-app": source });
    render(<Projects onShowRuns={() => {}} />);
    const verdict = await screen.findByRole("region", { name: "Verdict" });
    expect(verdict).toHaveClass("verdict-change");
    expect(within(verdict).getByText("2 of 4 differ from origin/main: 1 outdated · 1 modified.")).toBeInTheDocument();
    expect(screen.getByText(/compared with origin\/main 4034143 · harnesses: none found/)).toBeInTheDocument();
    expect(screen.getByText("Pull the remote (git pull, or Update from marketplace).")).toBeInTheDocument();
    expect(screen.getByText("Local change not on the remote: commit and push it in a PR, or discard it.")).toBeInTheDocument();
    expect(screen.getByText("New here, not on the remote: commit and push it in a PR.")).toBeInTheDocument();
  });

  test("a failed fetch is shown next to the remote ref", async () => {
    serve([], { "sample-app": { ...status, data: { ...status.data!, ref: "origin/main", fetched: false, fetchError: "could not resolve host" } } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/compared with origin\/main 9f8e7d6 \(fetch failed: could not resolve host\)/)).toBeInTheDocument();
  });

  test("an unfetched remote ref says the comparison uses the last fetch", async () => {
    serve([], { "sample-app": { ...status, data: { ...status.data!, ref: "origin/main", fetched: false, fetchError: null } } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/compared with origin\/main 9f8e7d6 \(last fetch\)/)).toBeInTheDocument();
  });

  test("a project in sync gets a green verdict", async () => {
    const synced: ProjectStatusView = { ...status, data: { ...status.data!, artifacts: [artifact({}), artifact({ id: "skill:sample-local", name: "sample-local", state: "local-only" })], counts: { current: 1, "local-only": 1 }, workflows: [] } };
    serve([], { "sample-app": synced });
    render(<Projects onShowRuns={() => {}} />);
    const verdict = await screen.findByRole("region", { name: "Verdict" });
    expect(verdict).toHaveClass("verdict-ok");
    expect(within(verdict).getByText("In sync with the marketplace: 2 skills and agents, nothing to change.")).toBeInTheDocument();
    expect(screen.queryByText(/Factory workflows that run/)).not.toBeInTheDocument();
  });

  test("verdicts and actions by state", () => {
    expect(verdictOf(null)).toEqual({ level: "empty", title: "No marketplace skill or agent is installed in this project.", badge: "nothing installed" });
    expect(verdictOf({ current: 2, adapted: 1 })).toMatchObject({ level: "ok", badge: "in sync" });
    expect(verdictOf({ current: 1 }, "origin/main").title).toBe("In sync with origin/main: 1 skills and agents, nothing to change.");
    expect(verdictOf({ current: 1, outdated: 1 }, "HEAD").title).toBe("1 of 2 differ from the marketplace: 1 outdated.");
    expect(actionOf(artifact({ harness: "source", state: "current" }))).toBe("Nothing to do.");
    expect(actionOf(artifact({ harness: "source", state: "missing" }))).toMatch(/^Pull the remote/);
    expect(actionOf(artifact({ harness: "source", state: "unknown-base" }))).toMatch(/^Local change not on the remote/);
    expect(verdictOf({ current: 1, modified: 2, removed: 1 })).toEqual({ level: "change", title: "3 of 4 differ from the marketplace: 2 modified · 1 removed.", badge: "3 to change" });
    expect(actionOf(artifact({ state: "adapted" }))).toBe("Nothing to do.");
    expect(actionOf(artifact({ state: "outdated", current: null }))).toBe("Update to the marketplace version (olko-marketplace-skill-sync).");
    expect(actionOf(artifact({ state: "modified" }))).toBe("Send the local change upstream (olko-marketplace-upstream) or reinstall the marketplace version.");
    expect(actionOf(artifact({ state: "modified", upstreamMoved: true }))).toMatch(/^Take the newer marketplace version into the local change/);
    expect(actionOf(artifact({ state: "unknown-base" }))).toBe("Compare by hand: it matches no marketplace version.");
    expect(actionOf(artifact({ state: "missing" }))).toBe("Install it (olko-marketplace-skill-sync).");
    expect(actionOf(artifact({ state: "removed" }))).toMatch(/^The marketplace dropped it/);
    expect(actionOf(artifact({ state: "local-only" }))).toMatch(/^Local only: publish it/);
  });

  test("a finished check whose status cannot be read still reports the run", async () => {
    serve([], { "sample-app": null }, { ...list, projects: [{ id: "sample-app", path: "/src/sample-app", exists: true, runs: 1, analyzing: "r-0000000u", status: null }] });
    server.use(
      http.get("/api/runs/:runId", () => HttpResponse.json({ run: { status: "done" } })),
      http.get("/api/projects/:id/status", () => HttpResponse.json({ error: "broken" }, { status: 500 })),
    );
    render(<Projects onShowRuns={() => {}} pollMs={10} />);
    expect(await screen.findByText("Status check of sample-app finished (run r-0000000u).")).toBeInTheDocument();
  });

  test("a missing status file is reported", async () => {
    serve([], { "sample-app": { ...status, data: null } });
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText("The status file of run r-0000000a is missing.")).toBeInTheDocument();
  });

  test("a failed project list load is shown", async () => {
    server.use(http.get("/api/projects", () => HttpResponse.json({ error: "x" }, { status: 500 })));
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText("/projects: 500")).toBeInTheDocument();
  });

  test("version and count texts", () => {
    expect(versionText(artifact({}))).toBe("1.0.0");
    expect(versionText(artifact({ state: "unknown-base", nearestVersion: "0.9.0" }))).toBe("nearest 0.9.0");
    expect(versionText(artifact({ state: "removed", lastVersion: "0.8.0" }))).toBe("last 0.8.0");
    expect(versionText(artifact({ installed: null, current: null }))).toBe("–");
    expect(countsText({ missing: 2, current: 1, removed: 0 })).toBe("1 current · 2 missing");
    expect(countsText(null)).toBe("");
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
