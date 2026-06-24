# Task 6 Report — `/api/folders` + `/api/folders/[id]` CRUD Routes

## TDD Evidence

### RED
Wrote `apps/web/src/__tests__/slice-14-folders-routes.test.ts` first.
Ran test before creating route files — **FAIL** (suite error: route module not found).

```
FAIL |web| apps/web/src/__tests__/slice-14-folders-routes.test.ts
Error: Failed to load url ../../app/api/folders/route
```

### GREEN
Implemented both route files, re-ran test — **PASS (2/2)**.

```
✓ |web| apps/web/src/__tests__/slice-14-folders-routes.test.ts (2 tests) 17ms
Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Files Changed

| Action | Path |
|--------|------|
| Created | `apps/web/src/__tests__/slice-14-folders-routes.test.ts` |
| Created | `apps/web/app/api/folders/route.ts` |
| Created | `apps/web/app/api/folders/[id]/route.ts` |

## Commit

SHA: `03ee77c`
Message: `feat(api): folders CRUD routes`
Branch: `feat/dashboard-folders`

## Concerns

None. Implementation is a verbatim copy of the spec-provided code. Import depths are correct (3 levels up for `route.ts`, 4 for `[id]/route.ts`). All status codes match spec: GET→200, POST→201/400, PATCH→200/400/404, DELETE→204/404, all 401 if no owner.
