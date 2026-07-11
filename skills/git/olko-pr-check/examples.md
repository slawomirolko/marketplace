# Olko PR Check

## Status Block

```text
PR #42: fix checkout totals
Branch: fix/checkout-totals -> main
URL: https://github.com/acme/shop/pull/42

CI/CD: RED
  failing:
    - test - https://github.com/acme/shop/actions/runs/123

Review findings:
  2 actionable, 1 questions, 1 nits, 3 info
  1. [actionable] src/cart.ts:L87 - null total path. add guard.
  2. [actionable] tests/cart.test.ts:L41 - missing regression. add discounted-total case.
  3. [question] reviewer:alex - confirm rounding rule for half cents.
  4. [nit] src/cart.ts:L12 - name vague. rename helper.
```

## Fix Menu Shape

```text
Fix which findings?
- All actionable
- src/cart.ts:L87 null total path [reviewer:alex]
- tests/cart.test.ts:L41 missing regression [bot:opencode]
- All nits
- Questions only - answer them
- Nothing - just report
```

## Report Lines

```text
fixed: src/cart.ts:L87 - null total guard.
skipped: src/cart.ts:L12 - nit conflicts with project naming rule.
```

## Useful Commands

```powershell
gh pr view --json number,state,headRefName
gh pr checks <num> --json bucket,name,state,workflow,link,completedAt,event
gh api repos/{owner}/{repo}/pulls/<num>/comments --paginate
gh api repos/{owner}/{repo}/issues/<num>/comments --paginate
gh api repos/{owner}/{repo}/pulls/<num>/reviews --paginate
```
