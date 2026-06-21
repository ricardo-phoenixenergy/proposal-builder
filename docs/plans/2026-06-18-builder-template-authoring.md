# Builder — Template Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin author proposal templates (ordered fixed slots + locks) from the `/admin` dashboard, surfaced to users through the existing Inspector template picker.

**Architecture:** Mirror the section-type Builder: built-in templates stay in `packages/shared`, DB-authored rows merge over them by `id` (copy-on-write — built-ins and in-use templates are frozen, edited via Duplicate + Deprecate). A server active-template registry merges + caches; the store hydrates the merged set on mount and the Inspector/`applyTemplate` read from it.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + Neon Postgres, Auth.js v5 credentials, Zustand, Vitest (node + jsdom projects).

## Global Constraints

- **Spec:** `docs/specs/2026-06-18-builder-template-authoring-design.md` is the source of truth.
- **Three-layer invariant** holds: templates are STRUCTURE (ordered section-type slots); the AI never authors them; components/theme stay separate. No content/theme/template blurring.
- **Copy-on-write:** built-in templates (`builtInTemplates`) are immutable; a template referenced by any stored proposal (`listInUseTemplateIds`) is frozen. Editing a frozen/built-in template = Duplicate (new id) + Deprecate. Deprecated templates are hidden from the picker but still resolvable.
- **v1 authoring scope:** `kind:"fixed"` slots only. `choice` slots and per-template `overrides` are NOT authorable (the validator rejects `choice`; built-ins keep them). Fixed-content entry is limited to text/paragraph fields.
- **SlotLock values:** `"open" | "fixed" | "editable-copy" | "editable-data"`.
- **Secrets/auth:** GET `/api/templates` is any-authed (the picker needs it, via `requireOwner`); POST/PUT/deprecate are admin-only (`requireAdmin`).
- **Module imports are extensionless** (`moduleResolution: "bundler"`); never add `.js`. `packages/shared` stays framework-agnostic (no React/DB/Next imports).
- **TypeScript strict** incl. `exactOptionalPropertyTypes`: only assign an optional object property when you have a defined value (use conditional spreads, as the existing editors do).
- **Tests are hermetic:** in-memory repo via `setRepoForTests`, admin identity via `setSessionUserResolverForTests`, client/UI via mocked `global.fetch`. Node-environment test files start with `// @vitest-environment node`; React test files use the default jsdom project.
- **No git in this workspace.** "Commit" steps are checkpoints: run the named test file(s) + `npm run typecheck`; both green before moving on. Record progress in the ledger.
- **Commands (scripts live at the REPO ROOT — the web workspace has NO `test`/`typecheck` script):**
  - Single test file: `npx vitest run <path-from-repo-root>` (e.g. `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`).
  - Full suite: `npm test` (root). Typecheck: `npm run typecheck` (root). Build: `npm run build -w @proposal/web`. Migration: `npm run db:generate -w @proposal/web`.

---

### Task 1: Shared — `Template.deprecated`, `builtInTemplates` export, `validateTemplateDefinition`

**Files:**
- Modify: `packages/shared/src/types/template.ts` (add `deprecated?`)
- Modify: `packages/shared/src/index.ts` (export `builtInTemplates`, `validateTemplateDefinition`)
- Create: `packages/shared/src/validation/validateTemplateDefinition.ts`
- Test: `packages/shared/src/validation/validateTemplateDefinition.test.ts`

**Interfaces:**
- Consumes: `SectionTypeSchema`/`FieldSchema` from `../types/section`; `SlotLock`/`Template` from `../types/template`; `ValidationError`/`ValidationResult` from `./result`.
- Produces:
  - `Template` gains `deprecated?: boolean`.
  - `validateTemplateDefinition(def: unknown, ctx: { sectionTypes: SectionTypeSchema[]; themeIds: string[] }): ValidationResult`
  - `builtInTemplates` re-exported from shared (alias of the in-code `templates` array).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/validation/validateTemplateDefinition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateTemplateDefinition } from "./validateTemplateDefinition";
import type { SectionTypeSchema } from "../types/section";

const sectionTypes: SectionTypeSchema[] = [
  { type: "text", label: "Text", category: "text", variants: [], schemaVersion: 1,
    fields: [{ key: "heading", type: "text" }, { key: "body", type: "paragraph" }] },
  { type: "executive_summary", label: "Exec", category: "text", variants: [], schemaVersion: 1,
    fields: [{ key: "summary", type: "paragraph" }] },
];
const ctx = { sectionTypes, themeIds: ["theme_phoenix_default", "theme_midnight"] };

const valid = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [
    { kind: "fixed", type: "text", lock: "editable-copy" },
    { kind: "fixed", type: "text", lock: "fixed", data: { heading: "Terms", body: "..." } },
  ],
};

describe("validateTemplateDefinition", () => {
  it("accepts a well-formed fixed-slot template", () => {
    expect(validateTemplateDefinition(valid, ctx).valid).toBe(true);
  });

  it("rejects a bad id, empty name, and unknown theme", () => {
    expect(validateTemplateDefinition({ ...valid, id: "Bad Id" }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, name: "  " }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, themeId: "nope" }, ctx).valid).toBe(false);
  });

  it("requires a non-empty slots array", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [] }, ctx).valid).toBe(false);
  });

  it("rejects an unknown slot type and a bad lock", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "ghost", lock: "open" }] }, ctx).valid).toBe(false);
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "text", lock: "weird" }] }, ctx).valid).toBe(false);
  });

  it("rejects a choice slot (not authorable in v1)", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "choice", allowed: ["text"], default: "text", lock: "choice" }] }, ctx).valid).toBe(false);
  });

  it("rejects fixed data referencing a non-text or unknown field", () => {
    expect(validateTemplateDefinition({ ...valid, slots: [{ kind: "fixed", type: "text", lock: "fixed", data: { nope: "x" } }] }, ctx).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/shared/src/validation/validateTemplateDefinition.test.ts`
Expected: FAIL — module not found / `validateTemplateDefinition` not defined.

- [ ] **Step 3: Add `deprecated?` to the Template type**

In `packages/shared/src/types/template.ts`, add the field to `Template`:

```ts
export interface Template {
  id: string;
  name: string;
  themeId: string;
  /** Structure read-only downstream (§7.1). */
  locked: boolean;
  slots: Slot[];
  /**
   * Thin per-template patches over base field schemas (§5.2):
   * overrides[type][fieldKey] patches the base schema for THIS template only.
   */
  overrides?: Record<string, Partial<Record<string, FieldSchema>>>;
  /** Hidden from the picker but still resolvable for existing proposals (§11 Builder). */
  deprecated?: boolean;
}
```

- [ ] **Step 4: Implement the validator**

Create `packages/shared/src/validation/validateTemplateDefinition.ts`:

```ts
import type { SectionTypeSchema } from "../types/section";
import type { ValidationError, ValidationResult } from "./result";

const ID_KEY = /^[a-z][a-z0-9_]*$/;
const LOCKS = ["open", "fixed", "editable-copy", "editable-data"] as const;

/**
 * Meta-validation for an authored template (§11 Builder). v1 authors `kind:"fixed"`
 * slots only; `choice` slots and per-template overrides are not authorable yet.
 * The caller supplies the known section types + theme ids so this stays pure.
 */
export function validateTemplateDefinition(
  def: unknown,
  ctx: { sectionTypes: SectionTypeSchema[]; themeIds: string[] },
): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });

  if (typeof def !== "object" || def === null) {
    return { valid: false, errors: [{ path: "", message: "Expected a template object", source: "app" }] };
  }
  const d = def as Record<string, unknown>;

  if (typeof d["id"] !== "string" || !ID_KEY.test(d["id"])) {
    push("/id", "id must be a lowercase slug (letters, digits, underscore; starting with a letter)");
  }
  if (typeof d["name"] !== "string" || d["name"].trim() === "") push("/name", "name is required");
  if (typeof d["themeId"] !== "string" || !ctx.themeIds.includes(d["themeId"])) {
    push("/themeId", "themeId must reference a known theme");
  }
  if (typeof d["locked"] !== "boolean") push("/locked", "locked must be a boolean");

  const slots = d["slots"];
  if (!Array.isArray(slots) || slots.length === 0) {
    push("/slots", "at least one slot is required");
  } else {
    slots.forEach((slot, i) => {
      const s = slot as Record<string, unknown>;
      if (s["kind"] === "choice") {
        push(`/slots/${i}/kind`, "choice slots aren't authorable yet");
        return;
      }
      if (s["kind"] !== "fixed") {
        push(`/slots/${i}/kind`, 'slot kind must be "fixed"');
        return;
      }
      const type = s["type"];
      const typeSchema = typeof type === "string" ? ctx.sectionTypes.find((t) => t.type === type) : undefined;
      if (!typeSchema) push(`/slots/${i}/type`, "slot type must be a known section type");
      if (!LOCKS.includes(s["lock"] as (typeof LOCKS)[number])) {
        push(`/slots/${i}/lock`, "lock must be one of open, fixed, editable-copy, editable-data");
      }
      const data = s["data"];
      if (data !== undefined) {
        if (typeof data !== "object" || data === null || Array.isArray(data)) {
          push(`/slots/${i}/data`, "data must be an object");
        } else if (typeSchema) {
          const textKeys = new Set(
            typeSchema.fields.filter((f) => f.type === "text" || f.type === "paragraph").map((f) => f.key),
          );
          for (const k of Object.keys(data as Record<string, unknown>)) {
            if (!textKeys.has(k)) push(`/slots/${i}/data/${k}`, `"${k}" is not a text field on ${String(type)}`);
          }
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: Export from shared**

In `packages/shared/src/index.ts`:
- Change the templates registry re-export to also export the built-in alias:

```ts
export { templates, templates as builtInTemplates, getTemplate } from "./templates/registry";
```

- Add next to the other validation exports:

```ts
export { validateTemplateDefinition } from "./validation/validateTemplateDefinition";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/validation/validateTemplateDefinition.test.ts`
Expected: PASS (6/6).

- [ ] **Step 7: Checkpoint**

Run: `npm run typecheck` — expected exit 0.

```bash
git add packages/shared/src/types/template.ts packages/shared/src/index.ts packages/shared/src/validation/validateTemplateDefinition.ts packages/shared/src/validation/validateTemplateDefinition.test.ts
git commit -m "feat(shared): Template.deprecated + builtInTemplates + validateTemplateDefinition"
```

---

### Task 2: Repo — `TemplateRow` + row-based template methods (memory)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-13-templates-repo.test.ts` (create)

**Interfaces:**
- Consumes: `Template` (shared), existing `Repository`, `createMemoryRepo`.
- Produces:
  - `interface TemplateRow { id: string; template: Template | null; deprecated: boolean; updatedAt: string }`
  - `Repository` template methods become: `listTemplateRows(): Promise<TemplateRow[]>`, `upsertTemplate(row: { id: string; template: Template | null; deprecated: boolean }): Promise<TemplateRow>`, `setTemplateDeprecated(id: string, deprecated: boolean): Promise<TemplateRow | null>`, `listInUseTemplateIds(): Promise<string[]>`.
  - `StoredTemplate` and the old `listTemplates()` / `upsertTemplate(template: Template)` are removed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-templates-repo.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

const tmpl: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};

describe("repo template rows", () => {
  it("upserts and lists authored template rows", async () => {
    await repo.upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const rows = await repo.listTemplateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.template?.name).toBe("Sales");
    expect(rows[0]!.deprecated).toBe(false);
  });

  it("toggles deprecation, and overlays a built-in via a null-template row", async () => {
    await repo.upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    expect((await repo.setTemplateDeprecated("tmpl_sales", true))?.deprecated).toBe(true);
    expect(await repo.setTemplateDeprecated("ghost", false)).toBeNull();

    const overlay = await repo.upsertTemplate({ id: "tmpl_open", template: null, deprecated: true });
    expect(overlay.template).toBeNull();
    expect(overlay.deprecated).toBe(true);
  });

  it("reports in-use template ids from stored proposals", async () => {
    await repo.createProposal("owner_a", sampleProposal);
    const ids = await repo.listInUseTemplateIds();
    expect(ids).toContain(sampleProposal.templateId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
Expected: FAIL — `listTemplateRows`/`upsertTemplate(row)`/`setTemplateDeprecated`/`listInUseTemplateIds` are not functions.

- [ ] **Step 3: Update the repo types**

In `apps/web/src/server/repo/types.ts`:
- Remove the `StoredTemplate` interface (lines 26–29).
- Add a `TemplateRow` interface near `SectionTypeRow`:

```ts
export interface TemplateRow {
  id: string;
  template: import("@proposal/shared").Template | null; // null = built-in deprecation overlay
  deprecated: boolean;
  updatedAt: string;
}
```

- Replace the two template methods in `Repository` with:

```ts
  /** Builder (§11). Authored template rows; null template = built-in overlay. */
  listTemplateRows(): Promise<TemplateRow[]>;
  upsertTemplate(row: { id: string; template: Template | null; deprecated: boolean }): Promise<TemplateRow>;
  setTemplateDeprecated(id: string, deprecated: boolean): Promise<TemplateRow | null>;
  /** Distinct templateId referenced by any stored proposal (freeze check). */
  listInUseTemplateIds(): Promise<string[]>;
```

(`Template` is already imported at the top of the file; keep that import.)

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`:
- Update the imports: remove `StoredTemplate`, add `TemplateRow`:

```ts
import type {
  ProposalSummary,
  ProposalVersion,
  Repository,
  SectionTypeRow,
  StoredProposal,
  StoredTheme,
  TemplateRow,
  UserSummary,
} from "./types";
```

(keep `DuplicateEmailError` import as-is.)

- Change the templates Map type:

```ts
  const templates = new Map<string, TemplateRow>(); // keyed by template id
```

- Replace the old `listTemplates`/`upsertTemplate` methods with the row-based set (mirror the section-type row methods):

```ts
    async listTemplateRows() {
      return [...templates.values()].map(clone);
    },

    async upsertTemplate({ id, template, deprecated }) {
      const row: TemplateRow = { id, template: template ? clone(template) : null, deprecated, updatedAt: now() };
      templates.set(id, row);
      return clone(row);
    },

    async setTemplateDeprecated(id, deprecated) {
      const existing = templates.get(id);
      if (!existing) {
        if (!deprecated) return null;
        const row: TemplateRow = { id, template: null, deprecated: true, updatedAt: now() };
        templates.set(id, row);
        return clone(row);
      }
      const row: TemplateRow = { ...existing, deprecated, updatedAt: now() };
      templates.set(id, row);
      return clone(row);
    },

    async listInUseTemplateIds() {
      const ids = new Set<string>();
      for (const p of proposals.values()) {
        if (p.document.templateId) ids.add(p.document.templateId);
      }
      return [...ids];
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Checkpoint**

Run: `npm run typecheck`
Expected: FAILS in `apps/web/src/server/repo/postgres.ts` (still implements the old template methods / references `StoredTemplate`) and in `apps/web/app/api/templates/route.ts` (calls the old `listTemplates`/`upsertTemplate`). **This is the intended interim state** — Tasks 3 and 5 resolve it. Confirm the new repo test is green, then proceed.

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/__tests__/slice-13-templates-repo.test.ts
git commit -m "feat(repo): row-based template methods + TemplateRow (memory)"
```

---

### Task 3: Repo — Postgres parity + schema + migration `0004`

**Files:**
- Modify: `apps/web/src/server/db/schema.ts` (templates table)
- Modify: `apps/web/src/server/repo/postgres.ts`
- Create (generated): `apps/web/drizzle/0004_*.sql` (+ meta)

**Interfaces:**
- Consumes: `TemplateRow` (Task 2); Drizzle `templates` table.
- Produces: Postgres implementation of all four template methods; nullable `template` column + `deprecated`/`updatedAt`.

- [ ] **Step 1: Update the Drizzle schema**

In `apps/web/src/server/db/schema.ts`, replace the `templates` table with:

```ts
export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  template: jsonb("template").$type<Template>(), // nullable: null = built-in deprecation overlay
  deprecated: boolean("deprecated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

(`boolean` and `timestamp` are already imported for the other tables.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `apps/web/drizzle/0004_*.sql` that drops NOT NULL on `templates.template` and adds `deprecated boolean not null default false` + `updated_at timestamptz not null default now()`. Open it and confirm no destructive `DROP`/data-loss statements.

- [ ] **Step 3: Implement the Postgres methods**

In `apps/web/src/server/repo/postgres.ts`, replace the old `listTemplates`/`upsertTemplate` with the row-based set (mirror the section-type row methods already in this file):

```ts
    async listTemplateRows() {
      const rows = await db.select().from(templates);
      return rows.map((r) => ({
        id: r.id,
        template: r.template ?? null,
        deprecated: r.deprecated,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async upsertTemplate({ id, template, deprecated }) {
      const [row] = await db
        .insert(templates)
        .values({ id, template: template ?? null, deprecated })
        .onConflictDoUpdate({ target: templates.id, set: { template: template ?? null, deprecated, updatedAt: new Date() } })
        .returning();
      return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async setTemplateDeprecated(id, deprecated) {
      const [existing] = await db.select().from(templates).where(eq(templates.id, id));
      if (!existing) {
        if (!deprecated) return null;
        const [row] = await db.insert(templates).values({ id, template: null, deprecated: true }).returning();
        return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
      }
      const [row] = await db
        .update(templates)
        .set({ deprecated, updatedAt: new Date() })
        .where(eq(templates.id, id))
        .returning();
      return { id: row!.id, template: row!.template ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async listInUseTemplateIds() {
      const rows = await db.execute<{ id: string }>(
        sql`SELECT DISTINCT document->>'templateId' AS id FROM proposals WHERE document ? 'templateId'`,
      );
      return ((rows as unknown as { rows?: { id: string }[] }).rows ?? (rows as unknown as { id: string }[]))
        .map((r: { id: string }) => r.id)
        .filter(Boolean);
    },
```

(`eq` and `sql` are already imported in this file.)

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: still FAILS — only now in `apps/web/app/api/templates/route.ts` (old `listTemplates`/`upsertTemplate(template)` calls). The repo layer is clean. Task 5 resolves the route. (If you want a clean checkpoint here, you may instead jump to Task 5 before re-running typecheck — but the repo regression test must pass now.)

- [ ] **Step 5: Run the repo regression test**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
Expected: PASS (3/3) — unchanged.

- [ ] **Step 6: Checkpoint**

```bash
git add apps/web/src/server/db/schema.ts apps/web/src/server/repo/postgres.ts apps/web/drizzle
git commit -m "feat(repo): postgres template-row parity + migration 0004"
```

---

### Task 4: Server active-template registry

**Files:**
- Create: `apps/web/src/server/registry/activeTemplates.ts`
- Test: `apps/web/src/__tests__/slice-13-active-templates.test.ts` (create)

**Interfaces:**
- Consumes: `builtInTemplates` (shared), `getRepo().listTemplateRows()`, `TemplateRow`.
- Produces: `getMergedTemplates(): Promise<Template[]>`, `refreshActiveTemplates(): Promise<Template[]>`, `invalidateActiveTemplates(): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-active-templates.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getMergedTemplates, invalidateActiveTemplates } from "../server/registry/activeTemplates";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
});
afterEach(() => {
  setRepoForTests(null);
  invalidateActiveTemplates();
});

const authored: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};

describe("active template registry", () => {
  it("includes built-ins and merges authored rows", async () => {
    await getRepo().upsertTemplate({ id: authored.id, template: authored, deprecated: false });
    invalidateActiveTemplates();
    const merged = await getMergedTemplates();
    expect(merged.map((t) => t.id)).toEqual(expect.arrayContaining([...builtInTemplates.map((t) => t.id), "tmpl_sales"]));
  });

  it("overlays deprecation onto a built-in via a null-template row", async () => {
    await getRepo().upsertTemplate({ id: builtInTemplates[0]!.id, template: null, deprecated: true });
    invalidateActiveTemplates();
    const merged = await getMergedTemplates();
    expect(merged.find((t) => t.id === builtInTemplates[0]!.id)?.deprecated).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-active-templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

Create `apps/web/src/server/registry/activeTemplates.ts`:

```ts
// apps/web/src/server/registry/activeTemplates.ts
import { builtInTemplates, type Template } from "@proposal/shared";
import { getRepo } from "../repo";
import type { TemplateRow } from "../repo/types";

let cache: Template[] | null = null;

/** Merge built-ins with DB rows: full templates override by id; null rows overlay deprecation. */
function merge(rows: TemplateRow[]): Template[] {
  const map = new Map<string, Template>();
  for (const t of builtInTemplates) map.set(t.id, t);
  for (const row of rows) {
    const base = row.template ?? map.get(row.id);
    if (!base) continue; // null overlay for an unknown id — ignore
    map.set(row.id, { ...base, deprecated: row.deprecated });
  }
  return [...map.values()];
}

export async function refreshActiveTemplates(): Promise<Template[]> {
  const rows = await getRepo().listTemplateRows();
  cache = merge(rows);
  return cache;
}

export function invalidateActiveTemplates(): void {
  cache = null;
}

/** Cached merged list; hydrates on first call or after invalidation. */
export async function getMergedTemplates(): Promise<Template[]> {
  if (cache) return cache;
  return refreshActiveTemplates();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-active-templates.test.ts`
Expected: PASS (2/2).

- [ ] **Step 5: Checkpoint**

```bash
git add apps/web/src/server/registry/activeTemplates.ts apps/web/src/__tests__/slice-13-active-templates.test.ts
git commit -m "feat(server): active template registry (merge built-ins + authored rows)"
```

---

### Task 5: API — rewrite `GET` + `POST /api/templates`

**Files:**
- Modify (rewrite): `apps/web/app/api/templates/route.ts`
- Test: `apps/web/src/__tests__/slice-13-templates-get-post.test.ts` (create)

**Interfaces:**
- Consumes: `requireOwner`/`requireAdmin`; `getMergedTemplates`/`invalidateActiveTemplates`; `getMergedSectionTypes`; `getRepo().upsertTemplate`; `validateTemplateDefinition` (shared); `themes` (app theme list); `Template` (shared).
- Produces: `GET` → `200 { templates: Template[] }` (any authed); `POST` → `201 { template: Template }` (admin); 400 invalid, 409 duplicate id.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-templates-get-post.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { GET, POST } from "../../app/api/templates/route";

const def: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const post = (body: unknown) =>
  new Request("http://x/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  invalidateActiveRegistry();
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
  invalidateActiveRegistry();
});

describe("GET /api/templates", () => {
  it("lists built-ins for any authed user", async () => {
    const body = (await (await GET()).json()) as { templates: Template[] };
    expect(body.templates.map((t) => t.id)).toEqual(expect.arrayContaining(builtInTemplates.map((t) => t.id)));
  });
});

describe("POST /api/templates", () => {
  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(def))).status).toBe(403);
  });

  it("creates a valid template", async () => {
    expect((await POST(post(def))).status).toBe(201);
    expect((await getRepo().listTemplateRows()).map((r) => r.id)).toContain("tmpl_sales");
  });

  it("400s an invalid template", async () => {
    expect((await POST(post({ ...def, slots: [] }))).status).toBe(400);
  });

  it("409s a duplicate id (built-in or existing authored)", async () => {
    expect((await POST(post({ ...def, id: builtInTemplates[0]!.id }))).status).toBe(409);
    await POST(post(def));
    expect((await POST(post(def))).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-get-post.test.ts`
Expected: FAIL — the current route exports an `upsert`-style POST/PUT and uses the removed repo methods (compile/behavior mismatch).

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `apps/web/app/api/templates/route.ts` with:

```ts
// apps/web/app/api/templates/route.ts
import { NextResponse } from "next/server";
import { validateTemplateDefinition, type Template } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import { getMergedTemplates, invalidateActiveTemplates } from "../../../src/server/registry/activeTemplates";
import { getMergedSectionTypes } from "../../../src/server/registry/activeRegistry";
import { themes } from "../../../src/theme/themes";

/** GET — the merged active template list (any authed user; the picker needs it). */
export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ templates: await getMergedTemplates() });
}

/** POST — create or duplicate an authored template (admin). */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const def = (await request.json().catch(() => null)) as Template | null;
  const ctx = { sectionTypes: await getMergedSectionTypes(), themeIds: themes.map((t) => t.id) };
  const result = validateTemplateDefinition(def, ctx);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid template", errors: result.errors }, { status: 400 });
  }
  const id = (def as Template).id;

  if ((await getMergedTemplates()).some((t) => t.id === id)) {
    return NextResponse.json({ error: `A template "${id}" already exists` }, { status: 409 });
  }

  const row = await getRepo().upsertTemplate({ id, template: def as Template, deprecated: false });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row.template }, { status: 201 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-get-post.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Verify typecheck is now clean**

Run: `npm run typecheck`
Expected: exit 0 (the route no longer uses removed methods; repo + registry are complete).

- [ ] **Step 6: Checkpoint**

```bash
git add apps/web/app/api/templates/route.ts apps/web/src/__tests__/slice-13-templates-get-post.test.ts
git commit -m "feat(api): GET + POST /api/templates (merged list + admin create)"
```

---

### Task 6: API — `PUT /api/templates/[id]` (edit; built-in & in-use frozen)

**Files:**
- Create: `apps/web/app/api/templates/[id]/route.ts`
- Test: `apps/web/src/__tests__/slice-13-templates-put.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin`; `builtInTemplates`/`validateTemplateDefinition`/`Template` (shared); `getRepo()` (`listTemplateRows`, `listInUseTemplateIds`, `upsertTemplate`); `getMergedSectionTypes`; `invalidateActiveTemplates`; `themes`.
- Produces: `PUT` → `200 { template }`; 409 built-in or in-use; 404 unknown authored id; 400 invalid.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-templates-put.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { builtInTemplates, sampleProposal, type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { PUT } from "../../app/api/templates/[id]/route";

const tmpl: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const put = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/templates/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
  invalidateActiveRegistry();
});

describe("PUT /api/templates/[id]", () => {
  it("edits an authored, not-in-use template", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const { req, ctx } = put(tmpl.id, { ...tmpl, name: "Renamed" });
    const res = await PUT(req, ctx);
    expect(res.status).toBe(200);
    expect((await getRepo().listTemplateRows())[0]!.template?.name).toBe("Renamed");
  });

  it("409s a built-in template", async () => {
    const id = builtInTemplates[0]!.id;
    const { req, ctx } = put(id, { ...tmpl, id });
    expect((await PUT(req, ctx)).status).toBe(409);
  });

  it("409s a template that is in use", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    await getRepo().createProposal("owner_a", { ...sampleProposal, templateId: tmpl.id });
    const { req, ctx } = put(tmpl.id, { ...tmpl, name: "Renamed" });
    expect((await PUT(req, ctx)).status).toBe(409);
  });

  it("404s an unknown authored id", async () => {
    const { req, ctx } = put("tmpl_ghost", { ...tmpl, id: "tmpl_ghost" });
    expect((await PUT(req, ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-put.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/templates/[id]/route.ts`:

```ts
// apps/web/app/api/templates/[id]/route.ts
import { NextResponse } from "next/server";
import { builtInTemplates, validateTemplateDefinition, type Template } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { getMergedSectionTypes } from "../../../../src/server/registry/activeRegistry";
import { invalidateActiveTemplates } from "../../../../src/server/registry/activeTemplates";
import { themes } from "../../../../src/theme/themes";

type Ctx = { params: Promise<{ id: string }> };

/** PUT — edit an authored template. Built-ins and in-use templates are frozen (409). */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  if (builtInTemplates.some((t) => t.id === id)) {
    return NextResponse.json({ error: "Built-in templates are immutable — duplicate it instead" }, { status: 409 });
  }

  const rows = await getRepo().listTemplateRows();
  const existing = rows.find((r) => r.id === id && r.template);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getRepo().listInUseTemplateIds()).includes(id)) {
    return NextResponse.json({ error: "Template is in use — duplicate it to change it" }, { status: 409 });
  }

  const def = (await request.json().catch(() => null)) as Template | null;
  const ctx = { sectionTypes: await getMergedSectionTypes(), themeIds: themes.map((t) => t.id) };
  const result = validateTemplateDefinition(def, ctx);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid template", errors: result.errors }, { status: 400 });
  }
  // id is immutable on edit: keep the path's id.
  const row = await getRepo().upsertTemplate({ id, template: { ...(def as Template), id }, deprecated: existing.deprecated });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row.template });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-put.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Checkpoint**

```bash
git add "apps/web/app/api/templates/[id]/route.ts" apps/web/src/__tests__/slice-13-templates-put.test.ts
git commit -m "feat(api): PUT /api/templates/[id] (edit, built-in + in-use frozen)"
```

---

### Task 7: API — `POST /api/templates/[id]/deprecate`

**Files:**
- Create: `apps/web/app/api/templates/[id]/deprecate/route.ts`
- Test: `apps/web/src/__tests__/slice-13-templates-deprecate.test.ts` (create)

**Interfaces:**
- Consumes: `requireAdmin`; `getRepo().setTemplateDeprecated`; `invalidateActiveTemplates`.
- Produces: `POST { deprecated }` → `200 { template: TemplateRow }`; 404 unknown.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-templates-deprecate.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Template } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveTemplates } from "../server/registry/activeTemplates";
import { POST } from "../../app/api/templates/[id]/deprecate/route";

const tmpl: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }],
};
const post = (id: string, body: unknown) => ({
  req: new Request(`http://x/api/templates/${id}/deprecate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  ctx: { params: Promise.resolve({ id }) },
});

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveTemplates();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveTemplates();
});

describe("POST /api/templates/[id]/deprecate", () => {
  it("deprecates an authored template", async () => {
    await getRepo().upsertTemplate({ id: tmpl.id, template: tmpl, deprecated: false });
    const { req, ctx } = post(tmpl.id, { deprecated: true });
    expect((await POST(req, ctx)).status).toBe(200);
    expect((await getRepo().listTemplateRows())[0]!.deprecated).toBe(true);
  });

  it("404s an unknown id when not deprecating", async () => {
    const { req, ctx } = post("tmpl_ghost", { deprecated: false });
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    const { req, ctx } = post("tmpl_sales", { deprecated: true });
    expect((await POST(req, ctx)).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-deprecate.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/templates/[id]/deprecate/route.ts`:

```ts
// apps/web/app/api/templates/[id]/deprecate/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../src/server/repo";
import { invalidateActiveTemplates } from "../../../../../src/server/registry/activeTemplates";

type Ctx = { params: Promise<{ id: string }> };

/** POST — deprecate (hide from the picker) or restore a template. Body { deprecated }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as { deprecated?: unknown } | null;
  const deprecated = body?.deprecated === true;

  const row = await getRepo().setTemplateDeprecated(id, deprecated);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  invalidateActiveTemplates();
  return NextResponse.json({ template: row });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-deprecate.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Checkpoint**

```bash
git add "apps/web/app/api/templates/[id]/deprecate/route.ts" apps/web/src/__tests__/slice-13-templates-deprecate.test.ts
git commit -m "feat(api): POST /api/templates/[id]/deprecate"
```

---

### Task 8: Client — `client/templates.ts`

**Files:**
- Create: `apps/web/src/client/templates.ts`
- Test: `apps/web/src/__tests__/slice-13-templates-client.test.ts` (create)

**Interfaces:**
- Consumes: `fetch` (mocked in tests); `Template` (shared).
- Produces:
  - `fetchTemplates(): Promise<Template[]>`
  - `createTemplate(def: Template): Promise<void>`
  - `updateTemplate(id: string, def: Template): Promise<void>`
  - `setTemplateDeprecated(id: string, deprecated: boolean): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-templates-client.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTemplates, createTemplate, updateTemplate, setTemplateDeprecated } from "../client/templates";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const err = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const tmpl = { id: "tmpl_x", name: "X", themeId: "theme_phoenix_default", locked: false, slots: [] };

describe("client/templates", () => {
  it("fetchTemplates unwraps { templates }", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ templates: [tmpl] })));
    expect(await fetchTemplates()).toEqual([tmpl]);
  });

  it("createTemplate POSTs to /api/templates", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await createTemplate(tmpl as never);
    expect(f).toHaveBeenCalledWith("/api/templates", expect.objectContaining({ method: "POST" }));
  });

  it("updateTemplate PUTs to /api/templates/:id", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await updateTemplate("tmpl_x", tmpl as never);
    expect(f).toHaveBeenCalledWith("/api/templates/tmpl_x", expect.objectContaining({ method: "PUT" }));
  });

  it("setTemplateDeprecated POSTs to the deprecate sub-route", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await setTemplateDeprecated("tmpl_x", true);
    expect(f).toHaveBeenCalledWith("/api/templates/tmpl_x/deprecate", expect.objectContaining({ method: "POST" }));
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(() => err(409, { error: "dup" })));
    await expect(createTemplate(tmpl as never)).rejects.toThrow("dup");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-client.test.ts`
Expected: FAIL — `../client/templates` doesn't exist.

- [ ] **Step 3: Implement the client module**

Create `apps/web/src/client/templates.ts` (mirrors `client/sectionTypes.ts`):

```ts
import type { Template } from "@proposal/shared";

export async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/templates");
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  return ((await res.json()) as { templates: Template[] }).templates;
}

export async function createTemplate(def: Template): Promise<void> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Create failed");
  }
}

export async function updateTemplate(id: string, def: Template): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Update failed");
  }
}

export async function setTemplateDeprecated(id: string, deprecated: boolean): Promise<void> {
  const res = await fetch(`/api/templates/${id}/deprecate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deprecated }),
  });
  if (!res.ok) throw new Error("Update failed");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-templates-client.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Checkpoint**

```bash
git add apps/web/src/client/templates.ts apps/web/src/__tests__/slice-13-templates-client.test.ts
git commit -m "feat(client): templates fetch module"
```

---

### Task 9: Store — `templates` state, `loadTemplates`, `applyTemplate` from state

**Files:**
- Modify: `apps/web/src/state/proposalStore.ts`
- Test: `apps/web/src/__tests__/slice-13-store-templates.test.ts` (create)

**Interfaces:**
- Consumes: `builtInTemplates`/`applyTemplate` (shared, the pure scaffolder); `fetchTemplates` (Task 8).
- Produces: store state `templates: Template[]` (initialised to `builtInTemplates`), action `loadTemplates(): Promise<void>`, and `applyTemplate(id)` resolving from `get().templates`. The shared `getTemplate` import is removed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-store-templates.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtInTemplates, type Template } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

const authored: Template = {
  id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false,
  slots: [{ kind: "fixed", type: "text", lock: "open" }, { kind: "fixed", type: "executive_summary", lock: "open" }],
};

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  useProposalStore.setState({ templates: builtInTemplates });
});

describe("store templates", () => {
  it("initialises templates to the built-ins", () => {
    expect(useProposalStore.getState().templates.map((t) => t.id)).toEqual(builtInTemplates.map((t) => t.id));
  });

  it("loadTemplates hydrates from the API", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ templates: [...builtInTemplates, authored] }), { status: 200, headers: { "content-type": "application/json" } })),
    ));
    await useProposalStore.getState().loadTemplates();
    expect(useProposalStore.getState().templates.map((t) => t.id)).toContain("tmpl_sales");
  });

  it("applyTemplate scaffolds a document from a hydrated template", () => {
    useProposalStore.setState({ templates: [...builtInTemplates, authored] });
    useProposalStore.getState().applyTemplate("tmpl_sales");
    const doc = useProposalStore.getState().document;
    expect(doc.templateId).toBe("tmpl_sales");
    expect(doc.sections).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-store-templates.test.ts`
Expected: FAIL — `templates`/`loadTemplates` are not on the store.

- [ ] **Step 3: Update the store**

In `apps/web/src/state/proposalStore.ts`:

- Update the shared import line (remove `getTemplate`, add `builtInTemplates`) and add the client import:

```ts
import { DEFAULT_MODEL, applyTemplate, builtInTemplates, sampleProposal, setActiveSectionTypes } from "@proposal/shared";
import type { GenerationModelId, ProposalDocument, SectionTypeSchema, Template, ThemeTokens } from "@proposal/shared";
import { fetchTemplates } from "../client/templates";
```

(Keep the existing `fetchSectionTypes` import.)

- Add to the `ProposalState` interface (near `sectionTypes`/`loadSectionTypes`):

```ts
  /** Active templates (built-ins + authored, hydrated from the API). */
  templates: Template[];
  /** Fetch the merged template list from the API into the store. */
  loadTemplates: () => Promise<void>;
```

- In the store body, initialise `templates` and add `loadTemplates`; rewrite `applyTemplate` to resolve from state:

```ts
  applyTemplate: (templateId) => {
    const template = get().templates.find((t) => t.id === templateId);
    if (!template) return;
    const document = applyTemplate(template);
    set({ document, theme: themeById(template.themeId), selectedId: document.sections[0]?.id ?? null });
  },
```

```ts
  templates: builtInTemplates,
  loadTemplates: async () => {
    try {
      set({ templates: await fetchTemplates() });
    } catch {
      get().notify("error", "Couldn't load templates.");
    }
  },
```

(`applyTemplate` from `@proposal/shared` is the pure scaffolder; the store action of the same name wraps it — keep both as they already coexist.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-store-templates.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Checkpoint**

Run: `npm run typecheck` — expected exit 0.

```bash
git add apps/web/src/state/proposalStore.ts apps/web/src/__tests__/slice-13-store-templates.test.ts
git commit -m "feat(store): templates state + loadTemplates + applyTemplate from state"
```

---

### Task 10: Inspector reads templates from the store; App hydrates on mount

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/__tests__/slice-03-static.test.tsx` and `apps/web/src/__tests__/slice-07-frontend.test.tsx` (make their `fetch` stub answer `/api/templates`)
- Test: `apps/web/src/__tests__/slice-13-inspector-templates.test.tsx` (create)

**Interfaces:**
- Consumes: store `templates` + `applyTemplate`; `openTemplate` (shared, fallback); `isThemePinned`/`isStructureLocked` (shared).
- Produces: the Inspector template dropdown lists store templates, excluding `deprecated` ones EXCEPT the document's current `templateId`; the current template for lock logic is resolved from the store.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-inspector-templates.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInTemplates, sampleProposal, type Template } from "@proposal/shared";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);

const active: Template = { id: "tmpl_active", name: "Active One", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }] };
const dead: Template = { id: "tmpl_dead", name: "Dead One", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }], deprecated: true };

describe("Inspector template picker", () => {
  it("lists store templates and hides deprecated ones (keeping the current)", () => {
    useProposalStore.setState({
      templates: [...builtInTemplates, active, dead],
      document: { ...sampleProposal, templateId: builtInTemplates[0]!.id },
    });
    render(<Inspector />);
    const select = screen.getByLabelText("Template") as HTMLSelectElement;
    const options = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("tmpl_active");
    expect(options).not.toContain("tmpl_dead");
  });

  it("keeps the current template in the list even when deprecated", () => {
    useProposalStore.setState({
      templates: [...builtInTemplates, dead],
      document: { ...sampleProposal, templateId: "tmpl_dead" },
    });
    render(<Inspector />);
    const select = screen.getByLabelText("Template") as HTMLSelectElement;
    const options = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("tmpl_dead");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-inspector-templates.test.tsx`
Expected: FAIL — the dropdown still maps the in-code `templates` import, so `tmpl_active` is absent.

- [ ] **Step 3: Update the Inspector**

In `apps/web/src/ui/Inspector.tsx`:
- Remove `getTemplate` and `templates` from the `@proposal/shared` import; keep `openTemplate`, `isStructureLocked`, `isThemePinned`, `getSectionType`, `SELECTABLE_MODELS`, `variantRangeWarnings`.
- Read templates from the store (add near the other selectors):

```ts
  const templates = useProposalStore((s) => s.templates);
```

- Replace the current-template resolution (was `getTemplate(document.templateId) ?? openTemplate`):

```ts
  const template = templates.find((t) => t.id === document.templateId) ?? openTemplate;
```

- Replace the dropdown's option source so it filters deprecated templates but always keeps the current one:

```tsx
          <select aria-label="Template" value={document.templateId} onChange={(e) => applyTemplateAction(e.target.value)}>
            {templates
              .filter((t) => !t.deprecated || t.id === document.templateId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
```

- [ ] **Step 4: Hydrate templates on App mount**

In `apps/web/src/App.tsx`, load templates alongside section types:

```tsx
  const loadSectionTypes = useProposalStore((s) => s.loadSectionTypes);
  const loadTemplates = useProposalStore((s) => s.loadTemplates);
  useEffect(() => {
    void loadSectionTypes();
    void loadTemplates();
  }, [loadSectionTypes, loadTemplates]);
```

- [ ] **Step 5: Keep the App-render tests hermetic**

`slice-03-static.test.tsx` and `slice-07-frontend.test.tsx` render `App`, which now also fetches `/api/templates`. Make their existing `global.fetch` stub URL-aware so the templates fetch resolves to an empty list (and section types keep their existing shape). For each file, update the stub so a request whose URL includes `/api/templates` returns `{ templates: [] }` and a request including `/api/section-types` returns the section-types shape it already returns. Concretely, replace the stub body with a URL switch, e.g.:

```ts
vi.stubGlobal("fetch", vi.fn((url: string) => {
  const body = String(url).includes("/api/templates") ? { templates: [] } : { sectionTypes: [] };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}));
```

(Match whatever section-types body each test already used; only ADD the `/api/templates` branch. If a test asserts specific section types, preserve that branch's shape.)

- [ ] **Step 6: Run the new test + the two touched suites**

Run: `npx vitest run apps/web/src/__tests__/slice-13-inspector-templates.test.tsx apps/web/src/__tests__/slice-03-static.test.tsx apps/web/src/__tests__/slice-07-frontend.test.tsx`
Expected: PASS (all three files green).

- [ ] **Step 7: Checkpoint**

```bash
git add apps/web/src/ui/Inspector.tsx apps/web/src/App.tsx apps/web/src/__tests__/slice-13-inspector-templates.test.tsx apps/web/src/__tests__/slice-03-static.test.tsx apps/web/src/__tests__/slice-07-frontend.test.tsx
git commit -m "feat(ui): Inspector template picker reads store; App hydrates templates"
```

---

### Task 11: `TemplateEditor` component

**Files:**
- Create: `apps/web/src/ui/admin/TemplateEditor.tsx`
- Test: `apps/web/src/__tests__/slice-13-template-editor.test.tsx` (create)

**Interfaces:**
- Consumes: `validateTemplateDefinition`, `type Template`, `type SlotLock` (shared); `createTemplate`/`updateTemplate` (client); store `sectionTypes` + `notify`; `themes` (app theme list).
- Produces: `TemplateEditor({ initial?, mode, onDone, onCancel })` with `mode: "create" | "edit"`, mirroring `SectionTypeEditor`. Saving validates then POST (create) / PUT (edit).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-template-editor.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SectionTypeSchema } from "@proposal/shared";
import { TemplateEditor } from "../ui/admin/TemplateEditor";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sectionTypes: SectionTypeSchema[] = [
  { type: "text", label: "Text", category: "text", variants: [], schemaVersion: 1, fields: [{ key: "heading", type: "text" }] },
];

describe("TemplateEditor", () => {
  it("creates a template: fills name + a slot, then POSTs", async () => {
    useProposalStore.setState({ sectionTypes });
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ template: {} }), { status: 201, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", f);
    const onDone = vi.fn();

    render(<TemplateEditor mode="create" onDone={onDone} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    fireEvent.click(screen.getByRole("button", { name: /add slot/i }));
    // the new slot defaults its type to the first section type ("text") and lock to "open"

    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/templates", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables Save while the draft is invalid (no slots)", () => {
    useProposalStore.setState({ sectionTypes });
    render(<TemplateEditor mode="create" onDone={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    expect(screen.getByRole("button", { name: /^save/i })).toBeDisabled(); // zero slots → invalid
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-template-editor.test.tsx`
Expected: FAIL — `../ui/admin/TemplateEditor` doesn't exist.

- [ ] **Step 3: Implement the editor**

Create `apps/web/src/ui/admin/TemplateEditor.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { validateTemplateDefinition, type SlotLock, type Template } from "@proposal/shared";
import { createTemplate, updateTemplate } from "../../client/templates";
import { useProposalStore } from "../../state/proposalStore";
import { themes } from "../../theme/themes";

const LOCKS: SlotLock[] = ["open", "editable-copy", "editable-data", "fixed"];

type DraftSlot = { type: string; lock: SlotLock; data: Record<string, string> };

function toDef(id: string, name: string, themeId: string, locked: boolean, slots: DraftSlot[]): Template {
  return {
    id: id.trim(),
    name: name.trim(),
    themeId,
    locked,
    slots: slots.map((s) => {
      const hasData = s.lock === "fixed" && Object.keys(s.data).some((k) => s.data[k]?.trim() !== "");
      return {
        kind: "fixed" as const,
        type: s.type,
        lock: s.lock,
        ...(hasData ? { data: Object.fromEntries(Object.entries(s.data).filter(([, v]) => v.trim() !== "")) } : {}),
      };
    }),
  };
}

export function TemplateEditor({
  initial,
  mode = "create",
  onDone,
  onCancel,
}: {
  initial?: Template;
  mode?: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const sectionTypes = useProposalStore((s) => s.sectionTypes);
  const editing = mode === "edit";
  const pickableTypes = sectionTypes.filter((t) => !t.deprecated);

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [themeId, setThemeId] = useState(initial?.themeId ?? themes[0]?.id ?? "");
  const [locked, setLocked] = useState(initial?.locked ?? false);
  const [slots, setSlots] = useState<DraftSlot[]>(
    (initial?.slots ?? []).flatMap((s) =>
      s.kind === "fixed"
        ? [{ type: s.type, lock: s.lock, data: Object.fromEntries(Object.entries(s.data ?? {}).map(([k, v]) => [k, String(v)])) }]
        : [], // choice slots aren't editable in v1; drop them from the draft
    ),
  );
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => toDef(id, name, themeId, locked, slots), [id, name, themeId, locked, slots]);
  const result = useMemo(
    () => validateTemplateDefinition(def, { sectionTypes, themeIds: themes.map((t) => t.id) }),
    [def, sectionTypes],
  );

  const addSlot = () =>
    setSlots((s) => [...s, { type: pickableTypes[0]?.type ?? "", lock: "open", data: {} }]);
  const patch = (i: number, p: Partial<DraftSlot>) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setSlots((s) => s.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setSlots((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const textFieldsOf = (type: string) =>
    (sectionTypes.find((t) => t.type === type)?.fields ?? []).filter((f) => f.type === "text" || f.type === "paragraph");

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateTemplate(def.id, def);
      else await createTemplate(def);
      notify("success", editing ? "Template updated." : "Template created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit template" : "New template"}</h2>

      <label className="field">
        <span className="field__label">Template id</span>
        <input aria-label="Template id" value={id} disabled={editing} onChange={(e) => setId(e.target.value)} placeholder="tmpl_sales" />
      </label>
      <label className="field">
        <span className="field__label">Template name</span>
        <input aria-label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales proposal" />
      </label>
      <label className="field">
        <span className="field__label">Theme</span>
        <select aria-label="Theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="steditor__req">
        <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Locked (pins structure &amp; theme)
      </label>

      <div className="field">
        <span className="field__label">Slots</span>
        {slots.map((s, i) => (
          <div key={i} className="steditor__field" data-slot={i}>
            <select aria-label="Slot type" value={s.type} onChange={(e) => patch(i, { type: e.target.value })}>
              {pickableTypes.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <select aria-label="Slot lock" value={s.lock} onChange={(e) => patch(i, { lock: e.target.value as SlotLock })}>
              {LOCKS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn btn--ghost" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn btn--ghost" onClick={() => remove(i)}>Remove</button>
            {s.lock === "fixed" ? (
              <div className="steditor__fixed">
                {textFieldsOf(s.type).map((f) => (
                  <input
                    key={f.key}
                    aria-label={`Fixed ${f.key}`}
                    value={s.data[f.key] ?? ""}
                    onChange={(e) => patch(i, { data: { ...s.data, [f.key]: e.target.value } })}
                    placeholder={f.label ?? f.key}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className="btn" onClick={addSlot}>Add slot</button>
      </div>

      {!result.valid ? (
        <ul className="notice notice--warn">
          {result.errors.map((e, i) => (
            <li key={i}><code>{e.path}</code> — {e.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!result.valid || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-13-template-editor.test.tsx`
Expected: PASS (2/2).

- [ ] **Step 5: Checkpoint**

```bash
git add apps/web/src/ui/admin/TemplateEditor.tsx apps/web/src/__tests__/slice-13-template-editor.test.tsx
git commit -m "feat(ui): TemplateEditor (fixed slots, locks, fixed content)"
```

---

### Task 12: `TemplateList` + dashboard Templates panel + page wiring + full verify

**Files:**
- Create: `apps/web/src/ui/admin/TemplateList.tsx`
- Modify: `apps/web/src/ui/admin/AdminDashboard.tsx`
- Modify: `apps/web/app/admin/page.tsx`
- Modify: `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` and `apps/web/src/__tests__/slice-12-admin-nav.test.tsx` (new required props)
- Test: `apps/web/src/__tests__/slice-13-template-list.test.tsx` (create)

**Interfaces:**
- Consumes: `builtInTemplates`/`type Template` (shared); `setTemplateDeprecated` (client); store `notify`; `TemplateEditor` (Task 11).
- Produces: `TemplateList({ templates, inUse, onChange })` (mirrors `SectionTypeList`); `AdminDashboard` gains `templates`/`inUseTemplates` props and a `"templates"` panel; `/admin` page passes them.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-13-template-list.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInTemplates, type Template } from "@proposal/shared";
import { TemplateList } from "../ui/admin/TemplateList";

afterEach(cleanup);

const authored: Template = { id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }] };

describe("TemplateList", () => {
  it("badges built-in vs authored and disables Edit for built-ins and in-use", () => {
    render(<TemplateList templates={[...builtInTemplates, authored]} inUse={["tmpl_sales"]} onChange={vi.fn()} />);

    const builtinRow = screen.getByText(builtInTemplates[0]!.name).closest("[data-template]") as HTMLElement;
    expect(within(builtinRow).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(builtinRow).getByRole("button", { name: /^edit/i })).toBeDisabled();

    const authoredRow = screen.getByText("Sales").closest("[data-template]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in use → frozen
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-13-template-list.test.tsx`
Expected: FAIL — `../ui/admin/TemplateList` doesn't exist.

- [ ] **Step 3: Implement `TemplateList`**

Create `apps/web/src/ui/admin/TemplateList.tsx` (mirrors `SectionTypeList`):

```tsx
"use client";

import { useState } from "react";
import { builtInTemplates, type Template } from "@proposal/shared";
import { setTemplateDeprecated } from "../../client/templates";
import { useProposalStore } from "../../state/proposalStore";
import { TemplateEditor } from "./TemplateEditor";

function isBuiltIn(id: string): boolean {
  return builtInTemplates.some((t) => t.id === id);
}

export function TemplateList({
  templates,
  inUse,
  onChange,
}: {
  templates: Template[];
  inUse: string[];
  onChange: (t: Template[]) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [editor, setEditor] = useState<{ initial?: Template; mode: "create" | "edit" } | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/templates");
    if (res.ok) onChange(((await res.json()) as { templates: Template[] }).templates);
  };

  const onDeprecate = async (id: string, deprecated: boolean) => {
    try {
      await setTemplateDeprecated(id, deprecated);
      await refresh();
    } catch {
      notify("error", "Couldn't update the template.");
    }
  };

  if (editor) {
    return (
      <TemplateEditor
        {...(editor.initial ? { initial: editor.initial } : {})}
        mode={editor.mode}
        onDone={async () => {
          setEditor(null);
          await refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <div className="stlist">
      <div className="stlist__head">
        <h2>Templates</h2>
        <button type="button" className="btn btn--primary" onClick={() => setEditor({ mode: "create" })}>
          New template
        </button>
      </div>
      <ul className="stlist__rows">
        {templates.map((t) => {
          const builtin = isBuiltIn(t.id);
          const used = inUse.includes(t.id);
          return (
            <li key={t.id} data-template={t.id} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{t.name}</span>
                <code className="stlist__key">{t.id}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{builtin ? "built-in" : "authored"}</span>
                {used ? <span className="tag">in use</span> : null}
                {t.locked ? <span className="tag">locked</span> : null}
                {t.deprecated ? <span className="tag tag--unstyled">deprecated</span> : null}
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditor({ initial: { ...t, id: `${t.id}_copy` }, mode: "create" })}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={builtin || used}
                  title={builtin ? "Built-ins are immutable — duplicate" : used ? "In use — duplicate to change" : undefined}
                  onClick={() => setEditor({ initial: t, mode: "edit" })}
                >
                  Edit
                </button>
                {builtin ? null : (
                  <button type="button" className="btn" onClick={() => void onDeprecate(t.id, !t.deprecated)}>
                    {t.deprecated ? "Restore" : "Deprecate"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Wire the dashboard, the page, and fix the dashboard tests**

In `apps/web/src/ui/admin/AdminDashboard.tsx`:
- Add imports: `import type { SectionTypeSchema, Template } from "@proposal/shared";` and `import { TemplateList } from "./TemplateList";`
- Extend the panel union and props, add `templates` state, enable the Templates nav button, and render the panel:

```tsx
type Panel = "section-types" | "users" | "templates";

export function AdminDashboard({
  sectionTypes,
  inUse,
  currentUserId,
  templates,
  inUseTemplates,
}: {
  sectionTypes: SectionTypeSchema[];
  inUse: string[];
  currentUserId: string;
  templates: Template[];
  inUseTemplates: string[];
}) {
  const [types, setTypes] = useState(sectionTypes);
  const [tmpls, setTmpls] = useState(templates);
  const [panel, setPanel] = useState<Panel>("section-types");
```

Replace the Templates nav button (currently `disabled`) with:

```tsx
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "templates"}
            onClick={() => setPanel("templates")}
          >
            Templates
          </button>
```

Replace the `<main>` body with a three-way switch:

```tsx
        <main className="admin__main">
          {panel === "section-types" ? (
            <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
          ) : panel === "users" ? (
            <UsersView currentUserId={currentUserId} />
          ) : (
            <TemplateList templates={tmpls} inUse={inUseTemplates} onChange={setTmpls} />
          )}
        </main>
```

In `apps/web/app/admin/page.tsx`, fetch the merged templates + in-use ids and pass them down:

```tsx
import { getMergedTemplates } from "../../src/server/registry/activeTemplates";
```

```tsx
  const [sectionTypes, inUse, templates, inUseTemplates] = await Promise.all([
    getMergedSectionTypes(),
    getRepo().listInUseTypeKeys(),
    getMergedTemplates(),
    getRepo().listInUseTemplateIds(),
  ]);
  return (
    <AdminDashboard
      sectionTypes={sectionTypes}
      inUse={inUse}
      currentUserId={session.user.id}
      templates={templates}
      inUseTemplates={inUseTemplates}
    />
  );
```

In `apps/web/src/__tests__/slice-11-admin-shell.test.tsx` and `apps/web/src/__tests__/slice-12-admin-nav.test.tsx`, add the two new required props to every `AdminDashboard` render call:

```tsx
templates={[]} inUseTemplates={[]}
```

(For the nav test, this lets the existing assertions stand; the Templates panel renders an empty `TemplateList` when clicked.)

- [ ] **Step 5: Run the new test + the touched dashboard tests**

Run: `npx vitest run apps/web/src/__tests__/slice-13-template-list.test.tsx apps/web/src/__tests__/slice-11-admin-shell.test.tsx apps/web/src/__tests__/slice-12-admin-nav.test.tsx`
Expected: PASS (all three files green).

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: entire suite green (all prior slices + the new slice-13 files).

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build -w @proposal/web`
Expected: clean build; the route list includes `/api/templates`, `/api/templates/[id]`, and `/api/templates/[id]/deprecate`.

- [ ] **Step 7: Checkpoint**

```bash
git add apps/web/src/ui/admin/TemplateList.tsx apps/web/src/ui/admin/AdminDashboard.tsx apps/web/app/admin/page.tsx apps/web/src/__tests__/slice-13-template-list.test.tsx apps/web/src/__tests__/slice-11-admin-shell.test.tsx apps/web/src/__tests__/slice-12-admin-nav.test.tsx
git commit -m "feat(ui): TemplateList + dashboard Templates panel + page wiring"
```

---

## Self-Review

**Spec coverage:**
- §A data model (`deprecated?`, built-ins in code, merge, table reshape, migration 0004) → Tasks 1, 3, 4. ✅
- §B repo methods (`listTemplateRows`/`upsertTemplate(row)`/`setTemplateDeprecated`/`listInUseTemplateIds`, drop `StoredTemplate`) → Tasks 2, 3. ✅
  - Note: the spec mentioned updating `slice-08-repo.test.ts` for the old template API, but that file's "themes & templates" block only tests **themes** (no template assertions), so there is nothing to migrate there — confirmed during planning; no task needed.
- §C server active-template registry → Task 4. ✅
- §D `validateTemplateDefinition(def, ctx)` (rejects choice, validates type/lock/theme/fixed-data) → Task 1. (Refined `ctx` to `{ sectionTypes: SectionTypeSchema[]; themeIds: string[] }` so fixed-data keys can be checked against the type's text fields — the spec's intent.) ✅
- §E routes (GET/POST/PUT/deprecate, status codes, freezing) → Tasks 5, 6, 7. ✅
- §F store + Inspector (state, loadTemplates, applyTemplate-from-state, dropdown filters deprecated/keeps current) → Tasks 9, 10. ✅
- §G builder UI (TemplateList, TemplateEditor, dashboard panel) → Tasks 11, 12. ✅
- §H testing — every task is TDD with hermetic seams. ✅
- File map — every Create/Modify path appears in a task. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The one adaptive instruction (Task 10 Step 5, URL-aware fetch stub) gives concrete code + a rule, because the exact prior stub body lives in files the implementer will read.

**Type consistency:** `TemplateRow`, the four repo methods, `validateTemplateDefinition(def, ctx)`, `getMergedTemplates`, `builtInTemplates`, the client functions, and `applyTemplate`-from-state are defined in Tasks 1–9 and consumed unchanged in later tasks. `requireOwner`/`requireAdmin` return `string | Response` and are used that way. `AdminDashboard` gains `templates`/`inUseTemplates` (Task 12), and the two existing dashboard tests are updated in the same task. `SlotLock` union matches the four locks used in the editor + validator.

**Note for executors (no-git workspace):** the `git` commands in each Checkpoint are illustrative; treat each checkpoint as "named test file(s) pass + `npm run typecheck` is green," except the deliberate Task 2→3→5 interim typecheck failures noted in those tasks. Record progress in `docs/plans/builder-template-authoring-progress.md`.
