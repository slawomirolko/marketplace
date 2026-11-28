import { http, HttpResponse } from "msw";
import { agents, config, mainWorkflow, RUN_ID, runDetail, runListItem } from "./data.ts";
import { API, MERGE_WORKFLOW, STATUS_WORKFLOW } from "./paths.ts";

export const handlers = [
  http.get(API.workflows, () => HttpResponse.json([mainWorkflow])),
  http.get(API.agents, () => HttpResponse.json(agents)),
  http.get(API.config, () => HttpResponse.json(config)),
  http.get(API.projects, () => HttpResponse.json({ roots: [], projects: [], statusWorkflow: STATUS_WORKFLOW, statusWorkflowInstalled: true, mergeWorkflow: MERGE_WORKFLOW, mergeWorkflowInstalled: true, canAnalyze: true })),
  http.get(API.stale, () => HttpResponse.json({ marketplace: "", stale: [] })),
  http.get(API.pending, () => HttpResponse.json([])),
  http.get(API.runs, () => HttpResponse.json([runListItem])),
  http.get(API.run(RUN_ID), () => HttpResponse.json(runDetail)),
];
