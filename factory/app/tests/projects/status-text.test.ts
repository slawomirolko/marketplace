import { actionOf, countsText, fetchNoteOf, remoteNameOf, verdictOf, versionText } from "../../src/projects/status-text.ts";
import type { ProjectArtifact, ProjectStatusData } from "../../src/types.ts";
import { artifact, CURRENT_COMMIT, INSTALLED_COMMIT, REMOTE_REF } from "../testUtils/projects.ts";

test.each<{ name: string; counts: Record<string, number> | null; ref?: string; verdict: Partial<ReturnType<typeof verdictOf>> }>([
  { name: "nothing installed", counts: null, verdict: { level: "empty", title: "No marketplace skill or agent is installed in this project.", badge: "nothing installed" } },
  { name: "current and adapted are in sync", counts: { current: 2, adapted: 1 }, verdict: { level: "ok", badge: "in sync" } },
  { name: "in sync with a remote names the remote", counts: { current: 1 }, ref: REMOTE_REF, verdict: { title: `In sync with ${REMOTE_REF}: 1 skills and agents, nothing to change.` } },
  { name: "HEAD is the marketplace", counts: { current: 1, outdated: 1 }, ref: "HEAD", verdict: { title: "1 of 2 differ from the marketplace: 1 outdated." } },
  { name: "modified and removed are changes", counts: { current: 1, modified: 2, removed: 1 }, verdict: { level: "change", title: "3 of 4 differ from the marketplace: 2 modified · 1 removed.", badge: "3 to change" } },
])("verdict: $name", ({ counts, ref, verdict }) => {
  expect(verdictOf(counts, ref)).toMatchObject(verdict);
});

test.each<{ name: string; extra: Partial<ProjectArtifact>; action: string | RegExp }>([
  { name: "a current source artifact needs nothing", extra: { harness: "source", state: "current" }, action: "Nothing to do." },
  { name: "a source artifact missing here is pulled", extra: { harness: "source", state: "missing" }, action: /^Pull the remote/ },
  { name: "a source artifact on no known base is a local change", extra: { harness: "source", state: "unknown-base" }, action: /^Local change not on the remote/ },
  { name: "an adapted artifact needs nothing", extra: { state: "adapted" }, action: "Nothing to do." },
  { name: "an outdated artifact with no known version is updated", extra: { state: "outdated", current: null }, action: "Update to the marketplace version (olko-marketplace-skill-sync)." },
  { name: "a modified artifact is sent upstream", extra: { state: "modified" }, action: "Send the local change upstream (olko-marketplace-upstream) or reinstall the marketplace version." },
  { name: "a modified artifact whose upstream moved takes the newer version in", extra: { state: "modified", upstreamMoved: true }, action: /^Take the newer marketplace version into the local change/ },
  { name: "an artifact on no known base is compared by hand", extra: { state: "unknown-base" }, action: "Compare by hand: it matches no marketplace version." },
  { name: "a missing artifact is installed", extra: { state: "missing" }, action: "Install it (olko-marketplace-skill-sync)." },
  { name: "a removed artifact was dropped by the marketplace", extra: { state: "removed" }, action: /^The marketplace dropped it/ },
  { name: "a local-only artifact is published", extra: { state: "local-only" }, action: /^Local only: publish it/ },
])("action: $name", ({ extra, action }) => {
  expect(actionOf(artifact(extra))).toMatch(action);
});

test.each<{ name: string; extra: Partial<ProjectArtifact>; text: string }>([
  { name: "the installed version", extra: {}, text: "1.0.0" },
  { name: "the nearest version of an unknown base", extra: { state: "unknown-base", nearestVersion: "0.9.0" }, text: "nearest 0.9.0" },
  { name: "the last version of a removed artifact", extra: { state: "removed", lastVersion: "0.8.0" }, text: "last 0.8.0" },
  { name: "no version at all", extra: { installed: null, current: null }, text: "–" },
  { name: "an outdated version with commits shows only the versions when they differ", extra: { state: "outdated", installed: "1.0.0", installedCommit: INSTALLED_COMMIT, current: "1.1.0", currentCommit: CURRENT_COMMIT }, text: "1.0.0 → 1.1.0" },
  { name: "an outdated artifact on the same version shows both commits", extra: { state: "outdated", installed: "1.0.0", installedCommit: INSTALLED_COMMIT, current: "1.0.0", currentCommit: CURRENT_COMMIT }, text: `1.0.0 (${INSTALLED_COMMIT}) → 1.0.0 (${CURRENT_COMMIT})` },
  { name: "an outdated artifact with no installed version shows its commit", extra: { state: "outdated", installed: null, installedCommit: INSTALLED_COMMIT, current: "1.0.0", currentCommit: CURRENT_COMMIT }, text: `commit ${INSTALLED_COMMIT} → 1.0.0 (${CURRENT_COMMIT})` },
  { name: "a current artifact with commits only", extra: { state: "current", installed: null, installedCommit: CURRENT_COMMIT, current: null, currentCommit: CURRENT_COMMIT }, text: "–" },
  { name: "the last commit of a removed artifact with no last version", extra: { state: "removed", lastVersion: null, lastCommit: "ccccccc" }, text: "last commit ccccccc" },
  { name: "a current version ignores the installed commit", extra: { installed: "1.0.0", installedCommit: INSTALLED_COMMIT, current: "1.0.0" }, text: "1.0.0" },
])("version text: $name", ({ extra, text }) => {
  expect(versionText(artifact(extra))).toBe(text);
});

test.each<{ ref: string | undefined; name: string | null }>([
  { ref: REMOTE_REF, name: REMOTE_REF },
  { ref: "HEAD", name: null },
  { ref: undefined, name: null },
])("remote name of $ref is $name", ({ ref, name }) => {
  expect(remoteNameOf(ref)).toBe(name);
});

test.each<{ name: string; data: Pick<ProjectStatusData, "ref" | "fetched" | "fetchError">; note: string }>([
  { name: "a failed fetch says why", data: { ref: REMOTE_REF, fetched: false, fetchError: "offline" }, note: " (fetch failed: offline)" },
  { name: "an unfetched remote used the last fetch", data: { ref: REMOTE_REF, fetched: false, fetchError: null }, note: " (last fetch)" },
  { name: "HEAD needs no note", data: { ref: "HEAD", fetched: false, fetchError: null }, note: "" },
  { name: "a fresh fetch needs no note", data: { ref: REMOTE_REF, fetched: true, fetchError: null }, note: "" },
])("fetch note: $name", ({ data, note }) => {
  expect(fetchNoteOf(data)).toBe(note);
});

test.each<{ name: string; counts: Record<string, number> | null; text: string }>([
  { name: "states in order, zero counts left out", counts: { missing: 2, current: 1, removed: 0 }, text: "1 current · 2 missing" },
  { name: "no counts", counts: null, text: "" },
])("counts text: $name", ({ counts, text }) => {
  expect(countsText(counts)).toBe(text);
});
