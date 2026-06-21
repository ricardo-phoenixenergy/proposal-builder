# Builder — Template Authoring (design)

> Third and final increment of the in-app Builder (§11), after section-type authoring
> (`2026-06-18-builder-section-types-design.md`) and user management
> (`2026-06-18-builder-user-management-design.md`). Lets an admin compose and manage
> proposal **templates** from the `/admin` dashboard, filling the dashboard's last
> disabled nav slot — **Templates**.

## Goal

An admin can author proposal templates from the frontend — an ordered list of
section-type **slots** with per-slot locks — without editing code:

- **Create** a template (name, theme, locked flag, ordered fixed slots).
- **List** all templates with their status (built-in / authored / in use / deprecated).
- **Edit** an authored, not-in-use template.
- **Duplicate** any template (the copy-on-write path for editing a frozen one).
- **Deprecate / restore** an authored template (hidden from the picker, still resolvable).

Authored templates then appear in the **existing** Inspector template picker, so users
choosing a template for a proposal pick from built-ins + authored alike.

## Decisions (settled in brainstorming)

1. **Copy-on-write lifecycle** (same model as section types). Built-in templates are
   immutable; a template referenced by any stored proposal is frozen. "Edit" of a
   frozen/built-in template = **Duplicate** (new id) + **Deprecate** (overlay flag).
2. **v1 authoring scope: fixed slots + locks + fixed content.** Author `kind:"fixed"`
   slots only. **Deferred:** `choice` slots and per-template `overrides` (the types stay;
   built-ins keep using them; the builder just doesn't author them yet).
3. **Surface via the existing picker.** Hydrate the merged set into the store on mount
   (like `loadSectionTypes`); the Inspector dropdown and `applyTemplate` read from it.

### Why copy-on-write matters here

`lockState` (`isStructureLocked`, `isThemePinned`, `isFieldLocked`) and the Inspector
read the **live** template to enforce locks, and the export gate compares a `fixed`
slot's canonical content. Freezing in-use templates means a proposal's edit/lock/export
behavior never shifts under it after the proposal is created from it.

---

## A. Data model & merge

- **Built-in templates stay in code** (`openTemplate`, `prelimTemplate` in
  `packages/shared/src/templates`). The active set = built-ins merged with DB-authored
  rows by `id` (authored wins), exactly like `activeRegistry.ts` does for section types.
- Add `deprecated?: boolean` to the shared `Template` type (mirrors `SectionTypeSchema.deprecated`).
- **Reshape the `templates` table to mirror `section_types`:**
  `id` PK, `template jsonb` **nullable** (null = a built-in deprecation overlay),
  `deprecated boolean not null default false`, `updatedAt timestamptz not null default now()`.
  Migration `0004` is additive: add `deprecated` + `updatedAt`, drop the `template` NOT NULL.
  (The table is currently unused by the running app — only the repo + one repo test touch it.)
- New `TemplateRow` type (mirrors `SectionTypeRow`):

```ts
export interface TemplateRow {
  id: string;
  template: Template | null; // null = built-in deprecation overlay
  deprecated: boolean;
  updatedAt: string;
}
```

## B. Repository changes

Replace the current template methods (`listTemplates()` / `upsertTemplate(template: Template)`
and the now-unused `StoredTemplate`) with the row-based surface, mirroring the
section-type methods:

```ts
listTemplateRows(): Promise<TemplateRow[]>;
upsertTemplate(row: { id: string; template: Template | null; deprecated: boolean }): Promise<TemplateRow>;
setTemplateDeprecated(id: string, deprecated: boolean): Promise<TemplateRow | null>;
/** Distinct templateId referenced by any stored proposal (freeze check). */
listInUseTemplateIds(): Promise<string[]>;
```

The one existing test that exercised the old `listTemplates`/`upsertTemplate(Template)`
signature (`slice-08-repo.test.ts`) is updated to the row API as part of this slice.

## C. Server active-template registry

A new `apps/web/src/server/registry/activeTemplates.ts`, structurally identical to
`activeRegistry.ts`:

- `getMergedTemplates(): Promise<Template[]>` — cached; built-ins first, DB rows override
  by `id`; a null-`template` row overlays `deprecated:true` onto the matching built-in.
  Deprecated templates **remain in the list** (carrying `deprecated:true`) so a proposal
  that already references one still resolves; the client filters them out of the picker.
- `refreshActiveTemplates()` / `invalidateActiveTemplates()` — mutation routes invalidate.

Unlike section types, **nothing deep in `packages/shared` needs the active template
set** (`applyTemplate`/`lockState` take a `Template` argument). So there is **no shared
mutable singleton** — the merge lives server-side and the client holds its copy in the
store. `getTemplate`/`registry.ts` in shared remain for the built-in defaults.

**Correction (applied 2026-06-18):** The current template was also resolved via
in-code `getTemplate` in the export route, CopyFields, ExportGate, and Outline — not
only in the store. Those four call sites now resolve from the merged/hydrated template
set: the server export route uses `getMergedTemplates()` (async); the three client
components read from the store's `templates` array with `.find(...) ?? openTemplate`.

## D. Validation — shared `validateTemplateDefinition(def, ctx)`

Mirrors `validateSectionTypeDefinition`, but takes a context of known keys (kept pure /
framework-agnostic — the caller supplies the sets):

```ts
validateTemplateDefinition(
  def: unknown,
  ctx: { sectionTypeKeys: string[]; themeIds: string[] },
): ValidationResult;
```

Rules:
- `id` is a lowercase slug (`/^[a-z][a-z0-9_]*$/`); `name` non-empty.
- `themeId` is present and ∈ `ctx.themeIds`.
- `locked` is a boolean.
- `slots` is a non-empty array; **every slot is `kind:"fixed"`** in v1 with:
  - `type` ∈ `ctx.sectionTypeKeys` (the active merged registry).
  - `lock` ∈ `"open" | "fixed" | "editable-copy" | "editable-data"`.
  - optional `data`: an object whose keys are **text/paragraph fields that exist on that
    section type** (the route/editor resolves field keys from the active registry).
- A `kind:"choice"` slot is **rejected by the authoring validator** in v1 (`"choice slots
  aren't authorable yet"`) — built-ins may still contain them; this validator gates only
  what an admin submits.

Enforced at both the API route and the editor UI (the editor also constrains the inputs
so an invalid template is hard to build in the first place).

## E. API (admin-gated, mirroring `/api/section-types`)

| Route | Method | Auth | Result |
|---|---|---|---|
| `/api/templates` | `GET` | any authed | `200 { templates: Template[] }` (merged, incl. deprecated flags) |
| `/api/templates` | `POST` | admin | create/duplicate; `201 { template }`; 400 invalid, 409 duplicate id |
| `/api/templates/[id]` | `PUT` | admin | edit; 409 if built-in or in-use; 404 unknown; 400 invalid |
| `/api/templates/[id]/deprecate` | `POST` | admin | `{ deprecated }`; 200; 404 unknown |

- `GET` is any-authed because the user-facing picker calls it (parallels GET
  `/api/section-types`).
- `POST`/`PUT` validate via `validateTemplateDefinition` with `sectionTypeKeys` from
  `getMergedSectionTypes()` and `themeIds` from the app theme list
  (`apps/web/src/theme/themes.ts`).
- `PUT` freezes built-ins (`builtInTemplates.some(id)`) and in-use ids
  (`listInUseTemplateIds()`) → 409, exactly like the section-type PUT.
- Every mutation calls `invalidateActiveTemplates()`.

## F. Surfacing to users (store + Inspector)

- The store gains `templates: Template[]` state and `loadTemplates()` (GET
  `/api/templates`), called on App mount alongside `loadSectionTypes()`.
- `applyTemplate(id)` resolves from `get().templates` (falling back to the in-code
  built-ins for the initial pre-hydration render) instead of shared `getTemplate`.
- The Inspector dropdown reads `useProposalStore(s => s.templates)`, filtering out
  `deprecated` **except** the document's current `templateId` (so the select value stays
  valid even if its template was later deprecated).
- `lockState` calls in the Inspector resolve the current template from the store list.

## G. Builder UI

- `TemplateList` (mirror `SectionTypeList`): rows showing `name` + `id`, badges
  (`built-in` / `authored` / `in use` / `deprecated`), and actions **New / Duplicate /
  Edit / Deprecate-Restore**. Edit is disabled for built-in or in-use (title explains why);
  Duplicate seeds a new id (`<id>_copy`).
- `TemplateEditor`: `name`, theme `<select>` (from the app theme list), `locked` checkbox,
  and an ordered **slot list** — each row: a section-type `<select>` (from the active
  registry, deprecated types excluded), a lock `<select>`, and, when `lock:"fixed"`,
  text inputs for that type's text/paragraph fields; **add / remove / move up-down**.
  Save validates client-side then POST (create/duplicate) or PUT (edit). Uses an explicit
  `mode: "create" | "edit"` prop (the lesson from the section-type editor).
- Wire into the `AdminDashboard` **Templates** nav slot (currently disabled), using the
  same panel-switching pattern the Users panel added (`panel` state extended to include
  `"templates"`).

## H. Testing (TDD, hermetic)

- **shared:** `validateTemplateDefinition` — valid template; rejects bad id/name, missing
  or unknown `themeId`, empty slots, unknown slot `type`, bad `lock`, a `choice` slot,
  and `fixed` data referencing a non-text/unknown field.
- **repo:** `listTemplateRows`/`upsertTemplate(row)`/`setTemplateDeprecated`/
  `listInUseTemplateIds` round-trip (memory); built-in deprecation overlay (null template);
  in-use ids derived from stored proposals. Update `slice-08-repo.test.ts` to the row API.
- **server registry:** `getMergedTemplates` merges built-ins + rows, applies overrides and
  deprecation overlays, and invalidation reloads.
- **routes:** GET (any-authed list), POST (201 / 400 / 409 duplicate / 401 / 403),
  PUT (edit / 409 built-in / 409 in-use / 404 / 400), deprecate (200 / 404 / 403).
- **store/UI:** `loadTemplates` hydrates; Inspector lists merged templates and excludes
  deprecated (but keeps the current one); `applyTemplate` scaffolds from a hydrated
  authored template; `TemplateList` badges + freeze-disable; `TemplateEditor` add/remove/
  reorder slots, fixed-field inputs, create→POST and edit→PUT dispatch; dashboard nav
  switches to the Templates panel.

## File map

**Create**
- `packages/shared/src/validation/validateTemplateDefinition.ts` (+ test)
- `apps/web/src/server/registry/activeTemplates.ts`
- `apps/web/app/api/templates/route.ts` (GET, POST)
- `apps/web/app/api/templates/[id]/route.ts` (PUT)
- `apps/web/app/api/templates/[id]/deprecate/route.ts` (POST)
- `apps/web/src/client/templates.ts`
- `apps/web/src/ui/admin/TemplateList.tsx`, `apps/web/src/ui/admin/TemplateEditor.tsx`
- Tests alongside each.

**Modify**
- `packages/shared/src/types/template.ts` (+ `deprecated?: boolean`)
- `packages/shared/src/index.ts` (export the new validator + `builtInTemplates` if not already)
- `apps/web/src/server/db/schema.ts` (templates table) + `apps/web/drizzle/0004_*.sql` (generated)
- `apps/web/src/server/repo/types.ts` (`TemplateRow`; reshape template methods; drop `StoredTemplate`)
- `apps/web/src/server/repo/memory.ts` + `postgres.ts` (row-based template methods + in-use ids)
- `apps/web/src/state/proposalStore.ts` (`templates` state, `loadTemplates`, `applyTemplate` from state)
- `apps/web/src/App.tsx` (call `loadTemplates()` on mount)
- `apps/web/src/ui/Inspector.tsx` (dropdown reads store templates; resolve current template from store)
- `apps/web/src/ui/admin/AdminDashboard.tsx` (enable Templates nav; `"templates"` panel)
- `apps/web/app/admin/page.tsx` (no change expected; the panel fetches client-side)
- `apps/web/src/__tests__/slice-08-repo.test.ts` (template assertions → row API)

## Out of scope

- `choice`-slot and per-template `override` authoring (types remain; built-ins keep them).
- Theme **authoring** (templates only reference existing themes).
- Hard-delete of templates (deprecate instead — preserves resolvability for existing proposals).
- A new template-gallery / new-proposal screen (the existing Inspector dropdown is reused).
- Re-scaffolding or migrating existing proposals when a template they used changes
  (copy-on-write makes this a non-issue: in-use templates are frozen).
