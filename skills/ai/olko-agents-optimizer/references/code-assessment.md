# Code Assessment Checklist

Systematic process for assessing code optimization, extension, and error prediction opportunities. Findings that are non-obvious and operationally significant become gotcha candidates for the context file. Use alongside [`gotcha-mining.md`](gotcha-mining.md) during Step 2b.

## Assessment Process

1. Identify the mechanism's core modules (entry points, data access, external calls)
2. For each module, scan using the category checklists below
3. For each finding, ask: "Would an agent get this wrong without being told?" and "Is this already documented?"
4. Only non-obvious findings that change agent behavior belong in the context file — the rest are code improvement opportunities, not documentation

## Category 1: Optimization Opportunities

Code patterns that waste resources or miss performance opportunities.

**Grep patterns:**
```
\.Result|\.Wait\(\)|\.GetAwaiter\(\)\.GetResult\(\)   → sync over async (blocking)
async\s+void                                          → async void (exception swallowing)
\.ToList\(\)|\.ToArray\(\)|\.ToListAsync\(\)           → materialization points (check for N+1)
foreach.*DbContext|foreach.*\.Query|foreach.*Select    → N+1 query suspicion
SELECT\s+\*|FromSqlRaw                                 → over-fetching
new\s+List<|new\s+Dictionary<|new\s+HashSet<           → allocations in hot paths
\.Add\(|\.AddRange\(|\.SaveChanges\(\)                  → individual saves (batch candidates)
\.FirstOrDefault\(|\.SingleOrDefault\(|\.Find\(\)       → repeated lookups (caching candidates)
```

**What to look for:**
- Redundant queries or round-trips — same data fetched multiple times in one flow
- Missing caching opportunities — repeated expensive lookups that don't change within a request
- Over-fetching or N+1 problems — queries inside loops, `.Include()` vs explicit load
- Unnecessary allocations or serialization — new collections created but not needed
- Opportunities to batch operations — individual `SaveChanges` calls that could be one transaction
- Async/await patterns that could be improved — `.Result`, `.Wait()`, `async void`, missing `ConfigureAwait`

**What to document vs fix:**
- Document in context file: non-obvious performance constraint (e.g., "batch size must be ≤500 due to pg parameter limit")
- Fix in code: obvious N+1, missing cache, sync-over-async

## Category 2: Extension Opportunities

Places where the mechanism could be generalized or is artificially constrained.

**Grep patterns:**
```
const\s+\d+|static\s+readonly\s+\w+\s+=\s+"[^"]*"     → hardcoded values (config candidates)
if\s+\(.*==\s*"[^"]*"\)|switch\s*\(\w+\.\w+\)          → hardcoded branching (strategy candidates)
new\s+\w+Handler\(|new\s+\w+Service\(|new\s+\w+Client\(  → direct instantiation (DI candidates)
//\s*TODO|//\s*FIXME|//\s*HACK|//\s*DEPRECATED         → flagged extension points
```

**What to look for:**
- Places where the mechanism could be generalized to support new use cases
- Hardcoded values that could become configuration-driven (limits, thresholds, URLs, intervals)
- Single-class responsibilities that could be extracted into plugins/strategies
- Missing telemetry or observability hooks (no metrics, no tracing, no structured logging)

**What to document vs fix:**
- Document in context file: non-obvious extension contract (e.g., "new commodity types must register in `CommoditySmartEnum` AND `proto` enum")
- Fix in code: extract hardcoded constant to config, add missing telemetry

## Category 3: Error Prediction

Potential failure points that are not obvious from reading the code in isolation.

**Grep patterns:**
```
catch\s*\(\s*\)|catch\s*\(\s*Exception\s*\)             → broad catch (swallowed errors)
try\s*\{.*\}\s*catch.*\{.*\}                             → error handling scope
timeout|Timeout|TIMEOUT                                  → timeout values (check for exhaustion)
retry|Retry|Polly|AddRetry                               → retry policies (check for exhaustion)
\.SendAsync|\.PostAsync|\.GetAsync                       → external HTTP calls
\.Publish\(|\.Send\(|\.Produce\(                         → message publishing (idempotency check)
Guid\.NewGuid|Guid\.CreateVersion7|Random\.              → ID generation (collision/dedup check)
```

**What to look for:**
- External dependency unavailability — HTTP, gRPC, message broker, database; what happens when they're down?
- Timeouts and retry exhaustion — outer timeout vs inner retry, does the caller handle exhaustion?
- Data inconsistency across bounded contexts — saga timeouts, orphaned state, partial writes
- Race conditions or concurrency issues — shared state, missing locks, optimistic concurrency
- Missing input validation — assumptions about external input not enforced at boundary
- Saga timeout or orphaned state risks — what happens when a saga times out mid-flow?
- Configuration misconfiguration — missing keys, wrong environment, silent defaults
- Resource exhaustion — connection pool limits, memory for large payloads, file handle limits
- Poison message handling gaps — what happens when a message can't be deserialized?
- Idempotency gaps for duplicate messages — does the handler dedupe?

For each predicted error, describe:
- The scenario that triggers it
- The current handling (or lack thereof)
- The blast radius

**What to document vs fix:**
- Document in context file: non-obvious error contract (e.g., "saga timeout leaves `PendingDecision` rows stuck — `StuckDecisionCleanupService` must run")
- Fix in code: missing validation, missing retry, broad catch swallowing errors

## Assessment Summary Template

After scanning, organize findings:

```markdown
## Code Assessment

### Optimization Opportunities
| # | Category | Description | Source | Document? |
|---|----------|-------------|--------|-----------|
| 1 | N+1 | foreach loop queries DbContext per item | FooService.cs:42 | No → Fix |
| 2 | Constraint | batch size ≤500 due to pg param limit | BarRepo.cs:18 | Yes → Add gotcha |

### Extension Opportunities
| # | Category | Description | Source | Document? |
|---|----------|-------------|--------|-----------|
| 1 | Config | hardcoded retry count=3 | BazClient.cs:12 | No → Fix |
| 2 | Contract | new commodities need enum + proto registration | CommoditySmartEnum.cs:1 | Yes → Add gotcha |

### Predicted Errors
| # | Scenario | Current handling | Blast radius | Document? |
|---|----------|-----------------|--------------|-----------|
| 1 | gRPC timeout mid-saga | Saga persists in Pending | Stuck rows | Yes → Add gotcha |
| 2 | Missing API key | ArgumentException | Crash | No → Fix validation |
```

Findings marked "Yes → Add gotcha" feed into Step 3 alongside gotcha mining results.
