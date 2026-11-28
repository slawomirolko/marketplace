import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Report, RunStatusView } from "../src/types.ts";
import { pollUntil } from "./helpers/poll.ts";

type Payload = RunStatusView & Partial<Omit<Report, keyof RunStatusView>>;

const [phase, runIdArg = ""] = process.argv.slice(2);
const client = new Client({ name: "restart-test", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(process.env.FACTORY_URL ?? ""), {
    requestInit: { headers: { Authorization: `Bearer ${process.env.FACTORY_TOKEN}` } },
  }),
);
const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })).structuredContent as Payload;

/** factory_status goes over HTTP and the restarted server replays the run, so a wide interval and limit. */
const STATUS_POLL = { intervalMs: 30, timeoutMs: 15000 };

function statusReaches(runId: string, statuses: string[]): Promise<Payload> {
  return pollUntil(() => call("factory_status", { runId }), statuses, STATUS_POLL);
}

try {
  if (phase === "begin") {
    const { runId } = await call("factory_start", { goal: "restart test" });
    await call("factory_confirm", { runId });
    console.log(runId);
  } else {
    const mid = await call("factory_status", { runId: runIdArg });
    console.log(`      after restart: status=${mid.status} node=${mid.currentNode} steps=${mid.cost.steps}`);
    await statusReaches(runIdArg, ["waiting_for_user"]);
    await call("factory_answer", { runId: runIdArg, questionId: "q-endpoint", answer: "extend" });
    const done = await statusReaches(runIdArg, ["done"]);
    const report = await call("factory_report", { runId: runIdArg });
    assert.equal(done.cost.steps, 13);
    assert.equal(report.byNode?.["hello/plan"]?.steps, 3);
    console.log("PASS  run survives server kill + restart, no duplicated turns");
  }
} catch (error) {
  console.error(`FAIL  restart ${phase}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
