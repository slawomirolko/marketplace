---
name: olko-commit
description: Verify coding style compliance, run affected tests, summarize changes, and commit + push. Off main, creates a scope-named branch + PR. With --force, commits directly to main.
---

## What I do
- Check changed files for compliance with project coding styles and architecture rules
- Determine which test projects are affected by the changes and run only those tests
- Handle test failures by presenting the reason and asking the user how to proceed
- Summarize changes and draft a commit message
- Commit and push to remote
- **Branch policy:**
  - Currently on `main`/`master` AND **no** `--force` flag → create a new branch named `<type>/<scope>-<short-hash-or-date>` from the current commit, commit there, push, and open a PR against `main`
  - Currently on a non-main branch → commit and push to that branch (PR optional, see Step 7)
  - `--force` flag explicitly passed → commit and push directly to the current `main`/`master` (legacy behavior)

## When to use me
**Always use this skill when the user says "commit" or any variant** (e.g. "commit this", "let's commit", "time to commit", "wrap up", "summarize changes", "run tests before commit"). Also use it when the user asks to finish a session and push changes.

### Flag detection
- Inspect the user's message for `--force` (case-insensitive). If present, set `SMART_COMMIT_FORCE=true` for this run and follow the legacy direct-to-main path.
- Any other token (e.g. `--scope=foo`, a free-form subject override) is recorded but does **not** enable force mode.
- If the user is ambiguous about whether they want a PR or a direct push, default to the **PR path** (no force) and confirm before committing.

### Empty session guard
- If the session-tracked change list (Step 1) is empty: tell the user "No files changed in this session" and stop. Do NOT create a branch, do NOT open a PR, do NOT push.

## Prerequisites
- The current directory must be a git worktree at the repo root (where `.csproj` files and `agents/` directory live)
- `dotnet` CLI must be available for .NET tests and style checks
- `uv` must be available for Python style checks and tests
- `Shouldly` is used for .NET test assertions; NSubstitute for mocks

## Workflow — follow these steps in order

### Step 1 — Discover changed files (session-only)
**Throughout the entire session**, track every file you create (Write tool) or modify (Edit tool) by maintaining a running list. This is the ONLY source of truth for "what changed." At the end of the session, use that tracked list — NOT `git diff` or `git status` — to determine which files to process.

- ❌ NEVER use `git diff --name-only HEAD`, `git status`, or `git diff --cached` to discover changes
- ✅ Only process files that YOU wrote or edited during this session
- If the tracked list is empty, tell the user "No files changed in this session" and stop

### Step 2 — Coding style compliance check
For each changed file, check it against the project's coding rules:

**For .NET files** (`.cs`, `.csproj`):
- Read and apply rules from `dotnet/AGENTS.md` and `dotnet/CODING_STYLE.md`
- Key checks:
  - No primary constructors for DI — explicit constructors required
  - No method names containing `And`
  - No `System.Text.Json.Serialization` attributes in Application layer models
  - No hardcoded connection strings
  - Settings types must be `sealed record` with explicit `{ get; init; }` properties
  - No default values in `settings.cs` records
  - Models use static factory methods returning `ErrorOr<T>`, not public setters/constructors
  - IDs must be `Guid` via `Guid.CreateVersion7()`
  - One public type per file
  - Dependency direction: API → Application, API → Infrastructure; never Application → API or Application → Infrastructure
  - Repositories operate on single tables; cross-table logic in Unit of Work or application service
  - If running as part of a style fix step, run `dotnet format` on the changed projects

**For Python files** (`.py` under `agents/`):
- Read and apply rules from `agents/AGENTS.md` and `agents/CODING_STYLE.md`
- Key checks:
  - Use `pathlib.Path` not `os.path`
  - Explicit type hints on public functions
  - Use `uv run --directory agents style_python` for Ruff formatting
  - No hand-edited gRPC stubs
  - Functions must have single responsibility
  - Don't mutate shared input dicts unless documented

**If any violation is found**, present it to the user clearly with the file path, line, rule broken, and ask: "Should I fix this before continuing, or skip?"

### Step 2.5 — Detect AGENTS.md staleness (existing docs) & cover new slices

Follow `ai-optimization.md`: only flag/add non-inferable content. Skip architectural overviews, flow diagrams, property tables, dependency lists, file indexes, and test locations.

This step has two phases. Run **Phase A first**, then **Phase B**.

#### Phase A — Existing AGENTS.md staleness detection

For each changed file, walk up its directory tree until you find the nearest `AGENTS.md`. If one exists, read it and check whether the code change invalidates any of its documented claims.

**How to detect staleness — only check these categories:**
- **Non-inferable naming quirks** — interface name differs from entity, proto field mappings, method renames
- **Custom tooling commands** — build, migration, format, lint invocation
- **Optional service wiring** — nullable DI dependencies
- **Configuration** — documented defaults vs. actual defaults

**Skip**: Behavior flows, architectural overviews, dependency lists, interface signatures, test file tables, location/folder structure — all inferable from code.

**Do NOT flag stale for trivial refactors** (renaming a local variable, extracting a private helper that doesn't change observable behavior, formatting-only changes). Only flag when configuration, naming quirks, or tooling commands materially differ from what the AGENTS.md states.

**If staleness is detected**, present findings to the user clearly — AGENTS.md path, stale section, what the document says vs. what the code now does. Then ask:

> "Behavior documented in `X/AGENTS.md` (section: Y) is stale due to changes in `Z.cs`.
> 
> - **Update AGENTS.md** to match the new code?
> - **Revert the code change** to keep documented behavior?

If the user chooses **Update**, rewrite the affected AGENTS.md sections to match the new code. Keep the same section structure and formatting style as the existing AGENTS.md.

If the user chooses **Revert**, undo the code change in that file and re-check.

If no staleness is found: "No existing AGENTS.md documented behavior affected by these changes."

#### Phase B — AGENTS.md coverage for new slices

For each changed file, identify if it belongs to a **new** feature slice (a directory 2+ levels deep from a `.csproj` project root containing implementation code, e.g. `PricePredictor.Master/Workflows/Cleaner/`). A slice is "new" when no `AGENTS.md` exists in that directory.

For each new slice found across all changed files:

1. **Check sibling directories in the same parent** — if other slices under the same parent already have `AGENTS.md` files, use one as a template for the new slice. Otherwise use `PricePredictor.Master/Workflows/Cleaner/AGENTS.md` as the reference.
2. **Create the slice-level `AGENTS.md`** — follow `ai-optimization.md`. Include only:
   - Non-inferable naming quirks (interface/entity mismatches, proto field mappings)
   - Cross-boundary validation rules (logic spanning multiple files)
   - Custom tooling commands (build, migration, format invocation)
   - Optional/nullable service wiring
   - Configuration keys and their defaults
   Do NOT include: Purpose, Behavior/Flow, Location, Dependencies, Interface, Testing sections — all inferable from code.
3. **Check for a project-level `AGENTS.md`** — e.g. `PricePredictor.FinanceTrackerApp/AGENTS.md`. If it exists, update it only if non-inferable quirks need documenting. Do not create project-level AGENTS.md files for structure/folder overviews.
4. **If the new slice added contracts** — check `PricePredictor.Contracts/AGENTS.md` and update its listing only for non-inferable mappings.
5. **Present all proposed AGENTS.md changes** to the user and ask: "Create/update these AGENTS.md files? (y/n)"

### Step 3 — Find affected test projects & Step 4 — Run tests

Both steps are handled by the `smart-test` skill. Load it and provide the list of files changed in this session. The `smart-test` skill maps changed files to test projects, runs unit tests, stops conflicting services, runs integration tests, restarts services, and handles failures.

Do NOT run `dotnet test` or `uv run pytest` directly in this skill. Always delegate to `smart-test`.

If `smart-test` reports failures and user chooses "Skip and continue" or "Abort", follow that choice.

### Step 4 — Summarize changes
Run `git diff HEAD` to see all changes. Produce a short summary (2–4 bullet points) of what changed and why. Keep it focused on intent, not file-by-file detail.

Then draft a commit message using the **caveman-commit** style:
- **Subject**: `<type>(<scope>): <imperative summary>` — `<scope>` optional, ≤50 chars, hard cap 72
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove"
- **Body (only if needed)**: skip when subject is self-explanatory; add only for non-obvious *why*, breaking changes, migration notes, linked issues
- Bullets `-` not `*`
- Never: filler words ("this commit does X"), emoji, AI attribution, restating file names when scope says it
- Always include body for: breaking changes, security fixes, data migrations, reverts

### Step 5 — Ask to commit
Present the summary and commit message. If any AGENTS.md files were created or modified in Step 2.5, list them alongside a brief "why" (e.g. "New slice X added — documenting non-inferable tooling commands and cross-boundary validation"). Then ask: "Commit with this message? (y/n)"
If no, let the user edit the message before retrying.

### Step 6 — Commit

Determine the current branch BEFORE staging, then stage and commit accordingly.

#### 6a — Resolve branch policy

```
git rev-parse --abbrev-ref HEAD
```

Capture `<current-branch>`. Then:

- If `SMART_COMMIT_FORCE=true` (see **Flag detection** above):
  - Stay on the current branch (must be `main`/`master` if forced).
  - Proceed straight to staging: `git add -A && git commit -m "<message>"`.
- Else if `<current-branch>` is `main` or `master`:
  - **Multiple smart-commits in one session**: if a PR branch was already created earlier in THIS session (track via a session flag `SMART_COMMIT_PR_BRANCH=<name>`), ask the user before creating another branch:
    > "A PR branch `<existing>` already exists from an earlier commit this session. Branch off `main` (fresh) or off `<existing>` (stacked)?"
    - **Fresh from main**: `git checkout main && git pull --ff-only origin main` before creating the new branch (only if working tree clean).
    - **Stacked**: `git checkout <existing>` and create the new branch from there.
  - Derive a branch name from the commit's `<type>` and `<scope>` (Step 4) plus a UTC timestamp:
    - `<type>/<scope>-<YYYYMMDD-HHMM>` (UTC, compact). Example: `feat/articles-reader-20260627-1415`.
    - Fallback if scope missing: `<type>/smart-<YYYYMMDD-HHMM>`.
    - Fallback if type also missing/unrecognized: `chore/smart-<YYYYMMDD-HHMM>`.
  - Sanitize: lowercase, `[^a-z0-9-]` → `-`, collapse repeats, trim leading/trailing `-`, max 60 chars.
  - **Uniqueness**: check `git ls-remote --heads origin <sanitized-name>` (and local `git rev-parse --verify refs/heads/<name>`). If the name exists, append `-2`, `-3`, … until a free name is found.
  - Create and switch:
    ```
    git checkout -b <branch-name>
    ```
  - Record `SMART_COMMIT_PR_BRANCH=<branch-name>` for this session.
  - Stage and commit on the new branch:
    ```
    git add -A && git commit -m "<message>"
    ```
- Else (already on a non-main branch):
  - Stage and commit on the current branch:
    ```
    git add -A && git commit -m "<message>"
    ```

If `git commit` fails (e.g. hooks reject, nothing staged), report the failure and do not retry blindly. Fix the underlying issue and run Step 6 again with a fresh commit.

**Note on tests after branch switch**: tests were already run green in Step 3/4 on the previous HEAD. Switching to a freshly created branch does not change file contents (same working tree, just a new ref label), so tests are NOT re-run. Green-to-green.

#### 6b — Confirm branch action with the user

Before pushing (Step 7), state the resolved branch policy in plain text:
- Forced path: "Force flag set — committing directly to `<current-branch>`."
- PR path: "On `main` — created branch `<branch-name>` for this change; a PR will be opened after push."
- Existing branch path: "On branch `<current-branch>` — committing here."

If the user objects to the chosen path, abort the commit (reset staged files with `git reset` on the new branch only if a branch was just created) and re-resolve.

### Step 6.5 — Rebuild docker compose services
If any changed files map to a docker-compose-hosted service, rebuild and restart that service to reflect the committed changes.

**Mapping: changed project → compose service name:**

| Changed path | Compose service |
|---|---|
| `PricePredictor.Api/**` | `pricepredictor.api` |
| `PricePredictor.Master/**` | `pricepredictor.master` |
| `PricePredictor.FinanceTrackerApp/**` | `pricepredictor.finance_tracker` |
| `agents/**` (Python) | `pricepredictor.army` |
| `PricePredictor.Contracts/**` | All app services (shared contracts) |
| `PricePredictor.Application/**` | All app services (shared logic) |
| `PricePredictor.Infrastructure/**` | All app services (shared infra) |
| `PricePredictor.Persistence/**` | All app services (shared data) |
| `PricePredictor.ArticlesReaderApp/**` | — (Rider-only, no compose service) |
| `PricePredictor.ArticlesFinderApp/**` | — (Rider-only, no compose service) |

**Services to NEVER rebuild** (data loss risk or infrastructure):
- `postgres`, `rabbitmq`, `ollama`, `otel-collector`, `tempo`, `loki`, `grafana`

**Workflow:**
1. Determine the set of compose service names affected by changed files using the table above
2. Deduplicate the list
3. If the list is empty, skip: "No docker compose services affected by these changes"
4. Present the list to the user: "Rebuild compose services: `pricepredictor.api`, `pricepredictor.master` — proceed? (y/n)"
5. If yes, for each service:
   ```bash
   docker compose build <service> && docker compose up -d <service>
   ```
6. If any build or restart fails, report the failure and ask whether to continue or abort

### Step 7 — Push & open PR (if applicable)

After committing, re-check the current branch:
```
git rev-parse --abbrev-ref HEAD
```

- **If `SMART_COMMIT_FORCE=true`** and current branch is `main`/`master`:
  - Push directly: `git push origin <branch>`.
  - "Committed and pushed directly to `<branch>` (force mode)."
  - Done.
- **If current branch is `main`/`master`** (and force was NOT set — should not happen if Step 6 was followed, but guard anyway):
  - "Committed locally to `main`. Refusing to push to `main` without `--force`. Re-run with `--force` to push directly, or move the commit to a feature branch."
  - Done.
- **If current branch is a newly created PR branch** (created in Step 6a):
  - Push with upstream:
    ```
    git push -u origin <branch>
    ```
  - **Open a Pull Request against `main`** using `gh`:
    ```
    gh pr create --base main --head <branch> --title "<conventional subject>" --body "<short body, optional>"
    ```
    - Title: the conventional commit subject from Step 4.
    - Body: the commit body if one was drafted; otherwise a 1–2 line summary of what changed. Keep it terse.
    - Return the PR URL to the user.
    - "Opened PR #<num>: <url>"
  - Proceed to **Step 7.5 — Post-PR decision**.
- **If current branch is any other non-main branch** (existed before Step 6):
  - Run `git push`. If the branch has no upstream, run `git push -u origin <branch>`.
  - Optionally offer to open a PR: "Open a PR for `<branch>` against `main`? (y/n)". If yes, run the same `gh pr create` command as above and proceed to **Step 7.5**.

**`gh` fallback**: if `gh pr create` fails with "command not found" (exit 127) or auth error, do NOT abort. Print the manual compare URL:
```
https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1
```
Extract `<owner>/<repo>` from `git remote get-url origin` (parse SSH or HTTPS form). Ask the user to open the PR manually, then skip Step 7.5 (no merge automation possible without `gh`).

### Step 7.5 — Post-PR decision (squash merge flow)

Only runs when a PR was successfully opened via `gh`. Ask the user:

> "PR #<num> opened. What next?
> 1. **Squash merge now** (don't wait for CI)
> 2. **Wait for CI/CD** then squash merge
> 3. **Leave PR open** — stop here"

#### Option 1 — Squash merge now
```
gh pr merge <num> --squash --delete-branch
```
Then proceed to **Step 7.6 — Post-merge cleanup**.

#### Option 2 — Wait for CI/CD then squash merge
Run:
```
gh pr checks <num> --watch
```
This blocks until all CI/CD checks finish. When done:
- **Green (success)**: proceed to `gh pr merge <num> --squash --delete-branch` → **Step 7.6**.
- **Red (failed)**: do NOT merge. Report which checks failed:
  ```
  gh pr checks <num>
  ```
  Print the failing check names and URLs. Tell the user: "CI/CD failed — PR left open. Fix the failures and re-run, or merge manually." Stop (leave HEAD on the PR branch).

#### Option 3 — Leave PR open
- "PR left open. Staying on branch `<branch>`."
- Done. Do not switch branches, do not merge, do not delete anything.

### Step 7.6 — Post-merge cleanup

After a successful squash merge (Options 1 or 2):
1. Switch to main and pull the merged state:
   ```
   git checkout main
   git pull --ff-only origin main
   ```
2. Delete the local branch (the `--delete-branch` flag on `gh pr merge` already deleted the remote branch):
   ```
   git branch -D <branch-name>
   ```
3. Clear `SMART_COMMIT_PR_BRANCH` session flag.
4. "Merged PR #<num> into `main`. Local main updated. Branch `<branch-name>` deleted (local + remote). HEAD is now on `main`."

**Worktree note**: this skill does NOT manage git worktrees. Creating/removing worktrees is handled by `smart-worktree-create` / `smart-worktree-merge`. If the user is working inside a non-root worktree, the branch/PR/merge flow above still works — only the local branch deletion happens inside that worktree's context.

## Important project rules to remember during this workflow
- .NET test assertions use **Shouldly** (e.g., `result.ShouldBe(expected)`)
- .NET unit tests mock with **NSubstitute**
- Integration tests use real `WebApplicationFactory` wiring
- Never add skip logic to tests
- Never create markdown files unless explicitly requested
- Never commit `.env` files or secrets
- Remove temp `.txt`/`.log` files before finishing
- Prefer feature slices and sub-slices in folder structure
