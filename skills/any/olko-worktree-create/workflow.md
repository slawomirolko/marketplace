# Smart Worktree Create Workflow

## Step 1 - Determine the branch name

Look for a branch name from context, in this priority order:

1. Active plan file: if the user is working on a plan from `.claude/skills/plan-editor/plans/`, `.agents/`, or any `.md` plan path mentioned in this session, derive the branch name from the plan title or filename. Prefer the filename without extension. Use the full plan title only if the filename is generic, such as `plan.md`.
2. User-provided name: if no plan is in context, ask:

   ```text
   No plan in context. What branch name should the worktree use? (e.g. `feature/add-balance-reversal`, `fix/saga-timeout`, `issue/42-empty-results`)
   ```

   Wait for the answer before proceeding.
3. Session topic: if the user has been discussing a specific feature or issue by name or number, propose a branch name and ask for confirmation:

   ```text
   Proposed branch name: `<proposed>`. Use this? (y/n)
   ```

Branch name rules:

- Use kebab-case: `feature/<slug>`, `fix/<slug>`, `issue/<n>-<slug>`, `chore/<slug>`.
- Prefix must be one of: `feature`, `fix`, `issue`, `chore`, `refactor`, `test`, `docs`, unless project adapter overrides `branchPrefixes`.
- No spaces, underscores, non-ASCII characters, or trailing slash.
- Max 60 characters.
- If the user provides a name without a prefix, ask whether to prepend `feature/`.

## Step 2 - Locate the repo root and verify remote

Run:

```powershell
git rev-parse --show-toplevel
git remote get-url origin
git symbolic-ref refs/remotes/origin/HEAD
```

Use `remoteName` from project configuration when set; otherwise use `origin`.

- The repo root is the worktree parent directory anchor.
- Confirm remote exists. If not, stop and ask the user to configure a remote.
- Confirm the default branch. Prefer `origin/HEAD`; if unavailable and no adapter override exists, use `origin/main` and note the fallback.

## Step 3 - Fetch latest from remote

Run:

```powershell
git fetch origin
```

Use the configured remote name if it is not `origin`. If fetch fails because of network or auth, stop and report the error. Do not fall back to stale local `main`.

## Step 4 - Check for branch and worktree collisions

Before creating anything, run:

```powershell
git worktree list
git branch --list "<branch-name>"
git branch --list -r "origin/<branch-name>"
```

- If a worktree for this branch already exists, report its path and stop. Ask whether to reuse it or pick a different name.
- If a local branch with this name already exists but has no worktree, ask whether to use the existing branch or pick a new name.
- If a remote branch `origin/<branch-name>` exists but no local branch exists, ask whether to track it or pick a new name.

## Step 5 - Determine the worktree path

The worktree directory is a sibling of the main repo, named `<repo-basename>-<branch-slug>`.

Example:

```text
Repo root: C:\Users\Inny\Documents\Git\pricePredictor
Branch: feature/add-balance-reversal
Worktree path: C:\Users\Inny\Documents\Git\pricePredictor-add-balance-reversal
```

Compute:

```powershell
$repoRoot = git rev-parse --show-toplevel
$repoBase = Split-Path $repoRoot -Leaf
$slug = $branchName -replace '^(feature|fix|issue|chore|refactor|test|docs)/', '' -replace '/', '-'
$worktreeParent = Split-Path $repoRoot -Parent
$worktreePath = Join-Path $worktreeParent "$repoBase-$slug"
```

Use `worktreeParent` from project configuration when set. If the worktree path already exists and Step 4 did not flag it as an active worktree, stop and ask the user. Do not overwrite.

## Step 6 - Create the worktree off the fetched remote tip

Create the worktree and branch in one command:

```powershell
git worktree add -b "<branch-name>" "<worktreePath>" "origin/main"
```

Replace `origin/main` with the fetched remote default branch when different.

Then set upstream so future `git pull` and rebase/merge use the remote default branch:

```powershell
git -C "<worktreePath>" branch --set-upstream-to=origin/main "<branch-name>"
```

This does not create `origin/<branch-name>`. First push still needs `git push -u origin <branch-name>`; commit skills may handle that.

## Step 7 - Verify and report

Run:

```powershell
git worktree list
git -C "<worktreePath>" rev-parse --abbrev-ref HEAD
git -C "<worktreePath>" log --oneline -1
git rev-parse --short origin/main
```

Confirm:

- New worktree appears in `git worktree list`.
- `HEAD` in the worktree is `<branch-name>`.
- Tip commit matches the fetched remote default branch.

Report:

```text
Worktree created.
  Path:   <worktreePath>
  Branch: <branch-name>
  Base:   origin/main @ <short sha>
```

Then tell the user:

```text
Worktree ready. To work in it, switch your editor/terminal to `<worktreePath>`. When done, use your normal commit workflow; first push should create `origin/<branch-name>`.
```
