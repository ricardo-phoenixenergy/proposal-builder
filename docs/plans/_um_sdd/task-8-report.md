# Task 8 Report — POST /api/users/[id]/password

## TDD Evidence

### RED (failing)
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-password.test.ts`
Result: FAIL — "Failed to load url ../../app/api/users/[id]/password/route — Does the file exist?"
0 tests collected; suite-level error confirming the route did not exist.

### GREEN (passing)
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-password.test.ts`
Result: PASS — 4/4 tests in 248ms

Test names (all passing):
1. `POST /api/users/[id]/password > resets the password (200) and stores a verifiable hash`
2. `POST /api/users/[id]/password > 400s a short password`
3. `POST /api/users/[id]/password > 404s an unknown id`
4. `POST /api/users/[id]/password > 403s a non-admin`

### TypeScript check
Ran: `npx tsc --noEmit` from `apps/web/`
Result: PASS — no output (exit 0), no type errors.

## Files Changed

| Action | Path |
|--------|------|
| Created | `apps/web/src/__tests__/slice-12-users-password.test.ts` |
| Created | `apps/web/app/api/users/[id]/password/route.ts` |

## Self-Review

- Import depth verified: route is at `app/api/users/[id]/password/route.ts` — five `../` levels to reach `src/server/...` — correct.
- `hashPassword` is sync; called without `await` — consistent with how other routes use it.
- Password validation trims before checking length, matching the spec constraint (§ Global Constraints line 17).
- `setUserPassword` returns `boolean`; `false` → 404 as specified.
- `{ ok: true }` response never echoes the password back.
- `exactOptionalPropertyTypes` respected — no optional properties assigned conditionally.

## Concerns

None. The route is straightforward and fully mirrors the deprecate sub-route pattern.
