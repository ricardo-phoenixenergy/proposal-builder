# Task 7 Report — Client modules: persistence.ts extended + folders.ts

## TDD Evidence

### RED
Wrote `apps/web/src/__tests__/slice-14-clients.test.ts` before any implementation.
Run result:
```
FAIL |web| apps/web/src/__tests__/slice-14-clients.test.ts (0 tests)
Error: Failed to load url ../client/folders — file does not exist
```
Failure reason: `folders.ts` did not exist; `persistence.ts` lacked `updateProposalMeta`, `duplicateProposal`, `deleteProposal`. Correct RED — missing features, not a typo.

### GREEN
After implementing both files:
```
✓ |web| apps/web/src/__tests__/slice-14-clients.test.ts (5 tests) 24ms
Test Files  1 passed (1)
Tests       5 passed (5)
```
All 5 tests pass.

## Typecheck Result

`npm run typecheck` exits 2 with **one pre-existing error** in `slice-14-folders-routes.test.ts:12` (`exactOptionalPropertyTypes` / `body: string | undefined` vs `BodyInit | null`). This error existed on the branch before Task 7 (confirmed via `git stash` round-trip). The three Task 7 files are type-clean.

## Files Changed

- `apps/web/src/client/persistence.ts` — updated `ProposalSummary` (added `client`, `folderId`); updated `createProposal` signature (added `folderId` param, wraps body in `{ document, folderId }`); added `updateProposalMeta`, `duplicateProposal`, `deleteProposal`, `downloadProposalPdf`.
- `apps/web/src/client/folders.ts` — created; exports `Folder` type + `fetchFolders`, `createFolder`, `renameFolder`, `deleteFolder`.
- `apps/web/src/__tests__/slice-14-clients.test.ts` — created; 5 tests covering proposals meta and folder client functions.

## Commit SHA

`648a889`

## Concerns

- The pre-existing `slice-14-folders-routes.test.ts` typecheck error should be fixed in its own task (it's a `body: undefined` vs `BodyInit | null` incompatibility under `exactOptionalPropertyTypes`). It is not a Task 7 concern.
- `downloadProposalPdf` uses `URL.createObjectURL` / `document.createElement` — these are browser APIs unavailable in the node vitest environment. The brief does not include a test for this function, consistent with it being browser-only. No action needed.
