import type { ProjectArtifact, ProjectStatusData } from "../types.ts";

export const STATES = ["current", "adapted", "outdated", "modified", "unknown-base", "missing", "removed", "local-only"] as const;

export const STATE_HELP: Record<string, string> = {
  current: "Same as the marketplace HEAD.",
  adapted: "Same as HEAD, plus a project adapter or a project model.",
  outdated: "Same as an older marketplace version.",
  modified: "Changed in the project; compared with the nearest marketplace version.",
  "unknown-base": "Shares no file with any marketplace version.",
  missing: "Not installed, but an installed agent or skill needs it.",
  removed: "The marketplace no longer has it.",
  "local-only": "The marketplace never had it.",
};

/** The ref of a marketplace checkout without an origin remote. */
const LOCAL_REF = "HEAD";
/** The harness of the skills and agents of a marketplace source checkout. */
const SOURCE_HARNESS = "source";

/** Why Merge updates is off for these artifacts, or null when one of them can be merged. */
export function mergeBlocker(artifacts: ProjectArtifact[] | undefined): string | null {
  if (!artifacts) {
    return "Check the status first: the merge needs to know which skills and agents differ from the marketplace.";
  }
  const mergeable = artifacts.some((artifact) => artifact.harness !== SOURCE_HARNESS && (artifact.state === "outdated" || (artifact.state === "modified" && artifact.upstreamMoved === true)));
  return mergeable ? null : "Nothing to merge: no installed skill or agent is outdated, or modified with a newer marketplace version. A marketplace source checkout is never merged.";
}

export function mergeNote(projectId: string, text: string): string {
  return `Merge of ${projectId} ${text}`;
}

export function checkNote(projectId: string, text: string): string {
  return `Status check of ${projectId} ${text}`;
}

/** The remote a status was compared with; null for a checkout without a remote, where the ref is plain `HEAD`. */
export function remoteNameOf(ref: string | null | undefined): string | null {
  return ref && ref !== LOCAL_REF ? ref : null;
}

/** The suffix of the "compared with" line: a failed fetch, or a comparison with what the last fetch left. */
export function fetchNoteOf(data: Pick<ProjectStatusData, "ref" | "fetched" | "fetchError">): string {
  if (data.fetchError) {
    return ` (fetch failed: ${data.fetchError})`;
  }
  return data.fetched === false && remoteNameOf(data.ref) ? " (last fetch)" : "";
}

function sideText(version: string | null | undefined, commit: string | undefined, withCommit: boolean): string {
  if (!version) {
    return commit ? `commit ${commit}` : "–";
  }
  return withCommit && commit ? `${version} (${commit})` : version;
}

function installedIsCurrent(artifact: ProjectArtifact): boolean {
  if (artifact.installedCommit && artifact.currentCommit) {
    return artifact.installedCommit === artifact.currentCommit;
  }
  return artifact.installed === artifact.current;
}

/** The version text of one artifact row: versions; a commit only where versions cannot tell two sides apart. */
export function versionText(artifact: ProjectArtifact): string {
  if (artifact.state === "unknown-base") {
    return `nearest ${sideText(artifact.nearestVersion, artifact.nearestCommit, false)}`;
  }
  if (artifact.state === "removed") {
    return `last ${sideText(artifact.lastVersion, artifact.lastCommit, false)}`;
  }
  if (!artifact.installed && !artifact.current && !artifact.installedCommit && !artifact.currentCommit) {
    return "–";
  }
  if (installedIsCurrent(artifact)) {
    return artifact.installed ?? "–";
  }
  const versionsAmbiguous = !artifact.installed || !artifact.current || artifact.installed === artifact.current;
  return `${sideText(artifact.installed, artifact.installedCommit, versionsAmbiguous)} → ${sideText(artifact.current, artifact.currentCommit, versionsAmbiguous)}`;
}

/** Counts as one line, in state order, without zeros. */
export function countsText(counts: Record<string, number> | null | undefined): string {
  if (!counts) {
    return "";
  }
  return STATES.filter((state) => counts[state]).map((state) => `${counts[state]} ${state}`).join(" · ");
}

const TO_CHANGE = ["outdated", "modified", "unknown-base", "missing", "removed"] as const;

export interface Verdict {
  level: "ok" | "change" | "empty";
  title: string;
  badge: string;
}

/** The answer of one status: in sync with the remote, how much to change, or nothing installed. */
export function verdictOf(counts: Record<string, number> | null | undefined, ref?: string | null): Verdict {
  const total = STATES.reduce((sum, state) => sum + (counts?.[state] ?? 0), 0);
  const remote = remoteNameOf(ref) ?? "the marketplace";
  if (total === 0) {
    return { level: "empty", title: "No marketplace skill or agent is installed in this project.", badge: "nothing installed" };
  }
  const change = TO_CHANGE.filter((state) => counts?.[state]);
  if (change.length === 0) {
    return { level: "ok", title: `In sync with ${remote}: ${total} skills and agents, nothing to change.`, badge: "in sync" };
  }
  const toChange = change.reduce((sum, state) => sum + (counts?.[state] ?? 0), 0);
  return { level: "change", title: `${toChange} of ${total} differ from ${remote}: ${change.map((state) => `${counts?.[state]} ${state}`).join(" · ")}.`, badge: `${toChange} to change` };
}

/** What to do with a skill or agent of a marketplace source checkout, compared with its remote. */
function sourceActionOf(artifact: ProjectArtifact): string {
  switch (artifact.state) {
    case "outdated":
    case "missing":
    case "removed":
      return "Pull the remote (git pull, or Update from marketplace).";
    case "modified":
    case "unknown-base":
      return "Local change not on the remote: commit and push it in a PR, or discard it.";
    case "local-only":
      return "New here, not on the remote: commit and push it in a PR.";
    default:
      return "Nothing to do.";
  }
}

const SYNC_SKILL = "olko-marketplace-skill-sync";
const UPSTREAM_SKILL = "olko-marketplace-upstream";

function neededBy(artifact: ProjectArtifact): string {
  return artifact.requiredBy?.length ? `; needed by ${artifact.requiredBy.join(", ")}` : "";
}

/** What to do with one skill or agent, by its state. */
export function actionOf(artifact: ProjectArtifact): string {
  if (artifact.harness === SOURCE_HARNESS) {
    return sourceActionOf(artifact);
  }
  switch (artifact.state) {
    case "outdated":
      return `Update to ${artifact.current ?? "the marketplace version"} (${SYNC_SKILL}).`;
    case "modified":
      if (artifact.upstreamMoved) {
        return `Take the newer marketplace version into the local change, then send the change upstream (${UPSTREAM_SKILL}).`;
      }
      return `Send the local change upstream (${UPSTREAM_SKILL}) or reinstall the marketplace version.`;
    case "unknown-base":
      return "Compare by hand: it matches no marketplace version.";
    case "missing":
      return `Install it (${SYNC_SKILL})${neededBy(artifact)}.`;
    case "removed":
      return "The marketplace dropped it: remove it from the project or keep it as a local copy.";
    case "local-only":
      return `Local only: publish it to the marketplace if other projects need it (${SYNC_SKILL}).`;
    default:
      return "Nothing to do.";
  }
}

/** The details cell of one artifact row: who needs a missing one, else its changed files. */
export function detailsText(artifact: ProjectArtifact): string {
  if (artifact.requiredBy?.length) {
    return `needed by ${artifact.requiredBy.join(", ")}`;
  }
  if (artifact.files.length) {
    return `${artifact.files.join(", ")}${artifact.upstreamMoved ? " · marketplace moved on" : ""}`;
  }
  return "";
}
