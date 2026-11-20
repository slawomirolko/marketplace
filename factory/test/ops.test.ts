import assert from "node:assert/strict";
import test from "node:test";
import { operationNamed } from "../src/ops.ts";

const count = operationNamed("list.count")!;

test("list.count counts each value, most frequent first, ties in first-seen order", async () => {
  const result = await count({ state: { merge: { entries: ["b", "a", "a", "c", "b", "a", "d"] } }, args: { over: "merge.entries" } } as any);
  assert.deepEqual(result.state, { counts: [{ value: "a", count: 3 }, { value: "b", count: 2 }, { value: "c", count: 1 }, { value: "d", count: 1 }], total: 7 });
});

test("list.count counts by a field of each item", async () => {
  const result = await count({ state: { v: [{ entry: "x" }, { entry: "y" }, { entry: "x" }] }, args: { over: "v", by: "entry" } } as any);
  assert.deepEqual(result.state, { counts: [{ value: "x", count: 2 }, { value: "y", count: 1 }], total: 3 });
});

test("list.count on an empty list gives no counts", async () => {
  const result = await count({ state: { v: [] }, args: { over: "v" } } as any);
  assert.deepEqual(result.state, { counts: [], total: 0 });
});

test("list.count stops when the path is not a list", async () => {
  await assert.rejects(count({ state: {}, args: { over: "v.items" } } as any), /state\.v\.items is not a list/);
});
