# Task 10 Report — UsersView Component

## TDD Evidence

### RED (before implementation)
Command: `npx vitest run apps/web/src/__tests__/slice-12-users-view.test.tsx`
Result: FAIL — `Failed to resolve import "../ui/admin/UsersView"` (file did not exist). 0 tests collected.

### GREEN (after implementation)
Command: `npx vitest run apps/web/src/__tests__/slice-12-users-view.test.tsx`
Result: PASS — 3/3 tests, 290ms

Test names:
1. `UsersView > lists accounts with role + status and locks the self row's Disable`
2. `UsersView > creates an account and prepends it`
3. `UsersView > toggles disable on another user via PATCH`

## TypeScript
`npx tsc --noEmit` (from `apps/web/`) — exit 0, no errors.
Note: `npm run typecheck -w @proposal/web` does not exist in package.json; tsc direct used instead.

## Files Changed
- **Created:** `apps/web/src/__tests__/slice-12-users-view.test.tsx` — 3 jsdom tests (verbatim from plan)
- **Created:** `apps/web/src/ui/admin/UsersView.tsx` — the `UsersView` component (verbatim from plan)

## Self-Review
- Component is a named export `UsersView({ currentUserId })` as specified.
- `"use client"` directive at top; extensionless imports; TypeScript strict.
- Guard logic matches spec: `lockDisable = !u.disabled && (isSelf || soleActiveAdmin)`; `lockDemote = u.isAdmin && (isSelf || soleActiveAdmin)`. Only Disable and Revoke-admin are ever locked; Enable and Make-admin are never locked.
- Markup conventions mirror `SectionTypeList.tsx`: `stlist`, `stlist__head`, `stlist__rows`, `stlist__row`, `stlist__main`, `stlist__label`, `stlist__key`, `stlist__tags`, `stlist__actions`, `tag`, `btn` classes.
- `data-user={u.id}` on each `<li>` for test selectors.
- `notify` from `useProposalStore` for success/error feedback.
- `createUser` response prepended to list state; `updateUser` PATCH response merges into list state.
- Loading state shows "Loading…" until fetch resolves.

## Concerns
- None. Component is verbatim from the plan. The `typecheck` script named in Global Constraints (line 24) does not exist in `apps/web/package.json`; ran `tsc --noEmit` directly with clean output.
