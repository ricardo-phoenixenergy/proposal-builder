# Task 11 Report: New-Proposal Dialog

## TDD Evidence

### RED Phase
Wrote `apps/web/src/__tests__/slice-14-new-dialog.test.tsx` before any implementation.
Ran test — confirmed FAIL (module-not-found error for `NewProposalDialog`, which didn't exist yet).
```
FAIL |web| apps/web/src/__tests__/slice-14-new-dialog.test.tsx
Error: Failed to resolve import "../ui/dashboard/NewProposalDialog"
```
Failure is for the expected reason: file absent, not a typo or misconfigured test.

### GREEN Phase
Implemented `NewProposalDialog.tsx` and wired `Dashboard.tsx`.
Ran both tests:
```
✓ |web| apps/web/src/__tests__/slice-14-dashboard.test.tsx (3 tests) 153ms
✓ |web| apps/web/src/__tests__/slice-14-new-dialog.test.tsx (1 test) 219ms
Test Files  2 passed (2)
Tests       4 passed (4)
```

## Typecheck Result
`npm run typecheck` — exit 0, no errors.

## Files Changed
- **Created:** `apps/web/src/ui/dashboard/NewProposalDialog.tsx`
- **Created:** `apps/web/src/__tests__/slice-14-new-dialog.test.tsx`
- **Modified:** `apps/web/src/ui/dashboard/Dashboard.tsx`
  - Removed `useRouter`/`router` (unused after dialog owns routing)
  - Added `import { NewProposalDialog } from "./NewProposalDialog"`
  - Added `showNew` state
  - Wired `+ New` button to `setShowNew(true)`
  - Added `+ New proposal` button to empty-state `div.dash__empty`
  - Rendered `<NewProposalDialog>` conditionally at bottom of `.dash`

## Commit SHA
`178d90c4a4f8c1b382b19b0f71d57e1633ad6c6a`

## Self-Review
- Three-layer split honoured: dialog only creates content (ProposalDocument) via `applyTemplate`, no layout/styling injected into data.
- `exactOptionalPropertyTypes` satisfied: `folderId === "" ? null : folderId` ensures `null` (not `undefined`) is passed when no folder selected.
- Extensionless imports throughout.
- `"use client"` directive on the dialog.
- `router.push` lives in the dialog, not in Dashboard — per spec.
- Dashboard's previously-unused `useRouter` removed, fixing potential lint/typecheck noise.
- `notify` used for both template-load and create failures.

## Concerns
None. Both test files pass, typecheck clean, commit on `feat/dashboard-folders`.
