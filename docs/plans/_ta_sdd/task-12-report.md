# Task 12 Report — TemplateList + Dashboard Templates Panel + Page Wiring

## What changed

### Files created
- `apps/web/src/ui/admin/TemplateList.tsx` — client component mirroring `SectionTypeList`. Badges: built-in/authored, in use, locked, deprecated. Buttons: New template, Duplicate, Edit (disabled for built-in or in-use), Deprecate/Restore (hidden for built-ins). Opens `TemplateEditor` for create/edit flows.
- `apps/web/src/__tests__/slice-13-template-list.test.tsx` — TDD test covering badge and disabled-Edit assertions.

### Files modified
- `apps/web/src/ui/admin/AdminDashboard.tsx` — extended `Panel` type to `"section-types" | "users" | "templates"`; added `templates: Template[]` and `inUseTemplates: string[]` required props; added `tmpls` state; enabled Templates nav button (removed `disabled`); added three-way panel switch rendering `TemplateList` for the templates panel.
- `apps/web/app/admin/page.tsx` — added `getMergedTemplates` import; extended `Promise.all` to also await `getMergedTemplates()` and `getRepo().listInUseTemplateIds()`; passes `templates` and `inUseTemplates` down to `AdminDashboard`.
- `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` — added `templates={[]} inUseTemplates={[]}` to `AdminDashboard` render.
- `apps/web/src/__tests__/slice-12-admin-nav.test.tsx` — added `templates={[]} inUseTemplates={[]}` to `AdminDashboard` render.

## TDD evidence

1. Test written first: `slice-13-template-list.test.tsx`
2. Run before implementation → FAIL (module not found — `../ui/admin/TemplateList`)
3. `TemplateList.tsx` created, `AdminDashboard.tsx` and `page.tsx` updated
4. Targeted run: **3 passed** (slice-13-template-list, slice-11-admin-shell, slice-12-admin-nav)

## Full suite result

```
Test Files  61 passed (61)
Tests       256 passed (256)
Duration    12.85s
```

All 256 tests pass. No pre-existing failures.

## Typecheck result

Exit 0 — clean (`tsc --noEmit` over both `packages/shared` and `apps/web`).

## Build result

Clean build. Route manifest includes all three required new routes:
- `/api/templates`
- `/api/templates/[id]`
- `/api/templates/[id]/deprecate`

## Concerns

None. All verification gates passed cleanly.
