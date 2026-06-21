# Task 19 — Report

## Status

COMPLETE — all steps executed successfully.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/App.tsx` | Added `import { useEffect } from "react"` and mount effect calling `void loadSectionTypes()` |
| `apps/web/app/globals.css` | Appended `.outline__add`, `.admin`, `.admin__bar`, `.admin__title`, `.admin__body`, `.admin__nav`, `.admin__navitem`, `.admin__main`, `.stlist__*`, `.steditor*` styles |
| `apps/web/.env.local.example` | Updated accounts comment to mention `--admin` bootstrap flag |
| `apps/web/src/__tests__/slice-03-static.test.tsx` | Added `vi.stubGlobal("fetch", ...)` in `beforeEach` + merged `afterEach` to restore globals and cleanup |
| `apps/web/src/__tests__/slice-07-frontend.test.tsx` | Same fetch stub pattern — both files render `<App/>` which now calls `loadSectionTypes` on mount |

## Test Suite Result

```
Test Files  40 passed (40)
Tests       179 passed (179)
Duration    10.80s
```

All 40 test files, 179 tests pass.

## Typecheck Result

```
npm run typecheck → exit 0
```

No errors.

## Build Result

```
npm run build -w @proposal/web → success (compiled successfully in 18.0s)
```

Route table (relevant routes):

```
ƒ /admin                                   3.88 kB         270 kB
ƒ /api/section-types                         161 B         103 kB
ƒ /api/section-types/[type]                  161 B         103 kB
ƒ /api/section-types/[type]/deprecate        161 B         103 kB
ƒ Middleware                              87.4 kB
```

Two pre-existing Edge Runtime warnings from `jose`/`next-auth` (CompressionStream / DecompressionStream) — these were present before Task 19 and are unrelated to this change.

## Tests Adjusted and Why

Two test files were adjusted:

- `apps/web/src/__tests__/slice-03-static.test.tsx`
- `apps/web/src/__tests__/slice-07-frontend.test.tsx`

**Why:** Both render `<App/>` in jsdom. The new mount `useEffect` calls `loadSectionTypes()` → `fetchSectionTypes()` → `fetch("/api/section-types")`. jsdom has no real `fetch`, so without a stub the tests would throw. The fix is minimal: `vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ sectionTypes: [] }) }))` in `beforeEach`, with `vi.unstubAllGlobals()` in `afterEach`. The stub resolves with an empty array — no section types are loaded, matching previous behaviour.

## Deviations

None. All steps followed verbatim.

## Concerns

None. The two Edge Runtime warnings from `jose`/`next-auth` are a pre-existing upstream issue (they appeared in builds before this task) and do not block deployment.
