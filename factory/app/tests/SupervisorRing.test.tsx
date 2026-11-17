import { render, screen, userEvent } from "./testUtils/index.ts";
import { SupervisorRing } from "../src/SupervisorRing.tsx";

describe("SupervisorRing", () => {
  test("without a supervisor report shows the idle hint and cannot open", () => {
    render(<SupervisorRing supervisor={null}>graph</SupervisorRing>);

    expect(screen.getByTestId("supervisor-ring")).toHaveClass("tone-idle");
    expect(screen.getByRole("button", { name: /watches every run/ })).toBeDisabled();
    expect(screen.getByText("graph")).toBeInTheDocument();
  });

  test("opens and closes the full report of a finished supervisor", async () => {
    render(
      <SupervisorRing supervisor={{ status: "done", agent: "supervisor-agent", model: "small-model", costUsd: 0.5, verdict: "improve", bottleneck: "review", idea: "cache", output: "full report" }}>
        graph
      </SupervisorRing>,
    );

    expect(screen.getByTestId("supervisor-ring")).toHaveClass("tone-improve");
    await userEvent.click(screen.getByRole("button", { name: /bottleneck: review · idea: cache/ }));
    const report = screen.getByRole("region", { name: "Supervisor report" });
    expect(report).toHaveTextContent("supervisor-agent · small-model · $0.500000");
    expect(report).toHaveTextContent("full report");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Supervisor report" })).not.toBeInTheDocument();
  });
});
