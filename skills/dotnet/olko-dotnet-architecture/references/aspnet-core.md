# ASP.NET Core guidance

Apply these rules to ASP.NET Core host projects in scope. Project docs override them. Security rules (authorization, anonymous access, antiforgery, CORS, HTTPS/HSTS, data-protection keys, secrets) live in `olko-dotnet-security`.

## Pipeline
- Register middleware in this order, and leave out the steps that the host does not use:
  1. forwarded headers
  2. exception handler, then HSTS (not in Development)
  3. HTTPS redirection
  4. static files
  5. routing
  6. CORS
  7. authentication
  8. authorization
  9. endpoint mapping
- Show the developer exception page only in Development. Other environments use the exception handler and problem details.
- Log with message templates and named placeholders (`"Order {OrderId} shipped"`). Do not build log text with string interpolation or concatenation.
- Turn on HTTP logging only for the fields that you need. Do not log request or response bodies, or headers such as `Authorization` and `Cookie`, unless the project docs allow it and redaction is on.
- Behind a proxy or ingress, call `UseForwardedHeaders()` before other middleware. Trust only the known proxies or networks. Do not clear the trusted lists to accept every source.

## Dependency injection
- Choose each service lifetime on purpose: singleton for stateless or thread-safe shared state, scoped for per-request state (for example a `DbContext`), transient for light stateless helpers.
- Do not resolve a scoped service from a singleton. Do not inject a scoped service into a singleton constructor.
- A background service does not inject a `DbContext` directly. It uses `IDbContextFactory<T>`, or creates a scope with `IServiceScopeFactory` and resolves the context from that scope.

## APIs
- Minimal API handlers return `TypedResults` (for example `Results<Ok<OrderDto>, NotFound>`), so that the result types are checked at compile time and appear in OpenAPI.
- Put a cross-cutting check that many endpoints share in an endpoint filter on the route group. Do not repeat it in every handler.
- Controllers inherit `ControllerBase`, have `[ApiController]`, and use attribute routing. Rely on the automatic 400 response for an invalid model. Do not repeat `ModelState.IsValid` checks.
- A create operation returns 201 with a `Location` header: `CreatedAtRoute` / `CreatedAtAction` in controllers, `TypedResults.CreatedAtRoute` or `TypedResults.Created` in Minimal APIs.
- Since .NET 10, API endpoints that fail authentication or authorization return 401 or 403 instead of a redirect to the cookie sign-in page. Do not add custom code that turns API redirects into status codes on .NET 10 or later. On earlier versions, configure the cookie events to return status codes for API paths.

## Background work
- A `BackgroundService` creates a new scope for each unit of work and disposes it after that unit.
- Pass the `CancellationToken` from `ExecuteAsync` to every async call and stop the loop when cancellation is requested.
- Keep startup short. Do not run long work before `ExecuteAsync` yields, because that blocks host startup.
- Move durable or long-running work out of the web process to a queue and a worker. In-process background work is lost when the process restarts.

## gRPC
- Version `.proto` contracts. Add a new package or service version for a breaking change.
- Never reuse a field number and never change the number or type of an existing field. Mark removed fields as `reserved`.

## Operations
- Expose separate liveness and readiness health checks. Tag each check and map each endpoint with a tag filter. Liveness does not call external dependencies.
- Use the built-in rate limiting, output caching, response compression, and request timeouts before you write custom middleware for the same need.

## Upgrades
- Upgrade in this order: SDK (`global.json`), `TargetFramework`, packages, review of the breaking-change list for each version step, then tests.
- Do not use preview APIs or preview packages unless the user asks for them.

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
