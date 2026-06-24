# Final-fix report — Dashboard+Folders branch review

Commit: c91554d
Branch: feat/dashboard-folders
Files changed: apps/web/src/ui/dashboard/Dashboard.tsx, apps/web/app/globals.css

---

## Finding 1 — One-click sign-out (Important)

File: apps/web/src/ui/dashboard/Dashboard.tsx

- Added import at line 18: `import { SignOutButton } from "../SignOutButton";`
- Replaced `<a className="btn btn--ghost" href="/api/auth/signout">Sign out</a>` with `<SignOutButton />` at line 128.
- SignOutButton calls `signOut({ callbackUrl: "/signin" })` programmatically via next-auth/react, bypassing the Auth.js v5 GET confirmation page.
- Admin link left unchanged.

---

## Finding 2 — Folder edit/delete button styles (Minor)

File: apps/web/app/globals.css

- Added two rules after `.dash__addfolder` (line 643 area):
  - `.dash__folderedit, .dash__folderdel { border: 0; background: transparent; cursor: pointer; padding: 4px 6px; opacity: 0.55; border-radius: 6px; }`
  - `.dash__folderedit:hover, .dash__folderdel:hover { opacity: 1; background: var(--ui-panel); }`
- Uses `--ui-panel` which is confirmed present in `:root` as `#ffffff`.

---

## Finding 3 — Token-ize destructive color (Minor)

File: apps/web/app/globals.css

- Added `--ui-danger: #c0392b;` to `:root` beside the other `--ui-*` tokens (line 24 area).
- Changed `.pcard__danger { color: #c0392b; }` to `color: var(--ui-danger);`.

---

## Verification results

- Tests: `npx vitest run apps/web/src/__tests__/slice-14-dashboard.test.tsx` — 3/3 passed (142ms)
- Typecheck: `npm run typecheck` — exit 0 (no errors)
- Build: `npm run build -w @proposal/web` — clean, 29 routes compiled successfully

## Concerns

None. All three fixes are low-risk: one import swap, two CSS additions, one CSS token substitution.
