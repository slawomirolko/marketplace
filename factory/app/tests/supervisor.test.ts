import { supervisorRing } from "../src/supervisor.ts";

test("without a supervisor the ring is idle", () => {
  expect(supervisorRing(null).tone).toBe("idle");
});

test("a running supervisor shows that it analyzes the run", () => {
  expect(supervisorRing({ status: "running", agent: "olko-factory-supervisor" })).toEqual({ tone: "busy", status: "analyzing the run", cost: "", headline: "analyzing the run", text: "", agent: "olko-factory-supervisor", model: null });
});

test("a failed supervisor shows its error as headline and text", () => {
  const failed = supervisorRing({ status: "failed", agent: "a", error: "model unavailable", costUsd: 0 });
  expect([failed.tone, failed.headline, failed.text, failed.cost]).toEqual(["failed", "model unavailable", "model unavailable", "$0.000000"]);
});

test("an improve verdict shows the bottleneck, the idea and the model", () => {
  const improve = supervisorRing({ status: "done", agent: "a", verdict: "improve", bottleneck: "w/fix", idea: "low tier", output: "x\nsupervise | improve | w/fix | low tier", costUsd: 0.0123, model: "claude-haiku-5-5" });
  expect([improve.tone, improve.headline, improve.model]).toEqual(["improve", "bottleneck: w/fix · idea: low tier", "claude-haiku-5-5"]);
});

test("an output without a parseable verdict line shows its last line", () => {
  expect(supervisorRing({ status: "done", agent: "a", output: "free text\nlast line" }).headline).toBe("last line");
});
