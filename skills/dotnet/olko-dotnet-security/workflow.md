# Olko Dotnet Security Workflow

This skill is read-only. Collect evidence with read and search tools. Run only the configured security command. Do not edit files.

## Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep `.cs`, `.csproj`, and `appsettings*.json` files. Also keep tracked `.env*` template files (for example `.env.example`) and CI/CD definition files (`.github/workflows/*.yml`, `azure-pipelines*.yml`, `.gitlab-ci.yml`). Never read untracked `.env` files. Skip files that match `dotnetSecurityGeneratedGlobs` unless docs explicitly require checking them. Leave Dockerfiles and Compose files to `olko-docker-style`.

At plan time, the scope is the planned files and planned elements that the caller gives.

## Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-dotnet-security/project.md` when `projectAdapter` is not `false`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, `CODING_STYLE.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with a rule, follow the doc and report the conflict. Remove every rule id in `dotnetSecurityRulesDisabled` from the check.

## Step 3 - Map projects
For every changed file:
- find the nearest `.csproj`
- mark the project as a web host when it uses `Microsoft.NET.Sdk.Web`, or when its code maps endpoints or controllers
- find the host startup file (`Program.cs` or the documented equivalent) for each web host

`.env*` templates and CI/CD definition files belong to no project. Check them against the `S` rules only.

Apply `S` rules to every project. Apply `W` rules only to web host projects.

## Step 4 - Check rules with a coverage count
1. Load `references/rules.md`.
2. Set `total` to the number of selected rules that are not disabled. Set `checked` to `0`.
3. Check the scope against one rule. Add `1` to `checked` only after that rule is complete. A check with no finding counts.
4. Before you report, make sure that `checked` equals `total`. If not, list the rule ids that you did not check.

## Step 5 - Run security command when configured
If `dotnetSecurityCommand` exists, run it from the documented working directory. If no command exists, do not invent one.

## Step 6 - Report result
If violations exist:

```text
.NET security violations (<checked>/<total> rules checked):
  1. <rule id> <file>:<line> - <rule broken> (source: <doc>:<section> | olko-dotnet-security:<rule id>)
Checks:
  1. <rule id> <file>:<line> - <finding>; <missing fact> (source: <doc>:<section> | olko-dotnet-security:<rule id>)
```

Report a finding that needs facts you do not have (for example instance count for `W6`) under `Checks:`, not as a violation. Leave out the `Checks:` block when there are none.

Never print a secret value. Name the file, line, and key only.

If the command fails, include the failing command and the smallest useful error snippet.

If clean:

```text
No .NET security violations found (<checked>/<total> rules checked).
```
