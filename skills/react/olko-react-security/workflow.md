# Olko React Security Workflow

This skill is read-only. Collect evidence with read and search tools. Run only the configured security command. Do not edit files.

## Step 1 - Resolve scope
If the caller gives changed files, use them. Otherwise run `git status --porcelain` and `git diff --name-only HEAD`.

Keep:
- `.ts` / `.tsx` files
- app shell files: `index.html`, `vite.config.*`, service worker files, and `reactHeadersConfig`
- `package.json`, the lockfile, and package-manager config (`.npmrc`)

Skip `dist/`, `node_modules/`, build output, and `reactGeneratedCodeDirs`.

At plan time, the scope is the planned files and planned elements that the caller gives.

## Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-react-security/project.md` when `projectAdapter` is not `false`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CODING_STYLE.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with a rule, follow the doc, report the conflict once, and do not report the finding. Remove every rule id in `reactSecurityRulesDisabled` from the check.

## Step 3 - Map project roots
For every changed file:
- find the nearest `package.json` beside a `vite.config.ts`/`.js`, unless `reactProjectRoot` overrides it
- find the typed API client, the auth module, and the app shell files from config, adapter, or established repo layout
- find the authentication mode (cookie or bearer header) from the API client or docs; `T3` depends on it

## Step 4 - Check rules with a coverage count
1. Load `references/rules.md`.
2. Select the groups that the scope touches. A group with no matching files is not applicable; list it as such.
3. Set `total` to the number of selected rules that are not disabled. Set `checked` to `0`.
4. Check the scope against one rule. Add `1` to `checked` only after that rule is complete. A check with no finding counts.
5. Before you report, make sure that `checked` equals `total`. If not, list the rule ids that you did not check.

Use TypeScript import and call inspection where practical. Avoid brittle text-only checks.

## Step 5 - Run security command when configured
If `reactSecurityCommand` exists, run it from the project root or documented working directory. If no command exists, do not invent one.

## Step 6 - Report result
If violations exist:

```text
React security violations (<checked>/<total> rules checked):
  1. <rule id> <file>:<line> - <rule broken> (source: <doc>:<section> | olko-react-security:<rule id>)
Checks:
  1. <rule id> <file>:<line> - <finding>; <missing fact> (source: <doc>:<section> | olko-react-security:<rule id>)
```

If a finding needs facts you do not have (for example a header config outside the repository for `H3`), report it as a `check`, not a violation. List it under `Checks:`. Leave out the `Checks:` block when there are none.

If the command fails, include the failing command and the smallest useful error snippet.

If clean:

```text
No React security violations found (<checked>/<total> rules checked).
```
