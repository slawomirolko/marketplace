# Olko PR Check

## Workflow — follow these steps in order

### Step 1 — Resolve the PR number

Resolve a PR number using this priority:

1. Session-tracked PR: if a PR was opened during this session by `olko-commit` or another workflow, reuse that PR number. Track it as `OLKO_PR_CHECK_PR_NUMBER`.
2. PR for current branch: if no session PR is tracked, check whether the current branch has an open PR:

   ```powershell
   gh pr view --json number,state,headRefName
   ```

   If the current branch maps to exactly one open PR, use its number.
3. User-supplied PR: if no PR is detected, ask for a PR number or URL. Accept a positive integer or parse `pull/<n>` from a GitHub PR URL.
4. Validate the PR exists and is open:

   ```powershell
   gh pr view <num> --json number,state,title,headRefName,baseRefName,url
   ```

   If it errors or `state` is not `OPEN`, report and stop.

Record `OLKO_PR_CHECK_PR_NUMBER=<num>` and `OLKO_PR_CHECK_PR_HEAD=<headRefName>` for the session.

### Step 2 — Read only the latest CI/CD state

Get the most recent check run state per check name:

```powershell
gh pr checks <num> --json bucket,name,state,workflow,link,completedAt,event
```

Use `bucket` as authoritative state. It is one of `pass`, `fail`, `pending`, `skipping`, or `cancel`.

Deduplicate by `name`: keep only the row with the most recent `completedAt`, or `startedAt` when still pending and available. Ignore earlier runs of the same check. If `completedAt` is null and `bucket` is `pending`, treat it as still running.

Bucket tally:

- All `pass` or `skipping`: CI is green.
- Any `fail` or `cancel`: CI is red; collect check names and links.
- Any `pending` and no `fail`: CI is pending.

Do not walk the Actions timeline through `gh run list`. Fall back to this command only when `gh pr checks` returns an empty list:

```powershell
gh run list --branch <headRefName> --limit 5 --json status,conclusion,name,databaseId,headSha
```

### Step 2a — Wait for the required bot workflow

Use `prCheckRequiredWorkflowPattern` from config, default `opencode`.

If a workflow/check matching the pattern is not present, warn and continue:

```text
No <pattern> workflow detected on PR #<num>. Continuing without it.
```

If it is present but pending/running/not completed, do not proceed to review feedback yet. Ask the user whether to wait:

- Wait and block: poll `gh pr checks <num> --json bucket,name,state,completedAt` every `prCheckWaitSeconds` seconds up to `prCheckWaitPolls` polls. Continue when the matching workflow reaches `pass`, `fail`, `cancel`, or `skipping`.
- Watch live: run `gh pr checks <num> --watch`, then re-read full check state.
- Do not wait: proceed with partial CI state and mark workflow findings as `UNKNOWN`.

After waiting or watching, re-read the full `gh pr checks` output before continuing.

If a failed run's logs must be inspected, fetch only the failed job:

```powershell
gh run view <databaseId> --log-failed
```

Summarize only the relevant failing step. Do not dump full logs.

### Step 3 — Read newest review comments and actionable suggestions

Resolve `{owner}/{repo}` from `git remote get-url origin`. Support SSH (`git@github.com:OWNER/REPO.git`) and HTTPS (`https://github.com/OWNER/REPO`) remotes.

Fetch:

```powershell
gh api repos/{owner}/{repo}/pulls/<num>/comments --paginate
gh api repos/{owner}/{repo}/issues/<num>/comments --paginate
gh api repos/{owner}/{repo}/pulls/<num>/reviews --paginate
```

Fetch review thread resolution state through GraphQL:

```powershell
gh api graphql -f query='
query($owner:String!, $repo:String!, $num:Int!) {
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$num) {
      reviewThreads(first:100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first:100) {
            nodes { databaseId path line body author { login } createdAt }
          }
        }
      }
    }
  }
}' -F owner=<owner> -F repo=<repo> -F num=<num>
```

Filter to the newest actionable subset:

1. Drop review comments whose thread is `isResolved=true` or `isOutdated=true`.
2. Keep only the latest comment per thread.
3. Keep only the latest review per reviewer. Drop empty `COMMENT` reviews with no inline comments attached.
4. Do not drop bot authors. Comments from `github-actions[bot]`, `dependabot[bot]`, `mergify`, or any `*bot` author may be actionable. Keep bot comments that contain a code change request, failure report with a fix, question, or actionable link. Drop only pure noise with no useful action.
5. Classify each remaining item:
   - `actionable`: concrete code change requested, or review state is `REQUEST_CHANGES`.
   - `question`: open question requiring an answer, no code change implied.
   - `nit`: optional style/preference request.
   - `info`: FYI, no action needed. Mention count only; do not include in fix menu.

### Step 4 — Present concise status summary

Output a compact status block in caveman mode:

```text
PR #<num>: <title>
Branch: <head> -> <base>
URL: <url>

CI/CD: <GREEN | RED | PENDING>
  failing:
    - <check name> - <link>
  running: <count> checks

Review findings:
  <N> actionable, <M> questions, <K> nits, <I> info
  1. [actionable] <path>:L<line> - <one-line summary>
  2. [question] <reviewer> - <one-line summary>
```

If there are no open review comments or actionable suggestions, say so directly.

### Step 5 — Ask what to fix

Always ask the user before changing code. Never auto-fix.

Ask: `Fix which findings?`

Offer options:

- `All actionable` when any actionable findings exist.
- One option per actionable finding, including bot and required-workflow findings.
- `All nits` when nits exist.
- `Questions only — answer them` when questions exist.
- `Nothing — just report`.

Selection rules:

- Specific actionable items: fix only those, in selected order.
- `All actionable`: fix every actionable finding.
- `All nits`: fix every nit.
- `Questions only — answer them`: answer questions in PR comments only after user provides or confirms the answer text.
- `Nothing — just report`: stop with no changes.

### Step 6 — Fix selected findings

For each selected actionable finding:

1. Read the full comment already fetched in Step 3.
2. Locate the code using the comment path and nearby context. Do not trust stale absolute line numbers.
3. Apply the fix using normal repo editing rules and all in-scope `AGENTS.md` instructions.
4. Track every file edited in `OLKO_PR_CHECK_EDITED_FILES`.
5. After each fix, report:

   ```text
   fixed: <path>:L<line> - <one-line>
   ```

If a finding is ambiguous, ask the user with concrete options before editing.

If a finding is invalid, do not apply it. Report:

```text
skipped: <path>:L<line> - <reason>
```

Offer to post a PR comment explaining the skip only if the user explicitly chooses that path.

### Step 7 — Verify and hand off to commit

After selected fixes:

1. If `olko-test` is declared in `uses`, delegate verification to it with `OLKO_PR_CHECK_EDITED_FILES`.
2. If `olko-test` is not declared, use the project adapter/configured verification command if present. If no scoped verification is configured, ask before running broad tests.
3. If verification fails, fix the regression or ask the user how to proceed.
4. If `olko-commit` is declared in `uses`, hand off with edited files and PR number so it can commit/push per branch policy.
5. If `olko-commit` is not declared, report edited files and stop before commit/push.
6. Ask before watching CI again:

   ```powershell
   gh pr checks <num> --watch
   ```

Do not auto-merge.
