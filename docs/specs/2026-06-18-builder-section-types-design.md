# Builder — Section-Type Authoring (Design)

**Date:** 2026-06-18
**Status:** Approved (brainstorm), pending implementation plan
**Spec reference:** proposal-generator-spec.md §5 (three layers / registry), §11 (Builder, back-of-house), §14 (canonical types)

This is the first increment of the in-app **Builder** (§11). It delivers an
admin dashboard where an admin can author **section types** (schemas), and makes
those authored types live throughout the app. Two sibling increments are
explicitly sequenced *after* this one and are out of scope here:

1. **This slice:** admin role + dashboard shell + bootstrap + **section-type authoring** (+ minimal Add Section).
2. **Next:** user management in the dashboard (create/list/disable accounts).
3. **After:** template authoring in the dashboard.

---

## Decisions (locked during brainstorm)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Sequence | Section-type authoring first; templates + users later. |
| 2 | Editing built-ins | Allowed — but via copy-on-write, never in-place mutation (see #4). |
| 3 | Storage/merge | DB stores the **full** type definition; **DB wins by `type` key**, merged over code built-ins. |
| 4 | Drift handling | **Copy-on-write + deprecation.** Types are immutable once *in use*; "edit" = Duplicate + Deprecate. No migration of existing data. |
| 5 | Field types (this slice) | **`text` + `paragraph` only**, with char/word limits. Data fields (`dataset`/`matrix`/`list`) deferred. |
| 6 | Access | **Admin role** (`isAdmin`). Dashboard gated to admins; regular users get the editor only. |
| 7 | Add Section | **Included** — a minimal Outline "+ Add section" so authored types are placeable and the slice is demonstrable end to end. |

**Hard constraint (spec §8 non-goal):** users author **schemas and composition only — never React/JSX**. Authored types have no registered component and therefore render via the generic fallback (flagged *unstyled*), exactly as §5.4 describes.

---

## A. Registry becomes runtime data

Today `packages/shared` exports a static `sectionTypes` array and derives the Ajv
section schema once at module load. To let the DB contribute types, the registry
becomes a **settable active set**, while built-ins stay code-owned.

- `builtInSectionTypes` — the existing six types, immutable, code-owned (rename of the current `sectionTypes`; a `sectionTypes` alias may be retained to limit churn).
- `setActiveSectionTypes(authored: SectionTypeSchema[])` — merges built-ins with authored types (**authored wins by `type` key**), applies deprecation overlay, and bumps an internal **revision counter**.
- `getSectionType(type)` / `sectionTypeMap` / `listSectionTypes({ includeDeprecated })` read the active set. Default active set = built-ins (so existing imports/tests keep working with zero hydration).
- `validateSection(section)` keeps its signature, but **re-derives and recompiles** its Ajv validator when the revision counter changes (memoized by revision). `buildSectionSchema(types)` already exists and is reused.
- `validateSectionTypeDefinition(def): ValidationResult` — new pure "schema for schemas":
  - `type`: non-empty, matches a key slug (`^[a-z][a-z0-9_]*$`).
  - `label`: non-empty.
  - `fields`: ≥1; each field key unique and a valid slug; `type ∈ {text, paragraph}` (this slice); `maxChars`/`maxWords` (if present) positive integers; `text` uses `maxChars`, `paragraph` uses `maxWords`.
  - `variants`: array of non-empty strings (optional; all authored variants are unstyled).
  - `category`: `"text"` (this slice).

Deprecation: a type may carry `deprecated?: boolean`. Pickers (Add Section, future template composer) **exclude** deprecated types; rendering and validation still **include** them so existing sections keep working.

## B. Persistence & lifecycle

New table `section_types`:

| column | type | notes |
|--------|------|-------|
| `type` | text PK | the type key |
| `definition` | jsonb, nullable | full `SectionTypeSchema` for authored types; **null = built-in overlay** (flag-only) |
| `deprecated` | boolean, default false | |
| `created_at` / `updated_at` | timestamptz | |

Merge at runtime (`getActiveSectionTypes` on the server): start from `builtInSectionTypes`; for each DB row — if `definition` is present, it replaces/adds that key; apply `deprecated` to the resulting type (built-in or authored). Built-ins with no DB row are used verbatim from code.

Repo additions (interface + memory + postgres):
- `listSectionTypeRows(): Promise<SectionTypeRow[]>`
- `upsertSectionType(row): Promise<SectionTypeRow>`
- `setSectionTypeDeprecated(type, deprecated): Promise<SectionTypeRow | null>`
- `listInUseTypeKeys(): Promise<string[]>` — distinct `type` across all proposals' `document.sections` (memory: scan map; postgres: query over JSONB).

**Copy-on-write rules:**
- Built-ins are never mutated. To change one: **Duplicate** (creates a new authored type with a new key, pre-filled from the source) → edit → save; optionally **Deprecate** the built-in (writes a definition-null, `deprecated: true` row — no code change).
- An authored type is **editable in place** (PUT) only while **not in use** (`type` not in `listInUseTypeKeys()`). Once in use, PUT is rejected (409) and the UI offers Duplicate instead.
- Built-ins are never editable via PUT (they're code); only deprecatable.

## C. Admin role + bootstrap

- `users.isAdmin` boolean column (default false).
- `authenticateUser` returns `isAdmin`; the `jwt` callback copies it to the token, `session` exposes `session.user.isAdmin`. Types augmented in `types/next-auth.d.ts`.
- `requireAdmin()` guard (mirrors `requireOwner`): 401 if unauthenticated, 403 if not admin, else the owner id.
- `auth.config.ts` `authorized` callback: `/admin` requires `auth?.user?.isAdmin`.
- **Bootstrap:** `scripts/create-user.mjs` gains an `--admin` flag (sets `is_admin = true`). The first admin is minted via CLI; all later accounts come from the dashboard (next slice). The CLI remains the break-glass path.

## D. API

All routes hermetic-testable via the existing `setOwnerResolverForTests` seam plus an admin resolver seam.

| Method | Route | Access | Purpose |
|--------|-------|--------|---------|
| GET | `/api/section-types` | any authed | Merged active list (client hydration + dashboard) |
| POST | `/api/section-types` | admin | Create or duplicate; validates definition + key uniqueness |
| PUT | `/api/section-types/[type]` | admin | Edit; **409 if built-in or in-use** |
| POST | `/api/section-types/[type]/deprecate` | admin | Deprecate / restore (body `{ deprecated: boolean }`) |

Mutations invalidate the server's active-registry cache.

## E. UI — `/admin` dashboard

- **Route `/admin`** (gated by `isAdmin` in middleware). A shell with left nav: **Section types** (active), **Users** and **Templates** shown as disabled "coming next" items.
- **Section-types view:**
  - Table of types with badges: *built-in* / *authored*, *in-use*, *deprecated*, *unstyled* (no registered component).
  - Actions per row: **Duplicate**, **Edit** (disabled for built-in or in-use), **Deprecate / Restore**. Plus a top-level **New type**.
  - **Type editor form:** `type` key, `label`, and a **fields** editor — add/remove fields, each with field type (`text`/`paragraph`), label, key, required, and the matching limit (`maxChars` for text, `maxWords` for paragraph). Live meta-validation (`validateSectionTypeDefinition`) with inline errors; Save disabled while invalid.
- A short note in the form explains authored types render *unstyled* (fallback) until a developer registers a component.

## F. Client wiring

- On app load (editor shell), fetch `GET /api/section-types` and call `setActiveSectionTypes`, so the renderer, Inspector, Outline, and live validation all see authored types. The dashboard keeps the list in the Zustand store.
- Existing call sites (`getSectionType`, etc.) are unchanged — they now read the active registry.

## G. Add Section (minimal)

- Outline gains a **"+ Add section"** control, shown only when the template's structure is **not locked** (`isStructureLocked` false — e.g. the open template).
- Picking a non-deprecated type appends a new section: fresh id, chosen `type`, default variant (or none → fallback), and **empty data** (reuse `emptyDataForType`). The section is selected; it renders via the fallback and is editable via the existing `CopyFields`.
- Store action `addSection(type)`; pure mutation in `state/mutations` (or `packages/shared` template helpers) so it's unit-testable.

## H. Testing (TDD)

- **shared:** `validateSectionTypeDefinition` (valid/invalid cases); `setActiveSectionTypes` merge + override-by-key + deprecation filtering in `listSectionTypes`; `validateSection` picks up an authored type after hydration (schema re-derivation).
- **server:** section-types routes — admin gate (401/403), create, duplicate, edit-rejected-when-in-use (409), edit-rejected-for-built-in, deprecate/restore; repo methods incl. `listInUseTypeKeys`; active-registry hydration/merge.
- **client:** dashboard renders types with correct badges; create flow calls POST and refreshes; Edit disabled for built-in/in-use; Add Section appends a section that renders via fallback and is editable.
- All hermetic: in-memory repo (`setRepoForTests`), owner/admin resolver seams, mocked `fetch` for client tests.

---

## Out of scope (deferred)

- User management UI (next slice) — accounts still created via the `--admin` CLI for now (plus existing `user:create`).
- Template authoring (slice after) — until it lands, authored types reach proposals only via **Add Section**.
- Data-category authored fields (`dataset`/`matrix`/`list`) and generalizing the Inspector's data editors to dispatch by field type.
- Registering React components for authored types (developer-side, by design — authored types stay *unstyled*).
- Migrating existing proposal data when a type changes (copy-on-write makes this unnecessary).

## Risks / notes

- **Server registry is process-global.** Section types are global (not per-owner), so a per-process cached active registry is correct; serverless cold starts rebuild it from the DB. Mutations invalidate the cache in-process; other warm instances pick up changes on their next rebuild/TTL. Acceptable at this scale.
- **In-use scan cost.** `listInUseTypeKeys` scans proposals' JSONB; fine at current scale, revisit with an index if proposals grow large.
- **Local dev without a DB:** authored types and admin accounts require `DATABASE_URL` (consistent with the auth model). The in-memory repo supports them for tests and single-process dev, but they don't persist across restarts.
