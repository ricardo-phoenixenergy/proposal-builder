# Builder — Section-Type Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first Builder increment — an admin role + bootstrap + a gated `/admin` dashboard where admins author section types (text-fields-only, copy-on-write), made live across the app, plus a minimal "Add section" so authored types are usable end to end.

**Architecture:** The code-defined section-type registry in `packages/shared` becomes a runtime-settable active set (built-ins + DB-authored types, authored wins by key). A new `section_types` table stores full authored definitions; built-ins stay immutable in code and are changed only by Duplicate + Deprecate. An `isAdmin` role gates the dashboard and mutation routes. The client hydrates the active registry on load.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Ajv, Drizzle/Neon Postgres, Auth.js v5 (credentials), Vitest (node + jsdom projects), `@testing-library/react`.

## Global Constraints

- TypeScript strict; extensionless imports (`moduleResolution: "bundler"`) — never add `.js`.
- `packages/shared` is framework-agnostic: no React, no DB, no Next imports.
- AI generates content only; the Builder authors **schemas/composition only — never React/JSX** (spec §8 non-goal). Authored types render via the generic fallback (flagged *unstyled*).
- Field types this slice: **`text` and `paragraph` only**, with `maxChars` (text) / `maxWords` (paragraph) limits. Category `"text"` only.
- Built-in types are immutable in code; never mutated in place. "Edit a built-in" = Duplicate + Deprecate.
- Tests are hermetic: in-memory repo via `setRepoForTests`, auth via resolver seams, `fetch` mocked in client tests. No network/DB/Chromium in CI.
- **No git in this workspace** — replace per-task commits with a validation checkpoint: run the task's tests, then `npm run typecheck`.
- Run a single test file with: `npx vitest run <path>`. Full suite: `npx vitest run`. Typecheck: `npm run typecheck`. Build: `npm run build -w @proposal/web`.

---

## File map

**packages/shared**
- Modify `src/types/section.ts` — add `deprecated?: boolean` to `SectionTypeSchema`.
- Modify `src/registry/sectionTypes.ts` — `builtInSectionTypes`, settable active registry (in-place map mutation), `setActiveSectionTypes`, `listSectionTypes`, `sectionTypeRevision`.
- Modify `src/validation/validateSection.ts` — re-derive the Ajv validator when the registry revision changes.
- Create `src/validation/validateSectionTypeDefinition.ts` — meta-validation ("schema for schemas").
- Modify `src/index.ts` — export the new symbols.

**apps/web (server)**
- Modify `src/server/repo/types.ts` — `SectionTypeRow`, `StoredUser.isAdmin`, repo methods.
- Modify `src/server/repo/memory.ts` — section-type rows, in-use scan, isAdmin.
- Modify `src/server/repo/postgres.ts` — same against Drizzle.
- Modify `src/server/db/schema.ts` — `section_types` table, `users.isAdmin` column.
- Create `src/server/registry/activeRegistry.ts` — load rows, merge, `setActiveSectionTypes`, cache + invalidate.
- Modify `src/server/auth/credentials.ts` — `authenticateUser` returns `isAdmin`.
- Create `src/server/auth/sessionUser.ts` — `getSessionUser()` seam (`{ id, isAdmin } | null`) + test setter.
- Modify `src/server/auth/owner.ts` — re-implement `getOwner` on top of the session-user seam (keep its API).
- Modify `src/server/auth/guard.ts` — add `requireAdmin()`.
- Modify `auth.ts`, `auth.config.ts`, `types/next-auth.d.ts` — carry `isAdmin` in JWT/session; gate `/admin`.
- Create `app/api/section-types/route.ts` — GET (authed) + POST (admin).
- Create `app/api/section-types/[type]/route.ts` — PUT (admin).
- Create `app/api/section-types/[type]/deprecate/route.ts` — POST (admin).
- Modify `scripts/create-user.mjs` — `--admin` flag.

**apps/web (client)**
- Modify `src/state/mutations.ts` — `appendSection` pure mutation.
- Modify `src/state/proposalStore.ts` — `addSection`, `sectionTypes` list + `loadSectionTypes`.
- Create `src/client/sectionTypes.ts` — fetch helpers for the dashboard.
- Modify `src/ui/Outline.tsx` — "+ Add section" control.
- Create `app/admin/page.tsx` — gated dashboard shell (server component).
- Create `src/ui/admin/AdminDashboard.tsx` — shell + nav (client).
- Create `src/ui/admin/SectionTypeList.tsx` — table + badges + actions.
- Create `src/ui/admin/SectionTypeEditor.tsx` — field editor form + meta-validation.
- Modify `app/globals.css` — admin/dashboard + add-section styles.

---

## Task 1: Meta-validation — `validateSectionTypeDefinition` (shared)

**Files:**
- Create: `packages/shared/src/validation/validateSectionTypeDefinition.ts`
- Test: `packages/shared/src/validation/validateSectionTypeDefinition.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `ValidationResult`, `ValidationError` from `../validation/result`; `SectionTypeSchema`, `FieldSchema` from `../types/section`.
- Produces: `validateSectionTypeDefinition(def: unknown): ValidationResult`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/validation/validateSectionTypeDefinition.test.ts
import { describe, expect, it } from "vitest";
import { validateSectionTypeDefinition } from "./validateSectionTypeDefinition";

const valid = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [
    { key: "heading", type: "text", label: "Heading", required: true, maxChars: 80 },
    { key: "body", type: "paragraph", label: "Body", maxWords: 200 },
  ],
  variants: [],
  schemaVersion: 1,
};

describe("validateSectionTypeDefinition (schema for schemas)", () => {
  it("accepts a well-formed text type", () => {
    expect(validateSectionTypeDefinition(valid)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a bad type key", () => {
    const r = validateSectionTypeDefinition({ ...valid, type: "Case Study" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "/type")).toBe(true);
  });

  it("rejects an empty label", () => {
    expect(validateSectionTypeDefinition({ ...valid, label: "" }).valid).toBe(false);
  });

  it("requires at least one field", () => {
    expect(validateSectionTypeDefinition({ ...valid, fields: [] }).valid).toBe(false);
  });

  it("rejects duplicate field keys", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [valid.fields[0], { ...valid.fields[0] }],
    });
    expect(r.valid).toBe(false);
  });

  it("rejects a non-text field type this slice", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [{ key: "data", type: "dataset", label: "Data", required: true }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "/fields/0/type")).toBe(true);
  });

  it("rejects a non-positive or non-integer limit", () => {
    const r = validateSectionTypeDefinition({
      ...valid,
      fields: [{ key: "h", type: "text", label: "H", maxChars: 0 }],
    });
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/validation/validateSectionTypeDefinition.test.ts`
Expected: FAIL — cannot find module `./validateSectionTypeDefinition`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/validation/validateSectionTypeDefinition.ts
import type { ValidationError, ValidationResult } from "./result";

const TYPE_KEY = /^[a-z][a-z0-9_]*$/;
const ALLOWED_FIELD_TYPES = ["text", "paragraph"] as const; // this slice

function isPositiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Meta-validation for an authored section-type definition (§5.1 Builder).
 * The "schema for schemas": guards what a user may author before it joins the
 * registry. Text-only this slice. Errors use field-pointer paths.
 */
export function validateSectionTypeDefinition(def: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });

  if (typeof def !== "object" || def === null) {
    return { valid: false, errors: [{ path: "", message: "Expected a section-type object", source: "app" }] };
  }
  const d = def as Record<string, unknown>;

  if (typeof d["type"] !== "string" || !TYPE_KEY.test(d["type"])) {
    push("/type", "type must be a lowercase slug (letters, digits, underscore; starting with a letter)");
  }
  if (typeof d["label"] !== "string" || d["label"].trim() === "") {
    push("/label", "label is required");
  }
  if (d["category"] !== "text") {
    push("/category", 'category must be "text" in this version');
  }

  const fields = d["fields"];
  if (!Array.isArray(fields) || fields.length === 0) {
    push("/fields", "at least one field is required");
  } else {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      const f = field as Record<string, unknown>;
      if (typeof f["key"] !== "string" || !TYPE_KEY.test(f["key"])) {
        push(`/fields/${i}/key`, "field key must be a lowercase slug");
      } else if (seen.has(f["key"])) {
        push(`/fields/${i}/key`, `duplicate field key "${f["key"]}"`);
      } else {
        seen.add(f["key"]);
      }
      if (typeof f["label"] !== "string" || f["label"].trim() === "") {
        push(`/fields/${i}/label`, "field label is required");
      }
      if (!ALLOWED_FIELD_TYPES.includes(f["type"] as (typeof ALLOWED_FIELD_TYPES)[number])) {
        push(`/fields/${i}/type`, "field type must be text or paragraph in this version");
      }
      if (f["maxChars"] !== undefined && !isPositiveInt(f["maxChars"])) {
        push(`/fields/${i}/maxChars`, "maxChars must be a positive integer");
      }
      if (f["maxWords"] !== undefined && !isPositiveInt(f["maxWords"])) {
        push(`/fields/${i}/maxWords`, "maxWords must be a positive integer");
      }
    });
  }

  if (d["variants"] !== undefined) {
    if (!Array.isArray(d["variants"]) || d["variants"].some((v) => typeof v !== "string" || v === "")) {
      push("/variants", "variants must be an array of non-empty strings");
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Add the export**

In `packages/shared/src/index.ts`, after the `variantRangeWarnings` export line, add:

```ts
export { validateSectionTypeDefinition } from "./validation/validateSectionTypeDefinition";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/validation/validateSectionTypeDefinition.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Checkpoint** — `npm run typecheck`. Expected: exit 0.

---

## Task 2: Runtime-settable registry (shared)

**Files:**
- Modify: `packages/shared/src/types/section.ts` (add `deprecated?: boolean`)
- Modify: `packages/shared/src/registry/sectionTypes.ts`
- Modify: `packages/shared/src/validation/validateSection.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/registry/activeRegistry.test.ts`

**Interfaces:**
- Consumes: `SectionTypeSchema` (now with optional `deprecated`); `buildSectionSchema`.
- Produces:
  - `builtInSectionTypes: SectionTypeSchema[]`
  - `setActiveSectionTypes(authored: SectionTypeSchema[]): void` (authored wins by `type`)
  - `getSectionType(type: string): SectionTypeSchema | undefined` (reads active)
  - `listSectionTypes(opts?: { includeDeprecated?: boolean }): SectionTypeSchema[]`
  - `sectionTypeRevision(): number`
  - `resetSectionTypesForTests(): void`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/registry/activeRegistry.test.ts
import { afterEach, describe, expect, it } from "vitest";
import {
  builtInSectionTypes,
  getSectionType,
  listSectionTypes,
  resetSectionTypesForTests,
  sectionTypeRevision,
  setActiveSectionTypes,
} from "./sectionTypes";
import { validateSection } from "../validation/validateSection";

afterEach(() => resetSectionTypesForTests());

const caseStudy = {
  type: "case_study",
  label: "Case study",
  category: "text" as const,
  fields: [{ key: "body", type: "paragraph" as const, label: "Body", required: true, maxChars: 1000 }],
  variants: [],
  schemaVersion: 1,
};

describe("active section-type registry", () => {
  it("starts with the built-ins", () => {
    expect(getSectionType("executive_summary")).toBeDefined();
    expect(getSectionType("case_study")).toBeUndefined();
  });

  it("adds authored types and bumps the revision", () => {
    const before = sectionTypeRevision();
    setActiveSectionTypes([caseStudy]);
    expect(sectionTypeRevision()).toBeGreaterThan(before);
    expect(getSectionType("case_study")?.label).toBe("Case study");
    expect(getSectionType("executive_summary")).toBeDefined(); // built-ins still present
  });

  it("authored type overrides a built-in by key", () => {
    setActiveSectionTypes([{ ...builtInSectionTypes[0], type: "text", label: "Custom text" }]);
    expect(getSectionType("text")?.label).toBe("Custom text");
  });

  it("listSectionTypes hides deprecated by default", () => {
    setActiveSectionTypes([{ ...caseStudy, deprecated: true }]);
    expect(listSectionTypes().some((t) => t.type === "case_study")).toBe(false);
    expect(listSectionTypes({ includeDeprecated: true }).some((t) => t.type === "case_study")).toBe(true);
  });

  it("validateSection picks up an authored type after hydration", () => {
    setActiveSectionTypes([caseStudy]);
    const ok = validateSection({ id: "s1", type: "case_study", data: { body: "hello" } });
    expect(ok.valid).toBe(true);
    const bad = validateSection({ id: "s2", type: "case_study", data: {} }); // missing required body
    expect(bad.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/registry/activeRegistry.test.ts`
Expected: FAIL — `setActiveSectionTypes`/`resetSectionTypesForTests` not exported.

- [ ] **Step 3: Add `deprecated` to the type**

In `packages/shared/src/types/section.ts`, inside `SectionTypeSchema`, add after `defaultVariant?: string;`:

```ts
  /** Hidden from authoring/add-section pickers but still rendered/validated (§11 Builder). */
  deprecated?: boolean;
```

- [ ] **Step 4: Rewrite the registry module**

Replace the bottom of `packages/shared/src/registry/sectionTypes.ts` (everything from `export const sectionTypes` onward) with:

```ts
/** The six code-owned, immutable built-ins. Authored types may override by key. */
export const builtInSectionTypes: SectionTypeSchema[] = sectionTypeList; // <-- see note

// The active registry is a single mutated Map so exported references stay stable.
const activeMap = new Map<string, SectionTypeSchema>();
let revision = 0;

function rebuild(authored: SectionTypeSchema[]): void {
  activeMap.clear();
  for (const t of builtInSectionTypes) activeMap.set(t.type, t);
  for (const t of authored) activeMap.set(t.type, t); // authored wins by key
  revision++;
}
rebuild([]); // initialise to built-ins

/** Replace the authored layer; built-ins are always present underneath. */
export function setActiveSectionTypes(authored: SectionTypeSchema[]): void {
  rebuild(authored);
}

/** Test seam: restore the registry to built-ins only. */
export function resetSectionTypesForTests(): void {
  rebuild([]);
}

/** Monotonic counter; bumps whenever the active set changes (used to recompile schemas). */
export function sectionTypeRevision(): number {
  return revision;
}

export function getSectionType(type: string): SectionTypeSchema | undefined {
  return activeMap.get(type);
}

/** All active types; hides deprecated unless asked. */
export function listSectionTypes(opts?: { includeDeprecated?: boolean }): SectionTypeSchema[] {
  const all = [...activeMap.values()];
  return opts?.includeDeprecated ? all : all.filter((t) => !t.deprecated);
}

/** All active types including deprecated (for schema derivation / rendering). */
export function activeSectionTypes(): SectionTypeSchema[] {
  return [...activeMap.values()];
}
```

Then rename the existing array literal: change `export const sectionTypes: SectionTypeSchema[] = [` (top of file) to `const sectionTypeList: SectionTypeSchema[] = [`. (The `builtInSectionTypes` line above references it.) Remove the old `sectionTypeMap`/`getSectionType` definitions at the bottom — they're replaced above.

- [ ] **Step 5: Fix `section.schema.ts` import**

In `packages/shared/src/schema/section.schema.ts`, change the import and the static export to use the built-ins:

```ts
import { builtInSectionTypes } from "../registry/sectionTypes";
// ...
export const sectionSchema = buildSectionSchema(builtInSectionTypes);
```

- [ ] **Step 6: Make `validateSection` registry-aware**

In `packages/shared/src/validation/validateSection.ts`, replace the top imports + the compiled-validator line:

```ts
import type { ErrorObject } from "ajv";
import type { Section, SectionTypeSchema } from "../types/section";
import { ajv } from "./ajv";
import { buildSectionSchema } from "../schema/section.schema";
import { activeSectionTypes, getSectionType, sectionTypeRevision } from "../registry/sectionTypes";
import type { ValidationError, ValidationResult } from "./result";

// Recompile the section validator only when the active registry changes.
let compiled: ReturnType<typeof ajv.compile> | null = null;
let compiledRevision = -1;
function sectionValidator() {
  if (!compiled || compiledRevision !== sectionTypeRevision()) {
    compiled = ajv.compile(buildSectionSchema(activeSectionTypes()));
    compiledRevision = sectionTypeRevision();
  }
  return compiled;
}
```

Then in the body of `validateSection`, replace `if (!validateAgainstSchema(section))` with `const validateAgainstSchema = sectionValidator();` on the line above, then `if (!validateAgainstSchema(section))` as before. (The rest of the function — `ajvErrorPath`, `appLayerErrors`, `getSectionType` usage — is unchanged.)

- [ ] **Step 7: Export new symbols**

In `packages/shared/src/index.ts`, replace the registry export block:

```ts
export {
  builtInSectionTypes,
  getSectionType,
  listSectionTypes,
  activeSectionTypes,
  setActiveSectionTypes,
  sectionTypeRevision,
  resetSectionTypesForTests,
} from "./registry/sectionTypes";
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run packages/shared/src/registry/activeRegistry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Run the full shared suite (catch consumers of the old API)**

Run: `npx vitest run packages/shared`
Expected: PASS. If a test imported `sectionTypes` or `sectionTypeMap`, update it to `builtInSectionTypes` / `listSectionTypes()`.

- [ ] **Step 10: Checkpoint** — `npm run typecheck`. Fix any consumer of the removed `sectionTypes`/`sectionTypeMap` exports (search `apps/web` too) to use `builtInSectionTypes` or `listSectionTypes()`.

---

## Task 3: Repo — section-type rows + in-use scan (interface + memory)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Test: `apps/web/src/__tests__/slice-11-repo.test.ts`

**Interfaces:**
- Produces (on `Repository`):
  - `listSectionTypeRows(): Promise<SectionTypeRow[]>`
  - `upsertSectionType(row: { type: string; definition: SectionTypeSchema | null; deprecated: boolean }): Promise<SectionTypeRow>`
  - `setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<SectionTypeRow | null>`
  - `listInUseTypeKeys(): Promise<string[]>`
  - `SectionTypeRow = { type: string; definition: SectionTypeSchema | null; deprecated: boolean; updatedAt: string }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-repo.test.ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import type { Repository } from "../server/repo/types";

let repo: Repository;
beforeEach(() => {
  repo = createMemoryRepo();
});

const def: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [],
  schemaVersion: 1,
};

describe("repo section-type rows", () => {
  it("upserts and lists authored types", async () => {
    await repo.upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const rows = await repo.listSectionTypeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.definition?.label).toBe("Case study");
  });

  it("toggles deprecation", async () => {
    await repo.upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const updated = await repo.setSectionTypeDeprecated("case_study", true);
    expect(updated?.deprecated).toBe(true);
    expect(await repo.setSectionTypeDeprecated("ghost", true)).toBeNull();
  });

  it("can deprecate a built-in via a definition-null overlay row", async () => {
    const row = await repo.upsertSectionType({ type: "text", definition: null, deprecated: true });
    expect(row.definition).toBeNull();
    expect(row.deprecated).toBe(true);
  });

  it("reports in-use type keys from stored proposals", async () => {
    await repo.createProposal("owner_a", sampleProposal);
    const keys = await repo.listInUseTypeKeys();
    expect(keys).toContain(sampleProposal.sections[0]!.type);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-repo.test.ts`
Expected: FAIL — `upsertSectionType` not a function.

- [ ] **Step 3: Extend the Repository interface**

In `apps/web/src/server/repo/types.ts`, add the type and methods. After `StoredUser`:

```ts
export interface SectionTypeRow {
  type: string;
  definition: import("@proposal/shared").SectionTypeSchema | null;
  deprecated: boolean;
  updatedAt: string;
}
```

Inside `interface Repository`, after the user methods:

```ts
  /** Builder (§11). Authored section-type rows; null definition = built-in overlay. */
  listSectionTypeRows(): Promise<SectionTypeRow[]>;
  upsertSectionType(row: { type: string; definition: SectionTypeRow["definition"]; deprecated: boolean }): Promise<SectionTypeRow>;
  setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<SectionTypeRow | null>;
  /** Distinct section-type keys referenced by any stored proposal (freeze check). */
  listInUseTypeKeys(): Promise<string[]>;
```

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`: add `SectionTypeRow` to the type import list, add a store map near the others:

```ts
  const sectionTypeRows = new Map<string, StoredUser extends never ? never : import("./types").SectionTypeRow>();
```

(Simpler: import `SectionTypeRow` in the import block and write `new Map<string, SectionTypeRow>()`.) Then before the closing `};` of the returned object, add:

```ts
    async listSectionTypeRows() {
      return [...sectionTypeRows.values()].map(clone);
    },

    async upsertSectionType({ type, definition, deprecated }) {
      const row = { type, definition: definition ? clone(definition) : null, deprecated, updatedAt: now() };
      sectionTypeRows.set(type, row);
      return clone(row);
    },

    async setSectionTypeDeprecated(type, deprecated) {
      const existing = sectionTypeRows.get(type);
      const row = existing
        ? { ...existing, deprecated, updatedAt: now() }
        : { type, definition: null, deprecated, updatedAt: now() };
      sectionTypeRows.set(type, row);
      return clone(existing || row.deprecated !== undefined ? row : row);
    },

    async listInUseTypeKeys() {
      const keys = new Set<string>();
      for (const p of proposals.values()) {
        for (const s of p.document.sections) keys.add(s.type);
      }
      return [...keys];
    },
```

Note: simplify `setSectionTypeDeprecated` to return null when the type is unknown AND not being created. Use this exact body instead:

```ts
    async setSectionTypeDeprecated(type, deprecated) {
      const existing = sectionTypeRows.get(type);
      if (!existing) {
        // allow deprecating a built-in (no row yet) by creating an overlay row;
        // un-deprecating an unknown type is a no-op → null.
        if (!deprecated) return null;
        const row = { type, definition: null, deprecated: true, updatedAt: now() };
        sectionTypeRows.set(type, row);
        return clone(row);
      }
      const row = { ...existing, deprecated, updatedAt: now() };
      sectionTypeRows.set(type, row);
      return clone(row);
    },
```

(The test calls `setSectionTypeDeprecated("ghost", true)` expecting `null` — adjust the test expectation OR keep this behavior. Per the design, deprecating an unknown built-in key should be allowed; deprecating a truly nonexistent key returns null. Make the test concrete: change the `"ghost"` assertion to expect `null` only when the key is neither a built-in nor a row. To keep it simple and unambiguous, **change the test** line to: `expect(await repo.setSectionTypeDeprecated("ghost", false)).toBeNull();`)

Apply that test change in Step 1's file now.

- [ ] **Step 5: Add `SectionTypeRow` to the memory import**

In `apps/web/src/server/repo/memory.ts`, add `SectionTypeRow` to the existing `import type { ... } from "./types";` list, and declare `const sectionTypeRows = new Map<string, SectionTypeRow>();`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Checkpoint** — `npm run typecheck`. (The Postgres repo will now fail to satisfy `Repository` — that's fixed in Task 5. If typecheck blocks, proceed to Task 5 before re-running.)

---

## Task 4: Repo — `users.isAdmin` (interface + memory + credentials)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Modify: `apps/web/src/server/auth/credentials.ts`
- Test: `apps/web/src/__tests__/slice-11-admin-auth.test.ts`

**Interfaces:**
- `StoredUser` gains `isAdmin: boolean`.
- `createUser(input: { email: string; passwordHash: string; isAdmin?: boolean })`.
- `authenticateUser(email, password): Promise<{ id: string; email: string; isAdmin: boolean } | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-admin-auth.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { hashPassword } from "../server/auth/password";
import { authenticateUser } from "../server/auth/credentials";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("admin flag through authentication", () => {
  it("defaults isAdmin to false and surfaces it on auth", async () => {
    await getRepo().createUser({ email: "u@x.test", passwordHash: hashPassword("pw") });
    const user = await authenticateUser("u@x.test", "pw");
    expect(user?.isAdmin).toBe(false);
  });

  it("carries isAdmin true when created as admin", async () => {
    await getRepo().createUser({ email: "a@x.test", passwordHash: hashPassword("pw"), isAdmin: true });
    expect((await authenticateUser("a@x.test", "pw"))?.isAdmin).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-auth.test.ts`
Expected: FAIL — `isAdmin` missing / not on returned user.

- [ ] **Step 3: Extend `StoredUser` + `createUser` signature**

In `apps/web/src/server/repo/types.ts`: add `isAdmin: boolean;` to `StoredUser`, and change the `createUser` signature:

```ts
  createUser(input: { email: string; passwordHash: string; isAdmin?: boolean }): Promise<StoredUser>;
```

- [ ] **Step 4: Implement in memory repo**

In `apps/web/src/server/repo/memory.ts`, change `createUser`:

```ts
    async createUser({ email, passwordHash, isAdmin = false }) {
      const normalized = email.trim().toLowerCase();
      const stored: StoredUser = { id: uid("user"), email: normalized, passwordHash, isAdmin, createdAt: now() };
      users.set(normalized, stored);
      return clone(stored);
    },
```

- [ ] **Step 5: Update `authenticateUser` to return isAdmin**

In `apps/web/src/server/auth/credentials.ts`, change `AuthUser` and the return:

```ts
export interface AuthUser {
  id: string;
  email: string;
  isAdmin: boolean;
}
```

```ts
  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Checkpoint** — `npm run typecheck` (Postgres repo still pending Task 5).

---

## Task 5: Postgres schema + repo + migration

**Files:**
- Modify: `apps/web/src/server/db/schema.ts`
- Modify: `apps/web/src/server/repo/postgres.ts`
- Generate: `apps/web/drizzle/0002_*.sql`

**Interfaces:** Implements the Task 3 + Task 4 methods against Drizzle. Not unit-tested (no DB in CI); verified by typecheck + build.

- [ ] **Step 1: Add the table + column to the schema**

In `apps/web/src/server/db/schema.ts`, add to the `users` table definition a column:

```ts
  isAdmin: boolean("is_admin").notNull().default(false),
```

and import `boolean`: change the drizzle import to `import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";`. Then add a new table:

```ts
/** Authored section types (§11 Builder). definition null = built-in deprecation overlay. */
export const sectionTypeRows = pgTable("section_types", {
  type: text("type").primaryKey(),
  definition: jsonb("definition").$type<import("@proposal/shared").SectionTypeSchema>(),
  deprecated: boolean("deprecated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Implement the methods in the Postgres repo**

In `apps/web/src/server/repo/postgres.ts`, import the table + a `sql` helper:

```ts
import { desc, eq, sql } from "drizzle-orm";
import { proposalVersions, proposals, sectionTypeRows, templates, themes, users } from "../db/schema";
import type { Repository, SectionTypeRow, StoredProposal } from "./types";
```

Update `createUser` to accept `isAdmin` and select it back; update `getUserByEmail` to return `isAdmin`:

```ts
    async getUserByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
      return row
        ? { id: row.id, email: row.email, passwordHash: row.passwordHash, isAdmin: row.isAdmin, createdAt: row.createdAt.toISOString() }
        : null;
    },

    async createUser({ email, passwordHash, isAdmin = false }) {
      const [row] = await db
        .insert(users)
        .values({ id: uid("user"), email: email.trim().toLowerCase(), passwordHash, isAdmin })
        .returning();
      return { id: row!.id, email: row!.email, passwordHash: row!.passwordHash, isAdmin: row!.isAdmin, createdAt: row!.createdAt.toISOString() };
    },
```

Add the section-type methods before the closing `};`:

```ts
    async listSectionTypeRows() {
      const rows = await db.select().from(sectionTypeRows);
      return rows.map<SectionTypeRow>((r) => ({
        type: r.type,
        definition: r.definition ?? null,
        deprecated: r.deprecated,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },

    async upsertSectionType({ type, definition, deprecated }) {
      const [row] = await db
        .insert(sectionTypeRows)
        .values({ type, definition: definition ?? null, deprecated })
        .onConflictDoUpdate({ target: sectionTypeRows.type, set: { definition: definition ?? null, deprecated, updatedAt: new Date() } })
        .returning();
      return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async setSectionTypeDeprecated(type, deprecated) {
      const [existing] = await db.select().from(sectionTypeRows).where(eq(sectionTypeRows.type, type));
      if (!existing) {
        if (!deprecated) return null;
        const [row] = await db.insert(sectionTypeRows).values({ type, definition: null, deprecated: true }).returning();
        return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
      }
      const [row] = await db
        .update(sectionTypeRows)
        .set({ deprecated, updatedAt: new Date() })
        .where(eq(sectionTypeRows.type, type))
        .returning();
      return { type: row!.type, definition: row!.definition ?? null, deprecated: row!.deprecated, updatedAt: row!.updatedAt.toISOString() };
    },

    async listInUseTypeKeys() {
      const rows = await db.execute<{ type: string }>(
        sql`SELECT DISTINCT s->>'type' AS type FROM proposals, jsonb_array_elements(document->'sections') AS s`,
      );
      return (rows.rows ?? rows as unknown as { type: string }[]).map((r) => r.type).filter(Boolean);
    },
```

(Note: `db.execute` with `@neondatabase/serverless` returns rows directly; the `rows.rows ?? ...` guard handles either shape. If typecheck complains, type the result as `any` locally and map `.map((r: { type: string }) => r.type)`.)

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `drizzle/0002_*.sql` creating `section_types` and adding `users.is_admin`. Open it and confirm both changes are present.

- [ ] **Step 4: Checkpoint** — `npm run typecheck` (exit 0) and `npx vitest run apps/web/src/__tests__/slice-11-repo.test.ts apps/web/src/__tests__/slice-11-admin-auth.test.ts` (PASS). The Postgres repo now satisfies `Repository`.

---

## Task 6: Server active-registry hydration

**Files:**
- Create: `apps/web/src/server/registry/activeRegistry.ts`
- Test: `apps/web/src/__tests__/slice-11-active-registry.test.ts`

**Interfaces:**
- Consumes: `getRepo()`, `setActiveSectionTypes`, `builtInSectionTypes`, `SectionTypeRow`.
- Produces:
  - `refreshActiveRegistry(): Promise<SectionTypeSchema[]>` — load rows, merge, push into shared, return the merged list.
  - `invalidateActiveRegistry(): void`
  - `getMergedSectionTypes(): Promise<SectionTypeSchema[]>` — cached read.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-active-registry.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSectionType, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getMergedSectionTypes, invalidateActiveRegistry, refreshActiveRegistry } from "../server/registry/activeRegistry";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  resetSectionTypesForTests();
});
afterEach(() => {
  setRepoForTests(null);
  resetSectionTypesForTests();
});

describe("server active-registry hydration", () => {
  it("merges authored rows (incl. deprecation overlay) into the shared registry", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    await getRepo().upsertSectionType({ type: "text", definition: null, deprecated: true }); // overlay
    await refreshActiveRegistry();
    expect(getSectionType("case_study")?.label).toBe("Case study");
    expect(getSectionType("text")?.deprecated).toBe(true); // built-in flagged deprecated
  });

  it("caches until invalidated", async () => {
    const first = await getMergedSectionTypes();
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    expect((await getMergedSectionTypes()).some((t) => t.type === "case_study")).toBe(false); // cached
    invalidateActiveRegistry();
    expect((await getMergedSectionTypes()).some((t) => t.type === "case_study")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-active-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hydrator**

```ts
// apps/web/src/server/registry/activeRegistry.ts
import { builtInSectionTypes, setActiveSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { getRepo } from "../repo";
import type { SectionTypeRow } from "../repo/types";

let cache: SectionTypeSchema[] | null = null;

/** Merge built-ins with DB rows: full definitions override by key; null rows overlay deprecation. */
function merge(rows: SectionTypeRow[]): SectionTypeSchema[] {
  const map = new Map<string, SectionTypeSchema>();
  for (const t of builtInSectionTypes) map.set(t.type, t);
  for (const row of rows) {
    const base = row.definition ?? map.get(row.type);
    if (!base) continue; // null overlay for an unknown key — ignore
    map.set(row.type, { ...base, deprecated: row.deprecated });
  }
  return [...map.values()];
}

/** Reload from the repo, push the authored layer into the shared registry, cache + return. */
export async function refreshActiveRegistry(): Promise<SectionTypeSchema[]> {
  const rows = await getRepo().listSectionTypeRows();
  const merged = merge(rows);
  // built-ins are implicit in shared; pass only the non-built-in/overridden set
  setActiveSectionTypes(merged.filter((t) => !isPlainBuiltIn(t)));
  cache = merged;
  return merged;
}

function isPlainBuiltIn(t: SectionTypeSchema): boolean {
  const b = builtInSectionTypes.find((x) => x.type === t.type);
  return !!b && b === t; // unchanged built-in reference
}

export function invalidateActiveRegistry(): void {
  cache = null;
}

/** Cached merged list; hydrates on first call or after invalidation. */
export async function getMergedSectionTypes(): Promise<SectionTypeSchema[]> {
  if (cache) return cache;
  return refreshActiveRegistry();
}
```

(Note: `setActiveSectionTypes` already re-adds built-ins underneath, so passing the full merged set is also fine; the filter just avoids redundant entries. If the `isPlainBuiltIn` reference check proves brittle, simplify `refreshActiveRegistry` to `setActiveSectionTypes(merged)` — built-ins-win-by-key semantics make duplicates harmless.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-active-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint** — `npm run typecheck`.

---

## Task 7: Admin session seam + `requireAdmin`

**Files:**
- Create: `apps/web/src/server/auth/sessionUser.ts`
- Modify: `apps/web/src/server/auth/owner.ts`
- Modify: `apps/web/src/server/auth/guard.ts`
- Test: `apps/web/src/__tests__/slice-11-admin-guard.test.ts`

**Interfaces:**
- `SessionUser = { id: string; isAdmin: boolean }`
- `getSessionUser(): Promise<SessionUser | null>`; `setSessionUserResolverForTests(fn | null)`
- `getOwner()` keeps its signature (now derived from `getSessionUser`).
- `requireAdmin(): Promise<string | Response>` — 401 unauth, 403 non-admin, else owner id.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-admin-guard.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { requireAdmin } from "../server/auth/guard";
import { getOwner } from "../server/auth/owner";

afterEach(() => setSessionUserResolverForTests(null));

describe("requireAdmin", () => {
  it("401s when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => null);
    const r = await requireAdmin();
    expect(r instanceof Response && r.status).toBe(401);
  });

  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    const r = await requireAdmin();
    expect(r instanceof Response && r.status).toBe(403);
  });

  it("returns the owner id for an admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
    expect(await requireAdmin()).toBe("u1");
  });

  it("getOwner still returns the id via the same seam", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u9", isAdmin: false }));
    expect(await getOwner()).toBe("u9");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-guard.test.ts`
Expected: FAIL — `sessionUser` module / `requireAdmin` missing.

- [ ] **Step 3: Create the session-user seam**

```ts
// apps/web/src/server/auth/sessionUser.ts
export interface SessionUser {
  id: string;
  isAdmin: boolean;
}
export type SessionUserResolver = () => Promise<SessionUser | null>;

async function fromNextAuth(): Promise<SessionUser | null> {
  const { auth } = await import("../../../auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, isAdmin: session.user.isAdmin === true };
}

let resolver: SessionUserResolver = fromNextAuth;

export function setSessionUserResolverForTests(next: SessionUserResolver | null): void {
  resolver = next ?? fromNextAuth;
}

export function getSessionUser(): Promise<SessionUser | null> {
  return resolver();
}
```

- [ ] **Step 4: Re-base `owner.ts` on the seam**

Replace the body of `apps/web/src/server/auth/owner.ts` with:

```ts
import { getSessionUser, setSessionUserResolverForTests } from "./sessionUser";

/** The signed-in owner id, or null. Scopes every repo query. Derived from the session-user seam. */
export async function getOwner(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

/** Back-compat test seam: set the owner by wrapping the session-user resolver. */
export function setOwnerResolverForTests(next: (() => Promise<string | null>) | null): void {
  if (!next) {
    setSessionUserResolverForTests(null);
    return;
  }
  setSessionUserResolverForTests(async () => {
    const id = await next();
    return id ? { id, isAdmin: false } : null;
  });
}
```

(This keeps every existing test that calls `setOwnerResolverForTests` working unchanged.)

- [ ] **Step 5: Add `requireAdmin` to the guard**

In `apps/web/src/server/auth/guard.ts`, add the import and function:

```ts
import { getSessionUser } from "./sessionUser";
```

```ts
/** Resolve the signed-in ADMIN's owner id, or a Response: 401 unauth, 403 non-admin. */
export async function requireAdmin(): Promise<string | Response> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return user.id;
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the existing auth-routes tests (regression — they use `setOwnerResolverForTests`)**

Run: `npx vitest run apps/web/src/__tests__/slice-10-auth-routes.test.ts`
Expected: PASS.

- [ ] **Step 8: Checkpoint** — `npm run typecheck`.

---

## Task 8: Carry `isAdmin` through Auth.js + gate `/admin`

**Files:**
- Modify: `apps/web/auth.ts`
- Modify: `apps/web/auth.config.ts`
- Modify: `apps/web/types/next-auth.d.ts`

**Interfaces:** `session.user.isAdmin: boolean`; middleware redirects non-admins away from `/admin`. Verified by typecheck + build (no unit test — exercises NextAuth internals).

- [ ] **Step 1: Augment the session types**

In `apps/web/types/next-auth.d.ts`, add `isAdmin` to both `Session.user` and `JWT`:

```ts
declare module "next-auth" {
  interface Session {
    user: { id: string; isAdmin: boolean } & DefaultSession["user"];
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    isAdmin: boolean;
  }
}
```

- [ ] **Step 2: Set `isAdmin` on the user in `authorize`**

In `apps/web/auth.ts`, the `authorize` callback already returns `authenticateUser(...)`'s shape; extend the returned object:

```ts
      authorize: async (credentials) => {
        const user = await authenticateUser(credentials?.email, credentials?.password);
        return user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null;
      },
```

- [ ] **Step 3: Carry it through the callbacks**

In `apps/web/auth.config.ts`, update the `jwt` and `session` callbacks:

```ts
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user && "isAdmin" in user) token.isAdmin = (user as { isAdmin?: boolean }).isAdmin === true;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") session.user.id = token.id;
      if (session.user) session.user.isAdmin = token.isAdmin === true;
      return session;
    },
```

- [ ] **Step 4: Gate `/admin` in the `authorized` callback**

In `apps/web/auth.config.ts`, replace the `authorized` callback body with:

```ts
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p))) {
        return true;
      }
      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        return auth?.user?.isAdmin === true;
      }
      return !!auth?.user;
    },
```

- [ ] **Step 5: Checkpoint** — `npm run typecheck` (exit 0). `npm run build -w @proposal/web` (compiles; `/admin` not yet created — that's Task 14+, build still passes).

---

## Task 9: `GET /api/section-types`

**Files:**
- Create: `apps/web/app/api/section-types/route.ts`
- Test: `apps/web/src/__tests__/slice-11-section-types-get.test.ts`

**Interfaces:**
- Consumes: `requireOwner`, `getMergedSectionTypes`.
- Produces: `GET` returns `{ sectionTypes: SectionTypeSchema[] }` (includes deprecated; client filters where needed). 401 if unauthenticated.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-section-types-get.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { GET } from "../../app/api/section-types/route";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
  invalidateActiveRegistry();
});

describe("GET /api/section-types", () => {
  it("401s when unauthenticated", async () => {
    setOwnerResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });

  it("returns built-ins plus authored types", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    invalidateActiveRegistry();
    const body = (await (await GET()).json()) as { sectionTypes: SectionTypeSchema[] };
    const keys = body.sectionTypes.map((t) => t.type);
    expect(keys).toContain("executive_summary");
    expect(keys).toContain("case_study");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-get.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/section-types/route.ts
import { NextResponse } from "next/server";
import { validateSectionTypeDefinition, type SectionTypeSchema } from "@proposal/shared";
import { requireOwner, requireAdmin } from "../../../src/server/auth/guard";
import { getRepo } from "../../../src/server/repo";
import { getMergedSectionTypes, invalidateActiveRegistry } from "../../../src/server/registry/activeRegistry";

/** GET — list the merged active registry (any authed user). */
export async function GET(): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  return NextResponse.json({ sectionTypes: await getMergedSectionTypes() });
}

/** POST — create or duplicate an authored type (admin). See Task 10 for the body. */
export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;

  const def = (await request.json().catch(() => null)) as SectionTypeSchema | null;
  const result = validateSectionTypeDefinition(def);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid section type", errors: result.errors }, { status: 400 });
  }
  const type = (def as SectionTypeSchema).type;

  const existing = await getRepo().listSectionTypeRows();
  if (existing.some((r) => r.type === type) || (await getMergedSectionTypes()).some((t) => t.type === type)) {
    return NextResponse.json({ error: `A section type "${type}" already exists` }, { status: 409 });
  }

  const row = await getRepo().upsertSectionType({ type, definition: def as SectionTypeSchema, deprecated: false });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row.definition }, { status: 201 });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-get.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint** — `npm run typecheck`.

---

## Task 10: `POST /api/section-types` (create / duplicate)

**Files:**
- Modify: (POST already added in Task 9's route file)
- Test: `apps/web/src/__tests__/slice-11-section-types-post.test.ts`

**Interfaces:** POST consumes `requireAdmin`, `validateSectionTypeDefinition`, `getRepo().upsertSectionType`, `invalidateActiveRegistry`. Returns 201 `{ sectionType }`, 400 invalid, 403 non-admin, 409 duplicate key.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-section-types-post.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { POST } from "../../app/api/section-types/route";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true, maxWords: 200 }],
  variants: [], schemaVersion: 1,
};
const post = (body: unknown) =>
  new Request("http://x/api/section-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let admin = true;
beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  admin = true;
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: admin }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("POST /api/section-types", () => {
  it("403s a non-admin", async () => {
    admin = false;
    expect((await POST(post(def))).status).toBe(403);
  });

  it("creates a valid type", async () => {
    const res = await POST(post(def));
    expect(res.status).toBe(201);
    expect((await getRepo().listSectionTypeRows()).map((r) => r.type)).toContain("case_study");
  });

  it("400s an invalid definition", async () => {
    expect((await POST(post({ ...def, fields: [] }))).status).toBe(400);
  });

  it("409s a duplicate key (built-in or existing authored)", async () => {
    expect((await POST(post({ ...def, type: "executive_summary" }))).status).toBe(409);
    await POST(post(def));
    expect((await POST(post(def))).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails / passes**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-post.test.ts`
Expected: PASS (POST was implemented in Task 9). If the 409-for-built-in case fails, ensure `getMergedSectionTypes()` is consulted in the duplicate check (it is in the Task 9 code).

- [ ] **Step 3: Checkpoint** — `npm run typecheck`.

---

## Task 11: `PUT /api/section-types/[type]` (edit; freeze when in-use/built-in)

**Files:**
- Create: `apps/web/app/api/section-types/[type]/route.ts`
- Test: `apps/web/src/__tests__/slice-11-section-types-put.test.ts`

**Interfaces:** PUT consumes `requireAdmin`, `validateSectionTypeDefinition`, `getRepo().{listSectionTypeRows,listInUseTypeKeys,upsertSectionType}`, `builtInSectionTypes`, `invalidateActiveRegistry`. Returns 200 `{ sectionType }`; 400 invalid; 403 non-admin; 404 unknown authored type; **409 if built-in or in-use**.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-section-types-put.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal, type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { PUT } from "../../app/api/section-types/[type]/route";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};
const ctx = (type: string) => ({ params: Promise.resolve({ type }) });
const put = (body: unknown) =>
  new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("PUT /api/section-types/[type]", () => {
  it("edits a not-in-use authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const res = await PUT(put({ ...def, label: "Renamed" }), ctx("case_study"));
    expect(res.status).toBe(200);
    expect((await getRepo().listSectionTypeRows())[0]!.definition?.label).toBe("Renamed");
  });

  it("409s editing a built-in", async () => {
    const res = await PUT(put({ ...def, type: "text", label: "X" }), ctx("text"));
    expect(res.status).toBe(409);
  });

  it("409s editing an in-use authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    await getRepo().createProposal("owner_a", {
      ...sampleProposal,
      sections: [{ id: "s1", type: "case_study", data: { body: "x" } }],
    });
    const res = await PUT(put({ ...def, label: "Nope" }), ctx("case_study"));
    expect(res.status).toBe(409);
  });

  it("404s an unknown authored type", async () => {
    expect((await PUT(put(def), ctx("ghost"))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-put.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/section-types/[type]/route.ts
import { NextResponse } from "next/server";
import { builtInSectionTypes, validateSectionTypeDefinition, type SectionTypeSchema } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { invalidateActiveRegistry } from "../../../../src/server/registry/activeRegistry";

type Ctx = { params: Promise<{ type: string }> };

/** PUT — edit an authored type. Built-ins and in-use types are frozen (409). */
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type } = await params;

  if (builtInSectionTypes.some((t) => t.type === type)) {
    return NextResponse.json({ error: "Built-in types are immutable — duplicate it instead" }, { status: 409 });
  }

  const rows = await getRepo().listSectionTypeRows();
  const existing = rows.find((r) => r.type === type && r.definition);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getRepo().listInUseTypeKeys()).includes(type)) {
    return NextResponse.json({ error: "Type is in use — duplicate it to change it" }, { status: 409 });
  }

  const def = (await request.json().catch(() => null)) as SectionTypeSchema | null;
  const result = validateSectionTypeDefinition(def);
  if (!result.valid) {
    return NextResponse.json({ error: "Invalid section type", errors: result.errors }, { status: 400 });
  }
  // Key is immutable on edit: keep the path's type.
  const row = await getRepo().upsertSectionType({ type, definition: { ...(def as SectionTypeSchema), type }, deprecated: existing.deprecated });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row.definition });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-put.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint** — `npm run typecheck`.

---

## Task 12: `POST /api/section-types/[type]/deprecate`

**Files:**
- Create: `apps/web/app/api/section-types/[type]/deprecate/route.ts`
- Test: `apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts`

**Interfaces:** POST consumes `requireAdmin`, `getRepo().setSectionTypeDeprecated`, `invalidateActiveRegistry`. Body `{ deprecated: boolean }`. Returns 200 `{ sectionType }`; 403 non-admin; 404 when un-deprecating an unknown key.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SectionTypeSchema } from "@proposal/shared";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { invalidateActiveRegistry } from "../server/registry/activeRegistry";
import { POST } from "../../app/api/section-types/[type]/deprecate/route";

const def: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};
const ctx = (type: string) => ({ params: Promise.resolve({ type }) });
const post = (deprecated: boolean) =>
  new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deprecated }) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  invalidateActiveRegistry();
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
  invalidateActiveRegistry();
});

describe("POST /api/section-types/[type]/deprecate", () => {
  it("403s a non-admin", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await POST(post(true), ctx("case_study"))).status).toBe(403);
  });

  it("deprecates an authored type", async () => {
    await getRepo().upsertSectionType({ type: "case_study", definition: def, deprecated: false });
    const res = await POST(post(true), ctx("case_study"));
    expect(res.status).toBe(200);
    expect((await getRepo().listSectionTypeRows())[0]!.deprecated).toBe(true);
  });

  it("deprecates a built-in via overlay row", async () => {
    const res = await POST(post(true), ctx("text"));
    expect(res.status).toBe(200);
  });

  it("404s un-deprecating an unknown key", async () => {
    expect((await POST(post(false), ctx("ghost"))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
// apps/web/app/api/section-types/[type]/deprecate/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/server/auth/guard";
import { getRepo } from "../../../../../src/server/repo";
import { invalidateActiveRegistry } from "../../../../../src/server/registry/activeRegistry";

type Ctx = { params: Promise<{ type: string }> };

/** POST — deprecate (hide from pickers) or restore a section type. Body { deprecated }. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const { type } = await params;

  const body = (await request.json().catch(() => null)) as { deprecated?: unknown } | null;
  const deprecated = body?.deprecated === true;

  const row = await getRepo().setSectionTypeDeprecated(type, deprecated);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  invalidateActiveRegistry();
  return NextResponse.json({ sectionType: row });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-section-types-deprecate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint** — `npm run typecheck`.

---

## Task 13: Bootstrap — `create-user.mjs --admin`

**Files:**
- Modify: `apps/web/scripts/create-user.mjs`

**Interfaces:** CLI flag `--admin` sets `is_admin = true` on insert. Manual verification (no unit test for a script).

- [ ] **Step 1: Parse the flag and include it in the insert**

Replace the argv parsing + insert in `apps/web/scripts/create-user.mjs`:

```js
const args = process.argv.slice(2);
const isAdmin = args.includes("--admin");
const [email, password] = args.filter((a) => a !== "--admin");
if (!email || !password) {
  console.error("Usage: npm run user:create -w @proposal/web -- [--admin] <email> <password>");
  process.exit(1);
}
```

And the insert:

```js
  await sql`INSERT INTO users (id, email, password_hash, is_admin) VALUES (${id}, ${normalized}, ${hashPassword(password)}, ${isAdmin})`;
  console.log(`✓ Created ${isAdmin ? "admin " : ""}account ${normalized} (${id})`);
```

- [ ] **Step 2: Verify the script parses (no DB needed to fail-fast)**

Run: `node apps/web/scripts/create-user.mjs --admin`
Expected: prints the usage error (missing email/password) and exits 1 — confirms the flag parsing path runs without throwing.

- [ ] **Step 3: Checkpoint** — `npm run typecheck` (script is `.mjs`, not typechecked; this just confirms nothing else broke).

---

## Task 14: Store — `addSection` + section-type hydration

**Files:**
- Modify: `apps/web/src/state/mutations.ts`
- Modify: `apps/web/src/state/proposalStore.ts`
- Create: `apps/web/src/client/sectionTypes.ts`
- Test: `apps/web/src/__tests__/slice-11-store.test.ts`

**Interfaces:**
- `appendSection(document: ProposalDocument, type: string): ProposalDocument` (pure; appends a section with a fresh id + `emptyDataForType`).
- Store: `addSection(type: string): void`; `sectionTypes: SectionTypeSchema[]`; `loadSectionTypes(): Promise<void>`.
- `fetchSectionTypes(): Promise<SectionTypeSchema[]>` in `client/sectionTypes.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-11-store.test.ts
import { describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { appendSection } from "../state/mutations";

describe("appendSection", () => {
  it("appends a section of the given type with a fresh id and empty data", () => {
    const before = sampleProposal.sections.length;
    const next = appendSection(sampleProposal, "text");
    expect(next.sections).toHaveLength(before + 1);
    const added = next.sections[next.sections.length - 1]!;
    expect(added.type).toBe("text");
    expect(added.id).toBeTruthy();
    expect(typeof added.data).toBe("object");
    // original document not mutated
    expect(sampleProposal.sections).toHaveLength(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-store.test.ts`
Expected: FAIL — `appendSection` not exported.

- [ ] **Step 3: Implement `appendSection`**

In `apps/web/src/state/mutations.ts`, add (importing helpers as needed at top: `import { emptyDataForType, getSectionType, type ProposalDocument } from "@proposal/shared";`):

```ts
/** Append a new section of `type` with default data. Pure; returns a new document. */
export function appendSection(document: ProposalDocument, type: string): ProposalDocument {
  const schema = getSectionType(type);
  const id = `sec_${crypto.randomUUID().slice(0, 8)}`;
  const section = {
    id,
    type,
    ...(schema?.defaultVariant ? { variant: schema.defaultVariant } : {}),
    data: emptyDataForType(type),
  };
  return { ...document, sections: [...document.sections, section] };
}
```

(If `mutations.ts` already imports some of these symbols, merge rather than duplicate the import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-11-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the client fetch helper**

```ts
// apps/web/src/client/sectionTypes.ts
import type { SectionTypeSchema } from "@proposal/shared";

export async function fetchSectionTypes(): Promise<SectionTypeSchema[]> {
  const res = await fetch("/api/section-types");
  if (!res.ok) throw new Error(`Failed to load section types (${res.status})`);
  const body = (await res.json()) as { sectionTypes: SectionTypeSchema[] };
  return body.sectionTypes;
}

export async function createSectionType(def: SectionTypeSchema): Promise<void> {
  const res = await fetch("/api/section-types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Create failed");
}

export async function updateSectionType(type: string, def: SectionTypeSchema): Promise<void> {
  const res = await fetch(`/api/section-types/${type}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Update failed");
}

export async function setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<void> {
  const res = await fetch(`/api/section-types/${type}/deprecate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deprecated }),
  });
  if (!res.ok) throw new Error("Update failed");
}
```

- [ ] **Step 6: Add store state + actions**

In `apps/web/src/state/proposalStore.ts`: import `appendSection`, `setActiveSectionTypes`, `type SectionTypeSchema`, and `fetchSectionTypes`. Add to `ProposalState`:

```ts
  sectionTypes: SectionTypeSchema[];
  loadSectionTypes: () => Promise<void>;
  addSection: (type: string) => void;
```

In the store body (initial state + actions):

```ts
  sectionTypes: [],
  loadSectionTypes: async () => {
    try {
      const types = await fetchSectionTypes();
      setActiveSectionTypes(types); // hydrate the shared registry used by renderer/inspector
      set({ sectionTypes: types });
    } catch {
      get().notify("error", "Couldn't load section types.");
    }
  },
  addSection: (type) => set((state) => ({ document: appendSection(state.document, type) })),
```

- [ ] **Step 7: Run tests + checkpoint**

Run: `npx vitest run apps/web/src/__tests__/slice-11-store.test.ts`
Expected: PASS. Then `npm run typecheck`.

---

## Task 15: Outline — "+ Add section"

**Files:**
- Modify: `apps/web/src/ui/Outline.tsx`
- Test: `apps/web/src/__tests__/slice-11-add-section.test.tsx`

**Interfaces:** Consumes store `addSection`, `sectionTypes` (or `listSectionTypes()`), `isStructureLocked`. Renders an "Add section" control only when structure is unlocked.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/slice-11-add-section.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Outline } from "../ui/Outline";

afterEach(cleanup);

describe("Outline — add section", () => {
  it("appends a section of the picked type when structure is unlocked", () => {
    useProposalStore.setState({ document: { ...sampleProposal, templateId: "tmpl_open" }, selectedId: null });
    const before = useProposalStore.getState().document.sections.length;

    render(<Outline />);
    const picker = screen.getByLabelText(/add section/i);
    fireEvent.change(picker, { target: { value: "text" } });

    expect(useProposalStore.getState().document.sections).toHaveLength(before + 1);
    expect(useProposalStore.getState().document.sections.at(-1)!.type).toBe("text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-add-section.test.tsx`
Expected: FAIL — no element labelled "Add section".

- [ ] **Step 3: Add the control to the Outline**

In `apps/web/src/ui/Outline.tsx`: pull `addSection` and `listSectionTypes` (import `listSectionTypes` from `@proposal/shared`). Add `const addSection = useProposalStore((s) => s.addSection);`. After the `<div className="outline">…</div>` block and before closing `</nav>`, add:

```tsx
        {!locked ? (
          <div className="outline__add">
            <label className="field__label" htmlFor="add-section">
              Add section
            </label>
            <select
              id="add-section"
              aria-label="Add section"
              value=""
              onChange={(e) => {
                if (e.target.value) addSection(e.target.value);
              }}
            >
              <option value="">+ Add section…</option>
              {listSectionTypes().map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
```

- [ ] **Step 4: Run tests + checkpoint**

Run: `npx vitest run apps/web/src/__tests__/slice-11-add-section.test.tsx`
Expected: PASS. Then `npm run typecheck`.

---

## Task 16: `/admin` dashboard shell (gated)

**Files:**
- Create: `apps/web/app/admin/page.tsx`
- Create: `apps/web/src/ui/admin/AdminDashboard.tsx`
- Test: `apps/web/src/__tests__/slice-11-admin-shell.test.tsx`

**Interfaces:**
- `app/admin/page.tsx` — server component: `runtime = "nodejs"`; reads `auth()`, redirects non-admins to `/`; calls `getMergedSectionTypes()` + `listInUseTypeKeys()` and renders `<AdminDashboard>` with that data.
- `AdminDashboard({ sectionTypes, inUse }: { sectionTypes: SectionTypeSchema[]; inUse: string[] })` — client; nav + hosts `SectionTypeList`.

- [ ] **Step 1: Write the failing test (the client shell)**

```tsx
// apps/web/src/__tests__/slice-11-admin-shell.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { builtInSectionTypes } from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

afterEach(cleanup);

describe("AdminDashboard shell", () => {
  it("renders nav and the section-types area", () => {
    render(<AdminDashboard sectionTypes={builtInSectionTypes} inUse={[]} />);
    expect(screen.getByRole("heading", { name: /builder/i })).toBeInTheDocument();
    expect(screen.getByText(/section types/i)).toBeInTheDocument();
    // built-ins are listed
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the client shell**

```tsx
// apps/web/src/ui/admin/AdminDashboard.tsx
"use client";

import { useState } from "react";
import type { SectionTypeSchema } from "@proposal/shared";
import { SectionTypeList } from "./SectionTypeList";

/** Back-of-house dashboard shell (§11). Section types now; Users/Templates are next slices. */
export function AdminDashboard({ sectionTypes, inUse }: { sectionTypes: SectionTypeSchema[]; inUse: string[] }) {
  const [types, setTypes] = useState(sectionTypes);

  return (
    <div className="admin">
      <header className="admin__bar">
        <h1 className="admin__title">Builder</h1>
        <a className="btn btn--ghost" href="/">
          ← Back to editor
        </a>
      </header>
      <div className="admin__body">
        <nav className="admin__nav" aria-label="Builder sections">
          <button type="button" className="admin__navitem" aria-current="true">
            Section types
          </button>
          <button type="button" className="admin__navitem" disabled title="Coming next">
            Users
          </button>
          <button type="button" className="admin__navitem" disabled title="Coming next">
            Templates
          </button>
        </nav>
        <main className="admin__main">
          <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the gated server page**

```tsx
// apps/web/app/admin/page.tsx
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getMergedSectionTypes } from "../../src/server/registry/activeRegistry";
import { getRepo } from "../../src/server/repo";
import { AdminDashboard } from "../../src/ui/admin/AdminDashboard";

export const runtime = "nodejs";

/** Admin-only Builder dashboard. Middleware also gates /admin; this is defence in depth. */
export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/");

  const [sectionTypes, inUse] = await Promise.all([
    getMergedSectionTypes(),
    getRepo().listInUseTypeKeys(),
  ]);
  return <AdminDashboard sectionTypes={sectionTypes} inUse={inUse} />;
}
```

- [ ] **Step 5: Run tests + checkpoint**

Run: `npx vitest run apps/web/src/__tests__/slice-11-admin-shell.test.tsx`
Expected: PASS (this exercises the client shell; `SectionTypeList` is created in Task 17 — until then this import fails, so do Task 17 next and re-run). To keep this task self-contained, add a minimal placeholder `SectionTypeList` now if needed, then flesh it out in Task 17.

To avoid the cross-task dependency, create a minimal `SectionTypeList` stub here:

```tsx
// apps/web/src/ui/admin/SectionTypeList.tsx (stub; fully implemented in Task 17)
"use client";
import type { SectionTypeSchema } from "@proposal/shared";
export function SectionTypeList({ types }: { types: SectionTypeSchema[]; inUse: string[]; onChange: (t: SectionTypeSchema[]) => void }) {
  return (
    <div>
      <h2>Section types</h2>
      <ul>{types.map((t) => <li key={t.type}>{t.label}</li>)}</ul>
    </div>
  );
}
```

Then: `npx vitest run apps/web/src/__tests__/slice-11-admin-shell.test.tsx` → PASS. `npm run typecheck`.

---

## Task 17: Section-type list + badges + deprecate/duplicate actions

**Files:**
- Modify: `apps/web/src/ui/admin/SectionTypeList.tsx`
- Test: `apps/web/src/__tests__/slice-11-sectiontype-list.test.tsx`

**Interfaces:** Consumes `builtInSectionTypes`, the `client/sectionTypes` helpers, and `SectionTypeEditor` (Task 18). Renders rows with badges (built-in/authored, in-use, deprecated, unstyled) and actions: New, Duplicate, Edit (disabled for built-in/in-use), Deprecate/Restore.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/slice-11-sectiontype-list.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { SectionTypeList } from "../ui/admin/SectionTypeList";

afterEach(cleanup);

const authored: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};

describe("SectionTypeList", () => {
  it("badges built-in vs authored and disables Edit for built-ins and in-use", () => {
    render(<SectionTypeList types={[...builtInSectionTypes, authored]} inUse={["case_study"]} onChange={vi.fn()} />);

    const builtinRow = screen.getByText("Executive summary").closest("[data-type]") as HTMLElement;
    expect(within(builtinRow).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(builtinRow).getByRole("button", { name: /edit/i })).toBeDisabled();

    const authoredRow = screen.getByText("Case study").closest("[data-type]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in-use → frozen
    expect(within(authoredRow).getByText(/unstyled/i)).toBeInTheDocument(); // no registered component
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-list.test.tsx`
Expected: FAIL — stub has no badges/buttons.

- [ ] **Step 3: Implement the list**

```tsx
// apps/web/src/ui/admin/SectionTypeList.tsx
"use client";

import { useState } from "react";
import { builtInSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { resolveSection } from "../../registry/componentRegistry";
import { setSectionTypeDeprecated } from "../../client/sectionTypes";
import { useProposalStore } from "../../state/proposalStore";
import { SectionTypeEditor } from "./SectionTypeEditor";

function isBuiltIn(type: string): boolean {
  return builtInSectionTypes.some((t) => t.type === type);
}
function hasComponent(type: string): boolean {
  // a type renders styled only if a non-fallback component resolves for some variant
  return !resolveSection({ id: "_probe", type, data: {} }).unstyled;
}

export function SectionTypeList({
  types,
  inUse,
  onChange,
}: {
  types: SectionTypeSchema[];
  inUse: string[];
  onChange: (t: SectionTypeSchema[]) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [editing, setEditing] = useState<SectionTypeSchema | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/section-types");
    if (res.ok) onChange(((await res.json()) as { sectionTypes: SectionTypeSchema[] }).sectionTypes);
  };

  const onDeprecate = async (type: string, deprecated: boolean) => {
    try {
      await setSectionTypeDeprecated(type, deprecated);
      await refresh();
    } catch {
      notify("error", "Couldn't update the type.");
    }
  };

  if (creating || editing) {
    return (
      <SectionTypeEditor
        initial={editing ?? undefined}
        onDone={async () => {
          setCreating(false);
          setEditing(null);
          await refresh();
        }}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="stlist">
      <div className="stlist__head">
        <h2>Section types</h2>
        <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
          New type
        </button>
      </div>
      <ul className="stlist__rows">
        {types.map((t) => {
          const builtin = isBuiltIn(t.type);
          const used = inUse.includes(t.type);
          const unstyled = !hasComponent(t.type);
          return (
            <li key={t.type} data-type={t.type} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{t.label}</span>
                <code className="stlist__key">{t.type}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{builtin ? "built-in" : "authored"}</span>
                {used ? <span className="tag">in use</span> : null}
                {t.deprecated ? <span className="tag tag--unstyled">deprecated</span> : null}
                {unstyled ? <span className="tag tag--unstyled">unstyled</span> : null}
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditing({ ...t, type: `${t.type}_copy` })}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={builtin || used}
                  title={builtin ? "Built-ins are immutable — duplicate" : used ? "In use — duplicate to change" : undefined}
                  onClick={() => setEditing(t)}
                >
                  Edit
                </button>
                <button type="button" className="btn" onClick={() => void onDeprecate(t.type, !t.deprecated)}>
                  {t.deprecated ? "Restore" : "Deprecate"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + checkpoint**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-list.test.tsx`
Expected: PASS (the `SectionTypeEditor` import resolves once Task 18 is done; create its file next if the import fails). Then `npm run typecheck`.

---

## Task 18: Section-type editor form (create/edit + live meta-validation)

**Files:**
- Create: `apps/web/src/ui/admin/SectionTypeEditor.tsx`
- Test: `apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx`

**Interfaces:**
- `SectionTypeEditor({ initial?, onDone, onCancel })` — builds a `SectionTypeSchema`, runs `validateSectionTypeDefinition` live (disables Save while invalid), calls `createSectionType` (no `initial`) or `updateSectionType` (with `initial`), then `onDone()`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionTypeEditor } from "../ui/admin/SectionTypeEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SectionTypeEditor", () => {
  it("disables Save until the definition is valid, then POSTs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();

    render(<SectionTypeEditor onDone={onDone} onCancel={vi.fn()} />);

    // empty key/label/fields → Save disabled
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type key/i), { target: { value: "case_study" } });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Case study" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field key/i), { target: { value: "body" } });
    fireEvent.change(screen.getByLabelText(/field label/i), { target: { value: "Body" } });

    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-types", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the editor**

```tsx
// apps/web/src/ui/admin/SectionTypeEditor.tsx
"use client";

import { useMemo, useState } from "react";
import { validateSectionTypeDefinition, type FieldSchema, type SectionTypeSchema } from "@proposal/shared";
import { createSectionType, updateSectionType } from "../../client/sectionTypes";
import { useProposalStore } from "../../state/proposalStore";

type DraftField = { key: string; label: string; type: "text" | "paragraph"; required: boolean; limit: string };

function toDef(typeKey: string, label: string, fields: DraftField[]): SectionTypeSchema {
  return {
    type: typeKey.trim(),
    label: label.trim(),
    category: "text",
    schemaVersion: 1,
    variants: [],
    fields: fields.map<FieldSchema>((f) => ({
      key: f.key.trim(),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      ...(f.limit.trim() !== "" && f.type === "text" ? { maxChars: Number(f.limit) } : {}),
      ...(f.limit.trim() !== "" && f.type === "paragraph" ? { maxWords: Number(f.limit) } : {}),
    })),
  };
}

export function SectionTypeEditor({
  initial,
  onDone,
  onCancel,
}: {
  initial?: SectionTypeSchema;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const editing = !!initial && !initial.type.endsWith("_copy"); // a true edit, not a duplicate
  const [typeKey, setTypeKey] = useState(initial?.type ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [fields, setFields] = useState<DraftField[]>(
    (initial?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label ?? "",
      type: f.type === "paragraph" ? "paragraph" : "text",
      required: !!f.required,
      limit: String(f.maxChars ?? f.maxWords ?? ""),
    })),
  );
  const [busy, setBusy] = useState(false);

  const def = useMemo(() => toDef(typeKey, label, fields), [typeKey, label, fields]);
  const result = useMemo(() => validateSectionTypeDefinition(def), [def]);

  const addField = () =>
    setFields((f) => [...f, { key: "", label: "", type: "text", required: false, limit: "" }]);
  const patch = (i: number, p: Partial<DraftField>) =>
    setFields((f) => f.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => setFields((f) => f.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    try {
      if (editing) await updateSectionType(def.type, def);
      else await createSectionType(def);
      notify("success", editing ? "Type updated." : "Type created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit type" : "New section type"}</h2>
      <p className="meter">Authored types render unstyled (generic fallback) until a developer registers a component.</p>

      <label className="field">
        <span className="field__label">Type key</span>
        <input aria-label="Type key" value={typeKey} disabled={editing} onChange={(e) => setTypeKey(e.target.value)} placeholder="case_study" />
      </label>
      <label className="field">
        <span className="field__label">Label</span>
        <input aria-label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Case study" />
      </label>

      <div className="field">
        <span className="field__label">Fields</span>
        {fields.map((f, i) => (
          <div key={i} className="steditor__field">
            <input aria-label="Field key" value={f.key} onChange={(e) => patch(i, { key: e.target.value })} placeholder="key" />
            <input aria-label="Field label" value={f.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Label" />
            <select aria-label="Field type" value={f.type} onChange={(e) => patch(i, { type: e.target.value as DraftField["type"] })}>
              <option value="text">text</option>
              <option value="paragraph">paragraph</option>
            </select>
            <input
              aria-label="Field limit"
              type="number"
              value={f.limit}
              onChange={(e) => patch(i, { limit: e.target.value })}
              placeholder={f.type === "text" ? "max chars" : "max words"}
            />
            <label className="steditor__req">
              <input type="checkbox" checked={f.required} onChange={(e) => patch(i, { required: e.target.checked })} /> required
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => remove(i)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={addField}>
          Add field
        </button>
      </div>

      {!result.valid ? (
        <ul className="notice notice--warn">
          {result.errors.map((e, i) => (
            <li key={i}>
              <code>{e.path}</code> — {e.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!result.valid || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the list test again (editor now resolves)**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-list.test.tsx`
Expected: PASS.

- [ ] **Step 6: Checkpoint** — `npm run typecheck`.

---

## Task 19: Styles, client hydration wiring, env docs, full verification

**Files:**
- Modify: `apps/web/src/App.tsx` (call `loadSectionTypes` on mount)
- Modify: `apps/web/app/globals.css` (admin + add-section + editor styles)
- Modify: `apps/web/.env.local.example` (note `--admin` bootstrap)

- [ ] **Step 1: Hydrate the registry on editor load**

In `apps/web/src/App.tsx`, add a mount effect (App is a client component). Add `import { useEffect } from "react";` and inside `App`, after the store selectors:

```tsx
  const loadSectionTypes = useProposalStore((s) => s.loadSectionTypes);
  useEffect(() => {
    void loadSectionTypes();
  }, [loadSectionTypes]);
```

- [ ] **Step 2: Add styles**

Append to `apps/web/app/globals.css`:

```css
/* ---- Add section (outline) --------------------------------------------- */
.outline__add {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* ---- Admin / Builder dashboard ----------------------------------------- */
.admin { display: flex; flex-direction: column; height: 100vh; }
.admin__bar {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; padding: 0 18px; border-bottom: 1px solid var(--ui-line-strong); background: var(--ui-panel);
}
.admin__title { font-weight: 650; letter-spacing: -0.01em; }
.admin__body { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr); }
.admin__nav { border-right: 1px solid var(--ui-line); padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.admin__navitem {
  text-align: left; padding: 8px 10px; border: none; background: transparent; border-radius: var(--ui-radius-sm);
  cursor: pointer; color: var(--ui-ink); font: inherit;
}
.admin__navitem[aria-current="true"] { background: var(--ui-accent-soft); color: var(--ui-accent); font-weight: 600; }
.admin__navitem:disabled { color: var(--ui-ink-faint); cursor: not-allowed; }
.admin__main { overflow-y: auto; padding: 20px 24px; }

.stlist__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.stlist__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.stlist__row {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px;
  padding: 10px 12px; border: 1px solid var(--ui-line); border-radius: var(--ui-radius-sm); background: var(--ui-panel);
}
.stlist__main { display: flex; flex-direction: column; gap: 2px; }
.stlist__key { font-family: var(--ui-mono); font-size: 11px; color: var(--ui-ink-faint); }
.stlist__tags { display: flex; gap: 5px; flex-wrap: wrap; }
.stlist__actions { display: flex; gap: 6px; }

.steditor { display: flex; flex-direction: column; gap: 12px; max-width: 640px; }
.steditor__field { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.steditor__req { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--ui-ink-soft); }
.steditor__actions { display: flex; gap: 8px; }
```

- [ ] **Step 3: Document the bootstrap flag**

In `apps/web/.env.local.example`, update the accounts comment block to mention the admin flag:

```
# Accounts are DB-backed and ADMIN-CREATED (no public signup). Bootstrap the first
# admin from the CLI, then create others from the Builder dashboard:
#   npm run user:create -w @proposal/web -- --admin you@example.com "your-password"
# Passwords are scrypt-hashed before they're stored; nothing is kept in plaintext.
```

- [ ] **Step 4: Full suite**

Run: `npx vitest run`
Expected: PASS — all prior tests plus the slice-11 suite. If any existing test imported `sectionTypes`/`sectionTypeMap`, fix it to `builtInSectionTypes`/`listSectionTypes()`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Clean build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: success; route table includes `/admin`, `/api/section-types`, `/api/section-types/[type]`, `/api/section-types/[type]/deprecate`.

- [ ] **Step 7: Manual smoke (optional, needs DATABASE_URL)**

`npm run db:migrate -w @proposal/web` → `npm run user:create -w @proposal/web -- --admin you@x.com "pw"` → sign in → visit `/admin` → create a `case_study` type → back to editor → "+ Add section" → pick Case study → it renders (unstyled) and is editable.

---

## Self-review

**Spec coverage:**
- A (runtime registry) → Tasks 2, 6, 14. B (persistence/lifecycle) → Tasks 3, 5, 11 (freeze), 12 (deprecate). C (admin/bootstrap) → Tasks 4, 7, 8, 13. D (API) → Tasks 9–12. E (dashboard UI) → Tasks 16–18. F (client wiring) → Tasks 14, 19. G (Add Section) → Task 15. H (testing) → embedded per task. ✓ All sections covered.
- Meta-validation (§A) → Task 1. ✓

**Placeholder scan:** No "TBD"/"add error handling"-style gaps; every code step shows full code. The one intentional stub (Task 16 `SectionTypeList`) is explicitly replaced in Task 17.

**Type consistency:** `SectionTypeRow` shape identical across types.ts/memory/postgres. `authenticateUser` return `{id,email,isAdmin}` matches `auth.ts` usage and `SessionUser`. `setActiveSectionTypes(authored[])` / `getMergedSectionTypes()` / `invalidateActiveRegistry()` names consistent across server + client + tests. `validateSectionTypeDefinition` returns `ValidationResult` (existing shape).

**Scope:** One subsystem (section-type authoring) + the shared groundwork (admin role/shell) needed to host it. User management and template authoring are explicitly out (later slices).
