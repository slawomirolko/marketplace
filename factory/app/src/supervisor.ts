export interface SupervisorData {
  status: "pending" | "running" | "waiting_for_client" | "done" | "failed";
  agent: string;
  tier?: string;
  model?: string;
  startedAt?: string;
  finishedAt?: string;
  costUsd?: number | null;
  output?: string | null;
  verdict?: string | null;
  bottleneck?: string | null;
  idea?: string | null;
  error?: string | null;
}

export type SupervisorTone = "idle" | "busy" | "ok" | "improve" | "fix" | "failed";

export interface SupervisorRingView {
  tone: SupervisorTone;
  status: string;
  cost: string;
  headline: string;
  text: string;
  agent: string;
  model: string | null;
}

const IDLE: SupervisorRingView = {
  tone: "idle",
  status: "watches every run",
  cost: "",
  headline: "After a run ends, the supervisor reports its bottleneck and optimizations here.",
  text: "",
  agent: "olko-factory-supervisor",
  model: null,
};

const STATUS_TEXT: Record<SupervisorData["status"], string> = {
  pending: "waiting for the run to end",
  running: "analyzing the run",
  waiting_for_client: "waiting for the client to run it",
  done: "done",
  failed: "failed",
};

function toneOf(data: SupervisorData): SupervisorTone {
  if (data.status === "failed") return "failed";
  if (data.status !== "done") return "busy";
  if (data.verdict === "improve" || data.verdict === "fix") return data.verdict;
  return "ok";
}

function headlineOf(data: SupervisorData): string {
  if (data.status === "failed") return data.error ?? "the supervisor failed";
  if (data.status !== "done") return STATUS_TEXT[data.status];
  if (data.verdict) return `bottleneck: ${data.bottleneck || "none"} · idea: ${data.idea || "none"}`;
  return (data.output ?? "").trim().split(/\r?\n/).at(-1)?.slice(0, 200) ?? "";
}

export function supervisorRing(data: SupervisorData | null | undefined): SupervisorRingView {
  if (!data) return IDLE;
  return {
    tone: toneOf(data),
    status: data.status === "done" ? (data.verdict ?? "done") : STATUS_TEXT[data.status],
    cost: data.costUsd === null || data.costUsd === undefined ? "" : `$${data.costUsd.toFixed(6)}`,
    headline: headlineOf(data),
    text: data.status === "failed" ? (data.error ?? "") : (data.output ?? ""),
    agent: data.agent,
    model: data.model ?? null,
  };
}
