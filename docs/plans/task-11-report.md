# Task 11 Report — `PUT /api/section-types/[type]`

## Status
COMPLETE

## Files Changed
- **Created:** `apps/web/src/__tests__/slice-11-section-types-put.test.ts` — 4 test cases
- **Created:** `apps/web/app/api/section-types/[type]/route.ts` — PUT handler

## Test Output
```
✓ |web| apps/web/src/__tests__/slice-11-section-types-put.test.ts (4 tests) 43ms

Test Files  1 passed (1)
      Tests  4 passed (4)
```

All 4 cases pass:
1. 200 — edits a not-in-use authored type (label change persisted)
2. 409 — editing a built-in (`text`)
3. 409 — editing an in-use authored type (a proposal references it)
4. 404 — unknown authored type

## Typecheck
`npm run typecheck` exits 0 (both `packages/shared` and `apps/web`).

## Deviations
None. Implementation follows the plan's Step 3 verbatim. Order of checks: `requireAdmin` → built-in 409 → 404 (no row with definition) → in-use 409 → validate body → upsert preserving `deprecated` and locking `type` key → `invalidateActiveRegistry` → 200.

## Concerns
None.
