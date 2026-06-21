# Task 6 Report — PUT /api/templates/[id]

## TDD Evidence

### RED (failing)
```
FAIL |web| apps/web/src/__tests__/slice-13-templates-put.test.ts
Error: Failed to load url ../../app/api/templates/[id]/route ... Does the file exist?
Test Files: 1 failed (1) | Tests: no tests
```

### GREEN (passing — 4/4)
```
✓ |web| apps/web/src/__tests__/slice-13-templates-put.test.ts (4 tests) 15ms
Test Files: 1 passed (1) | Tests: 4 passed (4)
```

### Test names (all 4)
1. `PUT /api/templates/[id] > edits an authored, not-in-use template`
2. `PUT /api/templates/[id] > 409s a built-in template`
3. `PUT /api/templates/[id] > 409s a template that is in use`
4. `PUT /api/templates/[id] > 404s an unknown authored id`

## Files Changed
- **Created:** `apps/web/app/api/templates/[id]/route.ts` — PUT handler
- **Created:** `apps/web/src/__tests__/slice-13-templates-put.test.ts` — test file

## Self-Review
- Guard order matches brief: requireAdmin → built-in check (409) → find authored row (404) → in-use check (409) → validate (400) → upsert preserving `existing.deprecated` → invalidate → 200.
- `id` immutability enforced: path `id` overrides any `id` in body on upsert.
- `exactOptionalPropertyTypes` safe: `deprecated: existing.deprecated` is always `boolean` from the row.
- Extensionless imports throughout; no `.js` suffixes.
- `invalidateActiveTemplates()` called after successful upsert only.

## Concerns
None. Implementation is a straightforward mirror of the section-type PUT handler as specified.
