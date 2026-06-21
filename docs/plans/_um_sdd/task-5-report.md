# Task 5 Report — `assertCanModify` guard helper

## TDD Evidence

### RED phase
Command: `npx vitest run apps/web/src/__tests__/slice-12-user-guards.test.ts`
Result: FAIL — `Error: Failed to load url ../server/auth/userGuards ... Does the file exist?`
0 tests collected, 1 suite failed (module not found — expected).

### GREEN phase
Command: `npx vitest run apps/web/src/__tests__/slice-12-user-guards.test.ts`
Result: PASS — 7/7 tests passed in 8ms.

### Test names (all 7 passing)
1. assertCanModify > blocks disabling your own account
2. assertCanModify > blocks demoting your own account
3. assertCanModify > blocks disabling the only active admin
4. assertCanModify > blocks demoting the only active admin
5. assertCanModify > allows disabling an admin when another active admin remains
6. assertCanModify > allows enabling/promoting freely (never reduces active admins)
7. assertCanModify > does not throw for an unknown target id (route handles 404)

### Typecheck
Command: `npx tsc --noEmit` (from `apps/web`)
Result: PASS — no output, exit 0.

## Files Changed

- **Created:** `apps/web/src/server/auth/userGuards.ts` — exports `GuardError` (extends Error) and `assertCanModify`
- **Created:** `apps/web/src/__tests__/slice-12-user-guards.test.ts` — 7 hermetic tests using `createMemoryRepo` + `setRepoForTests`

## Implementation Notes

- Self-lockout guard fires first (before any DB lookup) — avoids unnecessary async work.
- `removesActiveAdmin` condition matches the spec precisely: `target.isAdmin && !target.disabled && (change.isAdmin === false || change.disabled === true)`.
- Last-admin check only triggers when `removesActiveAdmin && countActiveAdmins() <= 1`.
- Unknown target id returns silently (`if (!target) return`) — the route's setter null return handles 404.
- No extra guards added beyond the two specified in the brief.
- TypeScript strict + exactOptionalPropertyTypes satisfied; extensionless imports used throughout.

## Self-Review

- Logic matches the spec's conditions exactly.
- The `GuardError` class correctly sets `this.name` for `instanceof` checks to work across module boundaries.
- Tests are hermetic: fresh memory repo per test via `beforeEach`/`afterEach`.
- No dependencies added.

## Concerns

None. The implementation is straightforward and all edge cases are covered by the provided test suite.
