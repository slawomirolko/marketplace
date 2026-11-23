# Olko Marketplace Upstream

## Workflow

### Step stage
1. Read the artifact's entry in `<project>/.agents/marketplace.lock.json`. Use `sourceCommit` as the base commit. When `base` is `unknown`, use `nearestCommit` and set `"baseUnknown": true` in `classification.json`.
2. Create a stage root: `node -e "console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'olko-upstream-')))"`. The stage directory is `<stage root>/<name>`.
3. Copy the local artifact into the stage directory:
   - skill: every file of `<project>/.agents/skills/<name>/` except `project.md` and `*.local.*`;
   - agent: `<project>/.opencode/agents/<file>`, with its `model:` frontmatter line set back to the line of the base commit's file.
4. For each changed file, compare the staged file with `git -C <marketplace> show <base commit>:<source>/<file>` (agent: `<source>`). Split the difference into hunks.
5. Classify each hunk:
   - `adapter`: it holds a project value: a project command, path, service, module, host, stack choice, team or product name, credential, or a local convention. It belongs in `.agents/skills/<name>/project.md`, not upstream.
   - `portable`: it improves the artifact for every project.
6. Revert every `adapter` hunk in the staged copy to the base text. The staged copy then holds only portable hunks.
7. Write `<stage root>/classification.json` (outside the stage directory): `{"hunks": [{"file", "kind", "text"}], "baseUnknown": <bool>}`. `text` is the hunk's added lines.
8. Change nothing in the project or the marketplace checkout.

### Step optimize
1. Load `olko-agents-optimizer`. Apply only its behavior-preserving rules: shorter wording, no duplication, stable prefix, examples over rule lists.
2. Edit only the portable hunks in the stage directory, not unchanged parts of the artifact. The PR must stay focused on the change.
3. Keep frontmatter contracts, commands, paths, thresholds, permissions, and hard rules.
4. When nothing is worth changing, change nothing and say why.

### Step publish
The plan's `action` is `open` or `append` (a `skip` never reaches this step).
1. `git -C <marketplace> fetch origin`. Default branch: `git -C <marketplace> symbolic-ref --short refs/remotes/origin/HEAD` without `origin/` (usually `main`).
2. Create a worktree in a new temp directory `<wt>`:
   - `open`: `git -C <marketplace> worktree add -b <plan.branch> <wt> origin/<default>`;
   - `append`: `git -C <marketplace> fetch origin <plan.branch>`, then `git -C <marketplace> worktree add -B <plan.branch> <wt> origin/<plan.branch>`.
3. Mirror the stage directory into `<wt>/<source>`: replace every file, and delete a file only when the project deleted it.
4. Bump the version by patch from the version in `<wt>` (not from the base): skill in `SKILL.md` frontmatter and its `registry.json` entry; agent in its `agents/opencode/index.json` entry. Run `node scripts/registry.mjs --fix` in `<wt>`, then `node --test scripts/registry.test.mjs`.
5. Run `node <wt>/scripts/olko-sanitize.mjs --path <wt>/<source> --project <project> --json`. Exit 2 means stop: remove the worktree, publish nothing, report the hit numbers.
6. `git -C <wt> add` only the files that changed among `<source>`, `registry.json`, `skills/*/index.json`, `agents/opencode/index.json`, `search-index.json` and `capability-graph.json`. Commit with the plan's `title` as the subject.
7. `git -C <wt> push -u origin <plan.branch>`.
8. `open`: write the plan's `body` to a temp file, make sure the `upstream-candidate` label exists (`gh label list --search upstream-candidate`, else `gh label create upstream-candidate`), then `gh pr create --draft --base <default> --head <plan.branch> --title "<plan.title>" --body-file <file> --label upstream-candidate`. `append`: `gh pr comment <plan.pr> --body-file <file>`.
9. Record the PR in the project's lock: `node <marketplace>/scripts/olko-marketplace-lock.mjs record --project <project> --artifact <artifact> --pending-pr <number> --content-hash <content hash>`.
10. `git -C <marketplace> worktree remove <wt>`.
11. Reply with the PR number and URL. The person merges or closes it.
