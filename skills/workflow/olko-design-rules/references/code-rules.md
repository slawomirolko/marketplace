# Code rules (all stacks; code time only)

Apply these rules only to changed lines. Do not apply them to a plan.

### C1 - Nesting (arrow anti-pattern)
Flag a staircase of nested conditions where the main path is inside the deepest level and the guards are on the outer levels.
Also flag an `if`/`else` where each branch is one statement and the pair can be its own function that returns early instead of using `else`.
Fix: invert the guards and return, continue, or break early, so that the main path is at the top level.
Do not flag: when the change would alter behavior (for example, both branches have side effects that depend on order).

### C2 - Cryptic identifiers and abbreviations
Flag two kinds of names:
- Short names that do not tell what they hold (`a`, `tmp`, `x2`, `rel`). Do not flag short names that are clear (`sum`, `count`, `key`). If it is borderline, do not flag it.
- Abbreviated word segments (`Emp`, `Org`, `Ref`, `Src`, `Dst`, `Msg`, `Req`, `Res`, `Mgr`, `Cfg`, `Ctx`, `Svc`, `Evt`, `Attr`). Flag each segment, also when the meaning is easy to guess.
Fix: use the full words.
Do not flag: abbreviations in `designRulesAllowedAbbreviations`, loop counters `i` and `j` in a conventional index loop, or the name of a caught exception. Do not judge `CancellationToken` parameter names (see "Not adopted" in `overview.md`).

### C3 - Accessor visibility
Flag a public type or member that has no use outside its module, package, or file.
Fix: make it as narrow as the language allows (internal, file-private, private, or not exported).
Do not flag: when a search cannot confirm that there is no external use (reflection, dependency injection registration, public API surface, partial repository). Do not flag exception types; external callers can need to catch them.

### C4 - Magic strings and numbers
Flag a literal that has no clear meaning when it occurs at least `designRulesMagicValueMinRepeats` times in scope. Count across all changed files together, not per file.
Fix: extract a named constant that tells what the value means.
Do not flag: `0`, `1`, or `-1` used as a trivial index, increment, or comparison; empty-string checks; values that already have a name (constant, config, or enum); a single test literal that only has to be different from a real value.

### C5 - Nested try/catch
Flag a `try` inside another `try`, or a `catch` that contains its own `try`. Two levels are sufficient to flag.
Fix: move the inner block into its own function.

### C6 - Standalone collection-population block
Flag a loop that only fills a list, map, or set before the main logic of the function starts. Flag it also when the function is short.
Fix: extract the loop into a named function (for example, `buildOrderIdMap`).

### C7 - Linear scan that a lookup can replace
Flag a repeated search (`find`, `contains`, `any`, `FirstOrDefault`) on a list or array inside a loop or per-row mapping. Also flag a distinct list that is built only for membership checks.
Fix: build a map or set one time, then look up by key.

### C8 - Repeated mapping block
Flag a block or local function that maps one type to another (for example, row to domain model, or entity to DTO) when it occurs in two or more functions, or when a mapper for the same types already exists.
Fix: extract one mapper and reuse it. Follow the existing mapper convention of the project when there is one.
