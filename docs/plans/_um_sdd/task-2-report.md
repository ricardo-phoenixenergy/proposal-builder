# Task 2 Report — Postgres parity: `disabled` column, migration, repo methods

**Date:** 2026-06-18

---

## What was implemented

### Step 1 — Schema change (`apps/web/src/server/db/schema.ts`)
Added `disabled: boolean("disabled").notNull().default(false)` to the `users` table definition, matching the plan's verbatim code.

### Step 2 — Migration generated (`apps/web/drizzle/0003_fixed_morgan_stark.sql`)
Ran `npm run db:generate -w @proposal/web`. Drizzle-kit diffed the schema snapshot and emitted a new migration. The generated SQL file is non-interactive and non-destructive.

**Migration filename:** `0003_fixed_morgan_stark.sql`

**Exact SQL contents:**
```sql
ALTER TABLE "users" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;
```

Only a single `ADD COLUMN` statement — no drops, truncations, or other destructive operations.

### Step 3 — Postgres repo methods (`apps/web/src/server/repo/postgres.ts`)
Changes applied verbatim from the plan:

1. **Imports updated:** `and` added to drizzle-orm imports; `UserSummary` added to type import; `DuplicateEmailError` added as a value import.
2. **`toUserSummary` helper added** (after `toStored`): maps a `UserRow` (`typeof users.$inferSelect`) to `UserSummary`, including the new `disabled` field.
3. **`getUserByEmail` updated:** return value now includes `disabled: row.disabled`.
4. **`createUser` replaced:** wrapped in try/catch; catches Postgres error code `23505` and re-throws as `DuplicateEmailError`; return value includes `disabled: row!.disabled`.
5. **New methods added:**
   - `getUserById(id)` — select by primary key, return `StoredUser | null` with `disabled`.
   - `listUsers()` — select all rows ordered by `createdAt`, map via `toUserSummary`.
   - `setUserDisabled(id, disabled)` — update + returning, map via `toUserSummary` or null.
   - `setUserAdmin(id, isAdmin)` — update + returning, map via `toUserSummary` or null.
   - `setUserPassword(id, passwordHash)` — update + returning, return `rows.length > 0`.
   - `countActiveAdmins()` — select rows where `isAdmin = true AND disabled = false`, return `rows.length`.

---

## Typecheck result

```
npm run typecheck  (repo root)
Exit code: 0
```

Both `packages/shared` and `apps/web` pass `tsc --noEmit`. The Postgres repo now fully satisfies the `Repository` interface.

---

## Regression test result

```
npx vitest run apps/web/src/__tests__/slice-12-users-repo.test.ts
Test Files: 1 passed (1)
Tests:      5 passed (5)
Duration:   ~738ms
```

All 5 tests green. Task 1's in-memory implementation is unaffected.

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/server/db/schema.ts` | Added `disabled` column to `users` table |
| `apps/web/src/server/repo/postgres.ts` | Updated imports, added `toUserSummary`, updated `getUserByEmail`/`createUser`, added 6 new repo methods |
| `apps/web/drizzle/0003_fixed_morgan_stark.sql` | Generated migration (ADD COLUMN only) |
| `apps/web/drizzle/meta/0003_snapshot.json` | Generated snapshot (drizzle-kit auto-created) |
| `apps/web/drizzle/meta/_journal.json` | Updated by drizzle-kit to include entry idx 3 |

---

## Self-review findings

- All code follows the plan verbatim. No deviations.
- `exactOptionalPropertyTypes` compliance: no optional properties conditionally assigned; all returned objects always include `disabled`.
- `and` operator is used correctly in `countActiveAdmins` to compose two equality predicates.
- `toUserSummary` is a module-level function (not inside the returned object), keeping it reusable across the four methods that need it.
- The `disabled` default (`false`) in both the schema and the Drizzle insert means existing rows created before the migration will get `false` upon `ALTER TABLE` — correct behavior.
- `desc` and `sql` remain imported (used by `listVersions` and `listInUseTypeKeys` respectively) — no unused import issues.

## Concerns

None. The migration is additive-only, typecheck is clean, and the regression test passes.
