import { http, HttpResponse } from "msw";
import { PendingDecisions } from "../src/Pending.tsx";
import { READ_ONLY_NOTE } from "../src/api.ts";
import type { PendingDecision } from "../src/types.ts";
import { API, render, screen, server, settleNetwork, userEvent, waitFor } from "./test-utils/index.ts";

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
    let listed = 0;
    server.use(
      http.get(API.pending, () => {
        listed += 1;
        return HttpResponse.json([]);
      }),
    );
    const { container } = render(<PendingDecisions onOpenRun={() => undefined} />);

    await waitFor(() => expect(listed).toBe(1));
    await settleNetwork();
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

  describe("a multiple question", () => {
    const mergeQuestion: PendingDecision = {
      runId: "r-0000merg",
      goal: "Merge updates of sample-app",
      workflow: "olko-marketplace-merge",
      questionId: "q-merge",
      text: "Which updates should be applied?",
      allowed: ["skill:sample-a", "skill:sample-b"],
      multiple: true,
      items: [
        { id: "skill:sample-a", label: "skill sample-a: clean merge", detail: "@@ -1 +1 @@\n-old line\n+new line", checked: true },
        { id: "skill:sample-b", label: "skill sample-b: 1 conflict", detail: "conflict reason", checked: false },
      ],
    };

    function serveMerge(answers: string[]) {
      server.use(
        http.get(API.pending, () => HttpResponse.json([mergeQuestion])),
        http.post(API.answer(mergeQuestion.runId), ({ request }) => {
          answers.push(new URL(request.url).searchParams.get("answer") ?? "");
          return HttpResponse.json([]);
        }),
      );
    }

    test("a multiple question renders checkboxes and sends the checked ids", async () => {
      const answers: string[] = [];
      serveMerge(answers);
      const user = userEvent.setup();
      render(<PendingDecisions onOpenRun={() => undefined} />);

      const first = await screen.findByTestId("merge-item-skill:sample-a");
      const second = screen.getByTestId("merge-item-skill:sample-b");
      expect(first).toBeChecked();
      expect(second).not.toBeChecked();
      expect(screen.getByText("skill sample-b: 1 conflict")).toBeInTheDocument();
      expect(screen.getByText(/-old line/)).toBeInTheDocument();
      await user.click(second);
      await user.click(screen.getByTestId("apply-selected"));

      expect(answers).toEqual(["skill:sample-a,skill:sample-b"]);
      await waitFor(() => expect(screen.queryByText(/Waiting for your decision/)).not.toBeInTheDocument());
    });

    test("Apply selected sends none when nothing is checked", async () => {
      const answers: string[] = [];
      serveMerge(answers);
      const user = userEvent.setup();
      render(<PendingDecisions onOpenRun={() => undefined} />);

      await user.click(await screen.findByTestId("merge-item-skill:sample-a"));
      await user.click(screen.getByTestId("apply-selected"));

      expect(answers).toEqual(["none"]);
    });

    test("Apply none sends none", async () => {
      const answers: string[] = [];
      serveMerge(answers);
      const user = userEvent.setup();
      render(<PendingDecisions onOpenRun={() => undefined} />);

      await user.click(await screen.findByTestId("apply-none"));

      expect(answers).toEqual(["none"]);
    });
  });
});
