# React security rules

Apply these rules to changed lines only. Read code outside the scope only to get evidence (for example, to find the API client wrapper). Report each violation with its rule id.

## B - Boundaries

- **B1** - Never embed secrets (API keys, tokens) in client bundle code; only `VITE_`-prefixed public config belongs in `import.meta.env`.
- **B2** - Validate/sanitize any user-controlled content rendered as HTML; do not use `dangerouslySetInnerHTML` without a documented sanitizer.
- **B3** - Do not trust client-side form validation alone — the API layer surfaces server validation errors, it does not suppress them.
- **B4** - Never log sensitive data (tokens, credentials, PII).

## T - Tokens and auth

### T1 - Tokens are not in web storage
Flag an access token, refresh token, or ID token written to `localStorage` or `sessionStorage`.
Why: any script that runs on the page can read web storage. One XSS bug then leaks the token.
Fix: let the back end keep the session in an `httpOnly`, `Secure`, `SameSite` cookie, or keep the token in memory only.

### T2 - UI role gating is cosmetic
Flag a change that hides a button, route, or field by role or permission when the matching API call has no server-side check in scope or in the documented back end.
Fix: keep the UI gate for usability, and make sure the back end enforces the same rule. Report the back-end gap to the caller.

### T3 - CSRF protection for cookie-authenticated requests
Flag a state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) that relies on cookie authentication and sends no CSRF token (antiforgery header or the documented equivalent).
Do not flag: requests that authenticate only with a bearer token in the `Authorization` header.

### T4 - Auth headers only for the trusted API
Flag code that attaches an `Authorization` header, a token, or `credentials: "include"` to a URL that comes from data (API response, query string, user input) or that points to a host outside the configured API origins.
Fix: attach auth in the typed API client only, and only for the configured base URL. Use a plain request for other hosts.

## U - URLs and messaging

### U1 - Safe URL schemes in links and navigation
Flag a URL from data that goes into `href`, `src`, `window.location`, `window.open`, or router navigation without a scheme check.
Fix: allow only `http:`, `https:`, and relative URLs. Block `javascript:`, `data:`, and other schemes. Parse with `new URL(value, window.location.origin)` and check `protocol`.

### U2 - No open redirect
Flag a `returnUrl`, `redirect`, `next`, or similar parameter that the app follows without a same-origin check.
Fix: accept only relative paths that start with a single `/`, or parse the URL and compare its origin with `window.location.origin`. Fall back to a safe default route.

### U3 - postMessage origins are exact
Flag a `message` event listener that does not check `event.origin` against an allowlist before it uses `event.data`.
Flag a `postMessage` call with target origin `"*"`.
Fix: compare `event.origin` with the exact expected origins. Send with the exact origin of the receiver.

## D - DOM and code execution

### D1 - No raw HTML through refs
Flag `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` used on a ref or a DOM node with data that is not a constant.
Fix: render through React, set `textContent`, or pass the value through the documented sanitizer.

### D2 - No dynamic code execution
Flag `eval`, `new Function(...)`, and `setTimeout` or `setInterval` with a string argument.
Fix: use a function reference or a data-driven lookup.

### D3 - Rich text renderers do not render raw HTML
Flag a Markdown or rich-text renderer that renders raw HTML from content (for example a raw-HTML plugin or an allow-HTML option) without the documented sanitizer.
Fix: turn raw HTML off, or sanitize the output with the documented sanitizer and an allowlist.

### D4 - File previews do not become active content
Flag a preview of uploaded or downloaded SVG or HTML files that renders them as active content: a `blob:` or `data:` URL in an `iframe`, an `object`/`embed`, or inline SVG markup from the file.
Fix: show SVG through an `img` element, render a sanitized copy, or open the file as a download. If an `iframe` is necessary, use a separate origin and the `sandbox` attribute without `allow-scripts` and `allow-same-origin` together.

## H - App shell

### H1 - Content-Security-Policy for the app shell
Flag an app shell that has no Content-Security-Policy, or a policy with `unsafe-inline` or `unsafe-eval` in `script-src`, or a wildcard source for scripts.
Fix: set the policy as a response header in `reactHeadersConfig` (preferred) or a `meta` tag. Use nonces or hashes for inline scripts.

### H2 - Third-party scripts are pinned and controlled
Flag a third-party `script` or `link` from a CDN without an `integrity` attribute and `crossorigin`.
Flag a tag manager that is added without a documented owner and a documented list of what it may load.
Fix: add Subresource Integrity, or bundle the dependency. Keep tag-manager scope under change control.

### H3 - Security headers for the app shell
Flag an app shell response config that does not set `X-Content-Type-Options: nosniff`, a `Referrer-Policy` (for example `strict-origin-when-cross-origin`), and framing control (`frame-ancestors` in the CSP).
Fix: set the headers in `reactHeadersConfig`.
If no headers config is in the repository or the adapter, report a `check`, not a violation.

### H4 - Service workers do not cache private data
Flag a service worker that caches authenticated API responses or responses with user data.
Flag a service worker without a reliable update path (no `skipWaiting`/`clients.claim` strategy or no update prompt, as the project docs choose).
Fix: cache only static assets and public responses. Clear caches on sign-out.

## P - Supply chain

### P1 - Lockfile, install scripts, and audit
Flag any of these:
- A changed `package.json` dependency without the matching committed lockfile change.
- A new dependency with an install script (`preinstall`, `install`, `postinstall`) that the project docs do not approve.
- A new dependency that the dependency audit command reports with a known high or critical vulnerability.
Fix: commit the lockfile, remove or approve the install script, and pick a fixed version. Run the audit with `reactSecurityCommand` when it is configured.
