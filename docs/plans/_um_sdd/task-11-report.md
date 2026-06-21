# Task 11 Report — Wire dashboard, page, styles, docs; full verify

## What changed

### Files modified

| File | Change |
|------|--------|
| `apps/web/src/ui/admin/AdminDashboard.tsx` | Added `currentUserId: string` required prop; added `Panel` type + `panel` state; wired nav buttons (Section types active, Users now enabled, Templates still disabled); renders `UsersView` when `panel === "users"` |
| `apps/web/app/admin/page.tsx` | Passes `currentUserId={session.user.id}` to `AdminDashboard` (redirect guard above guarantees session/admin exists) |
| `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` | Updated render call to pass `currentUserId="admin"` (new required prop) |
| `apps/web/app/globals.css` | Appended `.userform`, `.userform input[type="email"]`, `.userform input[type="password"]`, `.userform__admin` rules |
| `apps/web/.env.local.example` | Added JWT mid-session-revocation limitation note after the Auth section |

### Files created

| File | Change |
|------|--------|
| `apps/web/src/__tests__/slice-12-admin-nav.test.tsx` | New nav-switching integration test (TDD: red first, green after implementation) |

---

## globals.css token names actually used

The brief's suggested token names (`--ui-border`, `--ui-surface`, `--ui-text`) do NOT exist in `globals.css`. The actual chrome tokens are:

| Brief name | Actual token used |
|------------|-------------------|
| `--ui-border` | `--ui-line-strong` (used by `.topbar`, `.stlist__row`, etc.) |
| `--ui-surface` | `--ui-panel` (used by `.admin__bar`, `.topbar`, `.pane`, etc.) |
| `--ui-text` | `--ui-ink` (used everywhere as the primary foreground colour) |

The `.userform` rules were written with `--ui-line-strong`, `--ui-panel`, and `--ui-ink` — no new tokens introduced.

---

## TDD evidence for the nav test

1. **Red** — ran `npx vitest run apps/web/src/__tests__/slice-12-admin-nav.test.tsx` before modifying `AdminDashboard.tsx`. Test failed: Users button was disabled; `UsersView` heading never appeared.
2. **Green** — same test after Step 3 (updated `AdminDashboard.tsx`): PASS.
3. **Shell test** — `slice-11-admin-shell.test.tsx` also PASS after adding `currentUserId="admin"`.

---

## Full-suite result

```
Test Files  50 passed (50)
Tests       220 passed (220)
Duration    11.30s
```

All prior slices plus the new slice-12 files green.

---

## Typecheck result

```
npm run typecheck → exit 0
```

(Runs `tsc --noEmit` over both `packages/shared` and `apps/web`.)

---

## Build result

Clean `next build`. Routes present in output:

```
ƒ /api/users                             167 B         103 kB
ƒ /api/users/[id]                        167 B         103 kB
ƒ /api/users/[id]/password               167 B         103 kB
```

Full route list also includes `/admin`, `/print/[id]`, `/signin`, all section-type and proposal routes.

---

## Concerns

None. No pre-existing failures discovered; the suite was fully green before and after.
