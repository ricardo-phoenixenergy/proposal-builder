# Task 9 Report — `client/users.ts` fetch module

## TDD Evidence

### RED phase
Wrote `apps/web/src/__tests__/slice-12-users-client.test.ts` verbatim from the brief.
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-client.test.ts`
Result: **FAIL** — `Error: Failed to load url ../client/users ... Does the file exist?`
(0 tests collected, 1 suite failed — confirmed the import does not resolve.)

### GREEN phase
Created `apps/web/src/client/users.ts` verbatim from the brief.
Ran: `npx vitest run apps/web/src/__tests__/slice-12-users-client.test.ts`
Result: **PASS — 5/5 tests passed** (29 ms)

### Typecheck
`npx tsc --noEmit` in `apps/web` — no output, exit 0. Zero type errors.
(`npm run typecheck -w @proposal/web` script does not exist in this workspace — tsc run directly instead.)

## Files Changed

| Action | Path |
|--------|------|
| Created | `apps/web/src/__tests__/slice-12-users-client.test.ts` |
| Created | `apps/web/src/client/users.ts` |

## Self-Review

- Exports exactly the four functions specified: `fetchUsers`, `createUser`, `updateUser`, `setUserPassword`.
- `import type { UserSummary }` is type-only — erased at build, no server runtime pulled into the client bundle.
- Error handling mirrors `sectionTypes.ts`: reads `body.error` first, falls back to a default string.
- `fetchUsers` uses a distinct fallback (`Failed to load users (${res.status})`) matching the sectionTypes pattern for GET failures.
- `setUserPassword` returns `Promise<void>` — does not expose the `{ ok: true }` payload, as specified.
- Extensionless imports throughout. TypeScript strict + exactOptionalPropertyTypes satisfied.

## Concerns

None. The implementation is a straightforward mirror of the existing `sectionTypes.ts` pattern with the endpoint URLs and shapes from the earlier API tasks. No ambiguities encountered.
