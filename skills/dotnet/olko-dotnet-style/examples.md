# Olko Dotnet Style Examples

Example report:

```text
.NET style violations:
  1. src/App/Foo.cs:17 - Method has a `/// <summary>` comment that restates its name; remove it (source: olko-dotnet-style:Default .NET style rules)
  2. src/App/IFooRepository.cs:12 - CancellationToken parameter omits `= default` in an interface declaration (source: olko-dotnet-style:Default .NET style rules)
```

Partial-type and persistence violations:

```text
.NET style violations:
  1. src/App/Persistence/UnitOfWork.Predictions.cs:5 - `partial class UnitOfWork` splinters one type across files; delete the file and give the slice its own unit of work (source: olko-dotnet-style:Structural rules - Partial types are forbidden)
  2. src/App/Persistence/UnitOfWork.cs:34 - One class implements four unit-of-work interfaces; split by responsibility into one class per interface (source: olko-dotnet-style:Structural rules - Unit of work and repository boundaries)
  3. src/App/Persistence/FooRepository.cs:86 - `ResolveRaceAsync` selects existing rows before inserting; replace with `INSERT … ON CONFLICT (<unique columns>) DO NOTHING` (source: olko-dotnet-style:Structural rules - DB-native idempotency and concurrency)
  4. src/App/Persistence/FooRepository.cs:127 - `_context.Entry(entity).State = EntityState.Detached` manipulates EF entity state; remove it and let the database decide the write (source: olko-dotnet-style:Structural rules - DB-native idempotency and concurrency)
  5. src/App/Persistence/FooRepository.cs:149 - Table reached through a table-name string constant; use the mapped `DbSet<TEntity>` (source: olko-dotnet-style:Structural rules - Unit of work and repository boundaries)
```

Clean result:

```text
No .NET style violations found.
```
