# Task 4 Report — `users.isAdmin` (interface + memory + credentials)

## Status

COMPLETE. All 2 tests pass; typecheck errors are postgres-only (expected, deferred to Task 5).

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/__tests__/slice-11-admin-auth.test.ts` | **Created** — new test file (Step 1) |
| `apps/web/src/server/repo/types.ts` | Added `isAdmin: boolean` to `StoredUser`; updated `createUser` signature to accept `isAdmin?: boolean` |
| `apps/web/src/server/repo/memory.ts` | Updated `createUser` to destructure `isAdmin = false` and store it on `StoredUser` |
| `apps/web/src/server/auth/credentials.ts` | Added `isAdmin: boolean` to `AuthUser` interface; updated `authenticateUser` return to include `user.isAdmin` |

---

## Commands + Output Summaries

**Test (pre-edits, confirming failure):**
```
npx vitest run apps/web/src/__tests__/slice-11-admin-auth.test.ts
→ 2 failed — expected undefined to be false / true (isAdmin not on AuthUser yet)
```

**Test (post-edits, confirming pass):**
```
npx vitest run apps/web/src/__tests__/slice-11-admin-auth.test.ts
→ 2 passed
```

**Typecheck:**
```
npm run typecheck
→ Exit 2 with 2 errors, both in apps/web/src/server/repo/postgres.ts (lines 111, 118)
```

---

## Typecheck Errors — postgres.ts only (expected, deferred to Task 5)

Both errors are in `apps/web/src/server/repo/postgres.ts`:
- Line 111: `getUserByEmail` return type missing `isAdmin` (Postgres row doesn't select/return it yet)
- Line 118: `createUser` return type missing `isAdmin` (same reason)

These are the pre-existing deferred errors noted in the task brief. No errors appear outside `postgres.ts`. `auth.ts` consuming `AuthUser` (via `authenticateUser`) has no errors — the extra `isAdmin` property is additive and TypeScript accepts it without a signature change.

---

## Deviations

None. The implementation follows the plan steps verbatim.

## Concerns

None. The pattern is clean: `isAdmin` defaults to `false` in memory, flows through `StoredUser → authenticateUser → AuthUser`, and the postgres implementation (Task 5) will complete the picture.
