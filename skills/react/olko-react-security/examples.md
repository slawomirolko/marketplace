# Olko React Security Examples

Example report:

```text
React security violations (12/12 rules checked):
  1. T1 src/auth/session.ts:31 - access token written to localStorage (source: olko-react-security:T1)
  2. U2 src/pages/LoginPage/LoginPage.tsx:48 - returnUrl followed without same-origin check (source: olko-react-security:U2)
  3. U3 src/lib/embedBridge.ts:12 - message listener uses event.data without checking event.origin (source: olko-react-security:U3)
Checks:
  1. H3 index.html:1 - no response header config in repository; nosniff, Referrer-Policy, frame-ancestors not verifiable (source: olko-react-security:H3)
```

Clean report:

```text
No React security violations found (8/8 rules checked).
```
