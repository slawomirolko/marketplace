# Worktree Merge Workflow

## Step 0 - Load adaptation

Read `.agents/skill-config.md` if present. If project adapters are enabled, read `.agents/skills/olko-worktree-merge/project.md` if present.

Use configured `remoteName` and `defaultBranch` throughout. If `defaultBranch` is absent, resolve it from `git symbolic-ref refs/remotes/<remoteName>/HEAD`; if unavailable, use `main`.

Do not assume project-specific compose services or helper skill names unless the adapter declares them.

## Step 1 - Identify worktree and branch

Run:

```powershell
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git worktree list
```

Record:

- `worktreePath`: current repository toplevel.
- `branchName`: current branch.
- `mainRepoPath`: first `git worktree list` entry, or the entry for the configured default branch.

If current path is the main checkout, do not run the merge flow from there. If `worktreeCreateSkill` is configured and available by explicit project reuse, use it to create the worktree, then continue inside the created worktree. Otherwise ask the user for the worktree path or stop.

If `branchName` is the configured default branch, `main`, or `master`, stop: current branch is not a feature worktree branch.

## Step 2 - Ensure work is committed and pushed

Run:

```powershell
git status --porcelain
```

If there are uncommitted changes:

1. If `commitSkill` is configured and available by explicit project reuse, use it to run the full commit workflow.
2. Otherwise stop and ask the user to commit or provide permission for a minimal commit workflow.

If the tree is clean, check upstream:

```powershell
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

If no upstream exists, run:

```powershell
git push -u <remoteName> <branchName>
```

If upstream exists, compare local and remote with `git status -sb`. If local is ahead, run `git push`. If local is behind, stop and ask whether to pull/rebase or abort.

## Step 3 - Check conflicts against target branch

Fetch the target branch:

```powershell
git fetch <remoteName> <defaultBranch>
```

Check for conflicts:

```powershell
git merge-tree $(git merge-base HEAD <remoteName>/<defaultBranch>) HEAD <remoteName>/<defaultBranch>
```

If conflict markers appear, report the conflicting files and ask whether to rebase onto `<remoteName>/<defaultBranch>`. If yes, run the rebase, resolve conflicts with the user, then push with `--force-with-lease`. If no, stop.

## Step 4 - Create or reuse the GitHub PR

Check for an existing PR:

```powershell
gh pr view --json number,url,state
```

If no PR exists, derive metadata:

```powershell
git log --oneline <remoteName>/<defaultBranch>..HEAD
git diff --stat <remoteName>/<defaultBranch>..HEAD
```

Use the single commit subject as title when there is one commit. For multiple commits, propose a Conventional Commits title no longer than 72 characters and ask the user to confirm or edit it.

Create the PR:

```powershell
gh pr create --base <defaultBranch> --head <branchName> --title "<title>" --body "<body>"
```

Record `prNumber` and `prUrl`.

## Step 5 - Wait for CI checks

Poll status checks until all are completed:

```powershell
gh pr view <prNumber> --json statusCheckRollup --jq '[.statusCheckRollup[] | {name: .name, status: .status, conclusion: .conclusion}]'
```

If any check is `IN_PROGRESS`, `PENDING`, or equivalent, wait 30 to 60 seconds and poll again.

If any completed check concludes `FAILURE`, `CANCELLED`, or `TIMED_OUT`, report the failing checks and ask:

```text
CI check `<name>` failed. Fix failure, merge anyway, or abort? (fix / merge anyway / abort)
```

If the user chooses fix, stop. If the user chooses merge anyway, continue to review inspection. If the user aborts, stop.

## Step 6 - Inspect reviews and comments

Fetch review summaries and issue comments:

```powershell
gh pr view <prNumber> --json reviews,comments --jq '{reviews: [.reviews[] | {author: .author.login, state: .state, body: .body}], comments: [.comments[] | {author: .author.login, body: .body}]}'
```

Fetch inline comments:

```powershell
gh api repos/{owner}/{repo}/pulls/<prNumber>/comments --jq '[.[] | {author: .user.login, path: .path, line: .line, body: .body}]'
```

Fetch full bot issue comments:

```powershell
gh api repos/{owner}/{repo}/issues/<prNumber>/comments --jq '.[] | select(.user.login == "github-actions[bot]" or .user.login == "github-actions") | .body'
```

Parse bot comments for headings such as `Actionable Suggestions`, `Potential Risks`, `Nitpicks`, and `Summary`. Extract concrete file paths, line references, and requested changes.

If there are no reviews, no issue comments, no inline comments, and no actionable bot summaries, continue.

If feedback exists, group it as inline review comments, review summaries, issue comments, and bot review summaries. Ask:

```text
Code review feedback received:
<summary>

How to proceed?
1. Address all feedback
2. Address specific comments
3. Merge as-is
4. Abort
```

For option 1 or 2, apply requested code changes in the worktree. Run configured `styleCommands` for affected stacks. If `testSkill` is configured and available by explicit project reuse, use it for affected tests. Commit and push fixes, then return to Step 5.

For option 3, continue. For option 4, stop.

## Step 7 - Tear down worktree compose projects

Run:

```powershell
docker compose ls --all --format json
```

Find compose projects whose `ConfigFiles` or working directory is inside `worktreePath`. If no matching project exists, report that no worktree-side compose project was detected.

For each matching project, run from `worktreePath`:

```powershell
docker compose -p <worktreeProjectName> down --volumes --remove-orphans
```

Verify no containers, networks, or volumes remain:

```powershell
docker ps -a --filter "label=com.docker.compose.project=<worktreeProjectName>" --format "{{.Names}}"
docker network ls --filter "label=com.docker.compose.project=<worktreeProjectName>" --format "{{.Name}}"
docker volume ls --filter "label=com.docker.compose.project=<worktreeProjectName>" --format "{{.Name}}"
```

If leftovers remain, report them and ask before force-removing explicit resource IDs.

## Step 8 - Merge the PR

Ask:

```text
PR `<prUrl>` is ready. Merge it yourself on GitHub, or should I merge it with `gh`?
1. I'll merge it myself on GitHub
2. Merge with squash
3. Merge with merge commit
4. Merge with rebase
```

If the user chooses GitHub manual merge, wait for confirmation and verify:

```powershell
gh pr view <prNumber> --json state,mergedAt
```

For `gh` merge options, ask whether to delete the remote branch too, then run the selected command:

```powershell
gh pr merge <prNumber> --squash
gh pr merge <prNumber> --merge
gh pr merge <prNumber> --rebase
```

Add `--delete-branch` only when the user agrees.

## Step 9 - Pull latest target branch in main checkout

Record previous and new main SHAs:

```powershell
git -C <mainRepoPath> rev-parse HEAD
git -C <mainRepoPath> fetch <remoteName>
git -C <mainRepoPath> pull <remoteName> <defaultBranch>
git -C <mainRepoPath> rev-parse HEAD
git -C <mainRepoPath> log --oneline -1
```

## Step 10 - Rebuild affected main compose services

Skip this step when `mainComposeProject` is not configured.

Compute changed files from the merged range:

```powershell
git -C <mainRepoPath> log --oneline --name-only <previousMainSha>..<newMainSha>
```

Map changed files to services using configured `composeServiceMap`. If the configured compose file changed and `allServicesOnComposeChange` is true, rebuild all services declared in the main compose file.

Confirm the compose project state:

```powershell
docker compose -p <mainComposeProject> ps
```

If the project is stopped and the user wants it running, start it:

```powershell
docker compose -p <mainComposeProject> up -d
```

Rebuild affected services from `mainRepoPath`:

```powershell
docker compose -p <mainComposeProject> build <service>
docker compose -p <mainComposeProject> up -d <service>
```

For all services:

```powershell
docker compose -p <mainComposeProject> build
docker compose -p <mainComposeProject> up -d
```

Verify:

```powershell
docker compose -p <mainComposeProject> ps
docker compose -p <mainComposeProject> logs --tail=30 <service>
```

If a rebuilt service fails to start, report logs and ask whether to investigate or abort cleanup. Do not fix runtime bugs in this skill.

## Step 11 - Clean up worktree and local branch

After the PR is confirmed merged and the main checkout is updated, remove the worktree from the main checkout:

```powershell
git -C <mainRepoPath> worktree remove <worktreePath>
```

Safe-delete the local branch:

```powershell
git -C <mainRepoPath> branch -d <branchName>
```

If safe delete refuses because the branch is not merged, ask before using `-D`.

If the remote branch still exists and the user approved deletion, delete it:

```powershell
git -C <mainRepoPath> ls-remote --heads <remoteName> <branchName>
git -C <mainRepoPath> push <remoteName> --delete <branchName>
```

## Step 12 - Report completion

Report PR URL, target branch tip, worktree removal, local branch deletion, remote branch state, worktree compose teardown, and main compose rebuild status.
