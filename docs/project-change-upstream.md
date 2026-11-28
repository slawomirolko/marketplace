# Project Change Upstream

A project that installed marketplace skills or agents may change them locally. This
flow finds those changes and turns each one into a draft marketplace PR, but only
after a person says so. A person always merges or closes the PR.

## Parts

| Part | Role |
|------|------|
| `.agents/marketplace.lock.json` (in the project) | Provenance per installed artifact: marketplace version, source commit, content hash without the project adapter (`project.md`, `*.local.*`, the agent `model:` line). Commit it with the project. |
| `scripts/olko-marketplace-lock.mjs` | `init` writes the lock (finds the base version in marketplace history), `status` lists changed artifacts, `record` stores a pending PR or a rejected content hash, moves the base (`--marketplace <dir> --base-commit <sha>` sets version, source commit, hash and files from that marketplace commit and creates a missing entry) and stores an approved content hash (`--approved <sha256>`; `status` reports `approved` when it equals the copy's `contentHash`). Reads installed copies through the shared model, see [Installed-artifact model](#installed-artifact-model). |
| `scripts/olko-sanitize.mjs` | Blocking gate, see [Sanitize gate](#sanitize-gate). Exit 0 clean, 2 blocked, 1 failed. |
| `scripts/olko-upstream-plan.mjs` | Deterministic PR plan: `open`, `append` (open draft PR on the same base) or `skip` (duplicate, rejected, adapter-only). |
| `olko-marketplace-upstream` (agent and skill) | `stage`, `optimize` and `publish` steps, plus `resolve` for a merge. Draft PRs only; deny rules for merge, ready, reviewers and `gh api`. |
| Factory watch `marketplace-upstream` | Every 10 minutes, per known project with a lock, runs `status`. A change whose hash is the same in two checks starts one `olko-marketplace-upstream` run. |
| `scripts/olko-marketplace-merge.mjs` and workflow `olko-marketplace-merge` | Brings marketplace updates into a project, see [Merge updates](#merge-updates). |
| Factory viewer | Shows "Waiting for your decision" with `ok` / `no` for runs the viewer process owns. |

## Script ownership

`olko-marketplace-lock.mjs`, `olko-sanitize.mjs` and `olko-upstream-plan.mjs` are marketplace gates,
owned by the marketplace checkout and kept in its root `scripts/` folder. They are not files of the
`olko-marketplace-upstream` skill and are never installed with it:

- The upstream flow always works in a marketplace checkout (the stage, the publish worktree and the
  lock all need one), so the gates can always run from `<marketplace>/scripts/`.
- The factory workflow and the skill call them by that path. A change to a gate is a marketplace
  change with its tests in `scripts/`; it does not bump the skill version.
- The lock imports the installed-artifact model from the `olko-factory-project` skill in the same
  checkout (see below); the gates share `scripts/lib/cli.mjs` with the other root scripts.

## Flow

1. Install skills or agents, then run once in the project's marketplace checkout:
   `node scripts/olko-marketplace-lock.mjs init --project <project> --marketplace <marketplace checkout>`.
2. The factory knows a project when it is registered in the project registry (`~/.skill-factory/projects.json`, or the file named by `FACTORY_PROJECTS_FILE`), when a factory run used it (`input.project`), or when it is in the `dirs` list of `projects.json` in the factory data directory.
3. Edit an installed artifact in the project. After two checks without further change, the viewer asks.
4. `no`: the content hash is recorded as rejected; the same content is never offered again.
5. `ok`: the factory runs the steps in the background with the watch's CLI backend (set `FACTORY_WATCH_MODEL` in the factory's environment to pick the model for every tier, for example the model your OpenCode agents use): stage (adapter hunks stay out), optimize, sanitize gate, plan, publish (draft PR, label `upstream-candidate`). The PR is recorded as pending in the lock.
6. Review the draft PR on GitHub. Merge or close it yourself.

## Merge updates

The `olko-marketplace-merge` workflow (input `project` or `projectId`, and `marketplace`) brings marketplace updates into every
`outdated` artifact of one project and every `modified` one whose marketplace source moved on:

1. `prepare` merges base, local copy (adapter excluded) and upstream with `git merge-file` into a fresh work folder
   `<factory home>/merges/<run id>` (`FACTORY_HOME_DIR` or `~/.skill-factory`). Nothing is written to the project or the marketplace.
2. `resolve` (agent `olko-marketplace-upstream`, step `resolve`, writes only in the work folder) resolves conflicted hunks without
   dropping newer upstream text and classifies each local change as portable or project-specific in `<item>/resolution.json`.
3. `summary` builds one row per artifact; one question lists them all. A row is checked by default when its base is known
   and every hunk is marked sure.
4. `apply` writes the checked artifacts into the project (adapter untouched) and records the new base and the approved
   content hash in the lock. That answer is also the approval of the draft PR: the watch passes `approved` to
   `olko-marketplace-upstream`, whose `route` step then skips its question. The sanitize gate still runs and PRs stay drafts.

## Installed-artifact model

The lock and the project status scan (`olko-factory-project`, `scripts/project-scan.mjs`)
answer the same questions about an installed copy: what is installed, what its portable
content is, what its version is, and what its marketplace history is. One module answers them
for both: `skills/software-factory/olko-factory-project/scripts/installed-artifacts.mjs`.

- **Owner.** The module lives in the skill. An installed skill copy must work on its own, so a
  skill script cannot import the root `scripts/` folder; the lock always runs in a marketplace
  checkout, so it can import the module from the checkout path. The module imports only Node
  built-ins.
- **Locations.** `LOCATIONS` lists every harness folder (`.agents/skills`, `.claude/skills`,
  `.opencode/skills`, `.opencode/agents`, `.claude/agents`). The lock tracks the copies whose
  source exists at the marketplace HEAD, one per id: the first copy in that order. Each entry
  records its `location`; entries written before `location` existed fall back to
  `.agents/skills/<name>` and `.opencode/agents/<file>`.
- **Source paths.** `SOURCE_PATHS` is the one table of marketplace paths per kind and harness:
  `skills/<category>/<name>/`, `plugins/<plugin>/skills/<name>/`, `agents/opencode/<name>.md`
  (OpenCode agents), `plugins/<plugin>/agents/<name>.md` (Claude Code agents).
- **Adapter and portable text.** `project.md`, `*.local.*` and the agent `model:` line stay out,
  see [Skill Adaptation Contract](skill-adaptation-contract.md). CRLF and CR become LF.
- **Versions.** `registry.json` `skills[].version` (skills under `skills/<category>/`) and
  `agents/opencode/index.json` `agents[].version` at each commit; the front matter `version` when
  the index has none.
- **History.** The last `--depth` commits (default 40) of the source path, read with one
  `git cat-file --batch` per artifact. A copy older than the compared history is
  `unknown-base`; run again with a larger `--depth`.
- **State.** Exact match with HEAD: `current` (or `adapted` with an adapter or a project model);
  with an older commit: `outdated`; no exact match but a file equal to the nearest version:
  `modified` on a guessed base; no file in common: `unknown-base`. The nearest version has the
  fewest differing files, then the fewest differing lines, then is the newest.

Lock entry fields: `state` (at `init`), `version` and `sourceCommit` (the base; for `modified`
the nearest version, with `baseGuessed: true`), `base: "unknown"` with `nearestVersion` and
`nearestCommit` for `unknown-base`, `hash` and `files`, `location`, `pending`, `rejected`.

### Content hash

There is one content-hash format: `sha256:` plus the SHA-256 of each portable file's path, a
newline, its text and a newline, for every portable file in path order, plus the SHA-256 of each portable file (`hashFiles`). The lock
`hash`, the scan `contentHash`, the `status` `contentHash` (without the prefix) and the plan's
duplicate and rejected checks all use it. The lock `hash` is the hash of the base version (for
`unknown-base`, of the local copy at `init`).

The `olko-sync-state` hash (`sync-state.mjs hash`) is a different hash and is not comparable
with it: it hashes every file of the folder, the adapter and the agent model line included,
and has no prefix. It answers "did the folder change", not "did the marketplace content change".

## Security

- The marketplace is public. The sanitize gate blocks the run before anything leaves the machine; nothing is pushed when it finds a hit.
- The viewer accepts an answer only with its own request header (`x-factory-action: answer`), from a local origin and an allowed host, and only for runs its own process owns.
- Use a GitHub token limited to the marketplace repository (contents and pull requests). The flow never needs admin or workflow scopes.

## Sanitize gate

`scripts/olko-sanitize.mjs` blocks (exit 2) when a file name or line holds:

- a name derived from the project: every non-generic segment and the host of each git remote URL, the repository name (from `git rev-parse --git-common-dir`, so a worktree folder is not mistaken for it), the worktree and project folder names, package names, and the split parts of each (`billing-portal` also adds `billing` and `portal`);
- a private term (see [Forbidden terms](#forbidden-terms));
- a secret pattern: GitHub tokens, AWS access keys, Slack tokens, private key blocks, JWTs, connection strings with a password, email addresses outside placeholder domains, internal host names (`.internal`, `.corp`, `.lan`, `.local`);
- a binary file (UTF-16 with a byte order mark is decoded and scanned), or a symlink or other non-regular entry.

Matching folds Unicode (NFKC), drops zero-width characters and ignores case and the separators `-`, `_`, `.` and whitespace, so `BillingPortal`, `billing_portal` and `billing portal` all match, also inside longer words. A derived term shorter than four characters is not checked; the gate prints a warning with the count.

The workflow runs the gate twice. The `sanitize` node scans the stage directory (`--path`). The publish step stages the commit in a fresh marketplace worktree, then runs the gate on everything the draft PR publishes, before any push or `gh pr create`: the whole staged commit (`--staged <worktree>`: every added line, regenerated `registry.json` and index files included) and the commit message, PR title and PR body (`--text <file>`, reported as `text#n`). The PR body lists only file names found in the stage directory.

The gate fails closed (exit 1) when the project has no usable git remote or no private term is configured; `--allow-no-config` scans without them. Output never holds a value: a term is `#n`, a secret `#secret:<label>`, an error a fixed code such as `E_NO_TERMS`, and a file whose name holds a hit `#file<n>`.

## Forbidden terms

The repository is public, so it holds no list of forbidden words, not even hashed.
The sanitize gate reads them from private configuration only:

- `leakTerms` and `forbiddenTerms` (arrays of strings) in `~/.olko-sync/targets.json`
  (the folder named by `OLKO_SYNC_HOME`, or the file given with `--terms-file`), plus the
  last path segment of every sync target;
- `FACTORY_LEAK_TERMS`: comma-separated terms in the environment of the factory or shell.

Keep these values out of every tracked file, issue, PR and commit message.
