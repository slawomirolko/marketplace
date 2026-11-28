import { layoutGraph, scriptsHeight } from "../src/layout.ts";
import { agentScripts, buildLevel } from "../src/tree.ts";
import type { Level } from "../src/types.ts";
import { agents, mainWorkflow } from "./test-utils/data.ts";

test("two edges between the same pair of nodes are drawn once with both labels", () => {
  const level: Level = {
    items: [
      { kind: "step", key: "main/a", node: { id: "a", kind: "llm" } },
      { kind: "step", key: "main/b", node: { id: "b", kind: "llm" } },
    ],
    edges: [
      { from: "main/a", to: "main/b", label: "when x" },
      { from: "main/a", to: "main/b", label: "when y", dashed: true },
    ],
  };
  const { edges } = layoutGraph(level, new Set());
  expect(new Set(edges.map((edge) => edge.id)).size, "edge ids are unique").toBe(edges.length);
  expect(edges.map((edge) => edge.label)).toEqual(["when x | when y"]);
});

test.each([
  { name: "a script box inside the card makes it taller", listed: false },
  { name: "a script list in the card makes it taller", listed: true },
])("$name", ({ listed }) => {
  const level = buildLevel([mainWorkflow], "main");
  const heightOf = (extra?: Parameters<typeof layoutGraph>[2]) => layoutGraph(level, new Set(), extra).nodes.find((node) => node.id === "main/run")?.height ?? 0;
  expect(heightOf((item) => scriptsHeight(agentScripts(item, agents).length, listed))).toBeGreaterThan(heightOf());
});
