import { ReactFlow } from "@xyflow/react";
import { render, screen, userEvent } from "./testUtils/index.ts";
import { RING_GAP } from "../src/supervisor.ts";
import { SupervisorRing } from "../src/SupervisorRing.tsx";
import type { SupervisorData } from "../src/types.ts";
import type { Bounds } from "../src/types.ts";

const BOUNDS: Bounds = { x: 10, y: 20, width: 300, height: 500 };

function renderRing(supervisor: SupervisorData | null, bounds: Bounds | null = BOUNDS) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={[]} edges={[]}>
        <SupervisorRing supervisor={supervisor} bounds={bounds} />
      </ReactFlow>
    </div>,
  );
}

describe("SupervisorRing", () => {
  test("encloses the workflow bounds with a gap on every side", () => {
    renderRing(null);

    const ring = screen.getByTestId("supervisor-ring");
    expect(ring).toHaveStyle({ transform: `translate(${10 - RING_GAP}px, ${20 - RING_GAP}px)`, width: `${300 + 2 * RING_GAP}px`, height: `${500 + 2 * RING_GAP}px` });
  });

  test("draws nothing while the workflow has no bounds", () => {
    renderRing(null, null);

    expect(screen.queryByTestId("supervisor-ring")).not.toBeInTheDocument();
  });

  test("without a supervisor report shows the idle hint and cannot open", () => {
    renderRing(null);

    expect(screen.getByTestId("supervisor-ring")).toHaveClass("tone-idle");
    expect(screen.getByRole("button", { name: /olko-factory-supervisor watches every run/ })).toBeDisabled();
  });

  test("opens and closes the full report of a finished supervisor", async () => {
    renderRing({ status: "done", agent: "supervisor-agent", model: "small-model", costUsd: 0.5, verdict: "improve", bottleneck: "review", idea: "cache", output: "full report" });

    expect(screen.getByTestId("supervisor-ring")).toHaveClass("tone-improve");
    await userEvent.click(screen.getByRole("button", { name: /bottleneck: review · idea: cache/ }));
    const report = screen.getByRole("region", { name: "Supervisor report" });
    expect(report).toHaveTextContent("supervisor-agent · small-model · $0.500000");
    expect(report).toHaveTextContent("full report");

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Supervisor report" })).not.toBeInTheDocument();
  });
});
