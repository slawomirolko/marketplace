import "../../../test/helpers/isolated-home.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_HOSTS, callerFor } from "../../../test/helpers/data-api.ts";
import { apiMiddleware, createDataApi } from "../../../src/viewer-data.ts";
import type { AgentInfo, FactoryConfig, RunDetail, RunListItem, Workflow } from "../../src/types.ts";

/**
 * The one bridge from the viewer tests to the backend: the JSON the real data API serves, parsed and checked
 * against the viewer types. Only the API contract tests import it; every other viewer test uses typed fixtures.
 * The isolated-home import comes first so the backend never reads the real factory home.
 */
const factoryDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const configFile = path.join(factoryDir, "spec", "examples", "valid", "factory-config.json");

/** The temp data folders this test file created; removed after its last test. */
const dataDirs: string[] = [];

afterAll(() => {
  for (const dir of dataDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

/** A JSON type name as `typeof` gives it, with "array" and "null" told apart from "object"; "undefined" is a missing field. */
type JsonType = "string" | "number" | "boolean" | "object" | "array" | "null" | "undefined";

/** The fields a viewer type requires, each with the JSON types the viewer accepts for it. */
type Shape = Record<string, JsonType[]>;

const RUN_LIST_ITEM: Shape = { runId: ["string"], goal: ["string"], status: ["string"], createdAt: ["string", "null"], costUsd: ["number"], coverage: ["object"], harness: ["string", "null"], requestedModels: ["array"], usedModels: ["array"], synthetic: ["boolean"] };
const RUN_DATA: Shape = { runId: ["string"], goal: ["string"], status: ["string"], ledger: ["array"], events: ["array"] };
const LEDGER_RECORD: Shape = { runId: ["string"], workflow: ["string"], at: ["string"], nodePath: ["string"], kind: ["string"], tier: ["string", "null"], model: ["string", "null"], backend: ["string"], turn: ["number"], inputTokens: ["number", "null"], outputTokens: ["number", "null"], costUsd: ["number", "null"], costSource: ["string"] };
const RUN_EVENT: Shape = { at: ["string"], type: ["string"] };
const RUN_REPORT: Shape = { runId: ["string"], status: ["string"], workflow: ["string"], byNode: ["object"], byTier: ["object"], byModel: ["object"], byCostSource: ["object"], coverage: ["object"], cacheTokens: ["number"], harnessCostUsd: ["number"], cost: ["object"], synthetic: ["boolean"], bySubgraph: ["object"], passes: ["array"], calls: ["array"] };
const COST: Shape = { costUsd: ["number"], tokens: ["number"], cacheTokens: ["number"], steps: ["number"], costSource: ["string"], llmSteps: ["number"], unknownSteps: ["number"] };
const RUN_PASS: Shape = { node: ["string"], visit: ["number", "null"], startedAt: ["string"], endedAt: ["string", "null"], status: ["string"], agents: ["array"], records: ["number"], durationMs: ["number", "null"], waitMs: ["number"] };
const RUN_CALL: Shape = { node: ["string"], agent: ["string", "null"], agentName: ["string", "null"], visit: ["number", "null"], status: ["string"], startedAt: ["string"], costUsd: ["number", "null"], records: ["number"], durationMs: ["number", "null"], waitMs: ["number"] };
const SUPERVISOR: Shape = { status: ["string"], agent: ["string"] };
const WORKFLOW: Shape = { name: ["string"], version: ["string"], entry: ["string"], nodes: ["array"], edges: ["array"] };
const WORKFLOW_NODE: Shape = { id: ["string"], kind: ["string"] };
const AGENT_INFO: Shape = { name: ["string"], kind: ["string"], description: ["string"], file: ["string"], skills: ["array"], scripts: ["array"], missing: ["array"] };

function jsonType(value: unknown): JsonType {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean" || type === "undefined") {
    return type;
  }
  return "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return jsonType(value) === "object";
}

/** Every field of `value` at `where` that is missing or has a JSON type the viewer type does not allow. */
function shapeErrors(value: unknown, shape: Shape, where: string): string[] {
  if (!isRecord(value)) {
    return [`${where} is ${jsonType(value)}, not an object`];
  }
  return Object.entries(shape)
    .filter(([field, types]) => !types.includes(jsonType(value[field])))
    .map(([field, types]) => `${where}.${field} is ${jsonType(value[field])}, the viewer expects ${types.join(" or ")}`);
}

function eachErrors(values: unknown, shape: Shape, where: string): string[] {
  return Array.isArray(values) ? values.flatMap((value, index) => shapeErrors(value, shape, `${where}[${index}]`)) : [`${where} is not an array`];
}

function valuesErrors(record: unknown, shape: Shape, where: string): string[] {
  return isRecord(record) ? Object.entries(record).flatMap(([key, value]) => shapeErrors(value, shape, `${where}.${key}`)) : [`${where} is not an object`];
}

function fail(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`the served JSON does not match the viewer types:\n${errors.join("\n")}`);
  }
}

/** Checks a served run list against RunListItem[]. */
export function assertRunList(value: unknown): asserts value is RunListItem[] {
  fail(eachErrors(value, RUN_LIST_ITEM, "runs"));
}

/** Checks a served run detail against RunDetail: the run with its ledger and events, and the report with every part the viewer reads. */
export function assertRunDetail(value: unknown): asserts value is RunDetail {
  if (!isRecord(value)) {
    return fail(["run detail is not an object"]);
  }
  const { run, report } = value;
  const errors = [...shapeErrors(run, RUN_DATA, "run"), ...shapeErrors(report, RUN_REPORT, "report")];
  if (isRecord(run)) {
    errors.push(...eachErrors(run.ledger, LEDGER_RECORD, "run.ledger"), ...eachErrors(run.events, RUN_EVENT, "run.events"));
  }
  if (isRecord(report)) {
    errors.push(...valuesErrors(report.byNode, { ...COST, byAgent: ["object"] }, "report.byNode"), ...valuesErrors(report.bySubgraph, COST, "report.bySubgraph"));
    errors.push(...eachErrors(report.passes, RUN_PASS, "report.passes"), ...eachErrors(report.calls, RUN_CALL, "report.calls"));
    if (report.supervisor !== undefined) {
      errors.push(...shapeErrors(report.supervisor, SUPERVISOR, "report.supervisor"));
    }
    for (const [node, cost] of Object.entries(isRecord(report.byNode) ? report.byNode : {})) {
      errors.push(...valuesErrors(isRecord(cost) ? cost.byAgent : null, { ...COST, agentName: ["string", "null"] }, `report.byNode.${node}.byAgent`));
    }
  }
  fail(errors);
}

/** Checks served workflows against Workflow[], including every node's id and kind. */
export function assertWorkflows(value: unknown): asserts value is Workflow[] {
  const errors = eachErrors(value, WORKFLOW, "workflows");
  for (const [index, workflow] of (Array.isArray(value) ? value : []).entries()) {
    errors.push(...eachErrors(isRecord(workflow) ? workflow.nodes : null, WORKFLOW_NODE, `workflows[${index}].nodes`));
  }
  fail(errors);
}

/** Checks served agents against Record<string, AgentInfo>. */
export function assertAgents(value: unknown): asserts value is Record<string, AgentInfo> {
  fail(valuesErrors(value, AGENT_INFO, "agents"));
}

/** Checks the served factory config against FactoryConfig: an object whose optional parts have the declared JSON types. */
export function assertConfig(value: unknown): asserts value is FactoryConfig {
  fail(shapeErrors(value, {}, "config"));
  const optional: Shape = { tiers: ["array"], backends: ["array"], roles: ["object"], budget: ["object"], switches: ["object"], memoryLayer: ["string"] };
  if (isRecord(value)) {
    fail(Object.keys(optional).filter((field) => field in value).flatMap((field) => shapeErrors({ [field]: value[field] }, { [field]: optional[field] ?? [] }, "config")));
  }
}

/** The data API of a fresh temp data folder, read through the HTTP middleware the viewer calls. */
export interface ServedApi {
  /** The parsed JSON body of a GET; fails on any status but 200. */
  get(url: string): Promise<unknown>;
}

/** Serves a fresh data folder; with `demo` the folder first gets the finished demo run of the hello workflow. */
export async function servedApi({ demo }: { demo: boolean }): Promise<ServedApi> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-viewer-contract-"));
  dataDirs.push(dataDir);
  const api = createDataApi({ factoryDir, dataDir, configFile, demo });
  await api.ensureDemo();
  const call = callerFor(apiMiddleware(api, ALLOWED_HOSTS));
  return {
    async get(url) {
      const { status, body } = await call("GET", url, { headers: { host: [...ALLOWED_HOSTS][0] ?? "" } });
      if (status !== 200) {
        throw new Error(`GET ${url} answered ${status}`);
      }
      return body;
    },
  };
}

/** The demo run as the viewer receives it: run list, run detail, workflows, agents and config, each checked against its viewer type. */
export async function servedDemo() {
  const api = await servedApi({ demo: true });
  const runs = await api.get("/api/runs");
  assertRunList(runs);
  const [summary] = runs;
  if (!summary) {
    throw new Error("the demo data folder has no run");
  }
  const detail = await api.get(`/api/runs/${summary.runId}`);
  assertRunDetail(detail);
  const workflows = await api.get("/api/workflows");
  assertWorkflows(workflows);
  const agents = await api.get("/api/agents");
  assertAgents(agents);
  const config = await api.get("/api/config");
  assertConfig(config);
  return { runs, detail, workflows, agents, config };
}
