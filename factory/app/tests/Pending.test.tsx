import { http, HttpResponse } from "msw";
import { PendingDecisions } from "../src/Pending.tsx";
import { READ_ONLY_NOTE } from "../src/api.ts";
import type { PendingDecision } from "../src/types.ts";
import { API, render, screen, server, userEvent, waitFor } from "./testUtils/index.ts";

const decision: PendingDecision = {
  runId: "r-0000abcd",
  goal: "Upstream skill:sample-skill changed",
  workflow: "olko-marketplace-upstream",
  questionId: "q-upstream-decision",
  text: "skill:sample-skill changed in a project.\nok: open a draft PR.\nno: never ask again.",
  allowed: ["ok", "no"],
};

describe("PendingDecisions", () => {
  test("renders nothing when no run waits for a decision", async () => {
    const { container } = render(<PendingDecisions onOpenRun={() => undefined} />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });

  test("shows each waiting question with one button per allowed answer and posts the chosen one", async () => {
    const posted: { url: string; action: string | null }[] = [];
    server.use(
      http.get(API.pending, () => HttpResponse.json([decision])),
      http.post(API.answer(decision.runId), ({ request }) => {
        posted.push({ url: request.url, action: request.headers.get("x-factory-action") });
        return HttpResponse.json([]);
      }),
    );
    const user = userEvent.setup();
    render(<PendingDecisions onOpenRun={() => undefined} />);

    expect(await screen.findByText("Waiting for your decision (1)")).toBeInTheDocument();
    expect(screen.getByText(/never ask again/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "no" }));

    expect(posted).toHaveLength(1);
    expect(posted[0]?.action).toBe("answer");
    const url = new URL(posted[0]!.url);
    expect(url.searchParams.get("question")).toBe("q-upstream-decision");
    expect(url.searchParams.get("answer")).toBe("no");
    await waitFor(() => expect(screen.queryByText(/Waiting for your decision/)).not.toBeInTheDocument());
  });

  test("shows the server's error and keeps the question when the answer is refused", async () => {
    server.use(
      http.get(API.pending, () => HttpResponse.json([decision])),
      http.post(API.answer(decision.runId), () => HttpResponse.json({ error: "answer it in the session that owns it" }, { status: 409 })),
    );
    const user = userEvent.setup();
    render(<PendingDecisions onOpenRun={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "ok" }));

    expect(await screen.findByText("answer it in the session that owns it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok" })).toBeInTheDocument();
  });

  test("an answer that fails with an HTML page shows its status", async () => {
    server.use(
      http.get(API.pending, () => HttpResponse.json([decision])),
      http.post(API.answer(decision.runId), () => new HttpResponse("<html>bad gateway</html>", { status: 502 })),
    );
    const user = userEvent.setup();
    render(<PendingDecisions onOpenRun={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "ok" }));

    expect(await screen.findByText("answer failed: 502")).toBeInTheDocument();
  });

  test("an answer refused for the missing token says that the viewer is read-only", async () => {
    server.use(
      http.get(API.pending, () => HttpResponse.json([decision])),
      http.post(API.answer(decision.runId), () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })),
    );
    const user = userEvent.setup();
    render(<PendingDecisions onOpenRun={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "ok" }));

    expect(await screen.findByText(READ_ONLY_NOTE)).toBeInTheDocument();
  });

  test("a failing pending list is named instead of looking like no question", async () => {
    server.use(http.get(API.pending, () => HttpResponse.json({ error: "runs folder unreadable" }, { status: 500 })));
    render(<PendingDecisions onOpenRun={() => undefined} />);

    expect(await screen.findByText("Could not load the pending decisions: /pending: 500 (runs folder unreadable)")).toBeInTheDocument();
  });

  test("opens the run when its id is clicked", async () => {
    server.use(http.get(API.pending, () => HttpResponse.json([decision])));
    const opened: string[] = [];
    const user = userEvent.setup();
    render(<PendingDecisions onOpenRun={(id) => opened.push(id)} />);

    await user.click(await screen.findByRole("button", { name: decision.runId }));

    expect(opened).toEqual([decision.runId]);
  });
});
