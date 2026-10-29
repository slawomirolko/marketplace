# Olko Dotnet Security Examples

Example report:

```text
.NET security violations (14/14 rules checked):
  1. W1 src/Orders.Api/Endpoints/OrderEndpoints.cs:22 - route group returns orders without RequireAuthorization; check is only in OrderService (source: olko-dotnet-security:W1)
  2. W4 src/Orders.Api/Program.cs:41 - CORS policy allows any origin with credentials (source: olko-dotnet-security:W4)
  3. S2 src/Orders.Infrastructure/OrdersDbFactory.cs:12 - connection string literal in code (source: olko-dotnet-security:S2)
Checks:
  1. W6 src/Orders.Web/Program.cs:18 - cookie sign-in without persisted data-protection keys; instance count not documented (source: olko-dotnet-security:W6)
```

Clean report:

```text
No .NET security violations found (8/8 rules checked).
```
