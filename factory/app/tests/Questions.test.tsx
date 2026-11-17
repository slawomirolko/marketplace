import { QuestionsList } from "../src/Questions.tsx";
import { buildLevel, findItem } from "../src/tree.ts";
import type { Item } from "../src/types.ts";
import { mainWorkflow, questions, renderWithViewer, run, screen } from "./testUtils/index.ts";

function item(key: string): Item {
  return findItem(buildLevel([mainWorkflow], "main"), key)!;
}

describe("QuestionsList", () => {
  test("asks to click a human icon when no step is selected", () => {
    renderWithViewer(<QuestionsList item={null} />);

    expect(screen.getByText("Click a human icon to see the questions of that step.")).toBeInTheDocument();
  });

  test("asks for a run outside the runs mode", () => {
    renderWithViewer(<QuestionsList item={item("main/run")} />);

    expect(screen.getByText("Pick a run to see what run asked you and what you answered.")).toBeInTheDocument();
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
  });
});
