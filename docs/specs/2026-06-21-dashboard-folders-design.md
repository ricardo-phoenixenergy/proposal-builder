# Home Dashboard + Folders + Search (design)

> A post-sign-in home where a user sees all their proposals, opens one to edit,
> downloads its PDF, and organizes them into folders with search/sort. Builds on
> the existing proposal persistence (`/api/proposals`, `store.load(id)`, export).

## Goal

Sign-in lands on a **dashboard** (not the editor). From it a user can:
- see every proposal they own, as cards (title · client · last edited · folder);
- **search** (title/client), **sort**, and **filter by folder** (left sidebar);
- **open** a proposal to edit, **download** its PDF, **duplicate**, **rename**,
  **move** to a folder, and **delete** it;
- **create** a new proposal by picking a template in a dialog;
- manage **folders** (create/rename/delete; flat, one level).

## Decisions (settled in brainstorming)

1. **Routing:** dashboard at `/`; editor moves to `/p/[id]` (bookmarkable).
2. **Folders:** real `folders` table, **flat (one level)** + `proposals.folderId`. `null` = Unfiled.
3. **Layout:** folder sidebar + **card grid**.
4. **New proposal:** a dialog (template + title + folder) → create → open editor.
5. Judgment calls: **Rename** edits `document.title`; **Move** sets `folderId`; **Delete** is a hard delete (with confirm); **deleting a folder unfiles** its proposals (never deletes them).

## Mockups (reference)

Dashboard `/`:
```
┌────────────────────────────────────────────────────────────────────────────┐
│  Proposal Generator                                  [ Admin ]  [ Sign out ] │
├──────────────┬─────────────────────────────────────────────────────────────┤
│ FOLDERS      │ [ 🔍 Search title or client… ]   [ Sort: Recent ▾ ]  [ + New ]│
│  All      12 │   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  Sales     5 │   │ Acme Q3 Reno │ │ Tidal PPA    │ │ Northwind RFP│         │
│  NHS       4 │   │ Acme Inc.    │ │ Tidal Energy │ │ Northwind Ltd│         │
│  Unfiled   3 │   │ edited 2d ago│ │ edited 5d ago│ │ edited 1w ago│         │
│ + New folder │   │ ⟨Sales⟩      │ │ ⟨Sales⟩      │ │ ⟨Unfiled⟩    │         │
│              │   │ [Open][⬇][⋯] │ │ [Open][⬇][⋯] │ │ [Open][⬇][⋯] │         │
│              │   └──────────────┘ └──────────────┘ └──────────────┘         │
└──────────────┴─────────────────────────────────────────────────────────────┘
   ⋯ menu → Duplicate · Rename · Move to ▸ · Delete
```
Editor `/p/[id]` topbar: `[ ← Dashboard ]  <title> · <client>   [Save] [Export PDF] [Sign out]`.

---

## A. Data model (migration `0005`)

- New `folders` table:
  ```ts
  folders = pgTable("folders", {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  })
  ```
- `proposals` gains `folderId: text("folder_id")` (nullable; `null` = Unfiled; app-level link, no hard FK).
- Migration `0005` is additive: create `folders`, add `proposals.folder_id`.

Types (`apps/web/src/server/repo/types.ts`):
- `StoredProposal` gains `folderId: string | null`.
- `interface Folder { id: string; ownerId: string; name: string; createdAt: string }`
- `ProposalSummary` becomes:
  ```ts
  interface ProposalSummary { id: string; title: string; client: string; folderId: string | null; updatedAt: string }
  ```
  `client` is `document.client.name` (read from JSONB in Postgres; from the object in memory).

## B. Repository changes

Extend `Repository` (memory + postgres):
```ts
listProposals(ownerId): Promise<ProposalSummary[]>;                    // richer summary (client + folderId)
createProposal(ownerId, document, folderId?: string | null): Promise<StoredProposal>;  // folderId optional, defaults null
updateProposalMeta(id, patch: { title?: string; folderId?: string | null }): Promise<ProposalSummary | null>; // rename/move
duplicateProposal(ownerId, id): Promise<StoredProposal | null>;       // clone doc as "Copy of <title>", same folder
deleteProposal(id): Promise<boolean>;                                  // exists

listFolders(ownerId): Promise<Folder[]>;
createFolder(ownerId, name): Promise<Folder>;
renameFolder(ownerId, id, name): Promise<Folder | null>;              // owner-scoped; null if not owned/unknown
deleteFolder(ownerId, id): Promise<boolean>;                          // owner-scoped; also sets folderId=null on its proposals
```
Notes:
- `updateProposalMeta`: `title` rewrites `document.title`; `folderId` sets the column. Does **not** bump `updatedAt` (a metadata op, so Move/Rename don't reorder the "Recent" sort). Returns the fresh summary.
- `duplicateProposal`: title becomes `Copy of <title>`; keeps the source `folderId`.
- `deleteFolder`: deletes the folder row and unfiles its proposals (`folderId = null` where `folderId = id AND ownerId`), never deleting proposals.
- All folder methods are **owner-scoped in the query** (`WHERE id = … AND owner_id = …`).
- `createProposal`'s new third arg is optional so existing 2-arg callers are unaffected.

## C. API (all owner-scoped)

| Route | Method | Body | Result |
|---|---|---|---|
| `/api/proposals` | `GET` | — | `200 { proposals: ProposalSummary[] }` |
| `/api/proposals` | `POST` | `{ document, folderId? }` | `201 { proposal }` |
| `/api/proposals/[id]` | `GET` / `PUT` / `DELETE` | (existing) | read / autosave / delete |
| `/api/proposals/[id]` | `PATCH` | `{ title?, folderId? }` | `200 { proposal: ProposalSummary }`; 400 empty/invalid; 404 |
| `/api/proposals/[id]/duplicate` | `POST` | — | `201 { proposal: ProposalSummary }`; 404 |
| `/api/folders` | `GET` | — | `200 { folders: Folder[] }` |
| `/api/folders` | `POST` | `{ name }` | `201 { folder }`; 400 empty name |
| `/api/folders/[id]` | `PATCH` | `{ name }` | `200 { folder }`; 400; 404 |
| `/api/folders/[id]` | `DELETE` | — | `204`; 404 |

- Proposal routes guard with `requireOwnedProposal(id)` (404 hides others' ids); folder routes with `getOwner()` + repo owner-scoping (404 on not-owned).
- `PATCH /api/proposals/[id]`: require at least one of `title`/`folderId`. If `folderId` is a non-null string, it must be one of the owner's folders (validate against `listFolders`) else 400.
- `POST /api/proposals` extended to read optional `folderId` and pass to `createProposal`.
- Download reuses the existing `POST /api/proposals/[id]/export` (returns a PDF) — the dashboard triggers a browser download from the blob.

## D. Routing & editor

- `app/page.tsx` becomes a **server component** (the dashboard) — it `getOwner()`s, loads `listProposals` + `listFolders` via `getRepo()`, and renders `<Dashboard initialProposals initialFolders />` (a client component) for fast first paint.
- New `app/p/[id]/page.tsx` (server) reads `id` and renders `<App id={id} />`. `App` gains an optional `id` prop; on mount it `store.load(id)` (once), showing a loading state until `proposalId === id`; on load failure it routes to `/` with a toast.
- `App` topbar adds a **← Dashboard** link (`<a href="/">`). The "boots with `sampleProposal`" default is no longer reached via a route (every editor opens a real id); the store default stays harmless.
- `signIn(..., redirectTo: "/")` already lands on the dashboard. `/print/[id]`, `/admin`, `/signin` unchanged.

## E. Dashboard UI

Client components under `apps/web/src/ui/dashboard/`:
- `Dashboard.tsx` — owns state: `proposals`, `folders`, `selectedFolderId` (`null`=All, `"unfiled"`=Unfiled, or an id), `search`, `sort` (`recent` | `title`), and dialog open state. Derives the visible list in-memory (folder filter → text match on title/client → sort). Re-fetches after mutations.
- `FolderSidebar.tsx` — All / each folder (with counts) / Unfiled / **+ New folder**; rename + delete via a small inline menu; selecting filters.
- `ProposalToolbar.tsx` — search input, sort dropdown, **+ New** button.
- `ProposalGrid.tsx` + `ProposalCard.tsx` — card (title, client, "edited Nd ago", folder chip) with **Open** (→ `/p/[id]`), **Download** (export), and a `⋯` menu (Duplicate · Rename · Move to ▸ · Delete-with-confirm).
- `NewProposalDialog.tsx` — fetches templates (`fetchTemplates`), fields: title, template select, folder select (incl. Unfiled); on Create → `applyTemplate(template)` doc → `POST /api/proposals {document, folderId}` → `router.push('/p/<id>')`.
- States: loading, error (toast via the store's `notify`), empty ("No proposals yet" + New), and no-results (search/filter) variants.

Client modules:
- `apps/web/src/client/proposals.ts` (extend): `listProposals` (richer), `createProposal(document, folderId?)`, `updateProposal(id, {title?, folderId?})`, `deleteProposal(id)`, `duplicateProposal(id)`, `downloadProposalPdf(id)` (POST export → blob → trigger download).
- `apps/web/src/client/folders.ts` (new): `fetchFolders`, `createFolder(name)`, `renameFolder(id, name)`, `deleteFolder(id)`.

## F. Testing (TDD, hermetic)

- **repo:** richer `listProposals` (client + folderId); `createProposal` with/without folderId; `updateProposalMeta` (rename sets title, move sets folderId, unknown→null); `duplicateProposal` ("Copy of", same folder, new id); folder CRUD owner-scoped; `deleteFolder` unfiles its proposals; cross-owner isolation.
- **routes:** proposals PATCH (rename/move, 400 empty, 400 foreign folder, 404), duplicate (201/404), POST with folderId; folders GET/POST/PATCH/DELETE (owner-scoped, 400/404/204). Auth: 401 unauth, owner can't touch another's.
- **UI:** `Dashboard` renders cards from initial data; search filters by title+client; folder selection filters; sort orders; card actions call the right client fns (mocked `fetch`); `NewProposalDialog` creates + routes (mocked router); delete confirm; empty + no-results states; `FolderSidebar` create/rename/delete. Editor `/p/[id]` loads via `store.load` (mocked) and shows the back link.

## File map

**Create**
- `apps/web/app/p/[id]/page.tsx`
- `apps/web/src/ui/dashboard/Dashboard.tsx`, `FolderSidebar.tsx`, `ProposalToolbar.tsx`, `ProposalGrid.tsx`, `ProposalCard.tsx`, `NewProposalDialog.tsx`
- `apps/web/src/client/folders.ts`
- `apps/web/app/api/proposals/[id]/duplicate/route.ts`
- `apps/web/app/api/folders/route.ts`, `apps/web/app/api/folders/[id]/route.ts`
- `apps/web/drizzle/0005_*.sql` (generated)
- Tests alongside each.

**Modify**
- `apps/web/app/page.tsx` (→ dashboard server component)
- `apps/web/src/App.tsx` (accept `id`, load on mount, ← Dashboard link)
- `apps/web/src/server/db/schema.ts` (folders table + proposals.folderId)
- `apps/web/src/server/repo/types.ts` (Folder, richer ProposalSummary, StoredProposal.folderId, new method sigs)
- `apps/web/src/server/repo/memory.ts` + `postgres.ts` (richer summary + new methods)
- `apps/web/app/api/proposals/route.ts` (POST accepts folderId)
- `apps/web/app/api/proposals/[id]/route.ts` (add PATCH)
- `apps/web/src/client/proposals.ts` (extend)

## Out of scope (v1)
Nested folders, drag-and-drop, a table view, a `status` field, bulk actions, sharing, pagination, thumbnails/preview images. (`updatedAt` is not bumped by rename/move.)
