# Task 12 Report — Styles, load-failure redirect, full verify

## Token names used in globals.css dashboard block

All tokens referenced in the brief's CSS block exist verbatim in `:root`:
- `--ui-panel` (#ffffff)
- `--ui-ink` (#181a1f)
- `--ui-line-strong` (#d4d0c6)
- `--ui-accent` (#0b5d3b)

No token substitutions were required.

## TDD evidence for redirect

**Step 1 — Test written:** `apps/web/src/__tests__/slice-14-editor-redirect.test.tsx` created.

**Step 2 — Confirmed FAIL:** Test ran before implementation. `replace` spy was called 0 times; App showed the loading state without redirecting. Error: `AssertionError: expected "spy" to be called with arguments: [ '/' ]`

**Step 3 — Implementation added to `App.tsx`:**
- Added `import { useRouter } from "next/navigation"` (and `"use client"` directive — see below)
- Added `const router = useRouter()`
- Replaced `void loadProposal(id)` with `void loadProposal(id).catch(() => router.replace("/"))`

**Step 4 — PASS:** Both `slice-14-editor-redirect.test.tsx` and `slice-14-editor-route.test.tsx` pass.

## Additional fixes required

Adding `useRouter()` to `App.tsx` caused three existing tests to fail with "invariant expected app router to be mounted":
- `slice-14-editor-route.test.tsx` — added `vi.mock("next/navigation", ...)` 
- `slice-03-static.test.tsx` — added `vi.mock("next/navigation", ...)`
- `slice-07-frontend.test.tsx` — added `vi.mock("next/navigation", ...)`

Additionally, the build was failing pre-existing (confirmed via `git stash` test) because `App.tsx` already used `useEffect` / `useProposalStore` but lacked `"use client"`. Added `"use client"` to `App.tsx` to fix.

## Full-suite pass count

**73 test files, 284 tests — all passed.**

## Typecheck result

Exit 0. No errors.

## Build result

Clean build. Route list:

```
Route (app)                                 Size  First Load JS
┌ ƒ /                                    5.04 kB         150 kB
├ ○ /_not-found                            993 B         104 kB
├ ƒ /admin                               6.45 kB         266 kB
├ ƒ /api/assets                            177 B         103 kB
├ ƒ /api/auth/[...nextauth]                177 B         103 kB
├ ƒ /api/data/import                       177 B         103 kB
├ ƒ /api/folders                           177 B         103 kB
├ ƒ /api/folders/[id]                      177 B         103 kB
├ ƒ /api/generate/proposal                 177 B         103 kB
├ ƒ /api/generate/section                  177 B         103 kB
├ ƒ /api/proposals                         177 B         103 kB
├ ƒ /api/proposals/[id]                    177 B         103 kB
├ ƒ /api/proposals/[id]/duplicate          177 B         103 kB
├ ƒ /api/proposals/[id]/export             177 B         103 kB
├ ƒ /api/proposals/[id]/versions           177 B         103 kB
├ ƒ /api/refine/section                    177 B         103 kB
├ ƒ /api/section-types                     177 B         103 kB
├ ƒ /api/section-types/[type]              177 B         103 kB
├ ƒ /api/section-types/[type]/deprecate    177 B         103 kB
├ ƒ /api/templates                         177 B         103 kB
├ ƒ /api/templates/[id]                    177 B         103 kB
├ ƒ /api/templates/[id]/deprecate          177 B         103 kB
├ ƒ /api/themes                            177 B         103 kB
├ ƒ /api/users                             177 B         103 kB
├ ƒ /api/users/[id]                        177 B         103 kB
├ ƒ /api/users/[id]/password               177 B         103 kB
├ ƒ /p/[id]                              11.7 kB         271 kB
├ ƒ /print/[id]                            851 B         260 kB
└ ƒ /signin                                177 B         103 kB
```

All required routes present: `/`, `/p/[id]`, `/api/folders`, `/api/folders/[id]`, `/api/proposals/[id]/duplicate`.

## Files changed

- `apps/web/app/globals.css` — appended dashboard/card/modal CSS block
- `apps/web/src/App.tsx` — added `"use client"`, `useRouter`, and `.catch(() => router.replace("/"))` on load
- `apps/web/src/__tests__/slice-14-editor-redirect.test.tsx` — created (new TDD test)
- `apps/web/src/__tests__/slice-14-editor-route.test.tsx` — added `vi.mock("next/navigation")` (pre-existing test broken by useRouter addition)
- `apps/web/src/__tests__/slice-03-static.test.tsx` — added `vi.mock("next/navigation")` (same reason)
- `apps/web/src/__tests__/slice-07-frontend.test.tsx` — added `vi.mock("next/navigation")` (same reason)

## Commit SHA

`dda943d`

## Concerns

- The `"use client"` directive was missing from `App.tsx` before this task (pre-existing build failure confirmed via `git stash`). Task 12 fixed it as part of the build verification requirement. The three existing tests that needed a `next/navigation` mock were also a direct consequence of the same change; those were fixed rather than counted as regressions.
