import { http, HttpResponse } from "msw";
import { agents, config, mainWorkflow, RUN_ID, runDetail, runListItem } from "./data.ts";

export const handlers = [
  http.get("/api/workflows", () => HttpResponse.json([mainWorkflow])),
  http.get("/api/agents", () => HttpResponse.json(agents)),
  http.get("/api/config", () => HttpResponse.json(config)),
  http.get("/api/projects", () => HttpResponse.json({ roots: [], projects: [], statusWorkflow: "olko-project-status" })),
  http.get("/api/stale", () => HttpResponse.json({ marketplace: "", stale: [] })),
  http.get("/api/runs", () => HttpResponse.json([runListItem])),
  http.get(`/api/runs/${RUN_ID}`, () => HttpResponse.json(runDetail)),
];
