# .NET security rules

Apply these rules to changed lines only. Read code outside the scope only to get evidence (for example, to find a fallback authorization policy). Report each violation with its rule id.

## S - Connection strings and secrets (all .NET projects)

- **S1** - Load connection strings from configuration, user secrets, environment variables, or a documented secrets provider.
- **S2** - Do not hardcode connection strings in code.
- **S3** - Each connection string should have a dedicated settings type/section.
- **S4** - Keep secrets out of `appsettings*.json`, `.cs` files, tracked `.env*` templates, and CI/CD definition files. Secrets in Compose files: see `olko-docker-style`.
- **S5** - Use an ignored root `.env` or documented secret provider when the project standard requires it.
- **S6** - Use `.env.example` or equivalent templates with placeholder values.
- **S7** - For CI/CD, pass secrets through environment variables or the platform secret store.
- **S8** - Use the `__` double-underscore convention for nested configuration sections in environment files.

## W - ASP.NET Core web host (web host projects only)

### W1 - Authorization is declared at the endpoint
Flag an endpoint, controller, or route group that returns protected data or changes state when it has no `[Authorize]` attribute, no `RequireAuthorization(...)` call, and no fallback policy that covers it.
Flag it also when the only access check is inside a service, handler, or repository.
Fix: declare the policy on the endpoint or on its route group. A check inside the service can stay as a second layer.
Do not flag: an endpoint covered by a fallback policy that requires an authenticated user, when the endpoint needs no stricter policy.

### W2 - Anonymous access is rare and has a reason
Flag each added `[AllowAnonymous]` or `.AllowAnonymous()` that has no stated reason in the project docs, the project adapter, or the plan.
Flag it always when it is on a route group, or on an endpoint that changes state without its own verification (for example a webhook without a signature check).
Usual valid reasons: health probes, sign-in and sign-in callback endpoints, public static content, webhooks that verify a signature.
Fix: remove the anonymous access, or record the reason where the project keeps such decisions.

### W3 - Antiforgery on cookie-authenticated form posts and uploads
Flag a form post or an `IFormFile` upload endpoint in a host that authenticates users with cookies when antiforgery validation is off (`DisableAntiforgery()`, `[IgnoreAntiforgeryToken]`) or not set up (`AddAntiforgery()` / `UseAntiforgery()` missing where the framework needs them).
Fix: keep antiforgery validation on and send the token with the form.
Do not flag: an endpoint that accepts only a bearer token in the `Authorization` header.

### W4 - CORS has explicit origins and is not authentication
Flag any of these:
- `AllowAnyOrigin()` and credentials in the same policy, or an origin check that allows every origin (`SetIsOriginAllowed(_ => true)`) together with `AllowCredentials()`.
- A wildcard origin in a policy that authenticated endpoints use.
- An allowed origin copied from the request without validation.
- A CORS policy used as the only protection of an endpoint.
Fix: list exact origins from configuration. CORS only tells the browser which origins can read a response. It does not stop a direct request, so keep authorization on the endpoint.

### W5 - HTTPS redirection and HSTS outside Development
Flag a web host that does not call `UseHttpsRedirection()` and `UseHsts()` for non-Development environments. Flag `UseHsts()` that also runs in Development.
Fix: call `UseHsts()` only when the environment is not Development, and call `UseHttpsRedirection()`.
Do not flag: when project docs state that the ingress or proxy enforces the HTTPS redirect and HSTS for this host.

### W6 - Data-protection keys are shared between instances
Flag a host that runs more than one instance and uses cookie authentication, antiforgery, session state, or OIDC sign-in when any of these holds:
- `AddDataProtection()` is missing.
- Keys are not persisted to shared storage.
- No fixed application name is set with `SetApplicationName(...)`.
Shared storage examples: blob storage with keys protected by a key vault, Redis, or a database (`PersistKeysTo...` plus `ProtectKeysWith...`).
Why: each instance otherwise makes its own key ring. A cookie or token that one instance issues then fails on another instance and after a restart.
Do not flag: a pure JWT-bearer API that has no cookie, antiforgery, session, or OIDC sign-in. A host that docs state runs as one instance.
If the instance count is not known from docs, adapter, or deployment files, report the finding as `check` and say what is missing. Do not report it as a violation.
