---
name: olko-commit
description: "Orchestrate the commit workflow: delegate style check, docs staleness, tests, and docker rebuild to sub-skills, then draft a conventional commit message, resolve branch policy, commit, push, and open/merge a PR. Off main, creates a scope-named branch + PR. With --force, commits directly to main. Triggers: 'commit', 'commit this', 'wrap up', 'summarize changes'."
---

# Olko Commit

## What I do
- Track files changed during the session
- Delegate style compliance to `olko-commit-style`
- Delegate AGENTS.md staleness/coverage to `olko-commit-docs`
- Delegate test execution to `olko-test`
- Delegate docker rebuild to `olko-commit-docker`
- Draft a conventional commit message
- Resolve branch policy, commit, push, and open/merge a PR

## When to use me
**Always use this skill when the user says "commit" or any variant** (e.g. "commit this", "let's commit", "time to commit", "wrap up", "summarize changes", "run tests before commit"). Also when the user asks to finish a session and push changes.

## Dependencies (uses)

This skill orchestrates sub-skills. Declare them in `uses` in the project adapter (`.agents/skills/olko-commit/project.md`):

```yaml
uses:
  - olko-commit-style
  - olko-commit-docs
  - olko-test
  - olko-commit-docker
```

Each sub-skill is optional. If a sub-skill is **not** declared in `uses`, skip its phase and continue. If declared, delegate to it and follow its result. See [Explicit Skill Reuse](../../docs/explicit-skill-reuse.md).

## Configuration keys

Read from `.agents/skill-config.md`:

| Key | Default | Meaning |
|-----|---------|---------|
| `packageManager` | — | Package manager (e.g. NuGet, uv). Used for info only. |
| `deploymentTarget` | — | Deployment target. If not "Docker", skip docker rebuild. |

Layer control flags (`conventionDiscovery`, `projectAdapter`, `readArchitectureDocs`, `readTestingDocs`) are documented in the [Layered Skill Adaptation Pattern](../../docs/layered-skill-adaptation.md).

## Resolution order

1. Load `.agents/skill-config.md` (apply marketplace defaults if absent).
2. If `conventionDiscovery == true`, inspect the repo to infer conventions not stated in config. Skip when `false` or absent.
3. Load `AGENTS.md` in scope.
4. If `projectAdapter == true`, load `.agents/skills/olko-commit/project.md`. Skip when `false` or the file is absent.
5. Execute this skill with the accumulated context.

Precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill.

## Flag & argument parsing

Parse `$ARGUMENTS` for flags:

| Token | Effect |
|-------|--------|
| `--force` | Commit directly to `main`/`master` (legacy path). Case-insensitive. |
| `--scope=<foo>` | Override the commit scope. Does NOT enable force mode. |
| `<free-form subject>` | Override the commit subject. Does NOT enable force mode. |

If the user is ambiguous about PR vs. direct push, default to the **PR path** (no force) and confirm before committing.

## Prerequisites
- The current directory must be a git worktree at the repo root
- `git` CLI must be available
- `gh` CLI must be available for PR creation (fallback: print manual compare URL)

## Workflow — follow these steps in order

### Step 1 — Discover changed files (session-only)

**Throughout the entire session**, track every file you create (Write tool) or modify (Edit tool) by maintaining a running list. This is the ONLY source of truth for "what changed."

- NEVER use `git diff --name-only HEAD`, `git status`, or `git diff --cached` to discover changes
- Only process files that YOU wrote or edited during this session
- If the tracked list is empty: tell the user "No files changed in this session" and stop. Do NOT create a branch, open a PR, or push.

### Step 2 — Style compliance (delegate)

If `olko-commit-style` is declared in `uses`, delegate to it: pass the list of changed files. The sub-skill reads style rules from the project's docs, runs the prescribed tools, and reports violations. Follow its result.

If `olko-commit-style` is **not** in `uses`, skip style checking and continue.

### Step 2.5 — Docs staleness (delegate)

If `olko-commit-docs` is declared in `uses`, delegate to it: pass the list of changed files. The sub-skill detects stale `AGENTS.md` sections and creates coverage for new feature slices. Follow its result.

If `olko-commit-docs` is **not** in `uses`, skip docs checking and continue.

### Step 3 — Run tests (delegate)

If `olko-test` is declared in `uses`, delegate to it: pass the list of files changed in this session. The sub-skill maps changed files to test projects, runs tests, and handles failures.

If `olko-test` reports failures and the user chooses "Skip and continue" or "Abort", follow that choice.

If `olko-test` is **not** in `uses`, skip tests and continue.

### Step 4 — Summarize changes

Run `git diff HEAD` to see all changes. Produce a short summary (2–4 bullet points) of what changed and why. Keep it focused on intent, not file-by-file detail.

Then draft a commit message using the conventional-commit style:
- **Subject**: `<type>(<scope>): <imperative summary>` — `<scope>` optional, ≤50 chars, hard cap 72
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove"
- **Body (only if needed)**: skip when subject is self-explanatory; add only for non-obvious *why*, breaking changes, migration notes, linked issues
- Bullets `-` not `*`
- Never: filler words ("this commit does X"), emoji, AI attribution, restating file names when scope says it
- Always include body for: breaking changes, security fixes, data migrations, reverts

### Step 5 — Ask to commit

Present the summary and commit message. If any `AGENTS.md` files were created or modified in Step 2.5, list them with a brief "why." Then ask: "Commit with this message? (y/n)"

If no, let the user edit the message before retrying.

### Step 6 — Commit

Determine the current branch BEFORE staging, then stage and commit accordingly.

#### 6a — Resolve branch policy

```
git rev-parse --abbrev-ref HEAD
```

Capture `<current-branch>`. Then:

- If `--force` was set:
  - Stay on the current branch (must be `main`/`master` if forced).
  - Proceed straight to staging: `git add -A && git commit -m "<message>"`.
- Else if `<current-branch>` is `main` or `master`:
  - **Multiple commits in one session**: if a PR branch was already created earlier in THIS session (track via a session flag `OLKO_COMMIT_PR_BRANCH=<name>`), ask the user before creating another branch:
    > "A PR branch `<existing>` already exists from an earlier commit this session. Branch off `main` (fresh) or off `<existing>` (stacked)?"
    - **Fresh from main**: `git checkout main && git pull --ff-only origin main` before creating the new branch (only if working tree clean).
    - **Stacked**: `git checkout <existing>` and create the new branch from there.
  - Derive a branch name from the commit's `<type>` and `<scope>` (Step 4) plus a UTC timestamp:
    - `<type>/<scope>-<YYYYMMDD-HHMM>` (UTC, compact). Example: `feat/articles-reader-20260627-1415`.
    - Fallback if scope missing: `<type>/commit-<YYYYMMDD-HHMM>`.
    - Fallback if type also missing/unrecognized: `chore/commit-<YYYYMMDD-HHMM>`.
  - Sanitize: lowercase, `[^a-z0-9-]` → `-`, collapse repeats, trim leading/trailing `-`, max 60 chars.
  - **Uniqueness**: check `git ls-remote --heads origin <sanitized-name>` (and local `git rev-parse --verify refs/heads/<name>`). If the name exists, append `-2`, `-3`, … until a free name is found.
  - Create and switch:
    ```
    git checkout -b <branch-name>
    ```
  - Record `OLKO_COMMIT_PR_BRANCH=<branch-name>` for this session.
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

**Note on tests after branch switch**: tests were already run green in Step 3 on the previous HEAD. Switching to a freshly created branch does not change file contents (same working tree, just a new ref label), so tests are NOT re-run. Green-to-green.

#### 6b — Confirm branch action with the user

Before pushing (Step 7), state the resolved branch policy in plain text:
- Forced path: "Force flag set — committing directly to `<current-branch>`."
- PR path: "On `main` — created branch `<branch-name>` for this change; a PR will be opened after push."
- Existing branch path: "On branch `<current-branch>` — committing here."

If the user objects to the chosen path, abort the commit (reset staged files with `git reset` on the new branch only if a branch was just created) and re-resolve.

### Step 6.5 — Docker rebuild (delegate)

If `olko-commit-docker` is declared in `uses` **and** `deploymentTarget` in config is "Docker", delegate to it: pass the list of changed files. The sub-skill reads the service mapping from the project adapter, discovers the compose file, and rebuilds affected services. Follow its result.

If `olko-commit-docker` is **not** in `uses`, or `deploymentTarget` is not "Docker", skip docker rebuild and continue.

### Step 7 — Push & open PR (if applicable)

After committing, re-check the current branch:
```
git rev-parse --abbrev-ref HEAD
```

- **If `--force` was set** and current branch is `main`/`master`:
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
3. Clear `OLKO_COMMIT_PR_BRANCH` session flag.
4. "Merged PR #<num> into `main`. Local main updated. Branch `<branch-name>` deleted (local + remote). HEAD is now on `main`."

## Rules
- Follow the resolution order and precedence: Configuration > Project Adapter > AGENTS.md > Marketplace Skill
- Never hardcode project-specific behavior — put it in config or the project adapter
- Sub-skills are loaded only when declared in `uses` in the project adapter; never auto-load
- Never commit `.env` files or secrets
- Remove temp `.txt`/`.log` files before finishing
- This skill is itself adaptable: it reads `.agents/skill-config.md` and supports a project adapter at `.agents/skills/olko-commit/project.md`
