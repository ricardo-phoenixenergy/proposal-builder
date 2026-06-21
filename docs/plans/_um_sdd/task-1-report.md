# Task 1 Report — Repo types + in-memory user-management methods

**Date:** 2026-06-18
**Plan:** `docs/plans/2026-06-18-builder-user-management.md`, Task 1 (lines 28–283)

---

## What was implemented

### Files modified

1. **`apps/web/src/server/repo/types.ts`**
   - Added `disabled: boolean` to `StoredUser`.
   - Added `UserSummary` interface (id, email, isAdmin, disabled, createdAt — no passwordHash).
   - Added `DuplicateEmailError extends Error` class with `name` set and descriptive message.
   - Replaced the single Auth block in `Repository` with:
     - `getUserById(id: string): Promise<StoredUser | null>` (new)
     - `createUser` annotated with `@throws DuplicateEmailError`
     - Five new user-management methods: `listUsers`, `setUserDisabled`, `setUserAdmin`, `setUserPassword`, `countActiveAdmins`

2. **`apps/web/src/server/repo/memory.ts`**
   - Added `UserSummary` to the type import block and `DuplicateEmailError` as a value import.
   - Added `toSummary(u: StoredUser): UserSummary` helper at the top of the file (after `clone`).
   - Updated `createUser` to: normalize email, check for duplicate via `users.has`, throw `DuplicateEmailError` on conflict, set `disabled: false` on the stored object.
   - Added `getUserById` (linear scan over `users.values()` — keyed by email, not id).
   - Added `listUsers` (sorted ascending by `createdAt`, mapped through `toSummary`).
   - Added `setUserDisabled` / `setUserAdmin` (find by id, spread-update, write back under same email key, return summary or null).
   - Added `setUserPassword` (find by id, spread-update, return boolean).
   - Added `countActiveAdmins` (count `isAdmin && !disabled`).

3. **`apps/web/src/__tests__/slice-12-users-repo.test.ts`** (created)
   - Verbatim test from plan lines 50–107.
   - `// @vitest-environment node` header.
   - 5 test cases covering: ordered list without passwordHash, duplicate-email rejection, toggle disabled/admin with null-for-unknown, password update, active-admin count.

---

## TDD Evidence

### RED — Step 2

Command:
```
npm run test -- run "apps/web/src/__tests__/slice-12-users-repo.test.ts"
```

Output (selected):
```
FAIL |web| apps/web/src/__tests__/slice-12-users-repo.test.ts
  TypeError: repo.setUserDisabled is not a function
  TypeError: repo.setUserPassword is not a function
Test Files  1 failed (1)
      Tests  5 failed (5)
```

Why expected: `DuplicateEmailError` did not exist, none of the new `Repository` methods existed in either the interface or the in-memory implementation.

### GREEN — Step 5

Command:
```
npm run test -- run "apps/web/src/__tests__/slice-12-users-repo.test.ts"
```

Output:
```
✓ |web| apps/web/src/__tests__/slice-12-users-repo.test.ts (5 tests) 37ms
Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  1.18s
```

---

## Step 6 — Typecheck (expected interim failure)

Command: `npm run typecheck`

Result: **FAIL** (exit code 2) — two errors in `apps/web/src/server/repo/postgres.ts`:

```
postgres.ts(111,11): error TS2322: Property 'disabled' is missing in type returned by getUserByEmail
postgres.ts(118,11): error TS2322: Property 'disabled' is missing in type returned by createUser
```

Both errors arise because `postgres.ts` returns rows from the DB schema which does not yet have the `disabled` column, and does not implement the five new `Repository` methods. **This is the expected interim state** as documented in the plan's Step 6 and the task brief. Task 2 resolves it by adding the `disabled` column to the Drizzle schema and implementing the new methods in `postgres.ts`.

The `packages/shared` typecheck passes cleanly (no errors).

---

## Self-review findings

- All code matches plan verbatim — no improvisation.
- `exactOptionalPropertyTypes` is safe: all new fields are required (not optional), so no inadvertent `undefined` assignments.
- `toSummary` is a module-level const (not inside `createMemoryRepo`) which is correct — it's a pure function with no closure over mutable state.
- The `users` Map is keyed by normalized email; id-based lookups scan `users.values()`. This is O(n) but acceptable for small N (admin tool, not hot path).
- No new dependencies were added.
- Module imports are extensionless throughout.

---

## Concerns

None beyond the documented interim postgres.ts typecheck failure, which is intentional and expected.
