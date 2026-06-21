# Task 13: Bootstrap — `create-user.mjs --admin` — Report

## Summary
✓ Completed: Added `--admin` flag support to the bootstrap CLI script, allowing creation of admin accounts.

## Changes Made

### 1. Argv Parsing Update (lines 14-18)
Replaced simple positional arg destructuring with flag-aware parsing:
- Extracts `--admin` flag from any position in args
- Filters it out to isolate the two positional args (email, password)
- Updated usage message to show `[--admin]` as optional

### 2. INSERT Statement Update (line 31 + 32)
- Added `is_admin` column to INSERT VALUES
- Updated success message to conditionally show "admin " prefix when `isAdmin` is true

## Verification

### Flag Parsing Check ✓
```
$ node apps/web/scripts/create-user.mjs --admin
Usage: npm run user:create -w @proposal/web -- [--admin] <email> <password>
Exit code: 1
```
Confirms the flag-parsing path executes without throwing and properly handles missing credentials.

### Typecheck ✓
```
npm run typecheck
```
Exit code: 0 — no other breakage in the codebase.

## File Modified
- `apps/web/scripts/create-user.mjs` — argv parsing + INSERT with `is_admin` column
