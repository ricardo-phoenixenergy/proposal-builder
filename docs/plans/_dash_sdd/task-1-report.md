# Task 1 Report — Repo types + memory: richer summary, folderId, create/rename/move/duplicate

## TDD Evidence

### RED Phase

**Command:**
```
npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts
```

**Failing output (summarised):**
```
4 failed

× summary carries client + folderId
  → expected { id, title, updatedAt } to match object { id, title, client, folderId }
    (client and folderId missing from actual)

× createProposal defaults folderId to null
  → expected undefined to be null

× updateProposalMeta renames (title) and moves (folderId)
  → repo.updateProposalMeta is not a function

× duplicateProposal clones as 'Copy of', keeps folder, new id, owner-scoped
  → repo.duplicateProposal is not a function
```

**Why they failed:** The existing `ProposalSummary` lacked `client` and `folderId`; `StoredProposal` lacked `folderId`; the `Repository` interface and memory implementation were missing `updateProposalMeta` and `duplicateProposal`.

---

### GREEN Phase

**Command:**
```
npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts
```

**Passing output:**
```
✓ |web| apps/web/src/__tests__/slice-14-proposals-repo.test.ts (4 tests) 8ms

Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.17s
```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/server/repo/types.ts` | `ProposalSummary` gains `client: string` + `folderId: string \| null`; `StoredProposal` gains `folderId: string \| null`; `Repository` gains `updateProposalMeta` + `duplicateProposal`, `createProposal` gains optional `folderId` param |
| `apps/web/src/server/repo/memory.ts` | Added `toProposalSummary` helper; replaced `listProposals` + `createProposal`; added `updateProposalMeta` + `duplicateProposal` |
| `apps/web/src/__tests__/slice-14-proposals-repo.test.ts` | Created — 4 hermetic vitest tests (node environment) |

---

## Commit

SHA: `0e920f7`
Branch: `feat/dashboard-folders`
Message: `feat(repo): proposal summary client+folderId, updateProposalMeta, duplicateProposal (memory)`

---

## Self-Review

- `toProposalSummary` uses `p.document.client?.name ?? ""` — safe optional chain in case client is absent on future schema variants; matches the spec definition exactly.
- `updateProposalMeta`: does NOT bump `updatedAt` (per Global Constraints §16: "neither bumps updatedAt — metadata ops must not reorder the Recent sort"). Only `document` title and `folderId` are patched.
- `duplicateProposal`: new id, new timestamps, title prefixed with `"Copy of "`, `folderId` preserved from source, owner-scoped (returns null if ownerId mismatches).
- `createProposal` default param `folderId = null` satisfies `exactOptionalPropertyTypes` — the StoredProposal is constructed with the explicit value, not an undefined spread.
- `saveProposal` spreads `...existing`, so the new `folderId` field is preserved transparently — no change needed there (confirmed in spec note).
- No new dependencies added.
- Import was already present for `ProposalSummary` in memory.ts; no duplicate import issues (original `DuplicateEmailError` import was already correct, the duplicate was immediately fixed).

---

## Concerns

### Expected interim typecheck failure (postgres.ts)

`npm run typecheck` exits with code 2, failing on `apps/web/src/server/repo/postgres.ts` with two errors:

1. `Property 'folderId' is missing in type '{ id, ownerId, document, createdAt, updatedAt }' but required in type 'StoredProposal'` (line 12)
2. `listProposals` return type `{ id, title, updatedAt }[]` is not assignable to `ProposalSummary[]` — missing `client`, `folderId` (line 35)
3. `updateProposalMeta` and `duplicateProposal` are not implemented in postgres.ts

**This is the intended interim state** as documented in Task 1 Step 6 and the task brief ("expected: FAILS in postgres.ts (missing folderId / new methods) — intended, resolved in Task 3"). The memory repo test passes cleanly; postgres.ts is untouched.

No other concerns.
