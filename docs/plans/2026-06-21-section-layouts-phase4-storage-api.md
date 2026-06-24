# Section Layout Authoring — Phase 4: storage + API + registry hydration (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist authored section layouts and expose admin-gated CRUD, so layouts created in the (Phase-5) editor survive, hydrate the shared registry on the client, and reach the PDF via the `/print` route.

**Architecture:** A new global `section_layouts` table (Drizzle, migration 0007) with the composite key `(type, variant, pageFormat)` carried as a deterministic `id` PK. Repository methods `listSectionLayouts` / `upsertSectionLayout` / `deleteSectionLayout` (memory + postgres). A server merged-layouts registry (`activeLayouts.ts`, mirroring the section-types `activeRegistry.ts`) that loads DB rows into the shared `setActiveLayouts`. CRUD routes `/api/section-layouts` (GET any-authed, POST admin) and `/api/section-layouts/[type]/[variant]/[format]` (PUT/DELETE admin), validating each layout with `validateLayout` against its section type + a known page format. Client hydration via `client/layouts.ts` + a store `loadLayouts()` called on App mount; and **server hydration** so the `/print` RSC resolves authored layouts.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle + Neon Postgres, Auth.js v5, Zustand, Vitest.

This is **Phase 4 of 5** from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§D, §C-hydration, §J-storage). Phases 1–3 are merged (the model, validator, registry, interpreter, and format-aware resolution already exist). It ships on its own: layouts can be created/read/updated/deleted via the API and render in editor + PDF. Phase 5 (the authoring UI) is the only remaining phase.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`; migration generate `npm run db:generate -w @proposal/web`.
- **This IS a git repo** (the env banner wrongly says otherwise); work on a feature branch off `main`. Commit per task. (Windows `.next` flakiness — `EINVAL readlink … .next` — `rm -rf apps/web/.next` and rebuild.)
- **`npm test` (vitest) ignores TypeScript types** — always run `npm run typecheck` after editing any test file or `.ts(x)`.
- **MIGRATION SAFETY — CRITICAL:** `npm run db:generate` only *emits* the SQL file by diffing the schema; it does **NOT** connect to or modify any database. Do **NOT** run `db:migrate` / `db:push` or anything that applies the migration — applying `0007` to the production Neon DB is the user's deploy step (the same chain as `0006`). Never print, commit, or modify `apps/web/.env.local` or any secret.
- **Migration is additive:** a brand-new table only; no change to existing tables, rows, or behaviour.
- **Spec §D — no in-use freeze, real delete:** unlike section types, a layout edit only changes rendering, never stored proposal data. There is **no `deprecated` column and no in-use check**; `DELETE` removes the row. (A section whose variant's layout is deleted simply falls back to code/generic — `resolveSection` already handles this.)
- **Layout identity = `(type, variant, pageFormat)`**, stored as `id = \`${type}:${variant}:${pageFormat}\``.
- **Validation on write:** POST/PUT reject an unknown section `type` (no `getSectionType`), an unknown `pageFormat` (not in `PAGE_FORMATS`), and any layout failing `validateLayout(layout, typeSchema)` — all `400`.
- **Auth:** GET → `requireOwner()` (any authed); POST/PUT/DELETE → `requireAdmin()`. Both return a `Response` on failure (`if (x instanceof Response) return x;`). Mutations call `invalidateActiveLayouts()`.
- TypeScript strict (`exactOptionalPropertyTypes` ON); extensionless imports (no `.js`).

---

### Task 1: `section_layouts` table + migration 0007

**Files:**
- Modify: `apps/web/src/server/db/schema.ts`
- Create (generated): `apps/web/drizzle/0007_*.sql` (+ the drizzle journal/meta updates the tool writes)

**Interfaces:**
- Produces: `sectionLayoutRows` pgTable — `id` (text PK = `type:variant:pageFormat`), `type`, `variant`, `pageFormat` (`page_format`), `name`, `layout` (jsonb `SectionLayout`), `updatedAt`.

> No unit test: a table definition + generated SQL is verified by typecheck + the generated migration file + the repo tests in Task 2. (Same justification as a server-wiring task.)

- [ ] **Step 1: Add the table to the schema**

In `apps/web/src/server/db/schema.ts`, add (after the `sectionTypeRows` table, following the same column idiom):

```ts
/** Authored section layouts (§D). Global (Builder-managed). Identity is the
 *  composite (type, variant, pageFormat), carried as the `id` PK so upserts are
 *  deterministic. The full SectionLayout lives in `layout`; type/variant/page_format
 *  are denormalised for querying. No deprecated flag — layouts are edited/deleted
 *  freely (a deleted layout just falls back to the code/generic renderer). */
export const sectionLayoutRows = pgTable("section_layouts", {
  id: text("id").primaryKey(), // `${type}:${variant}:${pageFormat}`
  type: text("type").notNull(),
  variant: text("variant").notNull(),
  pageFormat: text("page_format").notNull(),
  name: text("name").notNull(),
  layout: jsonb("layout").$type<import("@proposal/shared").SectionLayout>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

(If `text`, `jsonb`, `timestamp`, `pgTable` are not all already imported at the top of the file, add the missing ones to the existing `drizzle-orm/pg-core` import. Do not add `uniqueIndex` — the `id` PK already enforces the composite uniqueness.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `apps/web/drizzle/0007_*.sql` is created containing `CREATE TABLE "section_layouts" (...)` with columns `id` (PK), `type`, `variant`, `page_format`, `name`, `layout` (jsonb), `updated_at`. The drizzle `meta/_journal.json` + a `0007_snapshot.json` are updated by the tool. **Do NOT run `db:migrate`.**

- [ ] **Step 3: Confirm the generated SQL**

Read `apps/web/drizzle/0007_*.sql` and confirm it only CREATEs the new table (no ALTER/DROP of existing tables). If the diff includes anything beyond the new table, STOP and report — the schema edit was wrong.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/db/schema.ts apps/web/drizzle
git commit -m "feat(layout): section_layouts table + migration 0007 (additive)"
```

---

### Task 2: Repository methods (types + memory + postgres)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Modify: `apps/web/src/server/repo/postgres.ts`
- Test: `apps/web/src/__tests__/slice-23-layout-repo.test.ts`

**Interfaces:**
- Consumes: `SectionLayout` from `@proposal/shared`; the `sectionLayoutRows` table (Task 1).
- Produces (on `Repository`): `listSectionLayouts(): Promise<SectionLayout[]>`; `upsertSectionLayout(layout: SectionLayout): Promise<SectionLayout>`; `deleteSectionLayout(type: string, variant: string, pageFormat: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-23-layout-repo.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import type { SectionLayout } from "@proposal/shared";

const layout = (variant: string, pageFormat = "a4_portrait"): SectionLayout => ({
  type: "cover", variant, pageFormat, name: variant, root: { kind: "stack", children: [] }, version: 1,
});

describe("memory repo — section layouts", () => {
  it("upserts, lists, overwrites by identity, and deletes", async () => {
    const repo = createMemoryRepo();
    expect(await repo.listSectionLayouts()).toEqual([]);

    await repo.upsertSectionLayout(layout("cover"));
    await repo.upsertSectionLayout(layout("hero", "widescreen_16_9"));
    expect((await repo.listSectionLayouts()).length).toBe(2);

    // overwrite same (type,variant,pageFormat) → still 2, name updated
    await repo.upsertSectionLayout({ ...layout("cover"), name: "Cover v2" });
    const all = await repo.listSectionLayouts();
    expect(all.length).toBe(2);
    expect(all.find((l) => l.variant === "cover")!.name).toBe("Cover v2");

    // delete
    expect(await repo.deleteSectionLayout("cover", "cover", "a4_portrait")).toBe(true);
    expect(await repo.deleteSectionLayout("cover", "cover", "a4_portrait")).toBe(false); // already gone
    expect((await repo.listSectionLayouts()).map((l) => l.variant)).toEqual(["hero"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-23-layout-repo.test.ts`
Expected: FAIL — `listSectionLayouts`/`upsertSectionLayout`/`deleteSectionLayout` not on the memory repo.

- [ ] **Step 3: Add the interface methods**

In `apps/web/src/server/repo/types.ts`, add to the `Repository` interface (near the section-type rows methods):

```ts
  /** Authored section layouts (§D). Global; identity = (type, variant, pageFormat). */
  listSectionLayouts(): Promise<import("@proposal/shared").SectionLayout[]>;
  upsertSectionLayout(layout: import("@proposal/shared").SectionLayout): Promise<import("@proposal/shared").SectionLayout>;
  deleteSectionLayout(type: string, variant: string, pageFormat: string): Promise<boolean>;
```

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`:

Add a module-level store + key near the other in-memory maps (e.g. beside `sectionTypeRows`):

```ts
const sectionLayoutRows = new Map<string, import("@proposal/shared").SectionLayout>();
const layoutKey = (type: string, variant: string, pageFormat: string) => `${type}:${variant}:${pageFormat}`;
```

Add the three methods to the returned repo object (mirroring the section-type method placement; `clone` already exists in this file):

```ts
  async listSectionLayouts() {
    return [...sectionLayoutRows.values()].map(clone);
  },
  async upsertSectionLayout(layout) {
    sectionLayoutRows.set(layoutKey(layout.type, layout.variant, layout.pageFormat), clone(layout));
    return clone(layout);
  },
  async deleteSectionLayout(type, variant, pageFormat) {
    return sectionLayoutRows.delete(layoutKey(type, variant, pageFormat));
  },
```

(If `createMemoryRepo` is called fresh per test the map should be per-instance, not module-level. CHECK the existing memory repo: if its other state — e.g. `sectionTypeRows` — is module-level vs created inside `createMemoryRepo`, MIRROR that exact scoping for `sectionLayoutRows` so a fresh `createMemoryRepo()` starts empty. The test creates a fresh repo and expects `[]`. Report which scoping the file uses.)

- [ ] **Step 5: Implement in the postgres repo**

In `apps/web/src/server/repo/postgres.ts`:

Ensure the imports include `sectionLayoutRows` from the schema and `eq` from `drizzle-orm` (add if missing — `eq` is already imported in this file):

```ts
import { sectionLayoutRows } from "../db/schema";
```

Add the three methods (mirroring `upsertSectionType`'s on-conflict idiom; identity collapses to the `id` PK):

```ts
  async listSectionLayouts() {
    const rows = await db.select().from(sectionLayoutRows);
    return rows.map((r) => r.layout);
  },
  async upsertSectionLayout(layout) {
    const id = `${layout.type}:${layout.variant}:${layout.pageFormat}`;
    const [row] = await db
      .insert(sectionLayoutRows)
      .values({ id, type: layout.type, variant: layout.variant, pageFormat: layout.pageFormat, name: layout.name, layout })
      .onConflictDoUpdate({
        target: sectionLayoutRows.id,
        set: { name: layout.name, layout, updatedAt: new Date() },
      })
      .returning();
    return row!.layout;
  },
  async deleteSectionLayout(type, variant, pageFormat) {
    const id = `${type}:${variant}:${pageFormat}`;
    const deleted = await db.delete(sectionLayoutRows).where(eq(sectionLayoutRows.id, id)).returning();
    return deleted.length > 0;
  },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-23-layout-repo.test.ts`
Expected: PASS (1 test, all assertions).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/server/repo/postgres.ts apps/web/src/__tests__/slice-23-layout-repo.test.ts
git commit -m "feat(layout): repo listSectionLayouts/upsertSectionLayout/deleteSectionLayout (memory + postgres)"
```

---

### Task 3: Server merged-layouts registry

**Files:**
- Create: `apps/web/src/server/registry/activeLayouts.ts`
- Test: `apps/web/src/__tests__/slice-23-active-layouts.test.ts`

**Interfaces:**
- Consumes: `setActiveLayouts`/`getLayout` (shared), `getRepo()`.
- Produces: `refreshActiveLayouts(): Promise<SectionLayout[]>` (loads rows → `setActiveLayouts` → caches), `invalidateActiveLayouts(): void`, `getMergedLayouts(): Promise<SectionLayout[]>` (cache or refresh).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-23-active-layouts.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { getLayout, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";
import { getMergedLayouts, refreshActiveLayouts, invalidateActiveLayouts } from "../server/registry/activeLayouts";

const layout: SectionLayout = {
  type: "cover", variant: "cover", pageFormat: "a4_portrait", name: "Cover",
  root: { kind: "stack", children: [] }, version: 1,
};

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  resetLayoutsForTests();
  invalidateActiveLayouts();
});
afterEach(() => {
  setRepoForTests(null);
  resetLayoutsForTests();
  invalidateActiveLayouts();
});

describe("activeLayouts registry", () => {
  it("refresh loads DB rows into the shared registry", async () => {
    await (await import("../server/repo")).getRepo().upsertSectionLayout(layout);
    await refreshActiveLayouts();
    expect(getLayout("cover", "cover", "a4_portrait")?.name).toBe("Cover");
  });

  it("getMergedLayouts caches; invalidate forces a re-read", async () => {
    const repo = (await import("../server/repo")).getRepo();
    await repo.upsertSectionLayout(layout);
    expect((await getMergedLayouts()).length).toBe(1);

    await repo.upsertSectionLayout({ ...layout, variant: "hero" });
    expect((await getMergedLayouts()).length).toBe(1); // cached
    invalidateActiveLayouts();
    expect((await getMergedLayouts()).length).toBe(2); // re-read
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-23-active-layouts.test.ts`
Expected: FAIL — `../server/registry/activeLayouts` does not exist.

- [ ] **Step 3: Implement the registry**

Create `apps/web/src/server/registry/activeLayouts.ts`:

```ts
import { setActiveLayouts, type SectionLayout } from "@proposal/shared";
import { getRepo } from "../repo";

/**
 * Server merged-layouts registry (§C) — mirrors activeRegistry.ts for section
 * types. Loads authored layout rows from the DB and pushes them into the shared
 * `setActiveLayouts` so the server (the /print RSC) resolves authored layouts.
 * Cached per process; mutations call invalidateActiveLayouts().
 */
let cache: SectionLayout[] | null = null;

export async function refreshActiveLayouts(): Promise<SectionLayout[]> {
  const layouts = await getRepo().listSectionLayouts();
  setActiveLayouts(layouts);
  cache = layouts;
  return layouts;
}

export function invalidateActiveLayouts(): void {
  cache = null;
}

export async function getMergedLayouts(): Promise<SectionLayout[]> {
  if (cache) return cache;
  return refreshActiveLayouts();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-23-active-layouts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/registry/activeLayouts.ts apps/web/src/__tests__/slice-23-active-layouts.test.ts
git commit -m "feat(layout): server merged-layouts registry (refresh/invalidate/getMerged)"
```

---

### Task 4: CRUD routes

**Files:**
- Create: `apps/web/app/api/section-layouts/route.ts`
- Create: `apps/web/app/api/section-layouts/[type]/[variant]/[format]/route.ts`
- Test: `apps/web/src/__tests__/slice-23-layout-routes.test.ts`

**Interfaces:**
- Consumes: `validateLayout`, `getSectionType`, `PAGE_FORMATS`, `setActiveSectionTypes` (to seed the type in tests), `SectionLayout` (shared); `requireOwner`/`requireAdmin`; `getRepo`; `getMergedLayouts`/`invalidateActiveLayouts`.
- Produces: `GET` (owner) → `{ layouts }`; `POST` (admin) → `201 { layout }` / 400 / 409; `PUT` (admin) → `200 { layout }` / 400 / 404; `DELETE` (admin) → `204` / 404.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-23-layout-routes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveLayouts } from "../server/registry/activeLayouts";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionLayout, type SectionTypeSchema } from "@proposal/shared";
import { GET, POST } from "../../app/api/section-layouts/route";
import { PUT, DELETE } from "../../app/api/section-layouts/[type]/[variant]/[format]/route";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [], schemaVersion: 1,
};
const layout: SectionLayout = {
  type: "cover", variant: "cover", pageFormat: "a4_portrait", name: "Cover",
  root: { kind: "stack", children: [{ kind: "heading", field: "title" }] }, version: 1,
};

const post = (body: unknown) =>
  new Request("http://x/api/section-layouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (body: unknown) =>
  new Request("http://x/api/section-layouts/cover/cover/a4_portrait", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (type: string, variant: string, format: string) => ({ params: Promise.resolve({ type, variant, format }) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
  invalidateActiveLayouts();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  resetSectionTypesForTests();
  invalidateActiveLayouts();
});

describe("section-layouts routes", () => {
  it("POST 401/403 by auth", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await POST(post(layout))).status).toBe(401);
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(layout))).status).toBe(403);
  });

  it("POST 400 on unknown type / unknown format / invalid layout", async () => {
    expect((await POST(post({ ...layout, type: "ghost" }))).status).toBe(400);
    expect((await POST(post({ ...layout, pageFormat: "nope" }))).status).toBe(400);
    expect((await POST(post({ ...layout, root: { kind: "heading", field: "missing" } }))).status).toBe(400);
  });

  it("POST 201 then 409 on duplicate; GET lists it", async () => {
    expect((await POST(post(layout))).status).toBe(201);
    expect((await POST(post(layout))).status).toBe(409);
    const body = (await (await GET()).json()) as { layouts: SectionLayout[] };
    expect(body.layouts.some((l) => l.variant === "cover")).toBe(true);
  });

  it("PUT 404 unknown then 200; DELETE 204 then 404", async () => {
    expect((await PUT(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(404);
    await POST(post(layout));
    expect((await PUT(put({ ...layout, name: "Cover v2" }), ctx("cover", "cover", "a4_portrait"))).status).toBe(200);
    expect((await getRepo().listSectionLayouts()).find((l) => l.variant === "cover")!.name).toBe("Cover v2");
    expect((await DELETE(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(204);
    expect((await DELETE(put(layout), ctx("cover", "cover", "a4_portrait"))).status).toBe(404);
  });

  it("GET 401 when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-23-layout-routes.test.ts`
Expected: FAIL — the route modules don't exist.

- [ ] **Step 3: Create the collection route (GET + POST)**

Create `apps/web/app/api/section-layouts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { validateLayout, getSectionType, PAGE_FORMATS, type SectionLayout } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import { getMergedLayouts, invalidateActiveLayouts } from "../../../src/server/registry/activeLayouts";

export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ layouts: await getMergedLayouts() });
}

/** Validate a layout's type, page format, and structure. Returns an error Response or null. */
function invalidLayout(layout: SectionLayout | null): Response | null {
  if (!layout || typeof layout !== "object") {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }
  const typeSchema = getSectionType(layout.type);
  if (!typeSchema) return NextResponse.json({ error: `Unknown section type "${layout.type}"` }, { status: 400 });
  if (!PAGE_FORMATS.some((f) => f.id === layout.pageFormat)) {
    return NextResponse.json({ error: `Unknown page format "${layout.pageFormat}"` }, { status: 400 });
  }
  const result = validateLayout(layout, typeSchema);
  if (!result.valid) return NextResponse.json({ error: "Invalid layout", errors: result.errors }, { status: 400 });
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const layout = (await request.json().catch(() => null)) as SectionLayout | null;
  const bad = invalidLayout(layout);
  if (bad) return bad;
  const l = layout as SectionLayout;

  if ((await getMergedLayouts()).some((x) => x.type === l.type && x.variant === l.variant && x.pageFormat === l.pageFormat)) {
    return NextResponse.json({ error: `A layout "${l.type}:${l.variant}:${l.pageFormat}" already exists` }, { status: 409 });
  }

  const saved = await getRepo().upsertSectionLayout(l);
  invalidateActiveLayouts();
  return NextResponse.json({ layout: saved }, { status: 201 });
}

export { invalidLayout };
```

- [ ] **Step 4: Create the item route (PUT + DELETE)**

Create `apps/web/app/api/section-layouts/[type]/[variant]/[format]/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { SectionLayout } from "@proposal/shared";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../src/server/repo";
import { getMergedLayouts, invalidateActiveLayouts } from "../../../../../src/server/registry/activeLayouts";
import { invalidLayout } from "../../route";

type Ctx = { params: Promise<{ type: string; variant: string; format: string }> };

const exists = async (type: string, variant: string, format: string) =>
  (await getMergedLayouts()).some((l) => l.type === type && l.variant === variant && l.pageFormat === format);

export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type, variant, format } = await params;

  if (!(await exists(type, variant, format))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const layout = (await request.json().catch(() => null)) as SectionLayout | null;
  const bad = invalidLayout(layout);
  if (bad) return bad;
  // The path identity is canonical; ignore any mismatching identity in the body.
  const saved = await getRepo().upsertSectionLayout({ ...(layout as SectionLayout), type, variant, pageFormat: format });
  invalidateActiveLayouts();
  return NextResponse.json({ layout: saved });
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type, variant, format } = await params;

  const deleted = await getRepo().deleteSectionLayout(type, variant, format);
  invalidateActiveLayouts();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-23-layout-routes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/api/section-layouts" apps/web/src/__tests__/slice-23-layout-routes.test.ts
git commit -m "feat(layout): CRUD routes for section layouts (admin POST/PUT/DELETE, owner GET)"
```

---

### Task 5: Client module + store `loadLayouts` + App-mount hydration

**Files:**
- Create: `apps/web/src/client/layouts.ts`
- Modify: `apps/web/src/state/proposalStore.ts`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/__tests__/slice-23-store-layouts.test.ts`

**Interfaces:**
- Consumes: `setActiveLayouts` (shared).
- Produces: `client/layouts.ts` (`fetchLayouts`/`createLayout`/`updateLayout`/`deleteLayout`); store `layouts: SectionLayout[]` + `loadLayouts(): Promise<void>` (GET → `setActiveLayouts` + set state); App mount calls `loadLayouts()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-23-store-layouts.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProposalStore } from "../state/proposalStore";
import { getLayout, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";

const layout: SectionLayout = {
  type: "cover", variant: "cover", pageFormat: "a4_portrait", name: "Cover",
  root: { kind: "stack", children: [] }, version: 1,
};

afterEach(() => {
  resetLayoutsForTests();
  vi.unstubAllGlobals();
});

describe("store loadLayouts", () => {
  it("fetches layouts and hydrates the shared registry + state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ layouts: [layout] }), { status: 200 })));
    await useProposalStore.getState().loadLayouts();
    expect(useProposalStore.getState().layouts.length).toBe(1);
    expect(getLayout("cover", "cover", "a4_portrait")?.name).toBe("Cover");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-23-store-layouts.test.ts`
Expected: FAIL — `loadLayouts` not on the store.

- [ ] **Step 3: Create the client module**

Create `apps/web/src/client/layouts.ts`:

```ts
import type { SectionLayout } from "@proposal/shared";

export async function fetchLayouts(): Promise<SectionLayout[]> {
  const res = await fetch("/api/section-layouts");
  if (!res.ok) throw new Error(`Failed to load layouts (${res.status})`);
  const body = (await res.json()) as { layouts: SectionLayout[] };
  return body.layouts;
}

export async function createLayout(layout: SectionLayout): Promise<void> {
  const res = await fetch("/api/section-layouts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Create failed");
  }
}

export async function updateLayout(type: string, variant: string, pageFormat: string, layout: SectionLayout): Promise<void> {
  const res = await fetch(`/api/section-layouts/${type}/${variant}/${pageFormat}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Update failed");
  }
}

export async function deleteLayout(type: string, variant: string, pageFormat: string): Promise<void> {
  const res = await fetch(`/api/section-layouts/${type}/${variant}/${pageFormat}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}
```

- [ ] **Step 4: Add `layouts` + `loadLayouts` to the store**

In `apps/web/src/state/proposalStore.ts`:

Add `setActiveLayouts` to the `@proposal/shared` import and `fetchLayouts` from the new client module:

```ts
import { fetchLayouts } from "../client/layouts";
```
(and add `setActiveLayouts` + `type SectionLayout` to the existing `@proposal/shared` import.)

Add to the `ProposalState` interface (next to `sectionTypes`/`loadSectionTypes`):

```ts
  /** Active authored layouts (hydrated from the API into the shared registry). */
  layouts: SectionLayout[];
  /** Fetch layouts from the API and hydrate the shared registry. */
  loadLayouts: () => Promise<void>;
```

Add to the store's initial state (next to `sectionTypes: []`):

```ts
  layouts: [],
```

Add the action (next to `loadSectionTypes`):

```ts
  loadLayouts: async () => {
    try {
      const layouts = await fetchLayouts();
      setActiveLayouts(layouts);
      set({ layouts });
    } catch {
      get().notify("error", "Couldn't load layouts.");
    }
  },
```

- [ ] **Step 5: Hydrate on App mount**

In `apps/web/src/App.tsx`, in the mount `useEffect` that calls `loadSectionTypes()`/`loadTemplates()`, also select and call `loadLayouts`:

```ts
  const loadLayouts = useProposalStore((s) => s.loadLayouts);
```
and in the effect body + deps:

```ts
  useEffect(() => {
    void loadSectionTypes();
    void loadTemplates();
    void loadLayouts();
  }, [loadSectionTypes, loadTemplates, loadLayouts]);
```

(Match the file's existing selector/effect shape exactly; if the selectors are destructured differently, follow that pattern. Report the actual shape.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-23-store-layouts.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/client/layouts.ts apps/web/src/state/proposalStore.ts apps/web/src/App.tsx apps/web/src/__tests__/slice-23-store-layouts.test.ts
git commit -m "feat(layout): client layouts module + store loadLayouts + App-mount hydration"
```

---

### Task 6: Server-side hydration for `/print`

**Files:**
- Modify: `apps/web/app/print/[id]/page.tsx`

**Interfaces:**
- Consumes: `refreshActiveLayouts` (Task 3) + `refreshActiveRegistry` (existing section-types server registry).

> No new unit test: the `/print` route is a server component that can't be hermetically unit-tested here; `refreshActiveLayouts` is covered by Task 3. Verified by typecheck + build. (Rationale: the client hydrates its own registry on mount, but the `/print` RSC runs in a separate server process whose shared registry is empty — without this it would render authored layouts/types as the generic fallback in the PDF.)

- [ ] **Step 1: Add server hydration before render**

In `apps/web/app/print/[id]/page.tsx`:

Add the imports:

```ts
import { refreshActiveLayouts } from "../../../src/server/registry/activeLayouts";
import { refreshActiveRegistry } from "../../../src/server/registry/activeRegistry";
```

In `PrintPage`, after the proposal is fetched and before computing the theme / returning the render, hydrate both registries so authored types AND layouts resolve during SSR:

```ts
  // The /print RSC runs server-side; its shared registries start empty. Hydrate
  // authored section types + layouts so resolveSection renders them in the PDF.
  await refreshActiveRegistry();
  await refreshActiveLayouts();
```

(Place these two awaits after the `if (!stored) …` guard and before `const theme = …`. If the import path for `activeRegistry` differs — confirm the existing section-types server registry module name/exports — use the real one and report it.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build (confirm the print route compiles)**

Run: `npm run build -w @proposal/web`
Expected: clean build; `/print/[id]` compiles. (If `EINVAL readlink … .next`, `rm -rf apps/web/.next` and rebuild.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/print/[id]/page.tsx"
git commit -m "feat(layout): hydrate authored types + layouts in the /print RSC"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (existing + new slice-23).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 4: Confirm the migration is present + not applied**

Run: `git status --porcelain apps/web/drizzle` (expect clean — 0007 already committed in Task 1) and confirm `apps/web/drizzle/0007_*.sql` exists. Do NOT run `db:migrate`. Note in the report that applying 0007 to prod Neon is the user's deploy step.

- [ ] **Step 5: Commit (only if incidental fixes were needed)**

```bash
git add -A
git commit -m "test: phase-4 storage/api green (suite + typecheck + build)"
```

---

## Self-Review

**1. Spec coverage (§D, §C-hydration, §J-storage):**
- `section_layouts` table (migration 0007, additive), composite identity → Task 1. ✅
- Repo `listSectionLayouts`/`upsertSectionLayout`/`deleteSectionLayout` (memory + postgres) → Task 2. ✅
- Server merged registry `getMergedLayouts`/`refreshActiveLayouts`/`invalidateActiveLayouts` → Task 3. ✅
- CRUD routes (GET owner; POST/PUT/DELETE admin; 400 invalid/unknown type/unknown format; 409 duplicate; 404 unknown; 204 delete; `invalidateActiveLayouts` on mutate) → Task 4. ✅
- Client `client/layouts.ts` + store `loadLayouts` + App-mount hydration → Task 5. ✅
- `/print` server hydration so authored layouts reach the PDF → Task 6. ✅
- Spec §D "no in-use freeze, real delete; global; layout edit changes only rendering" → honoured (no deprecated column, real DELETE). ✅
- Correctly **out of scope** (Phase 5): `SectionLayoutsView`/`LayoutEditor` authoring UI, Inspector/Outline variant pickers wired to `availableVariants`, `sampleDataForType`, `print-color-adjust`. Not implemented here.

**2. Placeholder scan:** No TBD/TODO; every code step is complete. Task 1 + Task 6 carry stated, justified no-unit-test exceptions (generated SQL / server-component wiring), verified by typecheck + build + repo tests.

**3. Type consistency:** Repo methods (`listSectionLayouts(): Promise<SectionLayout[]>`, `upsertSectionLayout(layout): Promise<SectionLayout>`, `deleteSectionLayout(type,variant,pageFormat): Promise<boolean>`) are identical across `types.ts`/`memory.ts`/`postgres.ts` and consumed unchanged by Tasks 3–4. `id = \`${type}:${variant}:${pageFormat}\`` is the single identity convention (table PK + memory key + repo upsert/delete). `getMergedLayouts`/`refreshActiveLayouts`/`invalidateActiveLayouts` signatures match every call site (routes + print). The route validation reuses the shared `validateLayout(layout, typeSchema)` + `PAGE_FORMATS` + `getSectionType` exactly as Phase 3 exposes them. The `invalidLayout` helper is exported from the collection route and reused by the item route (single source of validation). `loadLayouts`/`layouts` on the store match the App-mount call.

**Note on a deliberate deviation from the §D table sketch:** the spec sketched `id text primaryKey` *plus* a separate `unique (type, variant, page_format)`. This plan sets `id = "type:variant:pageFormat"`, so the PK already enforces that uniqueness and the separate unique index is redundant — collapsing the two into one deterministic key gives clean `onConflictDoUpdate` upserts. The columns `type`/`variant`/`page_format` remain for querying. Same guarantees, simpler.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase4-storage-api.md`. This is Phase 4 of 5; Phase 5 (the authoring UI — `SectionLayoutsView` + page-aware `LayoutEditor` + variant-picker wiring) gets its own plan after this ships.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
