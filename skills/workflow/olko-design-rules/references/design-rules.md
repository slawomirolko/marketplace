# Design rules (all stacks; apply at plan time and code time)

These rules are about design decisions: is it duplicated, is it necessary, is it simple enough. At plan time, anchor each finding to a planned file or element. At code time, anchor each finding to a changed line.

## DRY

### D1 - Duplicated logic shape
Flag two or more blocks in scope that do the same multi-step logic (the same branch sequence, the same loop shape, the same series of calls). Only names or literal values are different.
Fix: extract the shared shape into one function. Use parameters for the parts that are different.
Do not flag: blocks that look similar but apply different rules (different outcomes or edge-case handling). One repeated line or literal is not D1 (see C4 and C8).

### D2 - Business rule in more than one layer
Flag the same business rule or validation that is written independently in two or more places in scope (for example, in a request validator and again in a domain method). The copies can change separately and become different.
Fix: make one copy the single source of truth. Make the other place call it, or remove the copy that is not necessary.
Do not flag: a check that is duplicated on purpose across a trust boundary (at the API edge and in a domain method that internal callers also use). If you cannot tell which case applies, write the finding as a question.

### D3 - Existing functionality written again
Flag new code that does what an existing helper, utility, or extension in the repository already does (for example, a manual retry loop when a shared retry policy exists).
Fix: use the existing helper.
Do not flag: when a search does not find the equivalent. Do not guess that one exists.

## YAGNI

### D4 - Speculative abstraction
Flag a new interface, abstract base, plugin hook, strategy, or generic type parameter that has exactly one implementation or caller. Nothing in the plan or change shows that a second one is necessary.
Fix: use the concrete type. Add the abstraction when a second real variant exists.
Do not flag:
- An interface that an architecture rule requires (for example, consumers must depend on an interface resolved through dependency injection). This is not speculative abstraction.
- An interface that the repository uses for all similar services by convention.
- An interface that tests need now for a test double.

### D5 - Unused addition
Flag a new public method, overload, or parameter that no caller or test in scope uses.
Fix: remove it. Add it again when a caller needs it.
Do not flag: a parameter that an interface or base signature requires, or an optional parameter that is a normal part of a public API.

### D6 - Premature configuration
Flag a new config value, feature flag, environment variable, or constructor option when every current caller gives the same fixed value.
Fix: use a constant for the value. Add the setting when a second value is necessary.
Do not flag: a value of a type that the repository already makes configurable in other places (for example, connection strings or timeouts).

## KISS

### D7 - Pass-through layer
Flag a new function, class, or interface that only forwards a call and adds no behavior (no validation, no transformation, no logging).
Fix: call the target directly and remove the wrapper.
Do not flag: a wrapper that an architecture boundary requires (see D4), or an adapter between two different shapes.

### D8 - Dense code
Flag code that a reader must simulate to understand: a long chained pipeline that does several unrelated transformations, nested ternaries, bit tricks used as a boolean check, or a one-line statement that combines several concerns.
Fix: split it into named intermediate steps.
Do not flag: one clear pipeline that does one transformation (filter, map, one terminal call). Length alone is not a finding.

### D9 - Solution more complex than the problem
Flag a design pattern (strategy, factory, visitor, builder, generic pipeline) for a problem that has a small fixed number of cases, where a plain `if` or `switch` is sufficient. Also flag a custom result or error wrapper for one call site when the language or framework already has a construct for it.
Fix: use the direct approach. Add the pattern when the problem grows.
Do not flag: a pattern that the repository uses for the same class of problem.
