---
name: olko-agents-optimizer
description: "Optimize agent context files (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .windsurfrules, codex.md, etc.) using Addy Osmani's agents-md methodology. Triggers: 'optimize CLAUDE.md', 'streamline CLAUDE.md', 'agents-md', 'discoverability filter', 'add gotchas', 'optimize AGENTS.md', 'optimize context file', 'optimize .windsurfrules', 'optimize copilot-instructions', 'optimize codex.md'."
---

# Agents-MD Optimizer

Optimize agent context files (AGENTS.md, CLAUDE.md, etc.) by applying the discoverability filter: remove information agents can discover from code, keep only non-discoverable operational knowledge (gotchas, landmines, non-standard conventions), and mine source code for undocumented gotchas.

Research shows redundant context (directory trees, data flow diagrams) degrades agent performance by 15-20%, while human-authored operational knowledge reduces runtime by ~28%.

## Flag Parsing

Parse `$ARGUMENTS` for optional flags:

| Flag | Effect |
|------|--------|
| `--dry-run` | Analyze and show diff without modifying the file |
| `--report-only` | Output statistics and classification table only |
| `--path <path>` | Target file path (see auto-detection below) |
| `--help` | Display usage and exit |

If `--help` is present, display available flags and a brief description of the workflow, then stop.

## Workflow

### Phase 0: Setup

**Language Detection**: Detect the user's language from conversation history. Present all analysis results and messages in the user's language.

**Target File Resolution** (when `--path` is not specified):

Search for the first existing file in this priority order:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `.github/copilot-instructions.md`
4. `.windsurfrules`
5. `codex.md`

If none found, ask the user to specify the target file path.

**Small File Check**: If the target file has fewer than 20 lines, inform the user that the file is already minimal and optimization is unnecessary. Stop unless the user explicitly requests to proceed.

### Step 1: Baseline Analysis

Read the target file. Collect line statistics.

**Script Location**: Find the line-count script by searching for it:

```powershell
# Search in common skill installation paths
$SCRIPT_PATH = (Get-ChildItem -Path "$env:USERPROFILE/.claude/skills","$env:USERPROFILE/.codex/skills","$env:USERPROFILE/skills" -Filter "line-count.mjs" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if (-not $SCRIPT_PATH) {
  # Fallback: search in current directory
  $SCRIPT_PATH = (Get-ChildItem -Path . -Filter "line-count.mjs" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
```

Run the script if found:

```powershell
node "$SCRIPT_PATH" '<TARGET_PATH>'
```

**Fallback** (if script not found): Count lines manually using PowerShell:

```powershell
(Get-Content -LiteralPath '<TARGET_PATH>').Count
((Get-Content -LiteralPath '<TARGET_PATH>' | Select-String -Pattern '^##').Count)
```

Then classify each `##`/`###` section into one of three categories:

| Category | Meaning | Action |
|----------|---------|--------|
| `discoverable` | Agent can find this via Glob/Grep/Read within 10 seconds | Remove |
| `operational` | Non-discoverable, operationally significant | Keep |
| `verbose` | Operational knowledge but overly detailed | Compress |

To classify, **actually read the source files** referenced in each section. Verify whether the information is truly discoverable. Detailed classification criteria are in [`references/methodology.md`](references/methodology.md).

Present results as a table:

```
## Baseline Analysis — <filename>

Total: XXX lines (YY sections)

| Section | Lines | Category | Rationale |
|---------|-------|----------|-----------|
| Directory Structure | 63 | discoverable | Glob **/* reveals this instantly |
| Design Rules | 8 | operational | Non-standard constraints, not in code |
| Config & State | 24 | verbose | Operational but compressible to ~6 lines |

Removal candidates: XX lines (XX%)
```

If `--report-only`, stop here.

### Step 2: Gotcha Mining

Scan project source code to find non-obvious operational knowledge missing from the target file. Use the systematic checklist in [`references/gotcha-mining.md`](references/gotcha-mining.md).

Key Grep patterns to run on the codebase (via the Grep tool):

```
MUST|WARNING|HACK|TODO|FIXME          → developer-flagged gotchas
catch.*exit\(0\)|process\.exit        → error exit policies
setTimeout|setInterval|deadline       → timing constraints
=== null|== null|delete result        → implicit semantics
process\.platform|/proc/version       → platform detection quirks
cooldown|throttle|lastNotified        → rate limiting scope
```

Present findings:

```
## Discovered Gotchas

| # | Category | Description | Source | Already documented? |
|---|----------|-------------|--------|---------------------|
| 1 | Timing | 5s→4s→2s budget | _common.mjs:21,52 | No → Add |
| 2 | Implicit | null = key deletion | config.mjs:157 | No → Add |
```

### Step 2b: Code Assessment

Scan project source code for optimization opportunities, extension opportunities, and error prediction. Use the checklist in [`references/code-assessment.md`](references/code-assessment.md).

Key Grep patterns to run on the codebase (via the Grep tool):

```
\.Result|\.Wait\(\)|\.GetAwaiter\(\)\.GetResult\(\)   → sync over async (blocking)
async\s+void                                          → async void (exception swallowing)
foreach.*DbContext|foreach.*\.Query                    → N+1 query suspicion
const\s+\d+|static\s+readonly\s+\w+\s+=\s+"[^"]*"     → hardcoded values (config candidates)
catch\s*\(\s*\)|catch\s*\(\s*Exception\s*\)            → broad catch (swallowed errors)
timeout|retry|Polly                                    → timeout/retry exhaustion
\.SendAsync|\.Publish\(|\.Produce\(                    → external calls (idempotency check)
```

For each finding, decide:
- **Document as gotcha** — non-obvious operational constraint or error contract that changes agent behavior
- **Fix in code** — obvious code improvement (N+1, missing cache, sync-over-async, broad catch)

Only "Document as gotcha" findings feed into Step 3 alongside gotcha mining results. Code fixes are reported to the user but not applied by this skill.

Present findings:

```
## Code Assessment

### Optimization Opportunities
| # | Description | Source | Document? |
|---|-------------|--------|-----------|
| 1 | foreach loop queries DbContext per item | FooService.cs:42 | No → Fix |
| 2 | batch size ≤500 due to pg param limit | BarRepo.cs:18 | Yes → Add gotcha |

### Extension Opportunities
| # | Description | Source | Document? |
|---|-------------|--------|-----------|
| 1 | new commodities need enum + proto registration | CommoditySmartEnum.cs:1 | Yes → Add gotcha |

### Predicted Errors
| # | Scenario | Current handling | Blast radius | Document? |
|---|----------|-----------------|--------------|-----------|
| 1 | gRPC timeout mid-saga | Saga persists in Pending | Stuck rows | Yes → Add gotcha |
```

### Step 3: Generate Optimized File

Use AskUserQuestion to confirm before modifying:

> Based on the analysis:
> - **Remove**: X lines of discoverable content (Y sections)
> - **Compress**: X lines → ~Y lines (Z sections)
> - **Add**: X new gotcha items (from Step 2 mining + Step 2b code assessment)
>
> Options:
> 1. **Apply all** — Remove discoverable, compress verbose, add gotchas
> 2. **Item by item** — Review each change individually
> 3. **Cancel** — No changes

Apply the selected changes using Edit (prefer surgical edits over full rewrite).

If `--dry-run`, show the diff but do not write.

**Structure for optimized file** (recommended section order):
1. Project description (1-2 lines)
2. Development Commands
3. Design Rules (non-negotiable constraints)
4. Gotchas & Landmines (categorized subsections)
5. Conventions (non-standard project patterns)
6. Version/Release Management
7. Testing

Detailed anti-pattern examples with before/after are in [`references/anti-patterns.md`](references/anti-patterns.md).

### Step 4: Verification

Re-run statistics (using the same script or fallback method from Step 1) and present before/after comparison:

```
## Optimization Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total lines | 182 | 90 | -51% |
| Discoverable lines | 80 | 0 | Removed |
| Operational lines | 60 | 55 | Kept |
| Gotcha items | 0 | 25 | Added |

Discoverability filter: all remaining lines pass "not discoverable from code" check.
```

## Reference Files

- **[`references/methodology.md`](references/methodology.md)** — Discoverability filter decision tree, category classification criteria, compression techniques, efficiency research data
- **[`references/anti-patterns.md`](references/anti-patterns.md)** — 6 anti-pattern catalog with real before/after examples
- **[`references/gotcha-mining.md`](references/gotcha-mining.md)** — 8-category mining checklist with Grep patterns and source code analysis techniques
- **[`references/code-assessment.md`](references/code-assessment.md)** — Optimization opportunities, extension opportunities, and error prediction checklist with Grep patterns
