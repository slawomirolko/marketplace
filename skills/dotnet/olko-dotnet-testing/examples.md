# Olko Dotnet Testing Examples

Example report:

```text
.NET test convention violations:
  1. tests/App.Tests/FooServiceTests.cs:12 - Test name uses one underscore between method and scenario; use `MethodUnderTest__scenario_expectedResult` (source: olko-dotnet-testing:Test authoring rules - Test naming and organization)
  2. tests/App.Tests/FooServiceTests.cs:40 - Test body has no `// Arrange` / `// Act` / `// Assert` markers (source: olko-dotnet-testing:Test authoring rules - Arrange / Act / Assert markers are required)
```

Production-type and builder violations:

```text
.NET test convention violations:
  1. tests/App.Tests.Integration/Mobile/FooEndpointsTests.cs:18 - Local record mirrors the production endpoint response DTO; read the real type through `InternalsVisibleTo` (source: olko-dotnet-testing:Test authoring rules - Tests consume production types)
  2. tests/App.Tests.Integration/Mobile/FooEndpointsTests.cs:96 - Per-test object graph duplicates the slice builder; use the shared builder with named defaults (source: olko-dotnet-testing:Test authoring rules - One shared builder per slice)
  3. tests/App.Tests.Integration/Setup/IntegrationTest.cs:27 - Channel/marshaller plumbing repeated per test class; move it to the shared test base (source: olko-dotnet-testing:Default .NET test rules - Fixtures and builders)
```

Clean result:

```text
No .NET test convention violations found.
```
