# Task 8 Report — Editor route `/p/[id]` + App loads by id + Dashboard back link

**Date:** 2026-06-21
**Branch:** feat/dashboard-folders
**Commit:** a8dec73

---

## TDD Evidence

### RED (failing)
Ran `npx vitest run apps/web/src/__tests__/slice-14-editor-route.test.tsx` immediately after creating the test file.

Result: **FAIL (1/1)** — `App` took no `id` prop, `waitFor` timed out because "Loaded One" never appeared and there was no Dashboard link.

### GREEN (passing)
After updating `apps/web/src/App.tsx` and creating `apps/web/app/p/[id]/page.tsx`:

```
✓ |web| apps/web/src/__tests__/slice-14-editor-route.test.tsx (1 test) 115ms
Test Files  1 passed (1)
      Tests  1 passed (1)
```

---

## Typecheck

```
npm run typecheck — exit 0 (no errors)
```

Both `packages/shared` and `apps/web` type-checked cleanly.

---

## Files Changed

| Action   | Path |
|----------|------|
| Create   | `apps/web/app/p/[id]/page.tsx` |
| Modify   | `apps/web/src/App.tsx` |
| Create   | `apps/web/src/__tests__/slice-14-editor-route.test.tsx` |

---

## Implementation Summary

### `apps/web/src/App.tsx`
- Signature changed from `App()` to `App({ id }: { id?: string } = {})`.
- Added `proposalId` and `loadProposal` selectors from the store.
- Added a second `useEffect` that fires `loadProposal(id)` when `id` is set and differs from `proposalId`.
- Added loading guard: `const loading = Boolean(id) && proposalId !== id` — returns `<div className="app app--loading">Loading proposal…</div>` while waiting.
- Added `<a className="btn btn--ghost" href="/">← Dashboard</a>` in `topbar__brand`.
- All existing children (Outline, Inspector, ExportGate, SaveControl, Autosave, Toast, SignOutButton, DocumentRenderer) preserved.

### `apps/web/app/p/[id]/page.tsx`
- New Next.js 15 async server component.
- Awaits `params` per Next 15 convention (`params: Promise<{ id: string }>`).
- Renders `<App id={id} />`.

### `apps/web/src/__tests__/slice-14-editor-route.test.tsx`
- Stubs `global.fetch` URL-aware: proposal GET returns `{ proposal: { document: { ...sampleProposal, title: "Loaded One" } } }`, templates/section-types return empty arrays.
- Resets `proposalId: null` before render so the load effect always fires.
- Asserts "Loaded One" appears and a `/dashboard/i` link is in the document.

---

## Self-Review

- The `= {}` default in the function signature satisfies `exactOptionalPropertyTypes` — calling `<App />` (no props) works; the type correctly makes `id` optional.
- The loading guard compares `proposalId !== id` (string inequality), which is safe because `proposalId` starts `null` and only becomes the string id after `load` resolves.
- The ← Dashboard link uses a plain `<a href="/">` (not Next `Link`) as specified in the brief, consistent with the topbar pattern.
- `app/page.tsx` (the root route) is untouched — it still renders `<App />` with no id, which correctly skips the load effect.

---

## Concerns

- None for this slice. The brief notes that load failure leaves the loading spinner forever (no 404 redirect); that is accepted for v1 and handled in Task 12.
- The `← Dashboard` link appears even when `App` is rendered without an `id` (the existing `/` route). This is benign for now — when `/` becomes the real dashboard in a later task, `app/page.tsx` will no longer render `<App />` and the link will only appear on `/p/[id]`.
