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

const pick = operationNamed("list.pick")!;
const workers = [{ id: "flow" }, { id: "runtime" }, { id: "test" }];

test("list.pick keeps the items named in the ids list, in the order of the fixed list", async () => {
  const result = await pick({ state: { apply: { areas: ["test", "flow", "unknown"] } }, args: { items: workers, ids: "apply.areas" } } as any);
  assert.deepEqual(result.state, { items: [{ id: "flow" }, { id: "test" }], count: 2 });
});

test("list.pick keeps no item when the ids list is empty", async () => {
  const result = await pick({ state: { apply: { areas: [] } }, args: { items: workers, ids: "apply.areas" } } as any);
  assert.deepEqual(result.state, { items: [], count: 0 });
});

test("list.pick keeps every item when the ids path holds no list", async () => {
  const result = await pick({ state: { apply: { areas: null } }, args: { items: workers, ids: "apply.areas" } } as any);
  assert.deepEqual(result.state, { items: workers, count: 3 });
});

const merge = operationNamed("list.merge")!;

test("list.merge adds new values once and keeps every value already kept", async () => {
  const first = await merge({ state: { d: ["a", "b"] }, args: { from: "d" }, nodeId: "locked" } as any);
  assert.deepEqual(first.state, { items: ["a", "b"], count: 2, added: 2 });
  const second = await merge({ state: { d: ["b", "c"], locked: first.state }, args: { from: "d" }, nodeId: "locked" } as any);
  assert.deepEqual(second.state, { items: ["a", "b", "c"], count: 3, added: 1 });
  const third = await merge({ state: { d: null, locked: second.state }, args: { from: "d" }, nodeId: "locked" } as any);
  assert.deepEqual(third.state, { items: ["a", "b", "c"], count: 3, added: 0 });
});

const streak = operationNamed("builtin.streak")!;

test("builtin.streak counts consecutive hits, resets on a miss and starts again after reaching the limit", async () => {
  const run = async (verdict: string, previous: unknown) => (await streak({ state: { c: { verdict }, s: previous }, args: { when: 'c.verdict == "fail"', limit: 2 }, nodeId: "s" } as any)).state;
  const one = await run("fail", undefined);
  assert.deepEqual(one, { count: 1, reached: false });
  const two = await run("fail", one);
  assert.deepEqual(two, { count: 2, reached: true });
  assert.deepEqual(await run("fail", two), { count: 1, reached: false }, "the visit after the limit starts again");
  assert.deepEqual(await run("pass", one), { count: 0, reached: false });
});
