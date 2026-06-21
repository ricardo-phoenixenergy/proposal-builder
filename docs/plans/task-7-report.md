# Task 7 Report — Admin session seam + `requireAdmin`

## Status

COMPLETE — all tests pass, typecheck exits 0.

## Files Changed

| Action | Path |
|--------|------|
| Created | `apps/web/src/__tests__/slice-11-admin-guard.test.ts` |
| Created | `apps/web/src/server/auth/sessionUser.ts` |
| Replaced | `apps/web/src/server/auth/owner.ts` |
| Modified | `apps/web/src/server/auth/guard.ts` |
| Modified | `apps/web/types/next-auth.d.ts` |

## Commands + Output Summaries

### Step 2 — Confirm test fails (before implementation)

```
npx vitest run apps/web/src/__tests__/slice-11-admin-guard.test.ts
```
Result: FAIL — `../server/auth/sessionUser` module not found. Confirmed correct failure mode.

### Step 6 — New test passes

```
npx vitest run apps/web/src/__tests__/slice-11-admin-guard.test.ts
```
Result: PASS — 4/4 tests.

### Step 7 — Regression check

```
npx vitest run apps/web/src/__tests__/slice-10-auth-routes.test.ts apps/web/src/__tests__/slice-08-routes.test.ts apps/web/src/__tests__/slice-09-export.test.ts apps/web/src/__tests__/slice-06-routes.test.ts apps/web/src/__tests__/slice-05-import.test.ts
```

| File | Tests |
|------|-------|
| slice-10-auth-routes.test.ts | 3/3 PASS |
| slice-08-routes.test.ts | 4/4 PASS |
| slice-09-export.test.ts | 3/3 PASS |
| slice-06-routes.test.ts | 4/4 PASS |
| slice-05-import.test.ts | 3/3 PASS |
| **Total** | **17/17 PASS** |

### Step 8 — Typecheck

```
npm run typecheck
```
Result: exit 0.

## Deviations

One deviation from the plan: `apps/web/types/next-auth.d.ts` was updated as part of Task 7 (not Task 8 as planned). The `fromNextAuth` function in `sessionUser.ts` accesses `session.user.isAdmin`, which requires `isAdmin` in the Session type augmentation. Without it, `npm run typecheck` fails with TS2339. Adding `isAdmin: boolean` to `Session.user` and `JWT` at this point is purely additive and does not break any existing code — it is the same change Task 8 prescribes. Task 8 still owns the `auth.ts`/`auth.config.ts` callback wiring.

## Concerns

None. The back-compat `setOwnerResolverForTests` wrapper correctly wraps any id-resolver as `{ id, isAdmin: false }`, so all 17 pre-existing tests that use it are unaffected.
