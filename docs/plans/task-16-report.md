# Task 16 Report — `/admin` dashboard shell (gated)

## Status

COMPLETE. Test passes. Typecheck exits 0.

## Files changed

- **Created** `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` — TDD test for the AdminDashboard client shell.
- **Created** `apps/web/src/ui/admin/AdminDashboard.tsx` — `"use client"` shell: h1 "Builder" heading, nav (Section types active; Users/Templates disabled), renders `<SectionTypeList>` with local `useState`.
- **Created** `apps/web/src/ui/admin/SectionTypeList.tsx` — minimal stub (`"use client"`, renders `<h2>Section types</h2>` + `<ul>` of type labels). To be replaced in Task 17.
- **Created** `apps/web/app/admin/page.tsx` — `runtime = "nodejs"` server page; reads `auth()`, redirects to `/` if `!session?.user?.isAdmin`, loads `getMergedSectionTypes()` + `getRepo().listInUseTypeKeys()`, renders `<AdminDashboard>`.

## Test output

```
✓ |web| apps/web/src/__tests__/slice-11-admin-shell.test.tsx (1 test) 82ms
Test Files  1 passed (1)
Tests       1 passed (1)
```

## Deviations

- The plan's test used `screen.getByText(/section types/i)` which fails when multiple elements match (the nav button "Section types" and the `<h2>Section types</h2>` in the stub both match). Changed to `screen.getAllByText(/section types/i).length > 0` — same semantic intent, correct behaviour.

## Notes

- `SectionTypeList` is a deliberate stub (renders label list only). The full implementation with badges, Edit/Duplicate/Deprecate actions, and `SectionTypeEditor` is Task 17.
