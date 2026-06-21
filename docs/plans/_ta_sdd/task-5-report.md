# Task 5 Report — Rewrite GET + POST /api/templates

## TDD Evidence

### RED (before rewrite)
Command: `npx vitest run apps/web/src/__tests__/slice-13-templates-get-post.test.ts`
Result: 5/5 FAIL
- Old route used `getRepo().listTemplates()` (removed method) in GET
- Old POST/PUT (`upsert`) had no admin guard, no validation via `validateTemplateDefinition`, no 409 duplicate check
- All 5 assertions failed as expected

### GREEN (after rewrite)
Command: `npx vitest run apps/web/src/__tests__/slice-13-templates-get-post.test.ts`
Result: 5/5 PASS
```
✓ GET /api/templates > lists built-ins for any authed user
✓ POST /api/templates > 403s a non-admin
✓ POST /api/templates > creates a valid template
✓ POST /api/templates > 400s an invalid template
✓ POST /api/templates > 409s a duplicate id (built-in or existing authored)
Duration: 1.64s
```

## Typecheck Result
Command: `npm run typecheck`
Exit: 0 (clean — no errors across packages/shared + apps/web)

## Files Changed

| File | Action |
|---|---|
| `apps/web/app/api/templates/route.ts` | Rewritten (replaced entirely) |
| `apps/web/src/__tests__/slice-13-templates-get-post.test.ts` | Created (new test file) |

## Summary of Changes

**Old route** (`apps/web/app/api/templates/route.ts`):
- GET used `getRepo().listTemplates()` — a removed repo method
- POST/PUT: single `upsert` handler, `requireOwner` (not admin), no schema validation, no duplicate check, wrong signature for `upsertTemplate`

**New route**:
- GET: `requireOwner` (any authed) → `getMergedTemplates()` → `200 { templates }`
- POST: `requireAdmin` → parse body → `validateTemplateDefinition(def, { sectionTypes, themeIds })` → 400 if invalid → 409 if id already exists in merged set → `upsertTemplate({ id, template, deprecated: false })` → `invalidateActiveTemplates()` → `201 { template: row.template }`
- Removed the old `PUT` export and `upsert` function entirely

## Self-Review

- Auth guards follow the `const x = await require…(); if (x instanceof Response) return x;` pattern from `guard.ts` — correct.
- `validateTemplateDefinition` receives full context (`sectionTypes` from `getMergedSectionTypes()`, `themeIds` from `themes.map(t => t.id)`) — matches spec.
- 409 check uses `getMergedTemplates()` (not just DB rows) so built-in ids are also blocked — correct per spec.
- Cache invalidated after successful upsert — correct.
- TypeScript strict + `exactOptionalPropertyTypes` satisfied: `upsertTemplate` called with `{ id, template, deprecated: false }` — all required fields present, no optional property assigned undefined.
- No `.js` extensions on imports.

## Concerns

None. The old `PUT` export is removed; if any client code depended on `PUT /api/templates` it will 405. No existing tests referenced it, and the plan specifies this rewrite explicitly.
