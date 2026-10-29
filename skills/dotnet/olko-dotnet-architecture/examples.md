# Olko Dotnet Architecture Examples

Example report:

```text
.NET architecture violations:
  1. src/App/Finance/Foo.cs:42 - Application module references another module internals (source: ARCHITECTURE.md:Modular monolith boundaries)
  2. src/App/Orders.Api/Workers/OutboxWorker.cs:18 - background service injects a DbContext directly (source: olko-dotnet-architecture:A16)
```
