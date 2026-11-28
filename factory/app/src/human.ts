import { agentNameOf, allItems, isGroup, isWithin, stepName } from "./tree.ts";
import type { AgentInfo, AskedBy, AskedByRef, AskedQuestion, Item, Level } from "./types.ts";

export interface HumanQuestion {
  node: string;
  id: string;
  text: string;
}

/** The human icon of a graph node: green when the step asks you itself, black when it only passes on a question another step asks. */
export interface HumanIcon {
  role: "asks" | "relays";
  sources: string[];
  /** Asking steps named as workflow/step that this diagram does not draw. */
  external: string[];
  questions: HumanQuestion[];
  permission: string | null;
}

type DrawnItem = Exclude<Item, { kind: "terminal" }>;

function parentPath(key: string): string {
  return key.slice(0, key.lastIndexOf("/"));
}

function askedByRefs(askedBy: AskedBy | undefined): AskedByRef[] {
  if (askedBy === undefined) {
    return [];
  }
  return Array.isArray(askedBy) ? askedBy : [askedBy];
}

/** The workflow each drawn item comes from: the root workflow, or the one a subgraph, call or group draws inside it. */
function ownerWorkflows(level: Level, owner: string | null, owners: Map<string, string>): Map<string, string> {
  for (const item of level.items) {
    if (item.kind === "terminal") {
      continue;
    }
    const own = owner ?? item.key.split("/")[0]!;
    owners.set(item.key, own);
    if (item.kind === "subgraph") {
      ownerWorkflows(item.inner, item.node.workflow ?? own, owners);
    }
    if (item.kind === "team") {
      ownerWorkflows(item.inner, own, owners);
    }
  }
  return owners;
}

function sharedPrefix(first: string, second: string): number {
  let at = 0;
  while (at < first.length && at < second.length && first[at] === second[at]) {
    at++;
  }
  return at;
}

function askerOf(icons: Map<string, HumanIcon>, key: string): HumanIcon {
  const icon = icons.get(key) ?? { role: "asks" as const, sources: [key], external: [], questions: [], permission: null };
  icons.set(key, icon);
  return icon;
}

function drawnStep(items: DrawnItem[], owners: Map<string, string>, from: string, ref: AskedByRef): string | null {
  if (typeof ref === "string") {
    return `${parentPath(from)}/${ref}`;
  }
  const found = items.filter((item) => item.kind === "step" && item.node.kind === "llm" && item.node.id === ref.step && owners.get(item.key) === ref.workflow);
  return found.sort((first, second) => sharedPrefix(second.key, from) - sharedPrefix(first.key, from))[0]?.key ?? null;
}

/** An interrupt that names its asking steps in `askedBy` relays their question; each drawn asking step asks it. */
function markInterruptRelay(item: DrawnItem, items: DrawnItem[], owners: Map<string, string>, icons: Map<string, HumanIcon>): void {
  if (item.kind !== "step" || item.node.kind !== "interrupt" || !item.node.askedBy || !item.node.question) {
    return;
  }
  const question = { node: item.key, id: item.node.question.id, text: item.node.question.text };
  const sources: string[] = [];
  const external: string[] = [];
  for (const ref of askedByRefs(item.node.askedBy)) {
    const source = drawnStep(items, owners, item.key, ref);
    if (source) {
      sources.push(source);
    } else if (typeof ref !== "string") {
      external.push(`${ref.workflow}/${ref.step}`);
    }
  }
  for (const source of sources) {
    askerOf(icons, source).questions.push(question);
  }
  icons.set(item.key, { role: "relays", sources, external, questions: [question], permission: null });
}

/** A step asks when it asks after a turn itself (`askAfterTurn`) or when its marketplace agent has a permission to ask. */
function markAsker(item: DrawnItem, agents: Record<string, AgentInfo>, icons: Map<string, HumanIcon>): void {
  if (item.kind === "step" && item.node.kind === "llm" && item.node.askAfterTurn && item.node.question) {
    askerOf(icons, item.key).questions.push({ node: item.key, id: item.node.question.id, text: item.node.question.text });
  }
  const name = agentNameOf(item);
  const permission = name ? (agents[name]?.asks ?? null) : null;
  if (permission) {
    askerOf(icons, item.key).permission = permission;
  }
}

/** The items not nested inside another of the given items. */
function outermost(items: Item[]): Item[] {
  return items.filter((item) => !items.some((other) => other.key !== item.key && isWithin(item.key, other.key)));
}

/** Every group or team that holds an asking step and does not ask itself relays the questions of its outermost askers. */
function markGroupRelays(items: DrawnItem[], icons: Map<string, HumanIcon>): void {
  for (const item of items) {
    if (!isGroup(item) || icons.get(item.key)?.role === "asks") {
      continue;
    }
    const inside = outermost(allItems(item.inner).filter((inner) => icons.get(inner.key)?.role === "asks"));
    if (inside.length) {
      icons.set(item.key, { role: "relays", sources: inside.map((inner) => inner.key), external: [], questions: inside.flatMap((inner) => icons.get(inner.key)!.questions), permission: null });
    }
  }
}

/**
 * Marks the steps that ask the user. A step asks when an interrupt names it in `askedBy`, when it asks
 * after a turn itself (`askAfterTurn`), or when its marketplace agent has a permission to ask. The interrupt
 * that passes the question on, and every group or team holding a step that asks, relay it.
 */
export function humanIcons(level: Level, agents: Record<string, AgentInfo>): Map<string, HumanIcon> {
  const items = allItems(level).filter((item): item is DrawnItem => item.kind !== "terminal");
  const owners = ownerWorkflows(level, null, new Map());
  const icons = new Map<string, HumanIcon>();
  for (const item of items) {
    markInterruptRelay(item, items, owners, icons);
    markAsker(item, agents, icons);
  }
  markGroupRelays(items, icons);
  return icons;
}

/** The stored questions of a graph node: the ones it asked, the ones it passed on, or for a group every one inside it. */
export function questionsFor(key: string, questions: AskedQuestion[]): AskedQuestion[] {
  return questions.filter((question) => [...question.askedBy, question.node].some((path) => path !== null && isWithin(path, key)));
}

export function humanLabel(icon: HumanIcon): string {
  if (icon.role === "relays") {
    const from = [...new Set(icon.sources.map(stepName)), ...icon.external.map((step) => `${step} (not in this diagram)`)];
    return `Passes on a question to you from: ${from.join(", ")}. Click to see the questions and your answers in this run`;
  }
  const asked = icon.questions.map((question) => `${question.id} (through ${stepName(question.node)})`);
  return [asked.length ? `Asks you: ${asked.join(", ")}` : null, icon.permission ? `May ask you itself (${icon.permission})` : null].filter(Boolean).join(". ") + ". Click to see the questions and your answers in this run";
}
