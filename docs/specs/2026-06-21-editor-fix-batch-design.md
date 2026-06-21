# Editor Fix Batch (5 slices) — design

> Five discrete, independently shippable improvements to the editor, AI, theme,
> and PDF surfaces, built per `docs/specs/proposal-generator-spec.md` + CLAUDE.md.
> Each is its own slice with its own test cycle. **Do not refactor unrelated areas.**

## Goal

1. **Add/delete sections** in the Free Editor outline (insert from registered
   section types with schema defaults; delete with confirm; outline order = render
   order; reorder out of scope).
2. **Hide the Monaco token/code editor + raw token controls when a PRESET theme is
   active** — presets are read-only; "Fork to edit" creates an editable per-proposal
   custom theme.
3. **Paged document model** — proposals render as discrete A4 pages with automatic
   breaks at page boundaries plus manual breaks, driving the PDF pipeline so the
   export is pixel-stable.
4. **Right panel → AI workspace** — a collapsible "Document" disclosure (Template +
   Theme) on top; then Proposal Brief (global context), section-rewrite instruction,
   and a schema-driven field area (text/list = AI-composable; data = manual; unknown
   = plain input).
5. **AI model as an admin-configured setting** applied to every generation call; the
   per-user model picker is removed.

## Build order

**5 → 1 → 2 → 4 → 3.** Lightest dependency-wise to heaviest. Each slice is green
(full suite + typecheck + build) before the next starts.

## Confirmed decisions (from brainstorming)

- **Page size:** A4 portrait (slice 3).
- **Pagination strategy:** CSS/Chromium-paginated. The editor renders an A4 sheet
  using the *same* components, theme tokens, and page CSS as `/print`; Chromium does
  the actual page-splitting at export via CSS paged media. PDF is exact/stable;
  on-screen shows page-boundary guides + exact manual breaks. **No new dependency.**
- **Proposal Brief** is persisted in the content JSON as `document.brief` (slice 4).
- **Template + Theme** move into a collapsible "Document" disclosure atop the right
  panel (slice 4).
- **Theme fork** persists in the content JSON as `document.theme?: ThemeTokens`;
  `/print` resolves `document.theme` when present, else the preset by id (slice 2).
- **AI model setting** is stored in a new `app_settings` row read server-side; the
  per-Inspector model picker is removed (slice 5).
- **Manual page break** = a `pageBreakBefore?: boolean` on a `Section` (slice 3).
- **Per-field rewrite** passes the field's current value as context (so "rephrase"/
  "make concise" works); **section rewrite** is from-scratch (no current values).

## Build-time verification flags (per the batch instruction)

- **Slices 4 & 5 touch the AI surface.** Before changing generation, re-verify the
  Anthropic Messages + Structured Outputs surface against live docs (CLAUDE.md: "do
  not trust a snapshot") via the `claude-api` skill. The existing call shape in
  `apps/web/src/server/anthropic.ts` is the working baseline; keep it unless the live
  docs require a change, and flag any change in the slice's report.
- **Slice 3 touches the PDF pipeline.** Re-verify the puppeteer-core /
  `@sparticuz/chromium-min` + `page.pdf({ format, preferCSSPageSize })` surface
  against live docs before changing the export route.

---

## Slice 5 — AI model as an admin setting

**What:** one global model setting, set by an admin, applied to every generation
call. Remove the per-user model picker.

### Data + repo

- New `app_settings` table (migration `0006`, additive), a single-row key/value store:
  ```ts
  appSettings = pgTable("app_settings", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  })
  ```
- `Repository` gains:
  ```ts
  getAiModel(): Promise<GenerationModelId | null>;   // null when unset
  setAiModel(model: GenerationModelId): Promise<void>;
  ```
  Memory + Postgres implementations. The Postgres impl reads/writes the `"ai_model"`
  key; the memory impl holds a field. Both validate the stored string with
  `isSelectableModel` on read (unknown/null → `null`).
- Server helper `apps/web/src/server/aiModel.ts`:
  ```ts
  export async function getActiveModel(): Promise<GenerationModelId>
  // getRepo().getAiModel() ?? DEFAULT_MODEL
  ```

### API

| Route | Method | Body | Result |
|---|---|---|---|
| `/api/admin/settings` | `GET` | — | `200 { aiModel: GenerationModelId }` (falls back to `DEFAULT_MODEL`) |
| `/api/admin/settings` | `PUT` | `{ aiModel }` | `200 { aiModel }`; `400` if not selectable; admin-gated |

- Both guarded by an admin check (`auth()` → `session.user.isAdmin`), consistent with
  the existing admin routes; non-admin → `403`.

### UI

- `apps/web/src/ui/admin/SettingsPanel.tsx` (new): a card with a model `<select>`
  (`SELECTABLE_MODELS`), current value preselected, Save → `PUT`. Rendered inside the
  existing `AdminDashboard`. `app/admin/page.tsx` passes the current `aiModel`
  (from `getActiveModel()`) into `AdminDashboard`.

### Generation wiring

- `/api/generate/section` stops reading `model` from the request body; it calls
  `getActiveModel()` and passes that to `generateSection`. (The `generateSection`
  signature keeps `model?` for testability; the route supplies it.)
- The Inspector Model `<select>` and the store's `model`/`setModel` are removed in
  **slice 4** (when the right panel is rebuilt). Until then, slice 5 leaves the client
  picker in place but the **server ignores the client `model`** and uses the setting —
  so behaviour is correct after slice 5 regardless of slice 4.

### Tests (TDD, hermetic)

- repo: `getAiModel` null when unset; round-trips a set value; rejects/ignores a
  non-selectable stored value (→ null).
- `getActiveModel` falls back to `DEFAULT_MODEL`.
- route: `GET` returns the default when unset and the set value after `PUT`; `PUT`
  400 on a bad model; non-admin 403.
- `/api/generate/section` uses the setting and ignores a client-sent `model` (assert
  the mocked `createMessage` receives the setting's model, not the body's).

---

## Slice 1 — Add/delete sections in the Free Editor outline

**What:** in the outline (unlocked templates only), insert a section at a chosen
position and delete a section with confirm. New sections initialise from the section
type's schema defaults and render via the generic fallback if no component is
registered. Outline order = render order. **Reorder is out of scope.**

### Shared

- `packages/shared` already has `emptyData(typeSchema)` (`template/emptyData.ts`) used
  to scaffold section data. Reuse it.

### Store + mutations

- `apps/web/src/state/mutations.ts`:
  ```ts
  insertSection(doc, type, index): ProposalDocument   // new section with emptyData, spliced at index
  removeSection(doc, sectionId): ProposalDocument     // returns doc unchanged if id absent
  ```
  `insertSection` generates a fresh id (same id scheme as `appendSection`). Both are
  pure and clone.
- Store actions:
  ```ts
  insertSection: (type: string, index: number) => void
  removeSection: (id: string) => void   // also clears selectedId if it was the removed one
  ```
  `appendSection`/`addSection` stays (used elsewhere); `insertSection` is the
  position-aware primitive.

### UI

- `Outline.tsx` (unlocked only):
  - An **insert control between rows** (a thin "+" affordance) and at the top/bottom.
    On choose-a-type, calls `insertSection(type, index)` and selects the new section.
    Reuse the existing type `<select>` pattern (list from `listSectionTypes()`), shown
    inline at the chosen gap.
  - A **Delete** button per row (icon + `aria-label="Delete section"`). Clicking opens
    a confirm (reuse the existing confirm pattern used by the dashboard card delete);
    on confirm, `removeSection(id)`.
  - When the structure is **locked**, neither insert-at-position nor delete renders
    (matches today's add-section gating).

### Tests

- mutations: `insertSection` places the new section at the index with
  schema-default data; `removeSection` drops the section and is a no-op for an unknown
  id.
- store: `insertSection`/`removeSection` update the document; removing the selected
  section clears `selectedId`.
- UI: unlocked outline shows insert + delete; locked outline shows neither; insert
  selects the new section; delete requires confirm.

---

## Slice 2 — Preset themes read-only; fork to edit

**What:** when a **preset** theme is active, hide the Tokens form, the Monaco Code
editor, and the asset upload — show a "Fork to edit" button. Forking clones the active
preset into a per-proposal custom theme that is editable and that `/print` renders.

### Content model

- `ProposalDocument` gains `theme?: ThemeTokens` (additive, optional). Semantics:
  - `theme` **absent** → a preset is active (resolved by `themeId`); read-only.
  - `theme` **present** → a custom/forked theme overrides `themeId` everywhere it is
    resolved (editor preview and `/print`).
- JSON Schema: `document.schema.ts` adds an optional `theme` matching the existing
  `theme.schema.ts` shape; `validateDocument` validates `document.theme` when present
  (reuse the theme validator).
- `ThemeTokens` is unchanged. A forked theme gets `id: "custom"` and
  `name: "Custom (forked from <preset name>)"`.

### Store

- `theme` (live store state) is **derived from the document** on load/apply:
  `document.theme ?? themeById(document.themeId)`.
- New actions:
  ```ts
  forkTheme: () => void          // sets document.theme = clone(current resolved theme, id:"custom")
  unforkTheme: () => void        // deletes document.theme, reverts to the preset by themeId
  ```
  Editing tokens/code while forked mutates `document.theme` (the existing `setTheme`
  writes to `document.theme` when a fork is active; selecting a preset from the picker
  sets `themeId` and clears `document.theme`).
- Selecting a different **preset** from the picker clears any fork (sets `themeId`,
  removes `document.theme`).

### Print

- `app/print/[id]/page.tsx` resolves:
  ```ts
  const theme = stored.document.theme ?? themes.find(t => t.id === stored.document.themeId) ?? defaultTheme;
  ```
  (Fixes today's gap where a custom theme would not render in the PDF.)

### UI (Inspector theme group — final shape lands in slice 4's "Document" disclosure)

- Preset active (no `document.theme`): preset `<select>` + a **"Fork to edit"** button;
  Tokens/Code tabs + AssetUpload are **not rendered**.
- Forked (`document.theme` present): preset `<select>` still switches presets (and
  discards the fork after a confirm), plus the **Tokens/Code tabs + AssetUpload**
  editing surface and a **"Revert to preset"** button.
- `pinned` (template-pinned theme) still disables the whole group (unchanged).

### Tests

- `validateDocument` accepts a document with a valid `document.theme` and rejects a
  malformed one.
- store: `forkTheme` clones the active theme into `document.theme`; editing mutates it;
  `unforkTheme` / picking a preset clears it; load derives `theme` from
  `document.theme` when present.
- print page (server): renders `document.theme` when present, else the preset.
- UI: preset → no Tokens/Code/AssetUpload, "Fork to edit" present; forked → editors +
  "Revert to preset" present.

---

## Slice 4 — Right panel → AI workspace

**What:** restructure the Inspector into (top) a collapsible **Document** disclosure
holding Template + Theme, then the AI workspace: **Proposal Brief**, **section-rewrite
instruction**, and a **schema-driven field area**. Remove the per-user model picker.

### Field-kind model (single source of truth)

Reuse generation's existing notion of "AI-composable": a field is AI-composable iff
it is text-shaped. Add to `packages/shared`:
```ts
// fieldKind(field): "ai" | "data" | "manual"
//   "ai"     → text | paragraph | list   (AI-composable; per-field instruction + rewrite)
//   "data"   → dataset | matrix          (manual: grid / matrix editors only, never AI)
//   "manual" → any other/unknown kind    (plain editable input fallback)
```
(There is no `image` FieldType today; image content maps to "manual" if added later.
The spec's "image = manual upload" is satisfied by the manual fallback.)

### Content model

- `ProposalDocument` gains `brief?: string` (additive). The store's separate `brief`
  state is removed; `brief`/`setBrief` read/write `document.brief`. The brief is sent
  as global context on every generation call and is autosaved with the document.

### Generation (shared)

- New `packages/shared` builders (do not break `buildGenerationDataSchema`, which
  stays for any existing caller):
  ```ts
  buildTextFieldsGenerationSchema(typeSchema): JSONSchema | null
    // object schema over AI-composable fields ONLY (skips dataset/matrix);
    // null if the type has no AI-composable fields
  buildFieldGenerationSchema(field): JSONSchema | null
    // { value: <string | string[]> } for one AI-composable field; null otherwise
  ```
- New prompt builders in `apps/web/src/server/prompts.ts`:
  ```ts
  sectionRewritePrompt(typeSchema, brief, instruction): string   // rewrite all text fields from scratch
  fieldRewritePrompt(field, brief, instruction, currentValue): string  // one field; current value as context
  ```
  `systemPrompt()` is reused. Section rewrite **ignores** per-field instructions;
  per-field rewrite uses the field instruction + brief (+ current value as context).

### Server

- `generateSection` gains an optional `instruction?: string` and generates over
  `buildTextFieldsGenerationSchema` (text fields only), returning a partial
  `data` map for the AI-composable fields. The client merges it over existing data,
  leaving data/manual fields untouched.
- New `generateField(input, createMessage)` in `apps/web/src/server/generateField.ts`:
  ```ts
  { type, fieldKey, brief, instruction?, currentValue? } → { ok, value?, validation?, error? }
  ```
  Validates the single field's value against the type schema's field limits.

### API

| Route | Method | Body | Result |
|---|---|---|---|
| `/api/generate/section` | `POST` | `{ type, brief, instruction?, sectionId? }` | `200 { data, validation }` (text fields only); `422` on failure |
| `/api/generate/field` | `POST` | `{ type, fieldKey, brief, instruction?, currentValue?, sectionId? }` | `200 { value, validation }`; `400` non-AI field; `422` on failure |

Both read the model via `getActiveModel()` (slice 5). `model` is no longer accepted
from the client.

### Client

- `apps/web/src/client/generate.ts`:
  ```ts
  requestSectionGeneration({ type, brief, instruction?, sectionId? })   // model arg removed
  requestFieldGeneration({ type, fieldKey, brief, instruction?, currentValue?, sectionId? })
  ```

### UI

- `Inspector.tsx` becomes:
  1. **Document** disclosure (collapsible, open by default): Template `<select>` +
     the slice-2 Theme group (preset/fork). Remove the standalone Model `<select>`.
  2. **Proposal Brief** `<textarea>` bound to `document.brief`.
  3. **Section** (when one is selected):
     - **Section rewrite**: an instruction `<textarea>` + "Rewrite section with AI"
       button → `requestSectionGeneration({ type, brief, instruction, sectionId })`
       → merge returned data over existing section data.
     - **Schema-driven field area**: iterate the section type's fields in order:
       - `fieldKind === "ai"` → current value editor (text/paragraph `<textarea>` /
         `<input>`; list editor for `list`) + a per-field instruction `<input>` + a
         "Rewrite field" button → `requestFieldGeneration(...)` (sends current value).
         Respects per-field lock (read-only + no AI button when locked).
       - `fieldKind === "data"` → the existing `DataGrid`+`ColumnMapping`
         (`data_table`) / `MatrixEditor` (`commercial_comparison`) editors. Never AI.
       - `fieldKind === "manual"` → a plain `<input>` fallback.
     - The variant picker and choice-slot selector stay as today.
- The old single "Regenerate with AI" button and `CopyFields` are superseded by the
  schema-driven field area (the per-field editors render the same text/paragraph
  inputs, so `CopyFields` is folded into the new area).

### Tests

- shared: `fieldKind` mapping; `buildTextFieldsGenerationSchema` includes only
  AI-composable fields and is null when none; `buildFieldGenerationSchema` per kind.
- server: `generateSection` with an instruction returns only text-field data and
  preserves nothing it shouldn't; `generateField` returns one value and validates
  limits; non-AI field → error.
- routes: section/field generation happy-path + 400/422; model comes from the setting.
- store: `brief` reads/writes `document.brief`; section-rewrite merge preserves data
  fields.
- UI: Document disclosure collapses; brief persists into the document; an AI field
  shows instruction + rewrite; a data field shows the grid and no AI button; a locked
  field is read-only with no AI button.

---

## Slice 3 — Paged document model

**What:** render proposals as discrete A4 pages with automatic breaks at page
boundaries and manual breaks; the same page CSS drives the PDF export so on-screen
and export agree (export is pixel-exact via Chromium).

### Shared

- `packages/shared` page geometry constant:
  ```ts
  export const PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 } as const;
  ```
- `Section` gains `pageBreakBefore?: boolean` (additive). JSON Schema
  (`section.schema.ts`) adds the optional boolean; validation unchanged otherwise.

### Rendering

- A shared stylesheet `apps/web/src/render/paged.css` (imported by both the editor
  preview and `/print`):
  - `@page { size: A4; margin: <PAGE.marginMm>mm }`
  - the document is an A4-content-width column; sections get `break-inside: avoid`;
  - `[data-page-break-before="true"] { break-before: page }`.
- `DocumentRenderer.tsx` renders the A4 sheet: content constrained to A4 content
  width, applies `paged.css`, sets `data-page-break-before` from each section's flag.
  - **On screen:** a sheet styled to A4 width with page-boundary guides (a repeating
    background at page-height intervals) and exact manual page breaks (a forced new
    sheet). Auto-split boundaries are approximate on screen — flagged as guides.
  - **In print (`/print`):** Chromium paginates via `paged.css` (`@page` + the break
    rules) → exact, stable pages.
- `app/print/[id]/page.tsx` keeps `runtime="nodejs"`; the export route keeps
  `page.pdf({ format: "A4", preferCSSPageSize: true })` so `@page` governs the sheet.

### UI

- The selected section's field area (slice 4) gets a **"Page break before this
  section"** checkbox bound to `section.pageBreakBefore` (a metadata toggle, not AI).

### Tests

- shared: `Section` with `pageBreakBefore` validates; the constant is exported.
- render: `DocumentRenderer` sets `data-page-break-before="true"` on flagged sections.
- store: a `setPageBreakBefore(sectionId, value)` action toggles the flag.
- print page (server): renders with the paged stylesheet and honours the flag.

---

## File map (by slice)

**Slice 5 — admin model setting**
- Create: `apps/web/src/server/aiModel.ts`, `app/api/admin/settings/route.ts`,
  `apps/web/src/ui/admin/SettingsPanel.tsx`, `apps/web/drizzle/0006_*.sql` (generated),
  tests alongside.
- Modify: `apps/web/src/server/db/schema.ts` (app_settings), `repo/types.ts`,
  `repo/memory.ts`, `repo/postgres.ts`, `app/api/generate/section/route.ts`,
  `app/admin/page.tsx`, `src/ui/admin/AdminDashboard.tsx`.

**Slice 1 — add/delete sections**
- Modify: `apps/web/src/state/mutations.ts`, `src/state/proposalStore.ts`,
  `src/ui/Outline.tsx`; tests alongside.

**Slice 2 — preset themes read-only / fork**
- Modify: `packages/shared/src/types/document.ts`,
  `packages/shared/src/schema/document.schema.ts`,
  `packages/shared/src/validation/validateDocument.ts`,
  `apps/web/src/state/proposalStore.ts`, `src/ui/Inspector.tsx`,
  `app/print/[id]/page.tsx`; tests alongside.

**Slice 4 — AI workspace**
- Create: `apps/web/src/server/generateField.ts`,
  `app/api/generate/field/route.ts`; new shared builders + prompts; tests alongside.
- Modify: `packages/shared/src/types/document.ts` (brief),
  `packages/shared/src/types/section.ts` (helpers/exports as needed),
  `packages/shared/src/generation/generationSchema.ts` (new builders),
  `packages/shared/src/index.ts` (exports), `apps/web/src/server/prompts.ts`,
  `apps/web/src/server/generateSection.ts`, `app/api/generate/section/route.ts`,
  `apps/web/src/client/generate.ts`, `src/state/proposalStore.ts`,
  `src/ui/Inspector.tsx` (+ fold in `CopyFields`).

**Slice 3 — paged model**
- Create: `apps/web/src/render/paged.css`; tests alongside.
- Modify: `packages/shared/src/types/section.ts` (pageBreakBefore),
  `packages/shared/src/schema/section.schema.ts`,
  `packages/shared` page constant + export, `apps/web/src/render/DocumentRenderer.tsx`,
  `app/print/[id]/page.tsx`, `src/state/proposalStore.ts`, `src/ui/Inspector.tsx`
  (page-break toggle).

## Cross-cutting constraints

- TypeScript strict; extensionless imports (`moduleResolution: "bundler"`).
- TDD, hermetic tests: in-memory repo + `setRepoForTests`/`setOwnerResolverForTests`,
  mocked `createMessage`/`fetch`, `next/navigation` mock for client components.
- Commands at **repo root**: single test `npx vitest run <path>`, full suite
  `npm test`, typecheck `npm run typecheck`, build `npm run build -w @proposal/web`,
  migration `npm run db:generate -w @proposal/web`.
- Three-layer invariant: the AI generates schema-conformant CONTENT only; no
  styling/markup in content. Theme = CSS variables. Generic fallback always renders.
- New content fields (`brief`, `theme`, `pageBreakBefore`) are **additive and
  optional** so existing stored proposals keep validating.

## Out of scope

- Section reorder/drag-and-drop (slice 1).
- Per-field model overrides; non-admin model choice (slice 5).
- New `image` FieldType (slice 4 — handled by the manual fallback if added later).
- True on-screen measured pagination of auto-split content (slice 3 — guides only;
  the PDF is the source of truth for auto-splits).
- Multi-theme libraries / user-saved theme presets beyond the per-proposal fork
  (slice 2).
