# Task 4 Report — POST folderId + PATCH /api/proposals/[id]

## TDD Evidence

### RED (4/4 failing)
Run before any implementation changes:
- `POST /api/proposals (folderId) > creates in a folder` — expected 400 to be 201 (POST ignored folderId, treated `{ document, folderId }` envelope as an invalid document)
- `PATCH /api/proposals/[id] > renames and moves into an owned folder` — PATCH is not a function
- `PATCH /api/proposals/[id] > 400s an empty patch and a foreign folder` — PATCH is not a function
- `PATCH /api/proposals/[id] > 404s another owner's proposal` — PATCH is not a function

### GREEN (4/4 passing)
After implementation, all 4 tests pass in ~15ms.

## Files Changed

1. `apps/web/app/api/proposals/route.ts` — POST body parsing extended to accept either a bare `ProposalDocument` OR `{ document, folderId }` envelope; `folderId` threaded through to `createProposal`.
2. `apps/web/app/api/proposals/[id]/route.ts` — New `PATCH` export appended after DELETE; owner-guards via `requireOwnedProposal`; validates at least one field; checks foreign-folder ownership via `listFolders`; calls `updateProposalMeta` and returns `{ proposal: ProposalSummary }`.
3. `apps/web/src/__tests__/slice-14-proposals-routes.test.ts` — Created verbatim from the plan (node environment, hermetic memory repo + owner seams).

## Commit SHA

`2f04e4c` on branch `feat/dashboard-folders`
Message: `feat(api): POST folderId + PATCH /api/proposals/[id] (rename/move)`

## Self-Review

- Backward compatibility: existing callers posting a bare `ProposalDocument` still work (`"document" in body` false → treated as bare doc).
- `exactOptionalPropertyTypes` safe: `patch` object built with conditional property assignment, no undefined spread.
- Owner scoping: `requireOwnedProposal` returns 401/404 before any mutation; `listFolders` called with `owned.ownerId` (not re-read from session), preventing TOCTOU.
- `null` folderId (unfile) accepted correctly; only non-null string values are checked against owned folders.
- `updateProposalMeta` not owner-scoped at the repo level — protected by `requireOwnedProposal` at the route layer, which is the established pattern in this codebase.

## Concerns

None. The brief was unambiguous and all four test cases pass cleanly. Line-ending warnings (LF→CRLF) from git are cosmetic and pre-existing in this Windows environment.
