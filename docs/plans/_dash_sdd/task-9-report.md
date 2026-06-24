# Task 9 Report — Dashboard page + container + grid/cards

## TDD Evidence

### RED (failing)
Ran: `npx vitest run apps/web/src/__tests__/slice-14-dashboard.test.tsx`
Result: `FAIL` — `Failed to resolve import "../ui/dashboard/Dashboard"` (module did not exist).

### GREEN (passing)
After creating all four implementation files, re-ran the same command.
Result: `PASS 3/3`

Tests passing:
1. `Dashboard > renders proposal cards and filters by search`
2. `Dashboard > Open links to /p/[id]`
3. `Dashboard > shows an empty state when there are no proposals`

## Typecheck

`npm run typecheck` → exit 0 (no errors). Covers both `packages/shared` and `apps/web`.

## Files Changed

| File | Action |
|------|--------|
| `apps/web/app/page.tsx` | Modified — replaced client shell with server RSC dashboard |
| `apps/web/src/ui/dashboard/Dashboard.tsx` | Created — client container with search/sort/actions |
| `apps/web/src/ui/dashboard/ProposalGrid.tsx` | Created — grid list with empty-state |
| `apps/web/src/ui/dashboard/ProposalCard.tsx` | Created — card with Open link + ⋯ menu |
| `apps/web/src/__tests__/slice-14-dashboard.test.tsx` | Created — 3-test jsdom suite |

## Commit SHA

`11ae212` on branch `feat/dashboard-folders`

## Self-Review

- Code matches the brief verbatim (exact component signatures, exact JSX structure, exact test).
- `data-proposal` attribute on `<li>` enables `closest("[data-proposal]")` in the test.
- `Open` link is `<a href="/p/${id}">` (not a `<button>`), correctly found by `getByRole("link", { name: /open/i })`.
- Empty-state path in `Dashboard` renders when `proposals.length === 0` (before filtering), matching test expectation.
- `app/page.tsx` is a plain async server component (no `"use client"`) calling `getSessionUser()` + `getRepo()`.
- `+ New` button calls `router.push("/p/new")` as placeholder; Task 11 replaces it with `NewProposalDialog`.

## Concerns

None. The `listFolders` method was already implemented on the repo (`types.ts` line 125, `memory.ts` line 269, `postgres.ts` line 275), so `app/page.tsx` compiles cleanly.
