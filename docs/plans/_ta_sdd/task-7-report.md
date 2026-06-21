# Task 7 Report: `POST /api/templates/[id]/deprecate`

## Status
✅ COMPLETE — All tests pass (3/3), TypeScript strict mode clean.

## TDD Evidence

### RED (Test-First)
Created `apps/web/src/__tests__/slice-13-templates-deprecate.test.ts` with three test cases. Initial run failed as expected:
```
Error: Failed to load url ../../app/api/templates/[id]/deprecate/route (resolved id: ../../app/api/templates/[id]/deprecate/route)
```
Route module did not exist.

### GREEN (Implementation)
Implemented `apps/web/app/api/templates/[id]/deprecate/route.ts` following the spec exactly:
- Guard with `requireAdmin()` → 403 if non-admin
- Extract `id` from Next 15 async params
- Parse JSON body, extract `deprecated` boolean
- Call `getRepo().setTemplateDeprecated(id, deprecated)` → 404 if null
- Invalidate cache and return `200 { template: row }`

Final test run:
```
✓ |web| apps/web/src/__tests__/slice-13-templates-deprecate.test.ts (3 tests) 13ms
Test Files  1 passed (1)
Tests       3 passed (3)
```

### Test Names
1. `deprecates an authored template` — happy path, verifies deprecation persists
2. `404s an unknown id when not deprecating` — 404 for missing template
3. `403s a non-admin` — non-admin rejection

## Files Changed
- **Created:** `apps/web/app/api/templates/[id]/deprecate/route.ts` (24 LOC)
- **Created:** `apps/web/src/__tests__/slice-13-templates-deprecate.test.ts` (47 LOC)

## Verification
- ✅ `npx vitest run apps/web/src/__tests__/slice-13-templates-deprecate.test.ts` → 3/3 PASS
- ✅ `npm run typecheck` → 0 errors, TypeScript strict mode clean

## Concerns
None. Implementation is minimal, mirrors the section-type deprecate route exactly, and all constraints honored:
- Extensionless imports (tsconfig `moduleResolution: "bundler"`)
- Next 15 async params destructured correctly
- Auth guard pattern matches existing routes
- No git (no commit attempted)

## Next Step
Task 8: `GET /api/templates` — list (non-deprecated) templates for the picker UI.
