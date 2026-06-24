# In-Admin Section Layout Authoring (design)

> Let admins design the **visual layout** of each section type from `/admin`,
> WordPress/Gutenberg-style — composing a tree of brand-styled blocks — without
> ever executing user-authored code. Layouts are declarative JSON interpreted by
> a safe renderer; styling is theme-token-only.

## Goal

Today a section type's visual layout is a developer-authored React component
registered by `type:variant` ([componentRegistry.tsx](../../apps/web/src/registry/componentRegistry.tsx));
authored types fall back to the unstyled `GenericSection`. This feature gives
admins a **user-friendly, in-app way to author layouts** for any section type,
constrained to brand theme tokens, while preserving the project's hard
invariants (three-layer split; **no running user-authored JSX/code**).

## Decisions (settled in brainstorming)

1. **Authoring model:** a structured **block composer** (not a drag-and-drop
   canvas) with **nested containers** (`stack`, `columns`) — a Gutenberg-style
   block tree. Reorder via up/down within a parent. Drag-and-drop is deferred.
2. **Layouts are variants:** a section type may have **multiple named layouts**;
   each is a selectable **variant** in the editor Inspector, alongside code
   variants.
3. **Resolution precedence:** **authored layout (DB) → code component → generic
   fallback.** An authored layout can *add* a new variant or *override* a code
   one by reusing its variant name.
4. **Styling is token-only:** every style prop resolves to a theme CSS variable
   ([ThemeProvider](../../apps/web/src/theme/ThemeProvider.tsx)); no raw hex/px
   is representable. Brand consistency is structural.
5. **Security invariant kept:** the renderer is a `switch` over known block
   kinds — **no `eval`, no `dangerouslySetInnerHTML`, no user code**.
6. **Editor↔PDF parity:** the interpreter is an ordinary component, so `/print`
   renders authored layouts identically.

## A. Core model — the block tree (`packages/shared`)

A layout is a tree of blocks stored as JSON. New types in
`packages/shared/src/types/layout.ts`:

```ts
// Token vocabularies — the ONLY styling source.
export type TokenColor = "primary" | "accent" | "text" | "muted" | "surface" | "line"; // theme.colors keys
export type TokenFont = "heading" | "body";
export type SizeScale = "xs" | "sm" | "md" | "lg" | "xl";
export type SpaceScale = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type Align = "left" | "center" | "right";
export type Weight = "regular" | "medium" | "bold";

export interface BlockStyle {
  color?: TokenColor;       // → var(--c-<color>)
  background?: TokenColor;
  font?: TokenFont;         // → var(--f-<font>)
  size?: SizeScale;         // → font-size rem
  weight?: Weight;
  align?: Align;
  padding?: SpaceScale;     // → calc(px * var(--space))
}

export type LeafBlock =
  | { kind: "heading"; field: string; style?: BlockStyle }
  | { kind: "paragraph"; field: string; style?: BlockStyle }
  | { kind: "list"; field: string; style?: BlockStyle }
  | { kind: "keyValue"; fields: string[]; style?: BlockStyle }   // text fields → label:value rows
  | { kind: "table"; field: string; style?: BlockStyle }          // dataset field
  | { kind: "chart"; field: string; chart: "bar" | "line" | "pie" | "area"; style?: BlockStyle } // dataset
  | { kind: "matrix"; field: string; style?: BlockStyle }         // matrix field
  | { kind: "logo"; style?: BlockStyle }                          // theme.logoUrl
  | { kind: "divider"; style?: BlockStyle }
  | { kind: "callout"; text: string; style?: BlockStyle }         // STATIC text
  | { kind: "text"; text: string; style?: BlockStyle };           // STATIC label/caption

// A background turns any container into a cover/banner (see §I).
export type ImageRef = { assetUrl: string } | { field: string }; // fixed asset OR bound image field
export interface BlockBackground {
  image?: ImageRef;
  overlay?: { color: TokenColor; opacity: number }; // opacity 0..100; brand-token tint for legibility
  position?: "cover" | "contain";
  minHeight?: SizeScale | "page";                   // "page" → full document-format page (§J)
}

export type ContainerBlock =
  | { kind: "stack"; gap?: SpaceScale; style?: BlockStyle; background?: BlockBackground; children: Block[] }
  | { kind: "columns"; gap?: SpaceScale; widths?: number[]; style?: BlockStyle; background?: BlockBackground; columns: Block[][] };

export type Block = LeafBlock | ContainerBlock;

export interface SectionLayout {
  type: string;       // section-type key
  variant: string;    // design identity slug (e.g. "cover", "two_column")
  pageFormat: string; // the page format this layout is designed for (see §J), e.g. "widescreen_16_9"
  name: string;       // display label (e.g. "Cover")
  root: Block;        // normally a stack
  version: number;    // bumped on edits
}
```

A layout's identity is **(type, variant, pageFormat)** — so the same design
(`variant: "cover"`) can have a 16:9 version and an A4 version, each authored on a
canvas of the right size (§J).

**Concrete token mappings** (interpreter compiles these; theme stays the source):
`color`/`background` → `var(--c-<token>)`; `font` → `var(--f-<token>)`;
`radius` → `var(--radius)`. `size` → font-size rem: `xs .8 · sm .9 · md 1 · lg 1.35 · xl 1.9`.
`SpaceScale` (gap/padding) → `calc(<px> * var(--space))` with `none 0 · xs 4 · sm 8 · md 16 · lg 24 · xl 40`.
`weight` → `regular 400 · medium 550 · bold 700`.

**Field binding is kind-checked:** `heading`/`paragraph` → a `text`/`paragraph`
field; `list` → `list`; `table`/`chart` → `dataset`; `matrix` → `matrix`;
`keyValue` → all referenced fields are `text`/`paragraph`. `text`/`callout` are
static (author types the content); `logo`/`divider` bind nothing.

## B. Validation (`packages/shared`)

`validateLayout(layout, typeSchema): ValidationResult` in
`packages/shared/src/validation/validateLayout.ts`:

- root present; every node a known `kind`.
- field bindings reference an existing field **of a compatible kind** (above);
  static blocks carry non-empty `text`; `keyValue.fields` non-empty + all text.
- every `style` token is in-vocabulary; `chart.chart` ∈ the four kinds.
- `columns`: 2–4 columns; if `widths` present, length === columns and each > 0.
- max nesting depth 4 (guards pathological trees).
- Errors use JSON-pointer-ish paths (`/root/children/1/field`).

Enforced on save (route) **and** defensively in the renderer (unknown
kinds/props are skipped, never thrown).

## C. Rendering & resolution (`apps/web`)

- **`LayoutRenderer`** (`apps/web/src/render/LayoutRenderer.tsx`): pure
  `({ layout, data, theme }) → JSX`. Recursively maps each block kind to a small
  token-aware primitive; **data blocks reuse** the existing `DataTable`,
  `ChartView`, `ComparisonMatrix`. Token styles compile to inline CSS using the
  ThemeProvider variables (`--c-*`, `--f-*`, `--space`, `--radius`). A `switch`
  over kinds — no code execution, no raw HTML injection.
- **Active-layouts registry** (mirrors the section-type registry pattern):
  - shared store `packages/shared/src/registry/layouts.ts`:
    `setActiveLayouts(list)`, `getLayout(type, variant)`,
    `listLayoutVariants(type)`, `layoutsRevision()`.
  - server `apps/web/src/server/registry/activeLayouts.ts`:
    `getMergedLayouts()` / `refreshActiveLayouts()` / `invalidateActiveLayouts()`
    load DB rows and push into the shared store (used by `/print` + the server).
  - client: the store hydrates on App mount via `loadLayouts()`
    (GET `/api/section-layouts` → `setActiveLayouts`).
- **`resolveSection(section, { pageFormat })`** precedence: authored layout
  `getLayout(type, variant, pageFormat)` → code component (registry) →
  `GenericSection`. When an authored layout matches it returns a component that
  renders `<LayoutRenderer …/>` (`unstyled: false`). Format-aware (§J).
- **Selectable variants** for a type = code variants ∪ authored variants that
  have a layout **for the document's format**. Helper
  `availableVariants(type, pageFormat)` feeds the Inspector + Outline +
  New-section pickers.

## D. Storage & API (`apps/web`)

- New **`section_layouts`** table (migration `0007`, additive):
  ```ts
  sectionLayouts = pgTable("section_layouts", {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    variant: text("variant").notNull(),
    pageFormat: text("page_format").notNull(),   // §J — layout is designed for one format
    name: text("name").notNull(),
    layout: jsonb("layout").$type<SectionLayout>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  });
  // unique (type, variant, page_format)
  ```
  Layouts are **global** (Builder-managed, not owner-scoped), like section types.
- Repo (`Repository`, memory + postgres):
  ```ts
  listSectionLayouts(): Promise<SectionLayout[]>;
  upsertSectionLayout(row: { type; variant; pageFormat; name; layout: SectionLayout }): Promise<SectionLayout>;
  deleteSectionLayout(type: string, variant: string, pageFormat: string): Promise<boolean>;
  ```

| Route | Method | Body | Result |
|---|---|---|---|
| `/api/section-layouts` | `GET` | — | `200 { layouts }` (any authed — editor needs it) |
| `/api/section-layouts` | `POST` | `{ type, variant, pageFormat, name, layout }` | `201`; admin; 400 invalid (validateLayout against the type + known format) / 409 duplicate (type,variant,pageFormat) |
| `/api/section-layouts/[type]/[variant]/[format]` | `PUT` | `{ name, layout }` | `200`; admin; 400 invalid; 404 unknown |
| `/api/section-layouts/[type]/[variant]/[format]` | `DELETE` | — | `204`; admin; 404 unknown |

- Admin routes guard with `requireAdmin()`; GET with `requireOwner()`. Mutations
  `invalidateActiveLayouts()`.
- **No in-use freeze** (unlike schemas): a layout edit changes only rendering,
  never stored proposal *data*, so it can't cause schema drift. Deleting a
  layout that a section references as its variant → that section falls back to
  code/generic for that variant (acceptable; the editor still lists it as a
  missing variant). The validator that runs at export is unaffected.

## E. Authoring UI (`/admin`)

- **Entry:** each row in `SectionTypeList` gains a **Layouts** action → opens
  `SectionLayoutsView` for that type: a list of its authored layouts (name +
  variant slug) with **New / Edit / Delete**, plus a hint that code variants
  exist and can be overridden by matching the slug.
- **`LayoutEditor`** — the block composer:
  - **Palette** to add blocks (the kinds in §A).
  - **Block tree** with nesting (`stack`/`columns`), per-block **up/down/remove**,
    and a **field-binding** dropdown (the type's fields, kind-filtered).
  - **Selected-block inspector**: token-only style controls — Field, Font
    (Body/Heading), Size scale, **Color = theme swatches**, Align, Spacing; plus
    container `gap`, `columns` count (2–4), and `chart` kind where relevant.
  - **Live preview**: `LayoutRenderer` rendered with the default theme and
    **deterministic sample data** (`sampleDataForType(type)` — placeholder values
    per field kind). Invalid layouts show inline validation, Save disabled.
  - Save → POST/PUT; the variant slug is immutable on edit (like section types).
- Client modules: `apps/web/src/client/layouts.ts`
  (`fetchLayouts`, `createLayout`, `updateLayout`, `deleteLayout`).
- Store: `layouts` state + `loadLayouts()` (hydrates the shared registry, like
  `loadSectionTypes`).

## F. MVP scope (YAGNI)

**In v1:** the block palette + token style props above; nested
`stack`/`columns` (2–4); up/down reorder; field binding with kind checks; live
preview with sample data; create/edit/delete authored layouts; override-by-slug;
`/print` parity. **Deferred:** drag-and-drop canvas; conditional/visibility
rules; responsive per-breakpoint overrides; custom/plugin block kinds; reordering
across different parents by drag.

## G. File map

**Create (shared):** `types/layout.ts`, `validation/validateLayout.ts`,
`registry/layouts.ts` (+ exports in `index.ts`); tests alongside.
**Create (web server):** `server/registry/activeLayouts.ts`,
`app/api/section-layouts/route.ts`,
`app/api/section-layouts/[type]/[variant]/[format]/route.ts`,
`drizzle/0007_*.sql` (generated); tests alongside.
**Create (web client/UI):** `render/LayoutRenderer.tsx`,
`render/sampleData.ts` (`sampleDataForType`), `client/layouts.ts`,
`ui/admin/SectionLayoutsView.tsx`, `ui/admin/LayoutEditor.tsx`
(+ small block-row/inspector subcomponents); tests alongside.
**Modify:** `server/repo/types.ts` + `memory.ts` + `postgres.ts` (layout repo
methods), `server/db/schema.ts` (table), `registry/componentRegistry.tsx`
(`resolveSection` precedence + `availableVariants`), `state/proposalStore.ts`
(`layouts` + `loadLayouts`), `ui/Inspector.tsx` (variant picker uses
`availableVariants`; **`image` field → manual upload**) + `ui/Outline.tsx`
(variant picker), `ui/admin/SectionTypeList.tsx` (Layouts action),
`app/admin/page.tsx` (load layouts).
**Modify (the `image` content FieldType, §I):** `packages/shared/src/types/section.ts`,
`schema/section.schema.ts`, `template/emptyData.ts`, `generation/generationSchema.ts`,
`validation/validateSectionTypeDefinition.ts`, `apps/web/src/ui/admin/SectionTypeEditor.tsx`.
**Modify (PDF backgrounds, §I):** `app/api/proposals/[id]/export/route.ts`
(`printBackground: true`) + the print CSS (`print-color-adjust: exact`).
**Modify (page formats & modes, §J):** `packages/shared/src/render/page.ts`
(`PAGE_FORMATS`/`getPageFormat`, keep `PAGE`), `packages/shared/src/types/document.ts`
(`pageFormat`/`pageMode`) + `schema/document.schema.ts`,
`apps/web/src/render/DocumentRenderer.tsx` + `src/print/PrintDocument.tsx` +
`app/print/[id]/page.tsx` + `app/api/proposals/[id]/export/route.ts` (page size
from format + slides one-per-page), `apps/web/src/render/paged.css`
(format-driven `@page`), `state/proposalStore.ts` (set pageFormat/pageMode),
`ui/Inspector.tsx` (Document disclosure: format + mode controls).

## H. Testing (TDD, hermetic)

- **shared:** `validateLayout` (valid trees; bad kinds; binding kind mismatches;
  off-vocabulary tokens; columns 2–4 + widths; depth limit; static-text rules).
  Layouts registry (set/get/list variants, revision).
- **renderer:** each block kind renders; data blocks reuse the real components;
  token styles map to the right CSS variables; unknown kinds/props ignored
  (never throws); columns/stack nest.
- **resolution:** `resolveSection` precedence (authored > code > generic);
  `availableVariants` = code ∪ authored.
- **repo + routes:** CRUD owner/admin-gated; POST validates against the type;
  409 duplicate; 404 unknown; merge + `invalidateActiveLayouts`.
- **UI:** composer add/bind/nest/reorder/remove; token style controls; live
  preview reflects edits; Save disabled while invalid; authored variant appears
  in the Inspector picker. **print:** a section with an authored layout renders
  via `LayoutRenderer` in `/print`.
- **page formats & modes (§J):** `PAGE_FORMATS`/`getPageFormat` (known ids +
  fallback); `document.pageFormat`/`pageMode` additive + validate; `DocumentRenderer`
  emits the format's page size and, in `slides` mode, one page per section;
  `resolveSection(section, {pageFormat})` picks the format's layout;
  `availableVariants(type, format)` only offers layouts for that format; print
  page size follows the format. Old proposals (no settings) → A4 report unchanged.
- **backgrounds & image field (§I):** `validateLayout` background rules
  (image-field binding kind, overlay opacity 0–100, position, minHeight `"page"`);
  renderer renders background image + token overlay + `"page"` minHeight and
  degrades gracefully with no image; `fieldKind("image")="manual"` +
  `fieldToGenerationSchema(image)=null`; `validateSectionTypeDefinition` accepts
  `image`; `emptyDataForType` image → `""`; the editor field area renders a manual
  upload for image fields (no AI); the layout editor Background group toggles
  fixed-asset vs bound-field; export sends `printBackground: true`.

## I. Background images & overlays (cover pages)

A `background` on a container block (`stack`/`columns`) turns it into a
cover/banner — no new block kind. The image is an **asset**, not a token; the
**overlay stays token-driven** (brand colour + opacity) so legibility tinting
respects the brand.

- **Image source = both** (settled): `ImageRef` is either `{ assetUrl }` (a fixed
  asset chosen in the layout editor) or `{ field }` (bound to a per-proposal
  **image content field**). Uploads reuse the existing **`POST /api/assets`**
  (Vercel Blob → `{ url }`), same route the logo uses.
- **New `image` content FieldType** (the only content-schema change in this
  spec): so each proposal can supply its own cover image.
  - `packages/shared/src/types/section.ts`: add `"image"` to `FieldType`.
  - `schema/section.schema.ts`: an `image` field is a `{ type: "string" }` (URL).
  - `template/emptyData.ts`: `image` → `""`.
  - `generation/generationSchema.ts`: `fieldKind("image") = "manual"`;
    `fieldToGenerationSchema` returns `null` (never AI-generated).
  - `validation/validateSectionTypeDefinition.ts`: allow `"image"` field type.
  - **Builder section-type editor**: `image` selectable as a field type (no limit
    inputs).
  - **Editor field area** (the AI-workspace inspector): an `image` field renders a
    **manual upload** control (file → `/api/assets` → store the URL in
    `data[field]`), never AI — consistent with the existing manual-field handling.
- **Renderer** (`LayoutRenderer`): a container with `background` renders a
  positioned wrapper — `background-image: url(<resolved>)` (`assetUrl` directly,
  or `data[field]` for a bound field), `background-size: <position>`, optional
  `minHeight` (`"page"` → the A4 content height via the `PAGE` geometry), an
  **overlay layer** (`background: var(--c-<overlay.color>)` at `overlay.opacity%`)
  between image and children, and the children rendered above. Missing image →
  no background (graceful), never throws.
- **Validation** (`validateLayout`): `background.image` as `{ field }` must
  reference an existing **`image`** field; `overlay.color` a valid token;
  `overlay.opacity` an integer 0–100; `position` ∈ {cover, contain}; `minHeight`
  a valid `SizeScale` or `"page"`.
- **Layout editor**: a container block's inspector gains a **Background** group —
  image source toggle (**Fixed asset** [upload/preview via `/api/assets`] |
  **Bind to image field** [dropdown of the type's image fields]), an **overlay**
  colour swatch + opacity slider, position, and minHeight (incl. **Full page**).
  Live preview shows the cover with sample image + overlay.
- **PDF**: the export route must render backgrounds — set
  **`printBackground: true`** on `page.pdf(...)` and `print-color-adjust: exact`
  in the print CSS. (Touches the PDF surface — re-verify the puppeteer-core
  `page.pdf` options against live docs at build, per the existing flag.)
- **Sample data**: `sampleDataForType` supplies a placeholder image URL for
  `image` fields so the editor preview shows a representative cover.

## J. Page formats, modes & a page-aware editor

Today the paged model is fixed A4 portrait (`PAGE` + `@page A4`, from the
editor-fix-batch). This generalises it so documents can be **reports or slide
decks** at real aspect ratios, and the layout editor designs within the **actual
page bounds**.

**Page formats** — a small registry in `packages/shared/src/render/page.ts`
(generalising the existing `PAGE`):

```ts
export interface PageFormat { id: string; label: string; widthMm: number; heightMm: number; }
export const PAGE_FORMATS: PageFormat[] = [
  { id: "a4_portrait",     label: "A4 portrait",  widthMm: 210,    heightMm: 297 },
  { id: "a4_landscape",    label: "A4 landscape", widthMm: 297,    heightMm: 210 },
  { id: "letter_portrait", label: "Letter",       widthMm: 215.9,  heightMm: 279.4 },
  { id: "widescreen_16_9", label: "16:9 slide",   widthMm: 338.67, heightMm: 190.5 },  // 13.333×7.5in
  { id: "standard_4_3",    label: "4:3 slide",    widthMm: 254,    heightMm: 190.5 },  // 10×7.5in
];
export const DEFAULT_PAGE_FORMAT = "a4_portrait";
export function getPageFormat(id: string): PageFormat; // falls back to default
```
`PAGE` stays exported as the a4_portrait entry for backward-compat.

**Document settings** (additive, optional — on `ProposalDocument`):
- `pageFormat?: string` (a `PAGE_FORMATS` id; default `a4_portrait`).
- `pageMode?: "report" | "slides"` (default `report`).
Chosen in the editor's **Document** disclosure (and a template may seed defaults).
Old proposals lack these → default to A4 report (today's behaviour, unchanged).

**Rendering by mode:**
- **Report:** sections flow; `@page { size: <fmt> }` + `preferCSSPageSize`; manual
  `section.pageBreakBefore` still applies. Works for A4/Letter/landscape.
- **Slides:** **one section = one page** — each section renders in a page-sized
  frame (the format's exact dimensions) with a forced page break between sections;
  content is designed to fit (it's the author's job, like slides).
- The print route sets the PDF page size from the format (and `printBackground:
  true`, §I). `DocumentRenderer`/`PrintDocument` read `document.pageFormat` +
  `pageMode`.

**Layouts are format-targeted:** a layout's identity is **(type, variant,
pageFormat)** (§A). So `Cover` can exist as `widescreen_16_9` and `a4_portrait`,
each authored on a correctly-sized canvas.
- **Resolution** becomes format-aware: `resolveSection(section, { pageFormat })`
  → authored layout `getLayout(type, variant, pageFormat)` → code component →
  generic. (Code components are format-agnostic, effectively A4/report.)
- **`availableVariants(type, pageFormat)`** = code variants ∪ authored variants
  that have a layout **for that format** — so the Inspector only offers designs
  that fit the document's format.

**Page-aware editor:** the `LayoutEditor` canvas is sized to the layout's
`pageFormat` (e.g. a 16:9 box at the format's pixel size, scaled to fit), so you
design within the true page. Creating a layout asks for **format + variant +
name**; `background.minHeight: "page"` resolves to that format's height. The
`SectionLayoutsView` groups a type's layouts by format.

**Storage:** `section_layouts` adds a `page_format` column; unique key becomes
**(type, variant, page_format)** (§D).

## Build phases (for the implementation plan)

This spec is one coherent subsystem but large; build it as sequential phases,
each independently shippable and green:

1. **Page formats & modes** — `PAGE_FORMATS`, `document.pageFormat`/`pageMode`,
   format-aware `DocumentRenderer`/print/PDF size, slides one-per-page, editor
   Document control. (Foundation; useful on its own.)
2. **`image` field + asset reuse** — the `image` content FieldType end-to-end
   (§I), manual upload in the editor field area.
3. **Declarative layout model** — block types, `validateLayout`, layouts
   registry, interpreter `LayoutRenderer` (incl. backgrounds/overlays §I),
   format-aware `resolveSection`/`availableVariants`. (No authoring UI yet;
   verified via tests + seeded rows.)
4. **Storage + API** — `section_layouts` table/migration, repo, CRUD routes,
   active-layouts hydration (client + print).
5. **Authoring UI** — `SectionLayoutsView` + page-aware `LayoutEditor` (palette,
   nested tree, token inspector, background controls, live preview), variant
   pickers use `availableVariants`.

## Cross-cutting constraints

- Three-layer invariant intact: layouts are still **presentation**; the AI never
  authors them; content schema is unchanged.
- **No code execution** — interpreter is a closed `switch`; token-only styling.
- Additive + optional: no change to existing proposals, schemas, or code
  variants; types without an authored layout behave exactly as today.
- TypeScript strict; extensionless imports; commands at repo root; migration
  `0007` additive; deploy applies the migration before the new code serves
  (same chain as prior slices).

## Out of scope

Drag-and-drop authoring; responsive/conditional logic; letting the AI generate
layouts; per-proposal one-off layout overrides (layouts are type-level variants);
importing/exporting layout JSON by hand (the editor is the authoring surface).
