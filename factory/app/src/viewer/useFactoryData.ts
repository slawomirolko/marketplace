import { useCallback, useEffect, useState } from "react";
import { API, getJson, messageOf, postAction } from "../api.ts";
import type { AgentInfo, FactoryConfig, StaleWorkflow, Workflow } from "../types.ts";
import type { NoteLoad } from "./useLoadNotes.ts";

interface UpdateResult {
  before?: string;
  after?: string;
  changedFiles?: string[];
  stale?: StaleWorkflow[];
}

export interface FactoryData {
  workflows: Workflow[] | null;
  config: FactoryConfig | null;
  agents: Record<string, AgentInfo>;
  /** Why the workflows or the config could not be loaded; the viewer cannot draw anything then. */
  error: string | null;
  stale: Record<string, StaleWorkflow>;
  marketplace: string;
  updating: boolean;
  updateNote: string | null;
  update: () => Promise<void>;
}

function staleByWorkflow(entries: StaleWorkflow[]): Record<string, StaleWorkflow> {
  return Object.fromEntries(entries.map((entry) => [entry.workflow, entry]));
}

function updateSummary(result: UpdateResult): string {
  const moved = result.before === result.after ? "already up to date" : `${result.before?.slice(0, 7)} → ${result.after?.slice(0, 7)}, ${result.changedFiles?.length ?? 0} files changed`;
  return `Marketplace ${moved}; agents and skills reloaded; ${result.stale?.length ?? 0} workflows have a changed source.`;
}

/** The workflows, config, agents and changed sources of the factory, and the update from the marketplace that reloads them. */
export function useFactoryData(noteLoad: NoteLoad): FactoryData {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [config, setConfig] = useState<FactoryConfig | null>(null);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<Record<string, StaleWorkflow>>({});
  const [marketplace, setMarketplace] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);

  const loadStale = useCallback(() => {
    getJson<{ marketplace: string; stale: StaleWorkflow[] }>("/stale")
      .then((result) => {
        setMarketplace(result.marketplace);
        setStale(staleByWorkflow(result.stale));
        noteLoad("stale", null);
      })
      .catch((loadError: unknown) => {
        setStale({});
        noteLoad("stale", `Could not check changed sources: ${messageOf(loadError)}`);
      });
  }, [noteLoad]);
  useEffect(loadStale, [loadStale]);

  useEffect(() => {
    Promise.all([getJson<Workflow[]>("/workflows"), getJson<FactoryConfig>("/config")])
      .then(([workflowList, factoryConfig]) => {
        setWorkflows(workflowList);
        setConfig(factoryConfig);
      })
      .catch((loadError: unknown) => setError(messageOf(loadError)));
    getJson<Record<string, AgentInfo>>("/agents")
      .then((agentList) => {
        setAgents(agentList);
        noteLoad("agents", null);
      })
      .catch((loadError: unknown) => {
        setAgents({});
        noteLoad("agents", `Could not load agents: ${messageOf(loadError)}`);
      });
  }, [noteLoad]);

  const update = useCallback(async () => {
    setUpdating(true);
    setUpdateNote(null);
    try {
      const result = await postAction<UpdateResult>(`${API}/update`, "update");
      const [workflowList, agentList] = await Promise.all([getJson<Workflow[]>("/workflows"), getJson<Record<string, AgentInfo>>("/agents")]);
      setWorkflows(workflowList);
      setAgents(agentList);
      setStale(staleByWorkflow(result.stale ?? []));
      setUpdateNote(updateSummary(result));
    } catch (updateError) {
      setUpdateNote(messageOf(updateError));
    } finally {
      setUpdating(false);
    }
  }, []);

  return { workflows, config, agents, error, stale, marketplace, updating, updateNote, update };
}
