# Task 8 Report — Carry `isAdmin` through Auth.js + gate `/admin`

**Status:** COMPLETE

## Files Changed

- `apps/web/auth.ts` — `authorize` callback now returns `{ id, email, isAdmin: user.isAdmin }`.
- `apps/web/auth.config.ts` — `jwt` callback copies `isAdmin` onto the token when `user` is present; `session` callback exposes `session.user.isAdmin = token.isAdmin === true`; `authorized` callback gates `/admin` and `/admin/*` to `auth?.user?.isAdmin === true`.

## Step 1 Verification

`apps/web/types/next-auth.d.ts` was already correct — `Session.user.isAdmin: boolean` and `JWT.isAdmin: boolean` were both present from the previous task. No changes made.

## Verification Results

- `npm run typecheck` — exit 0 (no errors)
- `npm run build -w @proposal/web` — compiled successfully (15 routes, no `/admin` page yet — as expected)
- `npx vitest run` — 31 test files, 159 tests, all passed

## Deviations

None. Steps 2–4 follow the plan's exact code snippets verbatim.

## Concerns

None. The `/admin` route does not yet exist (Task 14+); the gate is wired and will silently redirect non-admins when the page is eventually created. The `authorized` callback's PUBLIC_PREFIXES check is unchanged and continues to allow unauthenticated access to `/signin`, `/api/auth`, and `/print`.
