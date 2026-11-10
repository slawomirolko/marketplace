# Agents-MD Optimizer

## Workflow

### Phase 0: Setup

**Adaptation Loading**: Read `.agents/skill-config.md` first. If `projectAdapter` is not `false`, load `.agents/skills/olko-agents-optimizer/project.md` when present. Apply this precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

**Language Detection**: Detect the user's language from conversation history. Present all analysis results and messages in the user's language.

**Target File Resolution** (when `--path` is not specified):

Search for the first existing file in `agentsOptimizerTargets` from config/adapter. If unset, use this marketplace default order:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `.github/copilot-instructions.md`
4. `.windsurfrules`
5. `codex.md`

If none found, ask the user to specify the target file path.

**Target Type**: The script reports `type` — `agent` (frontmatter with `mode` or `permission`), `skill` (frontmatter with `name` and `description`), or `context` (no frontmatter). For an agent prompt or a SKILL.md, keep frontmatter, invocation contracts, tools, permissions, paths, thresholds, and behavior constraints; adapt the section review to the file's format instead of imposing the context-file structure of Step 3.

**Small File Check**: If the target file has fewer than 20 lines, inform the user that the file is already minimal and optimization is unnecessary. Stop unless the user explicitly requests to proceed.

### Step 1: Baseline Analysis

Read the target file. Collect line statistics.

**Script Location**: Find the line-count script by searching for it:

```powershell
# Prefer agentsOptimizerLineCountScript from .agents/skill-config.md or the project adapter.
# Otherwise use the bundled scripts/line-count.mjs from this skill's loaded files.
$SCRIPT_PATH = '<resolved agentsOptimizerLineCountScript or bundled scripts/line-count.mjs>'
```

Run the script if found:

```powershell
node "$SCRIPT_PATH" '<TARGET_PATH>' --registry '<REGISTRY_PATH>'
```

`--registry` is optional; with it, an agent's allowed skills get their description lengths. Sections of an agent prompt are detected from numbered steps and upper-case labels, so their boundaries are approximate.

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

### Step 2c: Token and Cache Audit

Apply [`references/token-and-cache.md`](references/token-and-cache.md). Use the script output; do not count by hand.

1. **Size**: words and estimated tokens for the file and for each section. Compare with `agentsOptimizerAgentWordBudget` (agent prompts) and `agentsOptimizerSkillDescriptionMax` (each allowed skill's description, and a SKILL.md's own description).
2. **Prefix stability**: list every `prefixIssues` item and every section that changes per run, per user, or per machine. Classify each as delete, move out of the always-loaded file, or keep with a reason. Flag instructions that change permissions or the skill allowlist during a session, or that rewrite earlier context.
3. **Placement**: hard rules near the top, the output contract at the end.
4. **Examples over rules**: for each group of rules about one behavior, check whether 1–3 diverse input → output examples cover it. Propose the replacement; keep `NEVER` bans, numeric thresholds, and edge conditions as rules; confirm no example contradicts a kept rule; make several examples differ.
5. **Split plan** (agent prompts and SKILL.md files over budget): classify every section with the section classes in the reference. For each section that leaves, give the target (new skill, reference file, or subagent), the exact line that replaces it ("in step X, load skill Y"), and the words saved. Never move an `every-step` section. This skill does not create the new skills or load other skills; the calling agent or the user executes the plan.
6. **Providers**: for each entry in `agentsOptimizerProviders`, add the matching configuration advice from the reference (cache TTL, cache key, context size, keep-alive, warming cost).

Present:

```
## Token and Cache Audit — <filename>

Size: <words> words, ~<tokens> tokens (budget <budget>); allowed skills: <n>, descriptions <chars> chars
| # | Kind | Location | Finding | Proposal | Words saved |
|---|------|----------|---------|----------|-------------|
| 1 | prefix | line 366 | dated user rule in always-loaded prompt | move to memory or delete | 12 |
| 2 | examples | step 7b | 6 rules on path counting | 2 examples + keep the 15-path ceiling rule | 140 |
| 3 | split | step 11a | runs once per feature | skill `<name>`, step 11a loads it | 675 |
```

### Step 3: Generate Optimized File

Use AskUserQuestion to confirm before modifying:

> Based on the analysis:
> - **Remove**: X lines of discoverable content (Y sections)
> - **Compress**: X lines → ~Y lines (Z sections)
> - **Add**: X new gotcha items (from Step 2 mining + Step 2b code assessment)
> - **Token and cache**: X prefix issues, X rule groups → examples, split plan saving ~X words (Step 2c)
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
| Words / est. tokens | 5419 / 9241 | 2900 / 5100 | -46% |
| Prefix issues | 2 | 0 | Fixed |
| Rule groups → examples | 0 | 3 | Replaced |

Discoverability filter: all remaining lines pass "not discoverable from code" check.
```

## Reference Files

- **[`references/methodology.md`](references/methodology.md)** — Discoverability filter decision tree, category classification criteria, compression techniques, efficiency research data
- **[`references/anti-patterns.md`](references/anti-patterns.md)** — 6 anti-pattern catalog with real before/after examples
- **[`references/gotcha-mining.md`](references/gotcha-mining.md)** — 8-category mining checklist with Grep patterns and source code analysis techniques
- **[`references/token-and-cache.md`](references/token-and-cache.md)** — What loads on every step, cache rules per provider, examples over rules, section classes for a split plan
- **[`references/code-assessment.md`](references/code-assessment.md)** — Optimization opportunities, extension opportunities, and error prediction checklist with Grep patterns
