# Task 2 Report — Repo types + memory: folders CRUD

## TDD Evidence

### RED
Wrote `apps/web/src/__tests__/slice-14-folders-repo.test.ts` verbatim from the plan.
Ran: `npx vitest run apps/web/src/__tests__/slice-14-folders-repo.test.ts`
Result: **2 failed** — `repo.createFolder is not a function` (correct failure, feature missing).

### GREEN
Implemented:
1. `Folder` interface added to `apps/web/src/server/repo/types.ts` (near `StoredProposal`).
2. `listFolders`, `createFolder`, `renameFolder`, `deleteFolder` methods added to the `Repository` interface.
3. `Folder` added to the `./types` import in `memory.ts`.
4. `const folders = new Map<string, Folder>()` added inside `createMemoryRepo`.
5. All four methods implemented at end of the returned repo object.

Ran: `npx vitest run apps/web/src/__tests__/slice-14-folders-repo.test.ts`
Result: **2 passed** (2/2).

## Files Changed
- `apps/web/src/server/repo/types.ts` — added `Folder` interface + four `Repository` method signatures
- `apps/web/src/server/repo/memory.ts` — added `Folder` to import, `folders` Map, four method implementations
- `apps/web/src/__tests__/slice-14-folders-repo.test.ts` — created (test file)

## Commit
SHA: `f04a1f6`
Message: `feat(repo): folders CRUD, deleteFolder unfiles proposals (memory)`

## Typecheck
`npm run typecheck` still fails only in `apps/web/src/server/repo/postgres.ts` (2 pre-existing errors, resolved in Task 3). No new type errors introduced.

## Self-Review
- Owner-scoping enforced: `listFolders` filters by `ownerId`; `renameFolder`/`deleteFolder` check ownership, return null/false for non-owners.
- `deleteFolder` unfiles proposals correctly: iterates `proposals` map, sets `folderId = null` for all proposals matching both the folder id and the owner.
- Strict TypeScript: `exactOptionalPropertyTypes` respected; no optional property assigned without a defined value.
- `clone()` used on all returns to prevent mutation of internal state.
- Names trimmed in `createFolder` and `renameFolder` per implementation pattern.

## Concerns
None. Implementation matches plan exactly.
