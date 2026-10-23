# Olko Design Rules Workflow

This skill is read-only. Use only the `read`, `grep`, and `glob` tools to collect evidence. Do not call `edit`, `write`, or `bash`.

## Step 1 - Resolve mode and scope
- Plan time: the scope is the planned files and planned elements in the plan the caller gives.
- Code time: the scope is the changed lines the caller gives. If the caller gives no list, use the changed files and their diff hunks against the base.
- Skip generated files that the calling stack skill skips.

## Step 2 - Load adaptation layers
Read `.agents/skill-config.md`, then `.agents/skills/olko-design-rules/project.md` when `projectAdapter` is not `false`, then the nearest `AGENTS.md`. Apply this precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Remove every rule id in `designRulesDisabled` from the scan. If a project doc conflicts with a rule, follow the doc and report the conflict.

## Step 3 - Select rule files
1. Always load `references/design-rules.md`.
2. At code time, also load `references/code-rules.md`.
3. At code time, when the scope contains `.cs` files, also load `references/dotnet-rules.md`.

## Step 4 - Scan with a coverage count
1. Set `total` to the number of selected rules that are not disabled. Set `checked` to `0`.
2. Scan the scope against one rule. Add `1` to `checked` only after the scan of that rule is complete. A scan with no finding counts.
3. Do not add `1` for a rule that you did not scan.
4. Before you report, make sure that `checked` equals `total`. If they are not equal, report the rule ids that you did not scan. Do not report a complete scan.

## Step 5 - Report findings
Report one line for each finding:

```text
<rule id> <file>:<line> — <problem> — <fix>  (source: olko-design-rules:<rule id>)
```

At plan time, replace `<file>:<line>` with the planned file or the plan section that names the element.

If there are no findings, report:

```text
No olko-design-rules findings (<checked>/<total> rules scanned).
```

The caller decides which findings to fix. This skill does not fix code.
