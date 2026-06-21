# Task 12 Report — `POST /api/section-types/[type]/deprecate`

## Status
COMPLETE — all steps passed.

## Files Changed
- **Created** `apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts` — 4-case test suite (Step 1)
- **Created** `apps/web/app/api/section-types/[type]/deprecate/route.ts` — POST handler (Step 3)

## Test Output
```
✓ |web| apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts (4 tests) 11ms
Test Files  1 passed (1)
Tests       4 passed (4)
```

## Typecheck
`npm run typecheck` — exit 0 (no errors).

## Deviations
None. Implementation follows the plan's Step 3 verbatim.

## Concerns
None. The route is straightforward: `requireAdmin` → parse body → `setSectionTypeDeprecated` → 404 if null → `invalidateActiveRegistry` → 200.
