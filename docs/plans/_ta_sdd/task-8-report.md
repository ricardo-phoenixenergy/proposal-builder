# Task 8: Client — `client/templates.ts` — TDD Report

## Status
✓ COMPLETE. All 5 tests passing, TypeScript strict mode clean.

## TDD Evidence

### RED (Test Failure)
```
npx vitest run apps/web/src/__tests__/slice-13-templates-client.test.ts
→ Failed to load url ../client/templates (resolved id: ../client/templates)
  Does the file exist?
```

### GREEN (Implementation + Test Pass)
```
✓ |web| apps/web/src/__tests__/slice-13-templates-client.test.ts (5 tests) 26ms

Test Files  1 passed (1)
      Tests  5 passed (5)
```

### TypeCheck
```
npm run typecheck
→ [no errors]
```

## Files Changed

1. **Created:** `apps/web/src/client/templates.ts`
   - Four exports: `fetchTemplates()`, `createTemplate()`, `updateTemplate()`, `setTemplateDeprecated()`
   - Mirrors `apps/web/src/client/sectionTypes.ts` error handling pattern
   - Imports `Template` from `@proposal/shared`
   - All functions properly typed, extensionless imports

2. **Created:** `apps/web/src/__tests__/slice-13-templates-client.test.ts`
   - 5 tests covering all four API functions
   - Mocked `global.fetch` via vitest
   - Tests verify correct HTTP method, endpoint, and error handling
   - Node environment (`@vitest-environment node`)

## Test Summary

| Test | Purpose | Status |
|------|---------|--------|
| `fetchTemplates unwraps { templates }` | Unwrap response body | ✓ |
| `createTemplate POSTs to /api/templates` | POST method + endpoint | ✓ |
| `updateTemplate PUTs to /api/templates/:id` | PUT method + endpoint | ✓ |
| `setTemplateDeprecated POSTs to the deprecate sub-route` | POST to deprecate endpoint | ✓ |
| `throws the server error message on failure` | Error propagation | ✓ |

## Concerns
None. Implementation follows the brief exactly, mirrors the existing `sectionTypes.ts` pattern, and all tests pass with clean TypeScript.

## Readiness
Ready for next slice task. This module is ready for integration with the admin store and Router Handler (slice 14).
