# Olko React Testing Examples

Example report:

```text
React test convention violations:
  1. src/api/userClient.test.ts:12 - test asserts a key is absent from package.json (source: olko-react-testing:What not to test)
  2. src/components/UserCard/UserCard.test.tsx:20 - component test mocks the React Query hook instead of MSW (source: olko-react-testing:Test doubles)
  3. src/hooks/useUserQuery.test.ts:8 - early return bypasses assertions when precondition not met (source: olko-react-testing:No silent pass)
```
