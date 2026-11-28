# Olko Dotnet Style Workflow

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.cs` and `.csproj` files. Skip generated files matching `dotnetStyleGeneratedGlobs` unless docs explicitly require checking them.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-dotnet-style/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `CODING_STYLE.md`, and `TESTING.md` walking up from each changed file
- nearest `ARCHITECTURE.md` when `readArchitectureDocs: true`
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map projects
For every changed source file:
- find the nearest `.csproj`, unless `dotnetProjectRoot` overrides it
- group files by project
- classify source vs test project by project name and docs

Do not invent project-specific layer names.

### Step 4 - Run style command
Run `dotnetStyleCommand` from the repo root or documented working directory.

Replace `<project>.csproj` with the discovered project path. If a solution-level command is configured in docs/config, use that instead.

Do not run restore unless docs/config require it.

### Step 5 - Inspect documented style rules
Check only rules found in docs/adapters/config. Common rule types to look for when documented:
- nullable/reference-type handling
- async naming and cancellation token conventions
- exception/logging conventions
- dependency injection registration style
- test naming, fixture, builder, and assertion conventions
- generated-code edit restrictions
- namespace/file layout conventions

Do not enforce personal C# opinions unless the project docs say so.

### Step 6 - Handle violations
If violations exist and `dotnetStyleFixCommand` is configured or documented, ask before running it unless the parent workflow already authorized auto-fix.

If reporting:

```text
.NET style violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If clean:

```text
No .NET style violations found.
```

## Default .NET style rules

Apply these defaults unless config, adapter, or project docs override them.
Also apply the `olko-design-rules` catalogue to the changed lines: its design rules, code rules, and .NET-only rules.

### Documentation and method shape
- After reading a method name, a person should be able to understand what the method does.
- If a method name contains `And` or `Or`, inspect it for single-responsibility violations and split it when appropriate.
- Remove every `/// <summary>`/`/// <remarks>`/`<param>` block and every `//` line: a changed C# file carries ZERO comments. The only exception is the three test-body markers `// Arrange`, `// Act`, `// Assert`.
- A comment that explains what a method does signals a weak name: rename the method so the comment becomes redundant, then remove the comment.
- Never add a doc block to silence a missing-parameter-doc compiler warning; disable that warning in the project instead.
- Keep methods at or below 30 lines unless the local docs allow a specific exception.
- Method names should represent one responsibility.

### Naming and file organization
- Use file-scoped namespaces.
- Namespace must match the file location relative to the project root, for example `ProjectRoot/Weather/WeatherService.cs` -> `ProjectRoot.Weather`.
- Keep one public type per file and never declare a second type in that file — no nested `private sealed` helper, no nested record, no interface member record. One file = one type declaration.
- A result record returned by an interface (`<Name>RunResult`, `<Name>TickResult`) lives in its own file; an interface file declares only the interface.
- Keep related types in the same feature namespace and folder tree.
- Write only bounded loops: never `while (true)`. Use `for (var page = 0; page < MaxPageCount; page++)` with a named constant, or a `while (condition)` whose condition changes in the body, and log when the safety bound is hit.
- For every `record`, declare data with explicit public properties using `{ get; init; }`.
- Use opening and closing braces for all control flow statements, including single-line `if`, `else`, `for`, `foreach`, `while`, `using`, `lock`, and `fixed`.
- `CancellationToken` parameters must use the full name `cancellationToken` and default to `default`, for example `CancellationToken cancellationToken = default`. Check every changed interface member and method declaration, not just the implementation, and report each missing `= default` as a violation.

### Modern C#
- Enable nullable reference types in all projects with `<Nullable>enable</Nullable>`.
- Do not disable nullable warnings without a documented justification.
- Use `required` for non-nullable properties in classes and records.
- Use init-only properties for immutable data.
- Use collection expressions and spread syntax where they improve clarity.
- Use raw string literals for multi-line strings and JSON.
- Use `ArgumentNullException.ThrowIfNull(value)` instead of manual null checks.
- Use `ArgumentOutOfRangeException.ThrowIfNegativeOrZero(value)` for matching parameter validation.
- Use pattern matching with records for discriminated unions and control flow.
- Do not use the null-forgiving operator (`!`) unless the impossibility of null is clear and local.
- Prefer `global using` directives in a dedicated `GlobalUsings.cs` file.
- Use `FrozenDictionary` and `FrozenSet` for static readonly lookup data on .NET 8+ when lookup cost matters.
- Do not use primary constructors for dependency injection; prefer explicit constructors for injected services.

### Performance style
- Use async/await for I/O and always accept and forward `CancellationToken`.
- Do not use blocking calls such as `.Result` or `.Wait()` in async code.
- Use `ValueTask<T>` only when a method may complete synchronously and the benefit is clear.
- Use `ArrayPool<T>` for temporary buffers when repeated allocation matters.
- Pre-size collections when the count is known.
- Use `Span<T>` / `ReadOnlySpan<T>` for hot-path zero-allocation string and array processing.
- Use `stackalloc` only for small fixed-size buffers.
- Materialize LINQ queries once when enumerating multiple times.
- Do not enumerate an `IEnumerable<>` multiple times.
- Use `Any()` instead of `Count() > 0` for existence checks.
- Use `Select` projections early in LINQ chains to reduce transferred data.
- Prefer `StringBuilder` over string concatenation in loops.

### EF Core style
- Use `HasPrecision(18, 2)` for decimal properties unless domain docs require another precision.
- Use `HasMaxLength(N)` for string properties with known length limits.
- Use `IsRequired()` explicitly on non-nullable navigation and scalar properties.
- Use `AsNoTracking()` for all read-only EF Core queries.
- Use `AsSplitQuery()` when eager-loading multiple collections.
- Use `.Select()` projection instead of loading full entity graphs when only a subset of columns is needed.
- Use `ExecuteUpdateAsync()` and `ExecuteDeleteAsync()` for bulk operations on .NET 7+ when appropriate.
- Use compiled queries for frequently executed hot-path queries.

## Structural rules

Owner directives; they apply to every project that uses this skill.

### Partial types are forbidden
- Never use `partial`: not for a unit of work, DI registration, endpoints, handlers, test helpers, or any other hand-written type. A `partial` type is one responsibility splintered across files and defeats review and size caps.
- Split by responsibility into separate types in separate files instead.
- Sanctioned exemptions only: compiler-required top-level-statement `Program.cs`, source-generated `JsonSerializerContext`, EF-generated migrations/designers, and a project-documented pre-existing set scheduled for refactor. Never add a new member to such a set.
- If a size cap (file or type) blocks a change, extract a separate type; never shave the cap by splitting one type into partials.

### Unit of work and repository boundaries
- One unit of work per responsibility: a class implements exactly one unit-of-work interface. Never one class implementing several.
- A unit of work exposes repositories plus `SaveChangesAsync` only. Shared `SaveChangesAsync` behavior lives in one non-partial base class.
- Never add a repository from another feature slice to an existing unit-of-work interface or implementation; a new boundary gets its own unit of work.
- Never add a transport/broker member (publisher, sender, client) to a unit-of-work interface.
- A repository reaches its table through the mapped `DbSet<TEntity>` on the context, never through a table-name string matched or compared at runtime.
- When several repositories repeat the same CRUD shape, prefer a generic abstract repository parameterized by the entity/`DbSet<TEntity>` over repeating the code; the table and column names come from the entity mapping, not from literals.

### Idempotent writes and concurrency
- A repository only stages (`AddAsync`/`AddRangeAsync`); the unit of work saves. The table's unique index is the concurrency guard, so an idempotent insert needs no `ON CONFLICT`, no hand-rolled transaction, and no entity-state surgery.
- Translate a unique-index violation once, in the base unit of work: `SaveChangesAsync` catches the provider exception and rethrows a framework-agnostic `UniqueConstraintViolationException(constraintName)`, detaching the failed entries. Callers react to that specific constraint, never to EF Core or Npgsql exception types.
- An idempotent insert treats that collision as "already stored" at the caller — a cache hit — and a multi-row batch lands whole or not at all because it is one `SaveChangesAsync`.
- Never hand-roll a race: no `GetBy…` then filter "pending" then insert, no `ResolveRace*` helper, no catch of `DbUpdateException`/`PostgresException` outside the base unit of work.
- Never manipulate Entity Framework entity state to escape a failed write (`context.Entry(entity).State = EntityState.Detached/Modified`, `ChangeTracker` surgery). If the write needs that, the repository is doing the wrong thing.
- Use a concurrency token (`Version`/`xmin` plus `.IsConcurrencyToken()`, `DbUpdateConcurrencyException`) only where rows are actually UPDATED; it does nothing for insert-only rows, so never add a dead token column.
- Resolve an optimistic-concurrency failure by fixing its cause (missing token, stale tracked batch, read-modify-write) or by an explicit, user-visible conflict path; never swallow it.
- Raw ADO is banned for writes: no new `INSERT … ON CONFLICT` and no `DbCommand` for an insert or upsert. Remaining legacy upsert statements are a migration target, never a pattern to copy.

### Mappers, endpoints, instrumentation
- Put transport-to-domain and domain-to-read-model conversion in extension methods on a dedicated `<Thing>MappingExtensions` or `<Thing>ReadModelExtensions` type. Never inline a mapping lambda, projection, or DTO construction block in an endpoint, handler, or service body.
- A private `Build*`/`Create*`/`Map*` method that only forwards arguments to a production factory is a mapper defect: convert it into a C# 14 extension block on a `<Thing>Extensions` static class (`extension(FeedbackAggregate aggregate) { public ErrorOr<WeatherMemoryFeedback> ToWeatherMemoryFeedback(DateTime evaluatedAtUtc) => ... }`) that returns the factory's `ErrorOr<T>` result.
- Never use the classic `this` extension-method parameter form; extension blocks are required.
- Keep a host endpoint file to routing, authorization, parameter parsing, and delegation. A non-trivial read composition goes to an `I<Thing>ReadService` registered in host DI. Never place repository or unit-of-work access, mapping, formatting, ordering, or state-name selection in an endpoint.
- Extract a group of `activity?.SetTag(...)` calls into a private `Setup<Operation>Instrumentation` method and call it once per operation.
- Give a recurring invalid-input rule that must surface as a specific transport failure code its own exception type (for gRPC, an `RpcException` subtype) instead of repeating a generic error conversion at several call sites.

### Closed value sets and shared contracts
- Model a closed domain value set as a smart enum with `Id`, `Name`, `All`, `FromId`, `FromName`, and `TryParse`, even when the column is text. Persist it with `HasConversion(x => x.Name, name => T.FromName(name))` and a `HasMaxLength` sized for the longest name. Never model such a set as loose `string` constants, a plain enum stored by name, or an open string column.
- Parse closed values at the boundary; an unknown wire value becomes a validation error, never free text written to the column.
- Size a persisted version/label column for the values that actually exist; a generous `varchar(128)` for a short mechanism label is a defect.
- Keep a wire value or timestamp format read by more than one type or slice in ONE shared place: a `<Slice>Contract` type for constants, a single UTC-format helper for time strings. Never copy the same private constant or `FormatUtc` into a second type.

## Build warning hygiene

Owner directive.
- Build the changed projects. Every NEW analyzer warning on a changed file is a violation, not noise.
- Fix StyleCop spacing rules in the edit: `SA1117` (parameters all on one line or each on its own line), `SA1000`, `SA1011`, `SA1118`, `SA1137` (elements sharing a block keep identical indentation). `dotnet format` does not address them, so fix the whole file rather than only the edited hunk.
- Fix `IDE0130` by matching the namespace to the folder; a pre-existing sibling namespace is not a reason to copy it into new code.
- Treat `IDE0007` and `IDE0008` as non-violations. `var` is correct where the initializer makes the type obvious, and a project may disable `IDE0008` in `.editorconfig`.
- Never silence a warning with a pragma or `NoWarn`. Fix the code, or report why the warning is structural, such as host-level `IL2026`/`IL3050` on a `Map*` registration in top-level statements.

## Auto-styling
- Use `dotnet format` to apply repo-wide formatting and style fixes.
- Prefer `dotnet format` when code should be restyled automatically.
- Scope `--include` to the changed files when a repo-wide verify reports pre-existing end-of-line noise on untouched files.
