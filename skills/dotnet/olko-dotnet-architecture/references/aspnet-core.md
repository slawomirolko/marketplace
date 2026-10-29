# ASP.NET Core guidance

Apply these rules to ASP.NET Core host projects in scope. Each rule has an id `A1`-`A25`; cite a finding as `olko-dotnet-architecture:A<n>`. Security rules (authorization, anonymous access, antiforgery, CORS, HTTPS/HSTS, data-protection keys, secrets) live in `olko-dotnet-security`.

## Pipeline
- **A1** - Register middleware in this order. Skip the steps that the host does not use:
  1. forwarded headers
  2. exception handler, then HSTS (not in Development)
  3. HTTPS redirection
  4. static files
  5. routing
  6. CORS
  7. authentication
  8. authorization
  9. endpoint mapping
- **A2** - Show the developer exception page only in Development. Other environments use the exception handler and problem details.
- **A3** - Behind a proxy or ingress, configure `UseForwardedHeaders()` to trust only the known proxies or networks. Do not clear the trusted lists.

## Logging
- **A4** - Log with message templates and named placeholders (`"Order {OrderId} shipped"`). Do not build log text with string interpolation or concatenation.
- **A5** - Turn on HTTP logging only for the fields that you need.
- **A6** - Do not log request or response bodies, or the `Authorization` and `Cookie` headers, unless the project docs allow it and redaction is on.

## Dependency injection
- **A7** - Choose each service lifetime on purpose: singleton for stateless or thread-safe shared state, scoped for per-request state (for example a `DbContext`), transient for light stateless helpers.
- **A8** - A singleton never resolves or injects a scoped service.

## APIs
- **A9** - Minimal API handlers return `TypedResults` (for example `Results<Ok<OrderDto>, NotFound>`).
- **A10** - Put a cross-cutting check that many endpoints share in an endpoint filter on the route group. Do not repeat it in every handler.
- **A11** - Controllers inherit `ControllerBase`, have `[ApiController]`, and use attribute routing. Rely on the automatic 400 response for an invalid model. Do not repeat `ModelState.IsValid` checks.
- **A12** - A create operation returns 201 with a `Location` header: `CreatedAtRoute` / `CreatedAtAction` in controllers, `TypedResults.CreatedAtRoute` or `TypedResults.Created` in Minimal APIs.
- **A13** - .NET 10 or later: cookie authentication answers an unauthenticated or forbidden request to a known API endpoint with 401 or 403 instead of a redirect to the sign-in or access-denied page. Known API endpoints carry `IDisableCookieRedirectMetadata`, which the framework adds to `[ApiController]` endpoints, Minimal API endpoints that read a JSON request body or write a JSON response, endpoints that return `TypedResults` types, and SignalR endpoints. Other endpoints still redirect. Do not add cookie events that turn redirects into status codes for these endpoints. Mark an API endpoint that is not detected with `DisableCookieRedirect()`.
- **A14** - Before .NET 10, configure the cookie events to return status codes for API paths.

## Background work
- **A15** - A `BackgroundService` creates a new scope for each unit of work and disposes it after that unit.
- **A16** - A background service does not inject a `DbContext` directly. It uses `IDbContextFactory<T>`, or creates a scope with `IServiceScopeFactory` and resolves the context from that scope.
- **A17** - Pass the `CancellationToken` from `ExecuteAsync` to every async call and stop the loop when cancellation is requested.
- **A18** - Keep startup short. Do not run long work before `ExecuteAsync` yields.
- **A19** - Move durable or long-running work out of the web process to a queue and a worker.

## gRPC
- **A20** - Version `.proto` contracts. For a breaking change, add a new package or service version.
- **A21** - Never reuse a field number and never change the number or type of an existing field. Mark removed fields as `reserved`.

## Operations
- **A22** - Expose separate liveness and readiness health checks. Tag each check and map each endpoint with a tag filter. Liveness does not call external dependencies.
- **A23** - Use the built-in rate limiting, output caching, response compression, and request timeouts before you write custom middleware for the same need.

## Upgrades
- **A24** - Upgrade in this order: SDK (`global.json`), `TargetFramework`, packages, review of the breaking-change list for each version step, then tests.
- **A25** - Do not use preview APIs or preview packages unless the user asks for them.

## Not adopted (conflict with existing rules; do not add in syncs)
- Built-in `AddValidation` in place of FluentValidation.
- Test doubles in integration tests.
- SQLite in-memory databases for integration tests.
- SignalR as the default realtime transport.
- Registering services directly in `Program.cs` in place of explicit extension methods.
- Named `HttpClient` registrations in place of typed clients.
- Reading configuration inside Application services.
- A ban on environment variables for secrets.
- `CancellationToken` parameter naming (short or full name): each project's style skill decides.
- `///` XML doc comments on methods: each project's style skill decides.
