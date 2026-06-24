# Task 3 Report — Postgres parity for folders + proposal meta; migration 0005

## What changed

### `apps/web/src/server/db/schema.ts`
- Added `folders` table (id, owner_id, name, created_at) — placed before `proposals`.
- Added `folderId: text("folder_id")` column to `proposals` (nullable, after `ownerId`).

### `apps/web/src/server/repo/postgres.ts`
- Updated imports: added `folders` from schema; added `Folder`, `ProposalSummary` to types import.
- Updated `toStored`: now includes `folderId: row.folderId ?? null`.
- Added `toProposalSummary` helper: maps `ProposalRow` to `ProposalSummary` (id, title, client, folderId, updatedAt).
- Replaced `listProposals`: now returns `ProposalSummary[]` via `toProposalSummary`.
- Replaced `createProposal`: accepts optional `folderId = null` parameter; stores it.
- Added `updateProposalMeta`: patches title (into document) and/or folderId; does not bump updatedAt.
- Added `duplicateProposal`: owner-scoped copy with new id, "Copy of" title, same folderId.
- Added `listFolders`, `createFolder`, `renameFolder`, `deleteFolder` — all owner-scoped; `deleteFolder` unfiles proposals by setting `folderId = null`.

### `apps/web/drizzle/0005_bored_captain_marvel.sql` (generated)
```sql
CREATE TABLE "folders" (
    "id" text PRIMARY KEY NOT NULL,
    "owner_id" text NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "folder_id" text;
```
Migration is additive only — no drops, no data loss.

## Typecheck result
`npm run typecheck` — exit 0. Both repos satisfy the `Repository` interface.

## Regression test result
`npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts apps/web/src/__tests__/slice-14-folders-repo.test.ts`
- 2 test files, 6 tests — all PASSED.

## Commit SHA
`66bdc90` — branch `feat/dashboard-folders`

## Concerns
None. The migration is additive, the drizzle-kit output was non-interactive, and all prior tests remain green.
