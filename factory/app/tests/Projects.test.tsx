import { http, HttpResponse } from "msw";
import { App } from "../src/App.tsx";
import { Projects, countsText, versionText } from "../src/Projects.tsx";
import type { ProjectArtifact, ProjectList, ProjectStatusView } from "../src/Projects.tsx";
import { render, screen, server, userEvent, waitFor, within } from "./testUtils/index.ts";

const artifact = (extra: Partial<ProjectArtifact>): ProjectArtifact => ({ id: "skill:sample-skill", kind: "skill", name: "sample-skill", harness: "agents", location: ".agents/skills/sample-skill", state: "current", installed: "1.0.0", current: "1.0.0", files: [], workflows: [], ...extra });

const list: ProjectList = {
  roots: ["/src"],
  statusWorkflow: "olko-project-status",
  projects: [
    { id: "sample-app", path: "/src/sample-app", exists: true, runs: 2, status: { runId: "r-0000000a", createdAt: null, summary: "1 current", counts: { current: 1, outdated: 1, missing: 1 } } },
    { id: "sample-web", path: "/src/sample-web", exists: false, runs: 0, status: null },
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

function serve(posted: Posted[] = [], statuses: Record<string, ProjectStatusView | null> = { "sample-app": status, "sample-web": null }) {
  server.use(
    http.get("/api/projects", () => HttpResponse.json(list)),
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
    expect(screen.getByText(/Harnesses: opencode · Marketplace 9f8e7d6/)).toBeInTheDocument();
    expect(within(table).getByText("1.0.0 → 1.2.0")).toBeInTheDocument();
    expect(within(table).getByText("needed by agent:sample-agent")).toBeInTheDocument();
    expect(screen.getByText(/Factory workflows that run an installed artifact: sample-flow/)).toBeInTheDocument();
    expect(screen.getByText("folder missing", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "1 missing" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: "all 3" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
  });

  test("a project without a finished status run explains how to start one", async () => {
    serve();
    const user = userEvent.setup();
    render(<Projects onShowRuns={() => {}} />);
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: /sample-web/ }));

    expect(await screen.findByText(/No finished status yet/)).toBeInTheDocument();
    expect(screen.getByText("projectId: sample-web")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runs (0)" })).toBeDisabled();
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
    server.use(http.get("/api/projects", () => HttpResponse.json({ roots: [], projects: [], statusWorkflow: "olko-project-status" })));
    render(<Projects onShowRuns={() => {}} />);
    expect(await screen.findByText(/No project yet/)).toBeInTheDocument();
    expect(screen.getByText("Select a project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discover" })).toBeDisabled();
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
