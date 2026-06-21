# Task 3 Report: `authenticateUser` rejects disabled accounts

## Summary
Task 3 successfully implemented the disabled-account guard in the authentication flow. Disabled accounts are now rejected at sign-in, even with the correct password.

## TDD Evidence

### RED (Failing Test)
Command:
```bash
npx vitest run apps/web/src/__tests__/slice-12-auth-disabled.test.ts
```

Output (truncated):
```
❯ authenticateUser — disabled accounts > rejects a disabled account even with the correct password
  → expected { id: 'user_b887ebb2', …(2) } to be null

AssertionError: expected { id: 'user_b887ebb2', …(2) } to be null

- Expected: 
null

+ Received: 
Object {
  "email": "a@x.test",
  "id": "user_b887ebb2",
  "isAdmin": false,
}

Test Files 1 failed (1)
Tests 1 failed | 1 passed (2)
```

**Why it failed:** The disabled user authenticated and returned a principal object because `authenticateUser` had no guard to reject disabled accounts. The password was correct, so it passed the `verifyPassword` check and returned the user object.

### GREEN (Passing Test)
Command:
```bash
npx vitest run apps/web/src/__tests__/slice-12-auth-disabled.test.ts
```

Output:
```
✓ apps/web/src/__tests__/slice-12-auth-disabled.test.ts (2 tests) 274ms

Test Files 1 passed (1)
Tests 2 passed (2)
Duration 875ms
```

**Why it passes:** After adding the disabled-account guard, both tests pass:
1. "rejects a disabled account even with the correct password" — disabled user returns `null`
2. "still authenticates an enabled account" — enabled user authenticates normally

## Files Changed

1. **Created:** `apps/web/src/__tests__/slice-12-auth-disabled.test.ts`
   - Hermetic test using in-memory repo
   - Two test cases: disabled rejection and enabled acceptance
   - Node environment (headless tests)

2. **Modified:** `apps/web/src/server/auth/credentials.ts`
   - Added one line after the password verification check:
   ```typescript
   if (user.disabled) return null; // disabled accounts cannot sign in (§B)
   ```
   - Placed immediately before the return statement
   - No other changes to the function

## Type Safety
Typecheck passed without errors:
```bash
npm run typecheck
```
Output: (no output — clean)

## Concerns
None. The implementation is straightforward, matches the spec exactly, and both tests + typecheck are passing.

## Checkpoint Status
✅ All checks pass:
- Test file: 2/2 tests passing
- Typecheck: no errors
- No git needed (per global constraints, checkpoints are test-based)

Ready to move to Task 4.
