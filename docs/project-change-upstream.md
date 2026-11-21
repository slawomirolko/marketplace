# Project Change Upstream

A project that installed marketplace skills or agents may change them locally. This
flow finds those changes and turns each one into a draft marketplace PR, but only
after a person says so. A person always merges or closes the PR.

## Parts

| Part | Role |
|------|------|
| `.agents/marketplace.lock.json` (in the project) | Provenance per installed artifact: marketplace version, source commit, content hash without the project adapter (`project.md`, `*.local.*`, the agent `model:` line). Commit it with the project. |
| `scripts/olko-marketplace-lock.mjs` | `init` writes the lock (finds the base version in marketplace history), `status` lists changed artifacts, `record` stores a pending PR or a rejected content hash. |
| `scripts/olko-sanitize.mjs` | Blocking gate: names derived from the project (git remote owner and repository, package names, directory name), configured leak terms, forbidden words. Reports `#n`, never the value. Exit 0 clean, 2 blocked, 1 failed. |
| `scripts/olko-upstream-plan.mjs` | Deterministic PR plan: `open`, `append` (open draft PR on the same base) or `skip` (duplicate, rejected, adapter-only). |
| `olko-marketplace-upstream` (agent and skill) | `stage`, `optimize` and `publish` steps. Draft PRs only; deny rules for merge, ready, reviewers and `gh api`. |
| Factory watch `marketplace-upstream` | Every 10 minutes, per known project with a lock, runs `status`. A change whose hash is the same in two checks starts one `olko-marketplace-upstream` run. |
| Factory viewer | Shows "Waiting for your decision" with `ok` / `no` for runs the viewer process owns. |

## Flow

1. Install skills or agents, then run once in the project's marketplace checkout:
   `node scripts/olko-marketplace-lock.mjs init --project <project> --marketplace <marketplace checkout>`.
2. The factory knows a project when a factory run used it (`input.project`) or when it is listed in `projects.json` in the factory data directory.
3. Edit an installed artifact in the project. After two checks without further change, the viewer asks.
4. `no`: the content hash is recorded as rejected; the same content is never offered again.
5. `ok`: the factory runs the steps in the background with the watch's CLI backend: stage (adapter hunks stay out), optimize, sanitize gate, plan, publish (draft PR, label `upstream-candidate`). The PR is recorded as pending in the lock.
6. Review the draft PR on GitHub. Merge or close it yourself.

## Security

- The marketplace is public. The sanitize gate blocks the run before anything leaves the machine; nothing is pushed when it finds a hit.
- The viewer accepts an answer only with its own request header (`x-factory-action: answer`), from a local origin and an allowed host, and only for runs its own process owns.
- Use a GitHub token limited to the marketplace repository (contents and pull requests). The flow never needs admin or workflow scopes.
