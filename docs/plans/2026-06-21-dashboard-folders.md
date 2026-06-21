# Home Dashboard + Folders + Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A post-sign-in dashboard at `/` that lists the user's proposals as cards with folder organization and search/sort, plus per-proposal actions (open, download, duplicate, rename, move, delete); the editor moves to `/p/[id]`.

**Architecture:** Add a flat `folders` table + `proposals.folderId`; enrich the proposal summary (client + folder). New owner-scoped routes for folder CRUD and proposal rename/move/duplicate. `app/page.tsx` becomes a server-rendered dashboard that hands initial data to a client `<Dashboard>`; the editor (`<App>`) moves to `/p/[id]` and loads the proposal by id.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + Neon Postgres, Auth.js v5, Zustand, Vitest (node + jsdom projects).

## Global Constraints

- **Spec:** `docs/specs/2026-06-21-dashboard-folders-design.md` is the source of truth.
- **Owner scoping everywhere:** proposal routes guard with `requireOwnedProposal(id)` (404 hides others' ids); folder routes use `getOwner()` + repo queries scoped `WHERE … AND owner_id = …`. Never let one user touch another's data.
- **Folders are flat (one level).** `proposals.folderId` is nullable; `null` = Unfiled. Deleting a folder **unfiles** its proposals (sets `folderId = null`), never deletes them.
- **Rename** edits `document.title`; **Move** sets `folderId`; neither bumps `updatedAt` (metadata ops must not reorder the "Recent" sort). **Delete** is a hard delete (with a UI confirm).
- **`ProposalSummary` = `{ id, title, client, folderId, updatedAt }`** where `client = document.client?.name ?? ""`.
- **Module imports are extensionless** (`moduleResolution: "bundler"`); never add `.js`. `packages/shared` stays framework-agnostic.
- **TypeScript strict** incl. `exactOptionalPropertyTypes`: only assign optional object properties when you have a defined value (conditional spreads).
- **Tests are hermetic:** in-memory repo via `setRepoForTests`; owner identity via `setOwnerResolverForTests` (from `src/server/auth/owner`); client/UI via mocked `global.fetch`; router via a `next/navigation` mock. Node-env test files start with `// @vitest-environment node`; React test files use the default jsdom project.
- **This IS a git repo** (`origin main`). Commit after each task. Branch is `main`.
- **Commands (scripts at REPO ROOT):** single test file `npx vitest run <path-from-root>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`; migration `npm run db:generate -w @proposal/web` (drizzle-kit does NOT auto-load `.env.local`).

---

### Task 1: Repo types + memory — richer summary, `folderId`, create/rename/move/duplicate

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-14-proposals-repo.test.ts` (create)

**Interfaces:**
- Produces:
  - `ProposalSummary` → `{ id: string; title: string; client: string; folderId: string | null; updatedAt: string }`
  - `StoredProposal` gains `folderId: string | null`
  - `Repository`: `createProposal(ownerId, document, folderId?: string | null)`, `updateProposalMeta(id, patch: { title?: string; folderId?: string | null }): Promise<ProposalSummary | null>`, `duplicateProposal(ownerId, id): Promise<StoredProposal | null>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-proposals-repo.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("repo proposals — summary, folder, rename/move/duplicate", () => {
  it("summary carries client + folderId", async () => {
    const created = await repo.createProposal("owner_a", sampleProposal, "fld_1");
    const [s] = await repo.listProposals("owner_a");
    expect(s).toMatchObject({ id: created.id, title: sampleProposal.title, client: sampleProposal.client.name, folderId: "fld_1" });
  });

  it("createProposal defaults folderId to null", async () => {
    const created = await repo.createProposal("owner_a", sampleProposal);
    expect(created.folderId).toBeNull();
  });

  it("updateProposalMeta renames (title) and moves (folderId)", async () => {
    const c = await repo.createProposal("owner_a", sampleProposal);
    expect((await repo.updateProposalMeta(c.id, { title: "Renamed" }))?.title).toBe("Renamed");
    expect((await repo.updateProposalMeta(c.id, { folderId: "fld_x" }))?.folderId).toBe("fld_x");
    expect((await repo.getProposal(c.id))?.document.title).toBe("Renamed");
    expect(await repo.updateProposalMeta("nope", { title: "x" })).toBeNull();
  });

  it("duplicateProposal clones as 'Copy of', keeps folder, new id, owner-scoped", async () => {
    const c = await repo.createProposal("owner_a", sampleProposal, "fld_1");
    const dup = await repo.duplicateProposal("owner_a", c.id);
    expect(dup!.id).not.toBe(c.id);
    expect(dup!.document.title).toBe(`Copy of ${sampleProposal.title}`);
    expect(dup!.folderId).toBe("fld_1");
    expect(await repo.duplicateProposal("owner_b", c.id)).toBeNull(); // not owner
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts`
Expected: FAIL — `updateProposalMeta`/`duplicateProposal` not functions; summary lacks `client`/`folderId`.

- [ ] **Step 3: Update the repo types**

In `apps/web/src/server/repo/types.ts`:
- Replace `ProposalSummary` and add `folderId` to `StoredProposal`:

```ts
export interface ProposalSummary {
  id: string;
  title: string;
  client: string;
  folderId: string | null;
  updatedAt: string;
}
export interface StoredProposal {
  id: string;
  ownerId: string;
  document: ProposalDocument;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- In the `Repository` interface, replace the proposal create/update lines with:

```ts
  createProposal(ownerId: string, document: ProposalDocument, folderId?: string | null): Promise<StoredProposal>;
  updateProposalMeta(id: string, patch: { title?: string; folderId?: string | null }): Promise<ProposalSummary | null>;
  duplicateProposal(ownerId: string, id: string): Promise<StoredProposal | null>;
```

(Keep the existing `getProposal`, `saveProposal`, `deleteProposal`, `listProposals`, `listVersions`, `snapshotVersion` lines.)

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`, add a summary helper near the top (after `clone`):

```ts
const toProposalSummary = (p: StoredProposal): ProposalSummary => ({
  id: p.id,
  title: p.document.title,
  client: p.document.client?.name ?? "",
  folderId: p.folderId,
  updatedAt: p.updatedAt,
});
```

Replace `listProposals` and `createProposal`, and add the three methods (place after `createProposal`):

```ts
    async listProposals(ownerId) {
      return [...proposals.values()].filter((p) => p.ownerId === ownerId).map(toProposalSummary);
    },

    async createProposal(ownerId, document, folderId = null) {
      const id = uid("prop");
      const stored: StoredProposal = {
        id,
        ownerId,
        document: { ...clone(document), id },
        folderId,
        createdAt: now(),
        updatedAt: now(),
      };
      proposals.set(id, stored);
      return clone(stored);
    },

    async updateProposalMeta(id, patch) {
      const existing = proposals.get(id);
      if (!existing) return null;
      const document = patch.title !== undefined ? { ...clone(existing.document), title: patch.title } : existing.document;
      const updated: StoredProposal = {
        ...existing,
        document,
        folderId: patch.folderId !== undefined ? patch.folderId : existing.folderId,
      };
      proposals.set(id, updated);
      return toProposalSummary(updated);
    },

    async duplicateProposal(ownerId, id) {
      const src = proposals.get(id);
      if (!src || src.ownerId !== ownerId) return null;
      const newId = uid("prop");
      const stored: StoredProposal = {
        id: newId,
        ownerId,
        document: { ...clone(src.document), id: newId, title: `Copy of ${src.document.title}` },
        folderId: src.folderId,
        createdAt: now(),
        updatedAt: now(),
      };
      proposals.set(newId, stored);
      return clone(stored);
    },
```

Add `ProposalSummary` to the `import type { … } from "./types"` list at the top of the file (it may not be imported yet).

> Note: `saveProposal` already spreads `...existing`, so it preserves `folderId` — no change needed there. `getProposal` returns the stored object including `folderId`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

Run: `npm run typecheck` — expected: FAILS in `postgres.ts` (missing `folderId` / new methods) — intended, resolved in Task 3. The memory test passes.

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/__tests__/slice-14-proposals-repo.test.ts
git commit -m "feat(repo): proposal summary client+folderId, updateProposalMeta, duplicateProposal (memory)"
```

---

### Task 2: Repo types + memory — folders CRUD (deleteFolder unfiles)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-14-folders-repo.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface Folder { id: string; ownerId: string; name: string; createdAt: string }`
  - `Repository`: `listFolders(ownerId): Promise<Folder[]>`, `createFolder(ownerId, name): Promise<Folder>`, `renameFolder(ownerId, id, name): Promise<Folder | null>`, `deleteFolder(ownerId, id): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-folders-repo.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

describe("repo folders (owner-scoped)", () => {
  it("creates, lists (own only), renames", async () => {
    const f = await repo.createFolder("owner_a", "Sales");
    await repo.createFolder("owner_b", "Theirs");
    expect((await repo.listFolders("owner_a")).map((x) => x.name)).toEqual(["Sales"]);
    expect((await repo.renameFolder("owner_a", f.id, "Renamed"))?.name).toBe("Renamed");
    expect(await repo.renameFolder("owner_b", f.id, "Hijack")).toBeNull(); // not owner
  });

  it("deleteFolder unfiles its proposals (folderId -> null), owner-scoped", async () => {
    const f = await repo.createFolder("owner_a", "Sales");
    const p = await repo.createProposal("owner_a", sampleProposal, f.id);
    expect(await repo.deleteFolder("owner_b", f.id)).toBe(false); // not owner
    expect(await repo.deleteFolder("owner_a", f.id)).toBe(true);
    expect((await repo.getProposal(p.id))?.folderId).toBeNull();
    expect(await repo.listFolders("owner_a")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folders-repo.test.ts`
Expected: FAIL — folder methods not functions.

- [ ] **Step 3: Add the Folder type**

In `apps/web/src/server/repo/types.ts`, add near `StoredProposal`:

```ts
export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}
```

Add to the `Repository` interface:

```ts
  listFolders(ownerId: string): Promise<Folder[]>;
  createFolder(ownerId: string, name: string): Promise<Folder>;
  renameFolder(ownerId: string, id: string, name: string): Promise<Folder | null>;
  deleteFolder(ownerId: string, id: string): Promise<boolean>;
```

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`, add `Folder` to the `./types` import, add a folders map next to the others:

```ts
  const folders = new Map<string, Folder>(); // keyed by folder id
```

Add the methods (place after the proposal methods):

```ts
    async listFolders(ownerId) {
      return [...folders.values()]
        .filter((f) => f.ownerId === ownerId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(clone);
    },

    async createFolder(ownerId, name) {
      const folder: Folder = { id: uid("fld"), ownerId, name: name.trim(), createdAt: now() };
      folders.set(folder.id, folder);
      return clone(folder);
    },

    async renameFolder(ownerId, id, name) {
      const f = folders.get(id);
      if (!f || f.ownerId !== ownerId) return null;
      const updated: Folder = { ...f, name: name.trim() };
      folders.set(id, updated);
      return clone(updated);
    },

    async deleteFolder(ownerId, id) {
      const f = folders.get(id);
      if (!f || f.ownerId !== ownerId) return false;
      folders.delete(id);
      for (const [pid, p] of proposals) {
        if (p.folderId === id && p.ownerId === ownerId) proposals.set(pid, { ...p, folderId: null });
      }
      return true;
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folders-repo.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

(Typecheck still fails only in `postgres.ts` — resolved in Task 3.)

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/__tests__/slice-14-folders-repo.test.ts
git commit -m "feat(repo): folders CRUD, deleteFolder unfiles proposals (memory)"
```

---

### Task 3: Postgres parity + schema + migration `0005`

**Files:**
- Modify: `apps/web/src/server/db/schema.ts`
- Modify: `apps/web/src/server/repo/postgres.ts`
- Create (generated): `apps/web/drizzle/0005_*.sql`

**Interfaces:**
- Consumes: `Folder`, richer `ProposalSummary`, `StoredProposal.folderId` (Tasks 1–2).
- Produces: Postgres implementation of all new methods; `folders` table + `proposals.folder_id` column.

- [ ] **Step 1: Update the Drizzle schema**

In `apps/web/src/server/db/schema.ts`:
- Add `folderId` to `proposals` (after `ownerId`):

```ts
  folderId: text("folder_id"),
```

- Add a `folders` table (near `proposals`):

```ts
export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: `apps/web/drizzle/0005_*.sql` that **creates** `folders` and **adds** `proposals.folder_id` (nullable). Open it; confirm additive only (no drops/data loss).

- [ ] **Step 3: Implement the Postgres methods**

In `apps/web/src/server/repo/postgres.ts`:
- Add `folders` to the schema import and `Folder`, `ProposalSummary` to the types import:

```ts
import { proposalVersions, proposals, folders, sectionTypeRows, templates, themes, users } from "../db/schema";
import type { Folder, ProposalSummary, Repository, SectionTypeRow, StoredProposal, UserSummary } from "./types";
```

- Add `folderId` to `toStored`:

```ts
function toStored(row: ProposalRow): StoredProposal {
  return {
    id: row.id,
    ownerId: row.ownerId,
    document: row.document,
    folderId: row.folderId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

- Add a summary helper near `toStored`:

```ts
const toProposalSummary = (r: ProposalRow): ProposalSummary => ({
  id: r.id,
  title: r.document.title,
  client: r.document.client?.name ?? "",
  folderId: r.folderId ?? null,
  updatedAt: r.updatedAt.toISOString(),
});
```

- Replace `listProposals` + `createProposal`, and add the new proposal methods:

```ts
    async listProposals(ownerId) {
      const rows = await db.select().from(proposals).where(eq(proposals.ownerId, ownerId));
      return rows.map(toProposalSummary);
    },

    async createProposal(ownerId, document, folderId = null) {
      const id = uid("prop");
      const [row] = await db
        .insert(proposals)
        .values({ id, ownerId, document: { ...document, id }, folderId })
        .returning();
      return toStored(row!);
    },

    async updateProposalMeta(id, patch) {
      const [existing] = await db.select().from(proposals).where(eq(proposals.id, id));
      if (!existing) return null;
      const document = patch.title !== undefined ? { ...existing.document, title: patch.title } : existing.document;
      const folderId = patch.folderId !== undefined ? patch.folderId : existing.folderId;
      const [row] = await db.update(proposals).set({ document, folderId }).where(eq(proposals.id, id)).returning();
      return toProposalSummary(row!);
    },

    async duplicateProposal(ownerId, id) {
      const [src] = await db.select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.ownerId, ownerId)));
      if (!src) return null;
      const newId = uid("prop");
      const [row] = await db
        .insert(proposals)
        .values({ id: newId, ownerId, document: { ...src.document, id: newId, title: `Copy of ${src.document.title}` }, folderId: src.folderId })
        .returning();
      return toStored(row!);
    },
```

- Add the folder methods (place near the proposal methods):

```ts
    async listFolders(ownerId) {
      const rows = await db.select().from(folders).where(eq(folders.ownerId, ownerId)).orderBy(folders.name);
      return rows.map<Folder>((r) => ({ id: r.id, ownerId: r.ownerId, name: r.name, createdAt: r.createdAt.toISOString() }));
    },

    async createFolder(ownerId, name) {
      const [row] = await db.insert(folders).values({ id: uid("fld"), ownerId, name: name.trim() }).returning();
      return { id: row!.id, ownerId: row!.ownerId, name: row!.name, createdAt: row!.createdAt.toISOString() };
    },

    async renameFolder(ownerId, id, name) {
      const [row] = await db
        .update(folders)
        .set({ name: name.trim() })
        .where(and(eq(folders.id, id), eq(folders.ownerId, ownerId)))
        .returning();
      return row ? { id: row.id, ownerId: row.ownerId, name: row.name, createdAt: row.createdAt.toISOString() } : null;
    },

    async deleteFolder(ownerId, id) {
      const deleted = await db.delete(folders).where(and(eq(folders.id, id), eq(folders.ownerId, ownerId))).returning();
      if (deleted.length === 0) return false;
      await db.update(proposals).set({ folderId: null }).where(and(eq(proposals.folderId, id), eq(proposals.ownerId, ownerId)));
      return true;
    },
```

- [ ] **Step 4: Verify typecheck is clean**

Run: `npm run typecheck`
Expected: exit 0 (both repos satisfy `Repository`).

- [ ] **Step 5: Run the repo regression tests**

Run: `npx vitest run apps/web/src/__tests__/slice-14-proposals-repo.test.ts apps/web/src/__tests__/slice-14-folders-repo.test.ts`
Expected: PASS — unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/db/schema.ts apps/web/src/server/repo/postgres.ts apps/web/drizzle
git commit -m "feat(repo): postgres parity for folders + proposal meta; migration 0005"
```

---

### Task 4: API — `POST /api/proposals` (folderId) + `PATCH /api/proposals/[id]`

**Files:**
- Modify: `apps/web/app/api/proposals/route.ts`
- Modify: `apps/web/app/api/proposals/[id]/route.ts`
- Test: `apps/web/src/__tests__/slice-14-proposals-routes.test.ts` (create)

**Interfaces:**
- Consumes: `getOwner`/`requireOwnedProposal`, `getRepo()`.
- Produces: `POST /api/proposals` reads optional `folderId`; `PATCH /api/proposals/[id]` `{title?, folderId?}` → `200 { proposal: ProposalSummary }`, 400 empty/foreign-folder, 404.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-proposals-routes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as createProposal } from "../../app/api/proposals/route";
import { PATCH } from "../../app/api/proposals/[id]/route";

const post = (body: unknown) =>
  new Request("http://x/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const patch = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/proposals/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

describe("POST /api/proposals (folderId)", () => {
  it("creates in a folder", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const res = await createProposal(post({ document: sampleProposal, folderId: f.id }));
    expect(res.status).toBe(201);
    expect((await getRepo().listProposals("owner_a"))[0]!.folderId).toBe(f.id);
  });
});

describe("PATCH /api/proposals/[id]", () => {
  it("renames and moves into an owned folder", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const r1 = patch(c.id, { title: "Renamed" });
    expect((await PATCH(r1.req, r1.ctx)).status).toBe(200);
    const r2 = patch(c.id, { folderId: f.id });
    expect(((await (await PATCH(r2.req, r2.ctx)).json()) as { proposal: { folderId: string } }).proposal.folderId).toBe(f.id);
  });

  it("400s an empty patch and a foreign folder", async () => {
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const empty = patch(c.id, {});
    expect((await PATCH(empty.req, empty.ctx)).status).toBe(400);
    const foreign = patch(c.id, { folderId: "fld_not_mine" });
    expect((await PATCH(foreign.req, foreign.ctx)).status).toBe(400);
  });

  it("404s another owner's proposal", async () => {
    const c = await getRepo().createProposal("owner_b", sampleProposal);
    const r = patch(c.id, { title: "x" });
    expect((await PATCH(r.req, r.ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-proposals-routes.test.ts`
Expected: FAIL — `PATCH` not exported; POST ignores `folderId`.

- [ ] **Step 3: Extend POST in `apps/web/app/api/proposals/route.ts`**

Replace the `POST` body so it accepts an optional `folderId`:

```ts
export async function POST(request: Request): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { document?: ProposalDocument; folderId?: string | null } | ProposalDocument | null;
  // Back-compat: accept either a bare document or { document, folderId }.
  const document = (body && "document" in (body as object) ? (body as { document?: ProposalDocument }).document : (body as ProposalDocument)) ?? null;
  const folderId = body && "folderId" in (body as object) ? ((body as { folderId?: string | null }).folderId ?? null) : null;
  if (!document || typeof document !== "object" || !Array.isArray(document.sections)) {
    return NextResponse.json({ error: "Expected a ProposalDocument" }, { status: 400 });
  }
  const proposal = await getRepo().createProposal(owner, document, folderId);
  return NextResponse.json({ proposal }, { status: 201 });
}
```

- [ ] **Step 4: Add PATCH in `apps/web/app/api/proposals/[id]/route.ts`**

Append a `PATCH` handler (keep existing GET/PUT/DELETE):

```ts
/** PATCH — rename (title) and/or move (folderId). Owner-scoped. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const { id } = await params;
  const owned = await requireOwnedProposal(id);
  if (owned instanceof Response) return owned;

  const body = (await request.json().catch(() => null)) as { title?: unknown; folderId?: unknown } | null;
  const patch: { title?: string; folderId?: string | null } = {};
  if (typeof body?.title === "string" && body.title.trim() !== "") patch.title = body.title.trim();
  if (body && "folderId" in body) {
    const fid = body.folderId;
    if (fid !== null && typeof fid !== "string") return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
    if (typeof fid === "string") {
      const owns = (await getRepo().listFolders(owned.ownerId)).some((f) => f.id === fid);
      if (!owns) return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
    }
    patch.folderId = fid as string | null;
  }
  if (patch.title === undefined && patch.folderId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const summary = await getRepo().updateProposalMeta(id, patch);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ proposal: summary });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-proposals-routes.test.ts`
Expected: PASS (4/4).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/proposals/route.ts "apps/web/app/api/proposals/[id]/route.ts" apps/web/src/__tests__/slice-14-proposals-routes.test.ts
git commit -m "feat(api): POST folderId + PATCH /api/proposals/[id] (rename/move)"
```

---

### Task 5: API — `POST /api/proposals/[id]/duplicate`

**Files:**
- Create: `apps/web/app/api/proposals/[id]/duplicate/route.ts`
- Test: `apps/web/src/__tests__/slice-14-duplicate-route.test.ts` (create)

**Interfaces:**
- Consumes: `getOwner`, `getRepo().duplicateProposal`.
- Produces: `POST` → `201 { proposal: ProposalSummary }`; 401 unauth; 404 unknown/not-owned.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-duplicate-route.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST } from "../../app/api/proposals/[id]/duplicate/route";

const call = (id: string) => ({
  req: new Request(`http://x/api/proposals/${id}/duplicate`, { method: "POST" }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

describe("POST /api/proposals/[id]/duplicate", () => {
  it("duplicates an owned proposal (201)", async () => {
    const c = await getRepo().createProposal("owner_a", sampleProposal);
    const { req, ctx } = call(c.id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(201);
    expect((await getRepo().listProposals("owner_a"))).toHaveLength(2);
  });

  it("404s another owner's proposal", async () => {
    const c = await getRepo().createProposal("owner_b", sampleProposal);
    const { req, ctx } = call(c.id);
    expect((await POST(req, ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-duplicate-route.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/proposals/[id]/duplicate/route.ts`:

```ts
// apps/web/app/api/proposals/[id]/duplicate/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../../../src/server/auth/owner";
import { getRepo } from "../../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** POST — duplicate an owned proposal as "Copy of …". */
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const dup = await getRepo().duplicateProposal(owner, id);
  if (!dup) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { proposal: { id: dup.id, title: dup.document.title, client: dup.document.client?.name ?? "", folderId: dup.folderId, updatedAt: dup.updatedAt } },
    { status: 201 },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-duplicate-route.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/proposals/[id]/duplicate/route.ts" apps/web/src/__tests__/slice-14-duplicate-route.test.ts
git commit -m "feat(api): POST /api/proposals/[id]/duplicate"
```

---

### Task 6: API — `/api/folders` + `/api/folders/[id]`

**Files:**
- Create: `apps/web/app/api/folders/route.ts`
- Create: `apps/web/app/api/folders/[id]/route.ts`
- Test: `apps/web/src/__tests__/slice-14-folders-routes.test.ts` (create)

**Interfaces:**
- Consumes: `getOwner`, `getRepo()` folder methods.
- Produces: `GET /api/folders` → `{ folders }`; `POST` `{name}` → `201 { folder }` / 400; `PATCH /api/folders/[id]` `{name}` → `200 { folder }` / 400 / 404; `DELETE` → `204` / 404.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-folders-routes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { GET, POST } from "../../app/api/folders/route";
import { PATCH, DELETE } from "../../app/api/folders/[id]/route";

const post = (body: unknown) =>
  new Request("http://x/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const idReq = (id: string, method: string, body?: unknown) => ({
  req: new Request(`http://x/api/folders/${id}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

describe("/api/folders", () => {
  it("creates, lists, 400s empty name", async () => {
    expect((await POST(post({ name: "Sales" }))).status).toBe(201);
    expect((await POST(post({ name: "  " }))).status).toBe(400);
    const body = (await (await GET()).json()) as { folders: { name: string }[] };
    expect(body.folders.map((f) => f.name)).toEqual(["Sales"]);
  });

  it("renames (200) and deletes (204); 404 unknown", async () => {
    const f = await getRepo().createFolder("owner_a", "Sales");
    const r = idReq(f.id, "PATCH", { name: "Renamed" });
    expect((await PATCH(r.req, r.ctx)).status).toBe(200);
    const d = idReq(f.id, "DELETE");
    expect((await DELETE(d.req, d.ctx)).status).toBe(204);
    const gone = idReq(f.id, "DELETE");
    expect((await DELETE(gone.req, gone.ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folders-routes.test.ts`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement `apps/web/app/api/folders/route.ts`**

```ts
// apps/web/app/api/folders/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../src/server/auth/owner";
import { getRepo } from "../../../src/server/repo";

/** GET — list the owner's folders. */
export async function GET(): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ folders: await getRepo().listFolders(owner) });
}

/** POST — create a folder. Body { name }. */
export async function POST(request: Request): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name === "") return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  return NextResponse.json({ folder: await getRepo().createFolder(owner, name) }, { status: 201 });
}
```

- [ ] **Step 4: Implement `apps/web/app/api/folders/[id]/route.ts`**

```ts
// apps/web/app/api/folders/[id]/route.ts
import { NextResponse } from "next/server";
import { getOwner } from "../../../../src/server/auth/owner";
import { getRepo } from "../../../../src/server/repo";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — rename a folder. Body { name }. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name === "") return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  const folder = await getRepo().renameFolder(owner, id, name);
  if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ folder });
}

/** DELETE — remove a folder; its proposals become Unfiled. */
export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await getRepo().deleteFolder(owner, id);
  return ok ? new Response(null, { status: 204 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folders-routes.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/folders apps/web/src/__tests__/slice-14-folders-routes.test.ts
git commit -m "feat(api): folders CRUD routes"
```

---

### Task 7: Client modules — `proposals.ts` extended + `folders.ts`

**Files:**
- Modify: `apps/web/src/client/persistence.ts`
- Create: `apps/web/src/client/folders.ts`
- Test: `apps/web/src/__tests__/slice-14-clients.test.ts` (create)

**Interfaces:**
- Produces (in `persistence.ts`):
  - `ProposalSummary` updated to `{ id, title, client, folderId, updatedAt }`
  - `createProposal(document, folderId?: string | null)` (now sends `{document, folderId}`)
  - `updateProposalMeta(id, patch): Promise<ProposalSummary>`
  - `duplicateProposal(id): Promise<ProposalSummary>`
  - `deleteProposal(id): Promise<void>`
  - `downloadProposalPdf(id): Promise<void>`
- Produces (in `folders.ts`): `Folder` type, `fetchFolders()`, `createFolder(name)`, `renameFolder(id, name)`, `deleteFolder(id)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-clients.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateProposalMeta, duplicateProposal, deleteProposal } from "../client/persistence";
import { fetchFolders, createFolder, deleteFolder } from "../client/folders";

afterEach(() => vi.unstubAllGlobals());
const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("client proposals meta", () => {
  it("updateProposalMeta PATCHes and returns the summary", async () => {
    const f = vi.fn(() => ok({ proposal: { id: "p1", title: "T", client: "C", folderId: null, updatedAt: "t" } }));
    vi.stubGlobal("fetch", f);
    expect((await updateProposalMeta("p1", { title: "T" })).title).toBe("T");
    expect(f).toHaveBeenCalledWith("/api/proposals/p1", expect.objectContaining({ method: "PATCH" }));
  });

  it("duplicateProposal POSTs to the duplicate route", async () => {
    const f = vi.fn(() => ok({ proposal: { id: "p2", title: "Copy", client: "C", folderId: null, updatedAt: "t" } }, 201));
    vi.stubGlobal("fetch", f);
    expect((await duplicateProposal("p1")).id).toBe("p2");
    expect(f).toHaveBeenCalledWith("/api/proposals/p1/duplicate", expect.objectContaining({ method: "POST" }));
  });

  it("deleteProposal DELETEs", async () => {
    const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", f);
    await deleteProposal("p1");
    expect(f).toHaveBeenCalledWith("/api/proposals/p1", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("client folders", () => {
  it("fetchFolders unwraps { folders }", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ folders: [{ id: "f1", ownerId: "o", name: "Sales", createdAt: "t" }] })));
    expect((await fetchFolders())[0]!.name).toBe("Sales");
  });
  it("createFolder POSTs name; deleteFolder DELETEs", async () => {
    const f = vi.fn(() => ok({ folder: { id: "f1", ownerId: "o", name: "Sales", createdAt: "t" } }, 201));
    vi.stubGlobal("fetch", f);
    await createFolder("Sales");
    expect(f).toHaveBeenCalledWith("/api/folders", expect.objectContaining({ method: "POST" }));
    const d = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", d);
    await deleteFolder("f1");
    expect(d).toHaveBeenCalledWith("/api/folders/f1", expect.objectContaining({ method: "DELETE" }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-clients.test.ts`
Expected: FAIL — new functions / `folders` module missing.

- [ ] **Step 3: Extend `apps/web/src/client/persistence.ts`**

Replace the `ProposalSummary` interface and the `createProposal`/`listProposals` to the new shapes, and add the new functions:

```ts
export interface ProposalSummary {
  id: string;
  title: string;
  client: string;
  folderId: string | null;
  updatedAt: string;
}

export async function createProposal(
  document: ProposalDocument,
  folderId: string | null = null,
): Promise<{ id: string; document: ProposalDocument }> {
  const res = await fetch("/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, folderId }),
  });
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  const body = (await res.json()) as { proposal: { id: string; document: ProposalDocument } };
  return { id: body.proposal.id, document: body.proposal.document };
}

export async function updateProposalMeta(
  id: string,
  patch: { title?: string; folderId?: string | null },
): Promise<ProposalSummary> {
  const res = await fetch(`/api/proposals/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update failed (${res.status})`);
  return ((await res.json()) as { proposal: ProposalSummary }).proposal;
}

export async function duplicateProposal(id: string): Promise<ProposalSummary> {
  const res = await fetch(`/api/proposals/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error(`Duplicate failed (${res.status})`);
  return ((await res.json()) as { proposal: ProposalSummary }).proposal;
}

export async function deleteProposal(id: string): Promise<void> {
  const res = await fetch(`/api/proposals/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

/** Export to PDF and trigger a browser download. */
export async function downloadProposalPdf(id: string): Promise<void> {
  const res = await fetch(`/api/proposals/${id}/export`, { method: "POST" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proposal-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

(The existing `listProposals` keeps its body — it already returns the JSON `proposals` array, which now has the richer shape; the type annotation now matches.)

- [ ] **Step 4: Create `apps/web/src/client/folders.ts`**

```ts
export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
}

export async function fetchFolders(): Promise<Folder[]> {
  const res = await fetch("/api/folders");
  if (!res.ok) throw new Error(`Failed to load folders (${res.status})`);
  return ((await res.json()) as { folders: Folder[] }).folders;
}

export async function createFolder(name: string): Promise<Folder> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Create folder failed (${res.status})`);
  return ((await res.json()) as { folder: Folder }).folder;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const res = await fetch(`/api/folders/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Rename folder failed (${res.status})`);
  return ((await res.json()) as { folder: Folder }).folder;
}

export async function deleteFolder(id: string): Promise<void> {
  const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete folder failed (${res.status})`);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-clients.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Commit**

Run: `npm run typecheck` — exit 0.

```bash
git add apps/web/src/client/persistence.ts apps/web/src/client/folders.ts apps/web/src/__tests__/slice-14-clients.test.ts
git commit -m "feat(client): proposal meta/duplicate/delete/download + folders module"
```

---

### Task 8: Editor route `/p/[id]` + `App` loads by id + ← Dashboard link

**Files:**
- Create: `apps/web/app/p/[id]/page.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/__tests__/slice-14-editor-route.test.tsx` (create)

**Interfaces:**
- Consumes: `store.load(id)`; `persistence.loadProposal` (used by the store).
- Produces: `App({ id }: { id?: string })` — when `id` is given and differs from `proposalId`, it loads on mount and shows a loading state until ready; renders a ← Dashboard link. `/p/[id]` renders `<App id={id} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-editor-route.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { App } from "../App";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = String(url);
    if (u.includes("/api/proposals/")) return Promise.resolve(new Response(JSON.stringify({ proposal: { document: { ...sampleProposal, title: "Loaded One" } } }), { status: 200, headers: { "content-type": "application/json" } }));
    const body = u.includes("/api/templates") ? { templates: [] } : { sectionTypes: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  }));
}

describe("editor /p/[id]", () => {
  it("loads the proposal by id and shows a Dashboard back link", async () => {
    stubFetch();
    useProposalStore.setState({ proposalId: null });
    render(<App id="prop_123" />);
    await waitFor(() => expect(screen.getByText("Loaded One")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-editor-route.test.tsx`
Expected: FAIL — `App` takes no `id`; no Dashboard link.

- [ ] **Step 3: Update `apps/web/src/App.tsx`**

Add the `id` prop, load-on-mount, and the back link. Replace the component signature + effect and add the link in the topbar:

```tsx
export function App({ id }: { id?: string } = {}) {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const proposalId = useProposalStore((s) => s.proposalId);
  const loadProposal = useProposalStore((s) => s.load);
  const loadSectionTypes = useProposalStore((s) => s.loadSectionTypes);
  const loadTemplates = useProposalStore((s) => s.loadTemplates);

  useEffect(() => {
    void loadSectionTypes();
    void loadTemplates();
  }, [loadSectionTypes, loadTemplates]);

  useEffect(() => {
    if (id && id !== proposalId) void loadProposal(id);
  }, [id, proposalId, loadProposal]);

  const loading = Boolean(id) && proposalId !== id;
  if (loading) {
    return <div className="app app--loading">Loading proposal…</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <a className="btn btn--ghost" href="/">← Dashboard</a>
          <span className="topbar__title">{document.title}</span>
          <span className="topbar__sub">{document.client.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <SaveControl />
          <ExportGate />
          <SignOutButton />
        </div>
      </header>
      <Autosave />
      <Toast />

      <div className="workspace">
        <Outline />
        <main aria-label="Preview" className="canvas">
          <div className="sheet">
            <DocumentRenderer document={document} theme={theme} />
          </div>
        </main>
        <Inspector />
      </div>
    </div>
  );
}
```

(Keep the existing imports; `useEffect` is already imported.)

> Note on load failure: `store.load` throws if the fetch fails; for v1 the loading state simply persists on error. A redirect-on-404 is added in Task 12's polish step.

- [ ] **Step 4: Create `apps/web/app/p/[id]/page.tsx`**

```tsx
import { App } from "../../../src/App";

type Ctx = { params: Promise<{ id: string }> };

/** Editor for a single proposal. The client shell loads it by id (App). */
export default async function ProposalEditorPage({ params }: Ctx) {
  const { id } = await params;
  return <App id={id} />;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-editor-route.test.tsx`
Expected: PASS (1/1).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/p/[id]/page.tsx" apps/web/src/App.tsx apps/web/src/__tests__/slice-14-editor-route.test.tsx
git commit -m "feat(editor): /p/[id] route, App loads by id, Dashboard back link"
```

---

### Task 9: Dashboard page + container + grid/cards (open · download · ⋯ actions)

**Files:**
- Modify: `apps/web/app/page.tsx` (→ server dashboard)
- Create: `apps/web/src/ui/dashboard/Dashboard.tsx`
- Create: `apps/web/src/ui/dashboard/ProposalGrid.tsx`
- Create: `apps/web/src/ui/dashboard/ProposalCard.tsx`
- Test: `apps/web/src/__tests__/slice-14-dashboard.test.tsx` (create)

**Interfaces:**
- Consumes: `persistence.listProposals/updateProposalMeta/duplicateProposal/deleteProposal/downloadProposalPdf`, `folders.fetchFolders`, `ProposalSummary`, `Folder`.
- Produces: `Dashboard({ initialProposals, initialFolders, isAdmin }: { initialProposals: ProposalSummary[]; initialFolders: Folder[]; isAdmin: boolean })`. Search (title+client), sort (recent|title), folder filter via `selectedFolderId` state (set by the sidebar in Task 10). `NewProposalDialog` mounts in Task 11.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-dashboard.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Dashboard } from "../ui/dashboard/Dashboard";
import type { ProposalSummary } from "../client/persistence";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const props: ProposalSummary[] = [
  { id: "p1", title: "Acme Q3", client: "Acme Inc", folderId: null, updatedAt: "2026-06-10T00:00:00.000Z" },
  { id: "p2", title: "Tidal PPA", client: "Tidal Energy", folderId: null, updatedAt: "2026-06-18T00:00:00.000Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("renders proposal cards and filters by search", async () => {
    render(<Dashboard initialProposals={props} initialFolders={[]} isAdmin={false} />);
    expect(screen.getByText("Acme Q3")).toBeInTheDocument();
    expect(screen.getByText("Tidal PPA")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "tidal" } });
    expect(screen.queryByText("Acme Q3")).not.toBeInTheDocument();
    expect(screen.getByText("Tidal PPA")).toBeInTheDocument();
  });

  it("Open links to /p/[id]", () => {
    render(<Dashboard initialProposals={props} initialFolders={[]} isAdmin={false} />);
    const card = screen.getByText("Acme Q3").closest("[data-proposal]") as HTMLElement;
    expect(within(card).getByRole("link", { name: /open/i })).toHaveAttribute("href", "/p/p1");
  });

  it("shows an empty state when there are no proposals", () => {
    render(<Dashboard initialProposals={[]} initialFolders={[]} isAdmin={false} />);
    expect(screen.getByText(/no proposals yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-dashboard.test.tsx`
Expected: FAIL — `Dashboard` doesn't exist.

- [ ] **Step 3: Create `apps/web/src/ui/dashboard/ProposalCard.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ProposalSummary } from "../../client/persistence";
import type { Folder } from "../../client/folders";

function ago(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export function ProposalCard({
  proposal,
  folders,
  onDownload,
  onDuplicate,
  onRename,
  onMove,
  onDelete,
}: {
  proposal: ProposalSummary;
  folders: Folder[];
  onDownload: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, current: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const folderName = proposal.folderId ? folders.find((f) => f.id === proposal.folderId)?.name ?? "—" : "Unfiled";

  return (
    <li data-proposal={proposal.id} className="pcard">
      <div className="pcard__body">
        <span className="pcard__title">{proposal.title}</span>
        <span className="pcard__client">{proposal.client || "—"}</span>
        <span className="pcard__meta">edited {ago(proposal.updatedAt)}</span>
        <span className="tag">{folderName}</span>
      </div>
      <div className="pcard__actions">
        <a className="btn btn--primary" href={`/p/${proposal.id}`}>Open</a>
        <button type="button" className="btn" aria-label="Download" onClick={() => onDownload(proposal.id)}>⬇</button>
        <button type="button" className="btn" aria-label="More actions" onClick={() => setMenu((m) => !m)}>⋯</button>
      </div>
      {menu ? (
        <div className="pcard__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onDuplicate(proposal.id); }}>Duplicate</button>
          <button type="button" role="menuitem" onClick={() => { setMenu(false); onRename(proposal.id, proposal.title); }}>Rename</button>
          <div className="pcard__submenu">
            <span className="pcard__submenu-label">Move to</span>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onMove(proposal.id, null); }}>Unfiled</button>
            {folders.map((f) => (
              <button key={f.id} type="button" role="menuitem" onClick={() => { setMenu(false); onMove(proposal.id, f.id); }}>{f.name}</button>
            ))}
          </div>
          <button type="button" role="menuitem" className="pcard__danger" onClick={() => { setMenu(false); onDelete(proposal.id); }}>Delete</button>
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: Create `apps/web/src/ui/dashboard/ProposalGrid.tsx`**

```tsx
"use client";

import type { ProposalSummary } from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { ProposalCard } from "./ProposalCard";

export function ProposalGrid({
  proposals,
  folders,
  handlers,
}: {
  proposals: ProposalSummary[];
  folders: Folder[];
  handlers: {
    onDownload: (id: string) => void;
    onDuplicate: (id: string) => void;
    onRename: (id: string, current: string) => void;
    onMove: (id: string, folderId: string | null) => void;
    onDelete: (id: string) => void;
  };
}) {
  if (proposals.length === 0) {
    return <p className="dash__empty">No matches.</p>;
  }
  return (
    <ul className="pgrid">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} folders={folders} {...handlers} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Create `apps/web/src/ui/dashboard/Dashboard.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listProposals,
  updateProposalMeta,
  duplicateProposal,
  deleteProposal,
  downloadProposalPdf,
  type ProposalSummary,
} from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";
import { ProposalGrid } from "./ProposalGrid";

type Sort = "recent" | "title";

export function Dashboard({
  initialProposals,
  initialFolders,
  isAdmin,
}: {
  initialProposals: ProposalSummary[];
  initialFolders: Folder[];
  isAdmin: boolean;
}) {
  const notify = useProposalStore((s) => s.notify);
  const router = useRouter();
  const [proposals, setProposals] = useState(initialProposals);
  const [folders] = useState(initialFolders);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const selectedFolderId: string | null | "all" = "all"; // sidebar wires this in Task 10

  const refresh = async () => {
    try {
      setProposals(await listProposals());
    } catch {
      notify("error", "Couldn't refresh proposals.");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = proposals;
    if (selectedFolderId !== "all") {
      list = list.filter((p) => (selectedFolderId === null ? p.folderId === null : p.folderId === selectedFolderId));
    }
    if (q) list = list.filter((p) => p.title.toLowerCase().includes(q) || p.client.toLowerCase().includes(q));
    return [...list].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [proposals, search, sort, selectedFolderId]);

  const handlers = {
    onDownload: async (id: string) => {
      try {
        await downloadProposalPdf(id);
      } catch {
        notify("error", "Export failed.");
      }
    },
    onDuplicate: async (id: string) => {
      try {
        await duplicateProposal(id);
        await refresh();
        notify("success", "Duplicated.");
      } catch {
        notify("error", "Duplicate failed.");
      }
    },
    onRename: async (id: string, current: string) => {
      const title = window.prompt("Rename proposal", current);
      if (title === null || title.trim() === "") return;
      try {
        await updateProposalMeta(id, { title: title.trim() });
        await refresh();
      } catch {
        notify("error", "Rename failed.");
      }
    },
    onMove: async (id: string, folderId: string | null) => {
      try {
        await updateProposalMeta(id, { folderId });
        await refresh();
      } catch {
        notify("error", "Move failed.");
      }
    },
    onDelete: async (id: string) => {
      if (!window.confirm("Delete this proposal? This can't be undone.")) return;
      try {
        await deleteProposal(id);
        setProposals((prev) => prev.filter((p) => p.id !== id));
      } catch {
        notify("error", "Delete failed.");
      }
    },
  };

  return (
    <div className="dash">
      <header className="topbar">
        <span className="topbar__title">Proposal Generator</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {isAdmin ? <a className="btn btn--ghost" href="/admin">Admin</a> : null}
          <a className="btn btn--ghost" href="/api/auth/signout">Sign out</a>
        </div>
      </header>

      <div className="dash__toolbar">
        <input aria-label="Search title or client" placeholder="Search title or client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Recent</option>
          <option value="title">Title A–Z</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => router.push("/p/new")}>+ New</button>
      </div>

      <main className="dash__main">
        {proposals.length === 0 ? (
          <div className="dash__empty">
            <p>No proposals yet.</p>
          </div>
        ) : (
          <ProposalGrid proposals={visible} folders={folders} handlers={handlers} />
        )}
      </main>
    </div>
  );
}
```

> The `+ New` button routes to `/p/new` as a placeholder; Task 11 replaces it with the `NewProposalDialog`. `SignOutButton` is a client component used in the editor; here the dashboard header uses a plain sign-out link to keep the server/client split simple.

- [ ] **Step 6: Replace `apps/web/app/page.tsx` with the server dashboard**

```tsx
import { redirect } from "next/navigation";
import { getSessionUser } from "../src/server/auth/sessionUser";
import { getRepo } from "../src/server/repo";
import { Dashboard } from "../src/ui/dashboard/Dashboard";

export const runtime = "nodejs";

/** Home — the signed-in user's proposal dashboard. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/signin");

  const [proposals, folders] = await Promise.all([
    getRepo().listProposals(user.id),
    getRepo().listFolders(user.id),
  ]);
  return <Dashboard initialProposals={proposals} initialFolders={folders} isAdmin={user.isAdmin} />;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-dashboard.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 8: Commit**

Run: `npm run typecheck` — exit 0.

```bash
git add apps/web/app/page.tsx apps/web/src/ui/dashboard/Dashboard.tsx apps/web/src/ui/dashboard/ProposalGrid.tsx apps/web/src/ui/dashboard/ProposalCard.tsx apps/web/src/__tests__/slice-14-dashboard.test.tsx
git commit -m "feat(dashboard): server home page + grid/cards with search/sort/actions"
```

---

### Task 10: Folder sidebar (filter + folder CRUD UI)

**Files:**
- Create: `apps/web/src/ui/dashboard/FolderSidebar.tsx`
- Modify: `apps/web/src/ui/dashboard/Dashboard.tsx` (mount sidebar + wire `selectedFolderId` state)
- Test: `apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx` (create)

**Interfaces:**
- Consumes: `folders.fetchFolders/createFolder/renameFolder/deleteFolder`, `Folder`.
- Produces: `FolderSidebar({ folders, counts, selected, onSelect, onChange })` where `selected` is `"all" | null | string` and `onChange()` refreshes folders+proposals. Dashboard holds `selectedFolderId` state (replacing the Task 9 constant) and a `folders` state setter.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { FolderSidebar } from "../ui/dashboard/FolderSidebar";
import type { Folder } from "../client/folders";

afterEach(cleanup);

const folders: Folder[] = [{ id: "f1", ownerId: "o", name: "Sales", createdAt: "t" }];

describe("FolderSidebar", () => {
  it("lists All / folder / Unfiled and fires onSelect", () => {
    const onSelect = vi.fn();
    render(<FolderSidebar folders={folders} counts={{ all: 3, unfiled: 1, byFolder: { f1: 2 } }} selected="all" onSelect={onSelect} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sales/i }));
    expect(onSelect).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByRole("button", { name: /unfiled/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx`
Expected: FAIL — `FolderSidebar` doesn't exist.

- [ ] **Step 3: Create `apps/web/src/ui/dashboard/FolderSidebar.tsx`**

```tsx
"use client";

import type { Folder } from "../../client/folders";
import { createFolder, renameFolder, deleteFolder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";

type Selected = "all" | null | string;

export function FolderSidebar({
  folders,
  counts,
  selected,
  onSelect,
  onChange,
}: {
  folders: Folder[];
  counts: { all: number; unfiled: number; byFolder: Record<string, number> };
  selected: Selected;
  onSelect: (s: Selected) => void;
  onChange: () => void | Promise<void>;
}) {
  const notify = useProposalStore((s) => s.notify);

  const add = async () => {
    const name = window.prompt("New folder name");
    if (name === null || name.trim() === "") return;
    try {
      await createFolder(name.trim());
      await onChange();
    } catch {
      notify("error", "Couldn't create the folder.");
    }
  };
  const rename = async (f: Folder) => {
    const name = window.prompt("Rename folder", f.name);
    if (name === null || name.trim() === "") return;
    try {
      await renameFolder(f.id, name.trim());
      await onChange();
    } catch {
      notify("error", "Couldn't rename the folder.");
    }
  };
  const remove = async (f: Folder) => {
    if (!window.confirm(`Delete folder "${f.name}"? Its proposals move to Unfiled.`)) return;
    try {
      await deleteFolder(f.id);
      if (selected === f.id) onSelect("all");
      await onChange();
    } catch {
      notify("error", "Couldn't delete the folder.");
    }
  };

  const cls = (s: Selected) => `dash__folder${selected === s ? " dash__folder--active" : ""}`;

  return (
    <nav className="dash__sidebar" aria-label="Folders">
      <button type="button" className={cls("all")} onClick={() => onSelect("all")}>All <span className="dash__count">{counts.all}</span></button>
      {folders.map((f) => (
        <div key={f.id} className="dash__folderrow">
          <button type="button" className={cls(f.id)} onClick={() => onSelect(f.id)}>
            {f.name} <span className="dash__count">{counts.byFolder[f.id] ?? 0}</span>
          </button>
          <button type="button" className="dash__folderedit" aria-label={`Rename ${f.name}`} onClick={() => rename(f)}>✎</button>
          <button type="button" className="dash__folderdel" aria-label={`Delete ${f.name}`} onClick={() => remove(f)}>🗑</button>
        </div>
      ))}
      <button type="button" className={cls(null)} onClick={() => onSelect(null)}>Unfiled <span className="dash__count">{counts.unfiled}</span></button>
      <button type="button" className="btn dash__addfolder" onClick={add}>+ New folder</button>
    </nav>
  );
}
```

- [ ] **Step 4: Wire the sidebar into `Dashboard.tsx`**

- Add imports:

```tsx
import { fetchFolders } from "../../client/folders";
import { FolderSidebar } from "./FolderSidebar";
```

- Replace the `const [folders] = useState(initialFolders);` line and the `selectedFolderId` constant with state:

```tsx
  const [folders, setFolders] = useState(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState<"all" | null | string>("all");
```

- Add a folder refresh and counts:

```tsx
  const refreshFolders = async () => {
    try {
      setFolders(await fetchFolders());
      setProposals(await listProposals());
    } catch {
      notify("error", "Couldn't refresh folders.");
    }
  };

  const counts = useMemo(() => ({
    all: proposals.length,
    unfiled: proposals.filter((p) => p.folderId === null).length,
    byFolder: folders.reduce<Record<string, number>>((acc, f) => {
      acc[f.id] = proposals.filter((p) => p.folderId === f.id).length;
      return acc;
    }, {}),
  }), [proposals, folders]);
```

- Wrap the main area so the sidebar sits beside it (replace the `<main className="dash__main">…</main>` block):

```tsx
      <div className="dash__body">
        <FolderSidebar folders={folders} counts={counts} selected={selectedFolderId} onSelect={setSelectedFolderId} onChange={refreshFolders} />
        <main className="dash__main">
          {proposals.length === 0 ? (
            <div className="dash__empty"><p>No proposals yet.</p></div>
          ) : (
            <ProposalGrid proposals={visible} folders={folders} handlers={handlers} />
          )}
        </main>
      </div>
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx apps/web/src/__tests__/slice-14-dashboard.test.tsx`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/dashboard/FolderSidebar.tsx apps/web/src/ui/dashboard/Dashboard.tsx apps/web/src/__tests__/slice-14-folder-sidebar.test.tsx
git commit -m "feat(dashboard): folder sidebar with filter + folder CRUD"
```

---

### Task 11: New-proposal dialog (pick template → create → open)

**Files:**
- Create: `apps/web/src/ui/dashboard/NewProposalDialog.tsx`
- Modify: `apps/web/src/ui/dashboard/Dashboard.tsx` (open the dialog from + New)
- Test: `apps/web/src/__tests__/slice-14-new-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `fetchTemplates` (`client/templates`), `applyTemplate` (`@proposal/shared`), `createProposal` (`client/persistence`), `useRouter`, `Folder`.
- Produces: `NewProposalDialog({ folders, onClose })` — fetches templates on mount; Create → `applyTemplate(template)` → `createProposal(document, folderId)` → `router.push('/p/<id>')`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-14-new-dialog.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewProposalDialog } from "../ui/dashboard/NewProposalDialog";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/templates")) return Promise.resolve(new Response(JSON.stringify({ templates: [{ id: "tmpl_open", name: "Open", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }] }] }), { status: 200, headers: { "content-type": "application/json" } }));
    if (u === "/api/proposals" && init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ proposal: { id: "prop_new", document: {} } }), { status: 201, headers: { "content-type": "application/json" } }));
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewProposalDialog", () => {
  it("creates from a template and routes to the new editor", async () => {
    render(<NewProposalDialog folders={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/template/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Acme Q3" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/p/prop_new"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-new-dialog.test.tsx`
Expected: FAIL — dialog doesn't exist.

- [ ] **Step 3: Create `apps/web/src/ui/dashboard/NewProposalDialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate, type Template } from "@proposal/shared";
import { fetchTemplates } from "../../client/templates";
import { createProposal } from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";

export function NewProposalDialog({ folders, onClose }: { folders: Folder[]; onClose: () => void }) {
  const notify = useProposalStore((s) => s.notify);
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const t = (await fetchTemplates()).filter((x) => !x.deprecated);
        setTemplates(t);
        setTemplateId(t[0]?.id ?? "");
      } catch {
        notify("error", "Couldn't load templates.");
      }
    })();
  }, [notify]);

  const create = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setBusy(true);
    try {
      const document = applyTemplate(template);
      if (title.trim()) document.title = title.trim();
      const { id } = await createProposal(document, folderId === "" ? null : folderId);
      router.push(`/p/${id}`);
    } catch {
      notify("error", "Couldn't create the proposal.");
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-label="New proposal">
      <div className="modal__card">
        <h2>New proposal</h2>
        <label className="field"><span className="field__label">Title</span>
          <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled proposal" />
        </label>
        <label className="field"><span className="field__label">Template</span>
          <select aria-label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Folder</span>
          <select aria-label="Folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Unfiled</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={busy || templateId === ""} onClick={() => void create()}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Open the dialog from Dashboard's + New**

In `apps/web/src/ui/dashboard/Dashboard.tsx`:
- Add `import { NewProposalDialog } from "./NewProposalDialog";` and a state `const [showNew, setShowNew] = useState(false);`.
- Change the `+ New` button's handler to `onClick={() => setShowNew(true)}`.
- Before the closing `</div>` of `.dash`, render the dialog and the empty-state's New button:

```tsx
      {showNew ? <NewProposalDialog folders={folders} onClose={() => setShowNew(false)} /> : null}
```
- In the empty state, make the New button open it too:

```tsx
            <div className="dash__empty">
              <p>No proposals yet.</p>
              <button type="button" className="btn btn--primary" onClick={() => setShowNew(true)}>+ New proposal</button>
            </div>
```
- Remove the now-unused `useRouter`/`router` if nothing else uses it (the dialog owns routing). If `router` is unused after this, delete its import + declaration to satisfy lint/typecheck.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run apps/web/src/__tests__/slice-14-new-dialog.test.tsx apps/web/src/__tests__/slice-14-dashboard.test.tsx`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/dashboard/NewProposalDialog.tsx apps/web/src/ui/dashboard/Dashboard.tsx apps/web/src/__tests__/slice-14-new-dialog.test.tsx
git commit -m "feat(dashboard): new-proposal dialog (template pick → create → open)"
```

---

### Task 12: Styles, load-failure redirect, full verify

**Files:**
- Modify: `apps/web/app/globals.css` (dashboard + card + modal styles)
- Modify: `apps/web/src/App.tsx` (redirect to `/` on load failure)
- Test: `apps/web/src/__tests__/slice-14-editor-redirect.test.tsx` (create)

**Interfaces:**
- Consumes: everything above.
- Produces: dashboard visual styles; editor bounces to `/` when a proposal fails to load.

- [ ] **Step 1: Write the failing test (load-failure redirect)**

Create `apps/web/src/__tests__/slice-14-editor-redirect.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { App } from "../App";
import { useProposalStore } from "../state/proposalStore";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editor load failure", () => {
  it("redirects to / when the proposal can't be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).includes("/api/proposals/")) return Promise.resolve(new Response(JSON.stringify({ error: "Not found" }), { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify({ sectionTypes: [], templates: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    }));
    useProposalStore.setState({ proposalId: null });
    render(<App id="prop_missing" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-14-editor-redirect.test.tsx`
Expected: FAIL — App doesn't redirect on load error.

- [ ] **Step 3: Add redirect-on-failure to `App.tsx`**

Replace the load effect with one that catches and redirects (add `import { useRouter } from "next/navigation";` and `const router = useRouter();`):

```tsx
  const router = useRouter();
  useEffect(() => {
    if (id && id !== proposalId) {
      void loadProposal(id).catch(() => router.replace("/"));
    }
  }, [id, proposalId, loadProposal, router]);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-14-editor-redirect.test.tsx apps/web/src/__tests__/slice-14-editor-route.test.tsx`
Expected: PASS (both).

- [ ] **Step 5: Add dashboard styles**

In `apps/web/app/globals.css`, append a dashboard block. Use the existing UI tokens already used elsewhere in this file (e.g. `--ui-panel`, `--ui-ink`, `--ui-line-strong`, `--ui-accent` if present). Before writing, grep `globals.css` for the exact token names in use on `.topbar`/`.stlist`/`.btn` and reuse those — do not invent new tokens. Add styles for:

```css
.dash { min-height: 100vh; display: flex; flex-direction: column; }
.dash__toolbar { display: flex; gap: 10px; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--ui-line-strong); }
.dash__toolbar input { flex: 1; padding: 8px 10px; border: 1px solid var(--ui-line-strong); border-radius: 8px; background: var(--ui-panel); color: var(--ui-ink); }
.dash__body { display: flex; flex: 1; min-height: 0; }
.dash__sidebar { width: 220px; border-right: 1px solid var(--ui-line-strong); padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.dash__folder { display: flex; justify-content: space-between; width: 100%; text-align: left; padding: 8px 10px; border: 0; background: transparent; border-radius: 8px; color: var(--ui-ink); cursor: pointer; }
.dash__folder--active { background: var(--ui-panel); font-weight: 600; }
.dash__count { opacity: 0.6; }
.dash__folderrow { display: flex; align-items: center; }
.dash__addfolder { margin-top: 10px; }
.dash__main { flex: 1; padding: 18px; overflow: auto; }
.dash__empty { text-align: center; color: var(--ui-ink); opacity: 0.8; padding: 60px 0; display: flex; flex-direction: column; gap: 14px; align-items: center; }
.pgrid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.pcard { position: relative; border: 1px solid var(--ui-line-strong); border-radius: 12px; padding: 14px; background: var(--ui-panel); display: flex; flex-direction: column; gap: 10px; }
.pcard__body { display: flex; flex-direction: column; gap: 4px; }
.pcard__title { font-weight: 600; }
.pcard__client, .pcard__meta { font-size: 0.85em; opacity: 0.75; }
.pcard__actions { display: flex; gap: 6px; align-items: center; }
.pcard__menu { position: absolute; top: 46px; right: 12px; z-index: 5; background: var(--ui-panel); border: 1px solid var(--ui-line-strong); border-radius: 10px; padding: 6px; display: flex; flex-direction: column; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
.pcard__menu button { text-align: left; padding: 7px 10px; border: 0; background: transparent; color: var(--ui-ink); border-radius: 6px; cursor: pointer; }
.pcard__submenu { border-top: 1px solid var(--ui-line-strong); border-bottom: 1px solid var(--ui-line-strong); margin: 4px 0; padding: 4px 0; }
.pcard__submenu-label { display: block; font-size: 0.75em; opacity: 0.6; padding: 4px 10px; }
.pcard__danger { color: #c0392b; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
.modal__card { background: var(--ui-panel); color: var(--ui-ink); border-radius: 14px; padding: 22px; width: 420px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; gap: 12px; }
.modal__actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
.app--loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; opacity: 0.7; }
```

> If any token name above doesn't exist in `globals.css`, substitute the actual name used by the existing chrome (the implementer greps to confirm — same rule the template-authoring slice followed).

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: entire suite green (all prior slices + slice-14).

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build -w @proposal/web`
Expected: clean build; route list includes `/` (dashboard), `/p/[id]`, `/api/folders`, `/api/folders/[id]`, `/api/proposals/[id]/duplicate`, and the existing proposal/auth routes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/src/App.tsx apps/web/src/__tests__/slice-14-editor-redirect.test.tsx
git commit -m "feat(dashboard): styles + editor load-failure redirect; full verify"
```

---

## Self-Review

**Spec coverage:**
- §A data model (folders table, proposals.folderId, migration 0005, richer summary, Folder type) → Tasks 1, 2, 3. ✅
- §B repo (listProposals richer, createProposal folderId, updateProposalMeta, duplicateProposal, folder CRUD, deleteFolder unfiles, owner scoping) → Tasks 1–3. ✅
- §C API (POST folderId, PATCH, duplicate, folders CRUD, owner scoping, foreign-folder 400, download reuse) → Tasks 4, 5, 6 (download in client Task 7). ✅
- §D routing (dashboard at /, /p/[id], App id prop + load, back link, redirect-on-fail) → Tasks 8, 9, 12. ✅
- §E dashboard UI (Dashboard, FolderSidebar, toolbar, grid, card, dialog, client modules, states) → Tasks 7, 9, 10, 11. ✅
- §F testing — every task is TDD + hermetic. ✅
- File map — every Create/Modify path appears in a task. ✅

**Placeholder scan:** No TBD/TODO; every code step has complete code. The two adaptive notes (globals.css token names in Task 12; removing an unused `router` in Task 11) give concrete rules, not placeholders.

**Type consistency:** `ProposalSummary {id,title,client,folderId,updatedAt}`, `Folder`, `StoredProposal.folderId`, `createProposal(…, folderId?)`, `updateProposalMeta`, `duplicateProposal`, and folder methods are defined in Tasks 1–3 and consumed unchanged in routes (4–6), clients (7), and UI (9–11). `getOwner`/`requireOwnedProposal` return types used correctly. `Dashboard`/`FolderSidebar`/`NewProposalDialog`/`ProposalCard` prop shapes match across tasks. The `+ New` placeholder route in Task 9 is replaced by the dialog in Task 11.

**Note for executors:** This is a git repo on `main`; commit after each task. The deliberate interim typecheck failures are noted in Tasks 1–2 (postgres) and clear in Task 3. Track progress in `docs/plans/builder-dashboard-progress.md`.
