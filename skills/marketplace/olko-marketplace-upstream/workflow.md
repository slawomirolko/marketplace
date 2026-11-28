# Olko Marketplace Upstream

## Workflow

### Step stage
1. Read the artifact's entry in `<project>/.agents/marketplace.lock.json`. Use `sourceCommit` as the base commit. When `base` is `unknown`, use `nearestCommit` and set `"baseUnknown": true` in `classification.json`. When `baseGuessed` is true, `sourceCommit` is the nearest version, not a recorded one: also set `"baseUnknown": true`.
2. Create a stage root: `node -e "console.log(require('fs').mkdtempSync(require('path').join(require('os').tmpdir(),'olko-upstream-')))"`. The stage directory is `<stage root>/<name>`.
3. Copy the local artifact into the stage directory:
   - skill: every file of `<project>/<location>/` except `project.md` and `*.local.*` (`location` from the entry; `.agents/skills/<name>` when the entry has none);
   - agent: `<project>/<location>` (`.opencode/agents/<file>` when the entry has none), with its `model:` frontmatter line set back to the line of the base commit's file.
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
5. `git -C <wt> add` only the files that changed among `<source>`, `registry.json`, `skills/*/index.json`, `agents/opencode/index.json`, `search-index.json` and `capability-graph.json`.
6. In a new temp directory `<text>` (outside `<wt>`), write the plan's `title` to `<text>/message.txt` and the plan's `body` to `<text>/body.md`.
7. Publish gate. Run `node <marketplace>/scripts/olko-sanitize.mjs --project <project> --staged <wt> --text <text>/message.txt --text <text>/body.md --json`. It scans the whole staged commit (every added line, regenerated registry and index files included), the commit message, the PR title and the PR body. Any exit other than 0 means stop: remove the worktree, publish nothing, report the exit code and the hit numbers (never the matched text). Do not stage, edit or write anything for the PR after this step.
8. `git -C <wt> commit -F <text>/message.txt`.
9. `git -C <wt> push -u origin <plan.branch>`.
10. `open`: make sure the `upstream-candidate` label exists (`gh label list --search upstream-candidate`, else `gh label create upstream-candidate`), then `gh pr create --draft --base <default> --head <plan.branch> --title "<plan.title>" --body-file <text>/body.md --label upstream-candidate`. `append`: `gh pr comment <plan.pr> --body-file <text>/body.md`.
11. Record the PR in the project's lock: `node <marketplace>/scripts/olko-marketplace-lock.mjs record --project <project> --artifact <artifact> --pending-pr <number> --content-hash <content hash>`.
12. `git -C <marketplace> worktree remove <wt>`.
13. Reply with the PR number and URL. The person merges or closes it.

### Step resolve
Used by the marketplace merge workflow. The prompt names the work directory `<work>`. Read and write only inside `<work>`, with the read and edit tools. Run no shell command: everything this step needs is in `<work>`.
1. Read `<work>/plan.json`. Each item has `id`, `kind`, `name`, `state`, `locations`, `base`, `versions` (`localCommit` is the base commit, `upstreamCommit` the newest), `files` (`path`, `result`, `conflictKind`), `dir` (the proposed copy, adapter excluded) and `sides`.
2. The three sides of a file: `<sides>/base/<path>` (the marketplace version the copy came from), `<sides>/local/<path>` (the project copy without its adapter) and `<sides>/upstream/<path>` (the newest marketplace version). A missing file means that side has no such file.
3. Resolve every file with `result: "conflict"` in `<dir>/<path>`:
   - `both-edited`: replace each block from `<<<<<<< local` through `=======` to `>>>>>>> upstream` with one text. Start from the upstream text and put the local intent on top of it. Never drop upstream text in favour of base text. Leave no marker line.
   - `deleted-upstream` (the file holds the local copy) and `deleted-locally` (the file holds the upstream copy): keep the file as it is (you cannot delete files). When the other side's removal should win, say so in `reason`.
   - Record one hunk per resolved block or deleted-file decision: `{"file": "<path>", "reason": "<one line: what you kept from each side>", "sure": <bool>}`. Set `"sure": false` whenever the intent of either side is unclear, the sides contradict each other, or the file was deleted on one side.
4. Classify each item with `state: "modified"`: compare `<sides>/local` with `<sides>/base` per changed file and classify each hunk as in step `stage` 5 (`portable` or `adapter`; when unsure, `adapter`). Describe each hunk in one line: `"<path>: <what it changes>"`. Stage nothing.
5. Write `<dir>/resolution.json` for each item with a conflict or `state: "modified"`: `{"hunks": [...], "upstream": {"portable": [...], "adapter": [...]}}`. Leave out `upstream` for an `outdated` item; use `"hunks": []` without conflicts.
6. Change nothing else: not `plan.json`, not files without a conflict, not the project, not the marketplace checkout. Never write a project value into `reason` or `upstream` texts.
7. Reply with the counts: conflicted files resolved, hunks with `sure: false`, items classified.
