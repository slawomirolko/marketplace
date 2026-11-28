import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Factory } from "../src/engine.ts";
import type { Report } from "../src/types.ts";

export async function fakeRunReport(): Promise<Report> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-viewer-"));
  const factory = new Factory(dataDir, { backend: "fake" });
  const { run } = factory.start("add a greeting function", "viewer-demo");
  factory.confirm(run.runId, { backend: { kind: "fake" } });
  for (;;) {
    const { run: current } = await factory.waitForChange(run.runId, 30000);
    const question = current.pendingQuestion;
    if (current.status === "waiting_for_user" && question) {
      factory.answer(run.runId, question.id, question.id === "q-budget-pause" ? "continue" : "extend");
      continue;
    }
    if (current.status !== "running") {
      fs.rmSync(dataDir, { recursive: true, force: true });
      return factory.report(current);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outFile = process.argv[2] ?? "demo-report.json";
  fs.writeFileSync(outFile, JSON.stringify(await fakeRunReport(), null, 2));
  console.log(`wrote ${outFile}`);
  process.exit(0);
}
