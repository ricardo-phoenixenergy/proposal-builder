# Task 6 Report — GET + POST /api/users

## TDD Evidence

### RED (failing test)
- Wrote `apps/web/src/__tests__/slice-12-users-route.test.ts` verbatim from the plan.
- Ran `npx vitest run apps/web/src/__tests__/slice-12-users-route.test.ts`.
- Result: **FAIL** — `Failed to load url ../../app/api/users/route … Does the file exist?` (0 tests collected, 1 suite failed). Confirmed RED.

### GREEN (passing tests)
- Created `apps/web/app/api/users/route.ts` per plan spec.
- Ran same command again.
- Result: **PASS — 5/5 tests** (230 ms).
- Typecheck (`npx tsc --noEmit` from `apps/web`): **0 errors**.

## Files Changed

| Action | Path |
|--------|------|
| Created (test) | `apps/web/src/__tests__/slice-12-users-route.test.ts` |
| Created (route) | `apps/web/app/api/users/route.ts` |

## Implementation Notes

- `GET` calls `requireAdmin()`, returns its `Response` on 401/403, otherwise returns `{ users: await getRepo().listUsers() }`. `listUsers()` already returns `UserSummary[]` (no `passwordHash`).
- `POST` guards with `requireAdmin()`, validates email via `isValidEmail`, validates password length (≥ 8 after trim), calls `hashPassword`, builds an explicit `UserSummary` from the returned `StoredUser` before responding — `passwordHash` is never included in the 201 body.
- `DuplicateEmailError` is caught and mapped to 409. All other errors are re-thrown.
- Email is trimmed before `isValidEmail` and passed trimmed to `createUser`; the repo normalises further to lowercase.
- `isAdmin` defaults to `false` if absent or not exactly `true` — satisfies `exactOptionalPropertyTypes`.

## Self-Review

- Route mirrors the guard → validate → mutate → respond pattern of `section-types/route.ts`.
- No `passwordHash` leak: `listUsers()` returns summaries, and POST builds an explicit `UserSummary`.
- Password minimum applied on `password.trim().length`, consistent with spec §E.
- Imports are extensionless (no `.js`).
- TypeScript strict passes without suppression.

## Concerns

None. All five test cases pass cleanly; the implementation is a straight application of existing helpers.
