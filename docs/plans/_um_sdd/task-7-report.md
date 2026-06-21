# Task 7 Report — PATCH /api/users/[id]

## TDD Evidence

### RED (route not yet created)
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-patch.test.ts`
Result: **FAIL** — "Failed to load url ../../app/api/users/[id]/route … Does the file exist?"

### GREEN (after implementation)
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-patch.test.ts`
Result: **6/6 PASS** in 17ms

Test names (all passing):
1. disables and re-enables another user
2. promotes and demotes another user
3. 400s an empty change body
4. 404s an unknown id
5. 409s disabling your own account (self-lockout)
6. 409s demoting the only active admin

### Typecheck
Ran: `npx tsc --noEmit` from `apps/web/`
Result: **clean** (no output, exit 0)

## Files Changed

- **Created:** `apps/web/src/__tests__/slice-12-users-patch.test.ts` — verbatim from plan Task 7
- **Created:** `apps/web/app/api/users/[id]/route.ts` — verbatim from plan Task 7

## Self-Review

- `change` object is built with `typeof === "boolean"` guards — exactOptionalPropertyTypes-safe; no undefined properties are assigned.
- `assertCanModify` is called BEFORE any setter; `GuardError` is caught and mapped to 409, other errors are rethrown.
- `setUserAdmin` then `setUserDisabled` applied in that order so the final `summary` reflects both; null summary → 404.
- 400 returned when neither `disabled` nor `isAdmin` is a boolean in the body.
- Dynamic route context typed as `{ params: Promise<{ id: string }> }` — mirrors Next 15 async params pattern from `section-types/[type]/route.ts`.
- Imports are extensionless as required.

## Concerns

None. The implementation is a straightforward application of existing interfaces (`requireAdmin`, `assertCanModify`/`GuardError`, `getRepo().setUserAdmin`/`setUserDisabled`). All guard logic is delegated to `userGuards.ts` (built in Task 5), keeping the route handler thin.
