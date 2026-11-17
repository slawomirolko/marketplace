import { QuestionsList } from "../src/Questions.tsx";
import { buildLevel, findItem } from "../src/tree.ts";
import type { Item } from "../src/types.ts";
import { mainWorkflow, questions, renderWithViewer, run, screen, within } from "./testUtils/index.ts";

function item(key: string): Item {
  return findItem(buildLevel([mainWorkflow], "main"), key)!;
}

describe("QuestionsList", () => {
  test("asks to click a human icon when no step is selected", () => {
    renderWithViewer(<QuestionsList item={null} />);

    expect(screen.getByText("Click a human icon to see the questions of that step.")).toBeInTheDocument();
  });

  test("asks for a run outside the runs mode, even when a run is loaded", () => {
    renderWithViewer(<QuestionsList item={item("main/run")} />, { mode: "workflows", run, questions });

    expect(screen.getByText("Pick a run to see what run asked you and what you answered.")).toBeInTheDocument();
  });

  test("asks for a run in the runs mode before one is loaded", () => {
    renderWithViewer(<QuestionsList item={item("main/run")} />, { mode: "runs", run: null });

    expect(screen.getByText("Pick a run to see what run asked you and what you answered.")).toBeInTheDocument();
  });

  test("shows an answered question with its id, source, allowed answers and the answer", () => {
    renderWithViewer(<QuestionsList item={item("main/ask")} />, { mode: "runs", run, questions, humans: new Map([["main/ask", { role: "relays", sources: ["main/run"], questions: [], permission: null }]]) });

    const entry = screen.getByRole("listitem");
    expect(within(entry).getByText("ask", { selector: "code" })).toBeInTheDocument();
    expect(within(entry).getByText(/asked by run/)).toBeInTheDocument();
    expect(within(entry).queryByText(/through/)).not.toBeInTheDocument();
    expect(within(entry).getByText("Allowed answers: yes, no")).toBeInTheDocument();
    expect(within(entry).getByText("Your answer:").parentElement).toHaveTextContent("Your answer: yes");
    expect(screen.getByText(/This step passes on questions that other steps ask/)).toBeInTheDocument();
  });

  test("shows a waiting question that was asked through another step", () => {
    renderWithViewer(<QuestionsList item={item("main/run")} />, { mode: "runs", run, questions: [{ ...questions[0]!, answer: null, answeredAt: null }] });

    expect(screen.getByRole("heading", { name: "Questions of run" })).toBeInTheDocument();
    expect(screen.getByText(/through ask/)).toBeInTheDocument();
    expect(screen.getByText("Continue?")).toBeInTheDocument();
    expect(screen.getByText("Waiting for your answer")).toBeInTheDocument();
  });

  test("says when the run stored no question of the step", () => {
    renderWithViewer(<QuestionsList item={item("main/stop")} />, { mode: "runs", run, questions });

    expect(screen.getByText(/No question of this step is stored for this run/)).toBeInTheDocument();
    expect(screen.queryByText(/through its own permission/)).not.toBeInTheDocument();
  });

  test("adds the permission line when the step's agent may ask by itself", () => {
    const humans = new Map([["main/stop", { role: "asks" as const, sources: ["main/stop"], questions: [], permission: "question: allow" }]]);
    renderWithViewer(<QuestionsList item={item("main/stop")} />, { mode: "runs", run, questions, humans });

    expect(screen.getByText(/A question the agent asks itself through its own permission \(question: allow\) is not stored by the factory\./)).toBeInTheDocument();
    expect(screen.getByText("Questions this step asked you, oldest first.", { exact: false })).toBeInTheDocument();
  });
});
