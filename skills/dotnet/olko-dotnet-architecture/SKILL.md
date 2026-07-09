---
name: olko-dotnet-architecture
description: "Check .NET architecture compliance for changed C# projects. Reads project docs and adapters, maps changed .cs/.csproj files to source projects, verifies layer boundaries, dependency direction, contracts ownership, architecture-test availability, and reports violations with rule sources. Use when validating .NET architecture, before commit/test gates, during plan review, or when olko-commit-style/olko-test/olko-plan-editor delegates .NET architecture checks."
---

# Olko Dotnet Architecture

## What I do
- Map changed `.cs` / `.csproj` files to their nearest source project.
- Read architecture rules from `.agents/skill-config.md`, `.agents/skills/olko-dotnet-architecture/project.md`, scoped `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, and `TESTING.md`.
- Inspect changed code for documented .NET architecture rules.
- Discover and optionally run architecture tests when docs/config prescribe them.
- Report every violation with file, line, broken rule, and rule source.

## Configuration keys

Read from `.agents/skill-config.md` first, then the project adapter:

| Key | Default | Meaning |
|-----|---------|---------|
| `architectureCommand` | — | Command to run architecture checks. |
| `architectureTestPattern` | `*.Architecture.Tests.csproj`, `*.Architecture.*.csproj` | Project glob for architecture tests. |
| `dotnetProjectPrefix` | — | Optional required project-name prefix, for example `Company.Product.`. |
| `dotnetPromptHelperPath` | — | Optional central prompt helper path when prompt text must be centralized. |
| `readArchitectureDocs` | `true` | Whether to read architecture docs. |

For PricePredictor project adapters, set:

```yaml
dotnetProjectPrefix: PricePredictor.
```

## Default .NET architecture rules

Apply these defaults unless config, adapter, or project docs override them.

### Configuration
- Keep setting defaults in the base `appsettings*.json` file for the host.
- Add values to `appsettings.Development.json` or `appsettings.Test.json` only when intentionally overriding the base value for that environment.
- Do not put default values into settings record types.
- If a config key does not resolve to a value, fail fast with an `InvalidOperationException` that names the missing key.
- Do not silently ignore mismatched key formats or missing config sections.

### Identity and boundaries
- Use `Guid` for IDs except enums.
- Generate new IDs with `Guid.CreateVersion7()`.
- Organize code by feature slice and sub-slice folders, not generic layer blobs.
- Keep feature namespaces aligned with the feature folder tree.
- Treat each domain application project as a bounded module inside a modular monolith.
- Keep domain application modules isolated from each other.
- Runtime modules should communicate through contracts, application service interfaces, Unit of Work orchestration, or messaging.
- Host projects are composition roots. They wire modules together and delegate behavior instead of holding business rules.
- Keep hosts thin and use them only as composition roots for dependency injection, configuration, endpoint wiring, hosted services, and transport setup.
- Keep shared abstractions small, business-neutral, and stable.
- Do not add direct runtime references from one domain application module to another.
- Do not use `Shared` as a hidden dependency bucket for module-specific behavior.
- Do not cross module boundaries by reaching into another module's internals, repositories, or EF configuration.
- Do not bypass module boundaries through repositories, EF configuration, or another module's internals.
- Use integration messages for workflows that cross module or host boundaries.
- Use contracts and application services for in-process orchestration when the workflow must stay synchronous.
- Keep module-specific DTOs, validators, domain methods, and repositories inside the owning module.
- When a workflow touches multiple tables or modules, orchestrate it from an application service, Unit of Work, saga, or host-level workflow.
- Do not let a single repository coordinate cross-module behavior.
- Do not move domain rules into host startup, controllers, or message transport setup.
- Do not expose persistence entities directly in API responses; map to DTOs.
- Do not use SignalR by default; prefer the project's documented realtime/messaging transports.

### Layer defaults
- Application projects should be divided into vertical slices.
- Prefer feature slices and sub-slices in folder structure.
- Shared behavior used by multiple apps/APIs should live in a documented shared area, not duplicated across slices.
- Keep one contracts area for shared message contracts and integration message types when the project uses shared contracts.
- Application layer should define service interfaces, service implementations, repository interfaces, application DTOs, and domain logic unless project docs split these differently.
- Application layer should expose one explicit application DI extension, such as `AddApplication(this IServiceCollection services)`.
- Keep DI extension registration granular per vertical slice so settings stay isolated.
- Call application registration explicitly in host startup.
- Every service class should have its own interface.
- Register services in DI by interface and consume interfaces in constructors where practical.
- Do not introduce concrete-only service classes without an interface.
- Persistence layer should contain DbContext, EF Core configuration, migrations, and repository implementations that depend on DbContext.
- Persistence layer should expose one explicit persistence DI extension, such as `AddPersistence(this IServiceCollection services, IConfiguration configuration)`.
- Infrastructure layer should contain external clients, infrastructure DTOs/mappers, settings classes, messaging setup, and external-system wiring.
- Infrastructure setup should be exposed through explicit extension methods.
- API/host layer should contain endpoints, background services, startup configuration, and minimal business logic.

### Dependency direction
- API/host layers may reference Application and Infrastructure.
- Application defines interfaces.
- Application must not reference API/host or Infrastructure.
- Application must stay free of API, Infrastructure, and Persistence dependencies.
- Infrastructure may implement Application abstractions when project docs use that pattern.

### Reliability
- Never return `null`, empty collections, default values, or silently skip processing when a required file/resource/config is missing.
- Never swallow exceptions and return an empty/default result without logging or throwing.
- If an expected file is missing, throw `FileNotFoundException` with the path in the message.
- If a key format convention is required, make the result immediately verifiable with a test.

### EF Core architecture
- Configure models using `IEntityTypeConfiguration<T>` where `T` is the application model.
- Keep one configuration class per entity in `Persistence/Configurations/` unless project docs use another convention.
- Database entity/application models should be plain C# classes without artificial `Entity` suffixes unless docs require suffixes.
- Persistence models should mirror the documented application model structure when the project uses shared application models.
- Register configurations with `modelBuilder.ApplyConfigurationsFromAssembly(typeof(DbContext).Assembly)` in `OnModelCreating`.
- Apply global query filters for soft-delete when the model supports soft-delete.
- Generate EF migrations with `dotnet ef migrations add`; do not hand-write migration files.
- Review generated migrations before applying and confirm no unintended table/column drops.
- Roll back incorrect unapplied migrations with `dotnet ef migrations remove`.
- Use `Database.Migrate()` only to apply existing migrations at startup, not as a migration-generation workflow.
- Keep a design-time `DbContext` factory available so `dotnet ef` can discover the context.
- Do not use synchronous EF Core I/O such as `.ToList()` or `.First()` in async-capable paths.
- Do not use deprecated Entity Framework patterns from legacy EF.

### ASP.NET Core API
- Prefer `WebApplicationBuilder` and `WebApplication`; avoid new `Startup`/`WebHost` patterns.
- Use Minimal API route groups for endpoint organization.
- Use typed HTTP clients or wrapper client classes instead of injecting raw `HttpClient` directly.
- Use the Options pattern with `IOptions<T>` / validated options for configuration.
- Use `AddProblemDetails()`, `AddExceptionHandler<T>()`, and `UseExceptionHandler()` in the API layer.
- Map known exceptions to RFC 7807 problem details.
- Use FluentValidation with endpoint filters or pipeline behaviors when validation is needed.
- Use health checks with `AddHealthChecks()` and `MapHealthChecks("/health")`.
- Use database health probes such as `AddDbContextCheck<T>()` when a database is part of the service.
- Do not use synchronous I/O in API endpoints.

### Messaging
- Keep shared transport and bus defaults centralized in Infrastructure.
- Use one shared messaging extension method for all .NET hosts when registration is reusable.
- Pass host-specific transport settings, consumers, handlers, and schedules from each host startup when needed.
- Keep common messaging resource settings consistent across services, including broker URI, durable transport defaults, and serialization conventions.
- Document every cross-service saga path using `service -> message -> queue -> consumer`.
- Do not duplicate full messaging setup in each host unless a host has a genuinely unique requirement.
- Do not place transport orchestration or broker wiring in Application layer code.
- Prefer thin host startup calls that delegate to shared Infrastructure messaging extensions.

### OpenTelemetry
- Keep OpenTelemetry setup centralized in Infrastructure.
- Use one shared extension method for all .NET hosts when setup is reusable.
- Pass `serviceName` from each host startup and add only host-specific options there if needed.
- Include messaging instrumentation in the shared extension when the host uses message routing.
- Keep common resource tags consistent across services, including service name, environment, and version.
- Do not duplicate full telemetry setup in each host unless a host has a genuinely unique requirement.
- Do not place telemetry orchestration or exporter wiring in Application layer code.
- Every service should have instrumentation attached.

### Prompt centralization
- When `dotnetPromptHelperPath` is configured, store prompt text used in `.cs` files in that helper.
- Reuse prompt constants/builders from the configured prompt helper instead of duplicating prompt strings in services/clients.
- Keep prompt normalization helpers centralized when project docs define one.
- Do not declare prompt literals outside the configured helper unless explicitly requested.

### HTTP clients
- Use typed HTTP clients or wrapper client classes instead of injecting raw `HttpClient` directly into services.
- Register typed clients with `AddHttpClient<Interface, Implementation>`.
- Each external client should have its own registration extension method.
- Keep client setup in Infrastructure.
- Call client extension methods explicitly from host startup unless project docs centralize them.
- Use Polly policies for retry logic.
- Do not implement retry behavior with manual loops, recursive retries, or custom delay logic when Polly can be used.
- Do not introduce adapter patterns for clients unless project docs require them.
- HTTP client methods must throw on failure, not return `null`.
- Do not swallow `HttpRequestException` or transient failures.
- Add diagnostic context to exceptions, such as model name, chunk count, prompt size, URL purpose, or operation name.

### Serialization and DTOs
- Application layer models should not have `System.Text.Json.Serialization` attributes.
- Put serialization attributes on Infrastructure/API DTOs.
- Use mapper extension methods to convert Infrastructure DTOs to Application models.
- Keep serialization concerns isolated outside Application.

### Package management
- When Central Package Management is enabled, keep NuGet versions in the root `Directory.Packages.props`.
- Do not put `Version=` on `PackageReference` entries in `.csproj` files when CPM is enabled.
- Add package versions with `<PackageVersion Include="..." Version="..." />` and versionless `PackageReference` entries.
- Keep `PackageVersion` entries alphabetically sorted within the `ItemGroup`.
- Bump packages by editing `Directory.Packages.props` only.
- When upgrading a framework family, update related package versions together.
- Do not introduce per-project `Directory.Packages.props` files when the repo standard is one root file.

### Aggregate and slice rules
- Each domain application module is a bounded slice and should organize internals by feature sub-slice.
- Cross-aggregate references should use identity references such as `Guid <Aggregate>Id`, not navigation properties.
- Cross-aggregate lookups should go through the owning module's repository.
- Child entities should be added only through root methods, not constructed standalone and attached.
- Aggregate root methods should enforce invariants.
- Repository interfaces for a slice should live inside that slice's module, not a global repositories bucket.
- Do not let child entities reference sibling children directly.

### Application models and errors
- Static factory methods in models should return `ErrorOr<TModel>` when validation/domain failure can occur.
- Use a single `Create(..., Guid? id = null)` factory pattern for Guid-based models.
- Do not add parallel `CreateFrom(...)` factories unless project docs require them.
- If a business model property changes, add/update a domain method on the model to perform that change.
- Persist model state changes through Unit of Work / `SaveChangesAsync`, not ad-hoc setters or direct external mutation.
- Do not throw exceptions for validation/domain errors from model factory methods; return `ErrorOr` errors.
- Use `ErrorOr<T>` for expected/domain/application errors in Application services and domain logic.
- Reserve exceptions for technical failures and unexpected runtime faults.
- Application models should set values through factory/domain methods, not public mutable setters.
- Prefer private constructors plus static factories that enforce invariants.
- Use FluentValidation for .NET application validation when validation rules are needed.
- Keep HTTP exception handling in the API layer, not Application.

### Connection strings and secrets
- Load connection strings from configuration, user secrets, environment variables, or a documented secrets provider.
- Do not hardcode connection strings in code.
- Each connection string should have a dedicated settings type/section.
- Keep secrets out of `appsettings*.json`, `.cs` files, and compose environment blocks.
- Use an ignored root `.env` or documented secret provider when the project standard requires it.
- Use `.env.example` or equivalent templates with placeholder values.
- For CI/CD, pass secrets through environment variables or the platform secret store.
- Use the `__` double-underscore convention for nested configuration sections in environment files.

### Startup validation and settings flow
- Startup validation for external prerequisites must fail fast.
- Use project-specific custom exceptions for missing prerequisites when docs require custom exception types.
- Custom exceptions should extend appropriate system exception types such as `InvalidOperationException`.
- Keep startup validation logic in the outer layer or Infrastructure, not Application.
- Do not use settings types directly inside Application services.
- Application logic should receive configurable values through explicit method arguments, request objects, or parameter objects.
- Settings binding should stay in the outer layer.
- Keep default values in base appsettings files.
- Use environment-specific appsettings files only for overrides.
- Do not add default values inside settings record types.

### Project naming
- If `dotnetProjectPrefix` is configured, every project in the solution must start with that prefix.
- For PricePredictor, every project in the solution must start with the `PricePredictor.` prefix.
- Do not create .NET projects without the configured project prefix.

### Sagas
- Saga handlers should return messages wrapped in `ErrorOr<TMessage>` when the saga can fail.
- Do not return raw saga messages when an `ErrorOr<TMessage>` result is needed.
- Use `ILogger<TSaga>` in saga handlers so log categories align with the saga type.
- Every saga should emit instrumentation via `ActivitySource` and tag correlation values such as `workflow.saga_id`.
- Saga messages should inherit a shared workflow message base that carries correlation and saga ID when the project has that base type.
- Saga completion messages with payloads should expose a concrete saga-specific result type.
- `WorkflowSagaMessage<T>` type parameters should be dedicated record types, even when empty.
- Do not use catch-all message payload types when a specific saga payload record can be defined.
- Keep saga timeout values in configuration, not hardcoded in handlers or saga classes.
- Register saga listeners and publishers explicitly in host setup.
- When serializing `ErrorOr<T>`, keep an explicit wrapper shape with `isError`, `value`, and `errors`.
- Completed saga messages should use the project-standard completed result type when one is documented.
- Do not create saga-specific completed result records when the project standard requires one shared completed result.
- Do not attach domain payloads to completed message results when the project standard limits results to notification metadata.

### External references
- If repo docs reference dedicated gRPC, Docker, embedding/vector database, or secret-management docs, read those docs before checking related files.
- Apply those docs as higher-priority project rules.

### Smart enums
- Smart enum types should be records with private setters on instance properties.
- Smart enum types should expose hardcoded ID, hardcoded name, `FromId(int)`, `FromName(string)`, and public readonly `All`.
- Back `All` with readonly static instances only.
- Keep smart enum names short and domain-specific.

## Workflow

### Step 1 - Resolve scope
Use changed files from the caller when provided. Otherwise inspect `git status --porcelain` and `git diff --name-only HEAD`.

Keep only `.cs` and `.csproj` files. Skip generated files unless docs explicitly require checking them.

### Step 2 - Load adaptation layers
Follow precedence:

```text
Configuration > Project Adapter > AGENTS.md > Marketplace Skill
```

Read:
- `.agents/skill-config.md`
- `.agents/skills/olko-dotnet-architecture/project.md` when `projectAdapter: true`
- nearest `AGENTS.md`, `ARCHITECTURE.md`, `CODING_STYLE.md`, `TESTING.md` walking up from each changed file
- repo root `AGENTS.md`

Docs are the rule source of truth. If a doc conflicts with this skill, follow the doc and report the conflict.

### Step 3 - Map projects
For every changed source file:
- find the nearest `.csproj`
- classify source vs test project by project name and docs
- identify related contracts/application/domain/infrastructure/persistence projects only from docs, project references, or names already used by the repo

Do not invent layer names beyond what the repo uses.

### Step 4 - Inspect architecture
Check only rules found in docs/adapters/config. Common rule types to look for when documented:
- dependency direction between layers
- forbidden references from domain/application/contracts
- DTO/contract ownership and versioning
- persistence or transport concerns leaking into domain/application
- feature/module boundary crossings
- naming/location conventions for handlers, validators, repositories, migrations, and integration events
- test-double and fixture placement conventions when architecture docs include test rules

Use structured project files (`.csproj`) for reference checks. Do not rely on string matching when XML project references are available.

### Step 5 - Run architecture command when configured
If `architectureCommand` exists, run it from the documented working directory.

If no command exists and any .NET source changed, discover architecture test projects using `architectureTestPattern`. If found, run:

```bash
dotnet test <architecture-test-project>.csproj --no-restore
```

If docs say no architecture tests exist, skip this step.

### Step 6 - Report result
If violations exist:

```text
.NET architecture violations:
  1. <file>:<line> - <rule broken> (source: <doc>:<line-or-section>)
```

If command/tests fail, include the failing command and the smallest useful error snippet.

If clean:

```text
No .NET architecture violations found.
```

## Rules
- Never hardcode project-specific paths, layer names, or commands.
- Prefer documented rules over generic .NET opinions.
- Do not fix code unless the user or parent workflow asks for fixes.
- Keep output short and actionable.
