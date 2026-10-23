---
name: olko-design-rules
description: "Read-only rule catalogue for design and code review across stacks. Design rules (DRY, YAGNI, KISS) apply at plan time and code time. Code rules (nesting, cryptic identifiers, visibility, magic values, nested try/catch, collection-population blocks, linear scans, repeated mapping) apply at code time. .NET-only rules cover explicit enum values, sealed leaf types, and static field order. Never edits code; callers report findings with the rule id. Use when a stack style skill, plan review, or code review applies design rules. Triggers: 'design rules', 'DRY YAGNI KISS', 'check duplication', 'speculative abstraction', 'overengineering', 'olko-design-rules'."
---

# olko-design-rules

## Routing Summary
Read-only rule catalogue for design and code review across stacks. Design rules (DRY, YAGNI, KISS) apply at plan time and code time. Code rules apply at code time only. .NET-only rules apply only to C# files. This skill never edits code. The caller reports each finding with its rule id.

## Progressive Loading
- Load `overview.md` first after registry/category routing.
- Load `workflow.md` only after this skill is selected.
- Load `references/design-rules.md` for plan-time or code-time design review.
- Load `references/code-rules.md` only at code time.
- Load `references/dotnet-rules.md` only when the scope contains `.cs` files.
- Load `examples.md` only when the finding format is needed.
- Load `edge-cases.md` only for uncommon branches and strict rules.

## Files
- `overview.md` - purpose, configuration keys, scope limits, rules covered elsewhere, and rules not adopted.
- `workflow.md` - ordered scan procedure and finding format.
- `references/design-rules.md` - design rules D1-D9 (all stacks; plan time and code time).
- `references/code-rules.md` - code rules C1-C8 (all stacks; code time only).
- `references/dotnet-rules.md` - .NET-only rules N1-N3 (code time only).
- `examples.md` - finding report shape.
- `edge-cases.md` - failure handling and strict rules.
