# Brand-Aligned Proposal Generator — Technical Specification

**Version:** 3.0
**Status:** Build-ready draft
**Last updated:** June 2026

---

## 1. Summary

A web application that generates client proposals in your company's brand, combining AI-authored copy with a live, editable React-rendered document. The user provides a brief; the system drafts structured proposal content via the Claude API; the content flows into themed React components that render the proposal in real time. The user can tweak copy, regenerate sections, paste in data, swap layouts, and adjust design tokens, then export a print-quality PDF.

The core design principle is a strict separation between three independent layers:

- **Content** — structured JSON (sections, copy, datasets). The "what it says."
- **Structure** — templates, which are ordered lists of section slots. The "what's in it and in what order."
- **Presentation** — React components (layout) plus theme tokens (style). The "how it looks."

The AI only ever produces content that conforms to a fixed schema. It never emits layout, styling, or markup. This keeps generation reliable, makes the live editor predictable, and lets brand themes and layouts evolve independently of the copy. The same separation means a copy edit can never break a layout, and a re-theme can never corrupt content.

> **Changes in v3.0.** Folds in four decisions taken after v2.0: the generic fallback renderer (§5.4), the comparison-matrix section type (§6.6), field-level lock states for reusable templates (§7), and sanctioned forks modelled as typed slots (§7.3). Adds concrete TypeScript types and JSON Schema (§14) so the content contract is explicit rather than described. The remaining build-time unknowns (Claude API surface, PDF pipeline specifics) are called out in §15.

---

## 2. Goals and non-goals

**Goals**

- Generate complete, coherent proposal copy from a short brief.
- Render proposals using branded React components with real-time edits.
- Allow per-section regeneration and manual copy editing.
- Let users enter tabular data by pasting from Excel, uploading a file, typing into a grid, or (optionally) AI draft.
- Present a dataset as a table or as a choice of chart types, Excel-style — entered once, visualised multiple ways.
- Support side-by-side option comparison (e.g. PPA vs Capex vs Lease) as a dynamic, dimension-driven matrix.
- Let users adjust design tokens (colours, fonts, spacing) and see changes instantly.
- Offer designed, discrete layout variants per section type, switchable without touching content.
- Support locked, reusable templates where only sanctioned fields/choices change per proposal.
- Provide a live code editor for authoring themes and templates as JSON that compiles in real time.
- Enforce per-section limits (word/character for text; rows/columns/series for data) at generation, edit, and export.
- Produce a faithful, print-quality PDF export.
- Persist proposals, templates, and brand themes.

**Non-goals (v1)**

- Free-form drag-and-drop layout design (Canva-style). Layout is component- and variant-driven.
- In-browser authoring of arbitrary React/JSX components by end users (security and maintenance risk — see §8).
- Multi-user real-time collaborative editing (single-editor with autosave in v1).
- E-signature / contract execution (export and hand off instead).

---

## 3. Architecture overview

A three-tier app with the AI provider as an external service. The browser never holds the API key; all model calls are proxied through the backend.

```
┌──────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                       │
│                                                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Brief/form  │  │ Live editor  │  │ Inspector:      │   │
│  │             │  │ (3-pane)     │  │ copy · data grid│   │
│  │             │  │              │  │ variant · theme │   │
│  │             │  │              │  │ · code editor   │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                │                   │            │
│         ▼                ▼                   ▼            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Proposal doc (JSON) · Theme tokens · Template       │  │
│  └──────────────────┬─────────────────┬─────────────────┘ │
│                     ▼                 ▼                    │
│      ┌──────────────────────┐  ┌──────────────────┐       │
│      │ Component registry:  │  │ PDF print route  │       │
│      │  (type, variant) →   │  │ (same components)│       │
│      │  component; fallback │  └──────────────────┘       │
│      │  + charting library  │                             │
│      └──────────────────────┘                             │
└────────────┬──────────────────────────────┬───────────────┘
             │ REST / SSE                    │
             ▼                               ▼
┌────────────────────────────┐   ┌────────────────────────┐
│  Backend (Node/TS)         │   │  PDF service           │
│  - Auth                    │   │  (headless Chromium)   │
│  - Claude proxy + prompts  │   └────────────────────────┘
│  - Schema validation       │
│  - Data import parsing     │
│  - Persistence layer       │
└────────────┬───────────────┘
             ▼
   ┌──────────────────┐     ┌──────────────────┐
   │  Claude API      │     │  Postgres + blob │
   │ (Messages,       │     │  storage         │
   │  Structured out) │     └──────────────────┘
   └──────────────────┘
```

### Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + TypeScript, Vite | Component-driven rendering is the central requirement. |
| State | Zustand or Redux Toolkit | Single source of truth for proposal JSON + theme + template. |
| Styling | CSS variables driven by a theme object | Theme tokens map to CSS custom properties for instant re-theming with no content re-render. |
| Charts | Recharts, Visx, or Chart.js, wrapped in token-aware components | Don't hand-roll axes/scales; hide the library behind a component that reads theme tokens. |
| Code editor | Monaco (or CodeMirror) + Ajv | Schema-aware autocomplete and inline validation for theme/template JSON. |
| Backend | Node.js + TypeScript (Fastify or Express) | Shares types/schema with frontend; Claude proxy; parses data imports. |
| AI | Anthropic Claude API (Messages + Structured Outputs) | Schema-guaranteed JSON for reliable section generation. |
| PDF | Headless Chromium (Puppeteer/Playwright) rendering the same React route | Pixel-faithful export including charts, web fonts, gradients, absolute positioning. |
| Persistence | Postgres (JSONB) + object storage (logos, exports) | Relational data with binary assets in blob storage. |

---

## 4. The three-layer model

This is the most important architectural decision and everything else follows from it.

### 4.1 Content — the proposal document

The AI (or the user) produces **content only**: a structured `ProposalDocument` of sections. Each section has a `type`, an optional chosen `variant`, and a `data` object. Content never contains HTML, CSS, React, colours, or fonts. (Concrete types in §14.)

### 4.2 Structure — templates

A **template** is an ordered list of section **slots** plus defaults and locks. It carries no field definitions, no copy, and no styling. Selecting a template sets the document's structure and the default variant per section; what the user may then change is governed by each slot's lock state (§7).

### 4.3 Presentation — components and theme tokens

Presentation splits into two distinct things that are easy to conflate:

**Components decide layout.** Each section type resolves to a React component (or, for types with variants, one of several). The component owns structural design — where the heading sits, whether pricing is a table or cards, how a chart is laid out. Layout is hand-built design work, authored in code.

**Theme tokens decide style.** Components never hardcode a colour or font; they read CSS variables that the theme populates. Changing a token re-skins the entire document instantly with no content re-render, because many elements point at the same variable.

### 4.4 How the layers resolve at render time

```
template  →  ordered SLOTS; each names a type (or a choice of types) + default variant + lock
   │
section instance (content)  →  holds type, chosen variant, and data
   │
component registry  →  (type, variant) → React component   |   else → generic fallback
   │
component  →  reads THEME TOKENS for all colour / type / spacing
   │
rendered, on-brand section  (identical in preview and PDF export)
```

---

## 5. Schemas, section types, variants, and the fallback

### 5.1 Schema is attached to the section TYPE, not the slide

There is one schema per section type, held in a central registry. A template does not define schemas; its slots reference types. Two templates that both include a pricing section point at the **same** pricing schema — rules are reused, never duplicated, so they can't drift. The schema is the single contract the AI generates against, the editor builds inputs from, and the export gate validates against.

### 5.2 Per-template overrides for the exceptions

When the same type needs to behave slightly differently in one template (e.g. a tighter headline limit on a one-pager, or a locked field), the template supplies a thin patch over the base schema rather than owning a bespoke schema. The base schema remains the single source of truth; the override is visible and local.

### 5.3 Variants — designed, discrete layout choices

A variant is an alternative layout component for the same section type and the same data. Switching a variant changes only `section.variant` (a string); the renderer looks it up in the component registry and swaps the component. Content and theme are untouched.

Adding a new layout is fully additive: write a `{ data, theme }` component, register it under a key, add the key to the schema's `variants`. It immediately appears in the variant switcher for every section of that type — no existing component, theme, or document changes.

Each variant declares its sane content range (e.g. cards look best with 2–4 items, a table handles 12+, a pie caps at ~6 slices) so the UI can warn or suggest a better variant when the data exceeds it.

### 5.4 The generic fallback renderer

A schema can exist before any designed component does. To guarantee that **every section always renders**, the system ships one schema-driven fallback component that walks a section's fields generically — headings as headings, paragraphs as paragraphs, datasets as a plain table — styled with theme tokens but with no bespoke art direction.

Resolution rule: the registry is consulted for `(type, variant)`; if no component is registered for the type, the fallback renders it. Fallback-rendered sections are flagged in the builder and editor as **unstyled** so they're visibly a starting point, not a finished layout. This makes schema creation genuinely self-service — defining a type's fields yields something on the page immediately — while polished layouts remain a deliberate developer-side act layered on later.

**Graceful degradation.** Components read fields defensively; if a schema changes underneath a component (a field is removed or renamed), the component must degrade rather than crash. The registry records which schema version each variant was authored against, and a mismatch warns rather than breaks.

---

## 6. Tables, charts, data entry, and comparisons

Tables and charts are structured data, not prose, and are handled differently from text in three respects: how data enters, how it renders, and how it is constrained.

### 6.1 Data in — paste, import, type, or AI

A data section accepts data from any of: **paste from Excel/Sheets** (clipboard delivers tab-separated text, parsed into typed columns and rows); **file upload** (`.xlsx` / `.csv`); **editable grid** (paste-aware, typed columns, add/remove rows); or **AI draft** (the exception, not the default). All paths converge on one canonical, normalized dataset stored in `section.data`. Numbers the user already has should come from the user; the AI is for prose and structure.

### 6.2 Data out — table and charts are views of one dataset

Like Excel, the section owns the dataset once, and "table," "bar," "line," "pie" are all **variants** rendering that same data. Switching from table to chart never touches the data. The same dataset can appear as a table in one place and a chart in another with no re-entry.

### 6.3 Column mapping

A chart needs to know which columns mean what (Excel's "select X axis / series" step). The inspector surfaces a small mapping control — e.g. category column = `item`, value column = `price` — so one dataset can be charted different ways. Sensible defaults (first text column = categories, first numeric column = values) keep this invisible most of the time.

### 6.4 Rendering

Tables are ordinary layout components: map rows to DOM, read tokens for colour and type. Charts use a charting library (Recharts/Visx/Chart.js) wrapped in a token-aware component that pulls `theme.colors.primary`/`accent` for series and `var(--f-body)` for labels. The library is an implementation detail behind a component that speaks tokens. When the AI touches charts it produces only data plus minimal semantic intent (`chartType` from a fixed enum, axis labels) — never the visual.

### 6.5 Constraints are dimensional

Text overflows by word/character count; data overflows by **rows, columns, or series**. Data sections carry limits like `maxRows`, `maxColumns`, `maxSeries`, `maxCategories`, and the export gate checks those. Variants declare their sane ranges so a layout that can't fit the data warns the user or suggests a better one.

### 6.6 Side-by-side comparison — the options × metrics matrix

A comparison (PPA vs Capex vs Lease) is **its own section type** (`commercial_comparison`), not a fork of a single-model pricing type, because the whole point is to show options *together*. It is modelled as a matrix with two independent axes:

- **Columns = options** (Capex, PPA, Lease…). Adding an option adds a column.
- **Rows = metrics** (upfront cost, unit rate, term, payback…). Adding a metric adds a row.

Each cell is the value of one metric for one option. The component maps over both axes, so it is dynamic in N: a third option like Lease slots in as a new column with no code change. The shape:

```jsonc
{
  "metrics": ["Upfront cost", "Unit rate", "Term", "Payback"],
  "options": [
    { "name": "Capex", "values": { "Upfront cost": "£280k", "Unit rate": "—", "Term": "—", "Payback": "6.2 yrs" } },
    { "name": "PPA",   "values": { "Upfront cost": "£0", "Unit rate": "8.4p/kWh", "Term": "15 yrs", "Payback": "—" } },
    { "name": "Lease", "values": { "Upfront cost": "£0", "Unit rate": "—", "Term": "7 yrs", "Payback": "—" } }
  ]
}
```

**Structured matrix, not a freeform canvas.** Keeping this structured (rather than an embedded blank spreadsheet) is what guarantees the comparison stays aligned across options, on-brand via tokens, enforceable via limits, and faithful on export — the properties that justify the tool over plain Excel. Flexibility lives in the user controlling the rows and columns (and a cell may hold a value *or* a short note), not in abandoning structure. Because every option declares the same metric list, values line up across columns automatically.

**Not-applicable cells** (Capex has no unit rate; PPA has no upfront cost) get an explicit muted treatment (a dash) so gaps read as intentional. The column-count limit is real: two or three options compare cleanly, four is the practical portrait-page ceiling; beyond that the variant warns or the layout switches.

### 6.7 Export note

Because charts and matrices render as real DOM/SVG reading theme tokens, the headless-Chromium export captures them crisply and on-brand automatically. This is a primary reason to choose the Chromium export path. A `@react-pdf/renderer` fallback cannot run a web charting library and would require pre-rendering each chart to SVG/PNG.

---

## 7. Reusable, locked templates

Some templates (e.g. a **Prelim Proposal**) are meant to be reused every time with only the copy changing. "What can change" is an explicit, declared property per slot — not a convention users are trusted to honour. This reuses the override mechanism (§5.2): the template pins structure and theme and carries field-level locks layered over the base schemas.

### 7.1 Lock layers

- **Structure locked.** The template marks its slot order and variants read-only; the editor hides add/remove/reorder and variant pickers for proposals on this template.
- **Theme pinned.** The template references a fixed theme ID; the theme controls are read-only for these proposals, so nothing is recoloured off-brand.
- **Field-level locks.** Each field is marked editable or locked. The editor renders locked fields as non-editable text; the export gate refuses any document where a locked field was changed.

### 7.2 Two kinds of locked field

- **Fixed** — identical in every proposal (legal footer, standard methodology paragraph). Stored once on the template, not copied into each proposal, rendered from the template.
- **Editable-but-required** — per-proposal copy that must be filled (client name, project summary). These are the only inputs the user touches.

Split this way, a Prelim template is "a fixed frame plus a short list of blanks to fill in" — a tiny, explicit editable surface.

### 7.3 Sanctioned forks as typed slots

Sometimes a locked template still needs a legitimate, bounded choice — e.g. **PPA vs Capex** commercial models. This is not loosening the lock; it is a declared choice on the slot. A slot is therefore one of:

- a **fixed type** (one type, the normal case), or
- a **choice slot** — an allowlist of types with a default. The user toggles between exactly those; nothing else may be swapped in, and the section can't be added or removed.

PPA and Capex are modelled as **distinct types behind one choice slot**, not two variants of one type, because their underlying data differs (PPA has a unit rate, term, escalator; Capex has upfront cost, depreciation, payback). The rule of thumb: if two options need **different fields**, they are distinct **types** (typed slot); if they share the **same data** and only the presentation differs, they are **variants**.

Inheritance: lock and choice config live on the **template**; new proposals inherit via a living link, so updating boilerplate or theme once propagates to every proposal on the template. A version is snapshotted at export time for the record. Keep forks few and named — every sanctioned choice is a way two proposals on one template can diverge; a template that is mostly open choices has quietly become a freeform editor.

---

## 8. The live code editor

The inspector includes a code editor for authoring **themes and templates** as JSON, compiling in real time.

**Pipeline.** Editor holds JSON text → on change (debounced ~300ms) `JSON.parse` → validate against the JSON Schema (Ajv) → on success swap into React state → preview re-renders instantly. Theme changes need no content re-render because they resolve to CSS variables, so they are effectively free.

**Editor.** Monaco (powers VS Code) or CodeMirror, fed the JSON Schema so users get schema-aware autocomplete and inline error squiggles.

**Critical guardrail.** The live editor edits theme and template JSON — **not arbitrary React/JSX.** Running user-authored components in the browser is a security and stability problem. Component/layout authoring is a developer-side activity: build a component, register it as a variant, expose it as a discrete choice. If genuinely needed later, custom component authoring belongs in a sandboxed iframe with a vetted component API. For the large majority of "tweak the design" needs, tokens plus template structure plus variant selection are sufficient.

---

## 9. Enforcing limits

Limits are declared once in the section schema and drive three enforcement points:

1. **At generation** — limits are passed into the Claude prompt and encoded in the Structured Output JSON schema, so the model is constrained toward compliance. It won't always hit it exactly, which is why the next two exist.
2. **At edit time** — live counters and meters in the inspector validate against the same schema as the user types or as AI copy lands (green → amber → red for text; row/series counts for data).
3. **At export time** — a hard gate. Before PDF render, the document is validated against the full schema; any section over limit (text or dimensional), any changed locked field, or any unfilled required field blocks export with a pointer to the offending field.

Because the AI only ever produces schema-conformant content and never touches layout, "does this fit the design" collapses into "does this pass the schema" — a single testable rule.

---

## 10. APIs

### 10.1 Anthropic Claude API (external)

Use the **Messages API** with **Structured Outputs** so the model is constrained to your schema, guaranteeing valid JSON and removing brittle parsing.

- **Endpoint:** `POST https://api.anthropic.com/v1/messages`
- **Model:** a current Claude model (Sonnet for routine generation cost/latency; Opus for higher-quality first drafts).
- **Structured outputs:** constrain output to the per-section JSON Schema; constrain `chartType` and similar to enums.
- **Streaming:** stream responses (SSE) so copy appears progressively.

> **Confirm at build time.** The exact structured-output request shape and headers evolve; verify the current API surface against Anthropic's docs before wiring this, rather than trusting a snapshot (§15).

Backend proxy endpoints: `POST /api/generate/proposal` (full draft), `POST /api/generate/section` (one section), `POST /api/refine/section` (tweak existing copy). The backend owns the system prompt and brand-voice guidelines, validates model output against the schema before returning, and never exposes the API key to the client. Generation results must merge into existing content without clobbering manual edits — regeneration targets a single section and replaces only that section's `data`.

### 10.2 Application REST API

| Method | Route | Purpose |
|---|---|---|
| `GET/POST` | `/api/proposals` | List / create proposals. |
| `GET/PUT/DELETE` | `/api/proposals/:id` | Read / autosave / delete. |
| `GET/POST/PUT` | `/api/themes` | Manage brand themes. |
| `GET/POST/PUT` | `/api/templates` | Manage templates (slots, default variants, locks, overrides). |
| `POST` | `/api/data/import` | Parse pasted/uploaded `.xlsx`/`.csv` into a normalized dataset. |
| `POST` | `/api/proposals/:id/export` | Trigger PDF render; returns a download URL. |
| `POST` | `/api/assets` | Upload logos / images to blob storage. |

### 10.3 PDF export service

Headless Chromium loads a dedicated print route (`/print/:id`) rendering the **same** React components with print CSS (`@page`, page breaks, margins), then prints to PDF.

- **Why Chromium over `@react-pdf/renderer`:** reproduces the exact on-screen design — web fonts, charts, gradients, absolute positioning — so preview and export match and there is no second component set to maintain.
- **Reliability:** inline or self-host all fonts and images (external CDN fetches can hang the render); register fonts before first paint; size the service for memory; queue exports.
- **Fallback:** `@react-pdf/renderer` is viable only for simple, text-led proposals without charts, and accepts a flex-only layout engine with no `position: absolute`.

---

## 11. User experience and interface

**Three-pane editor.**

```
┌───────────────┬──────────────────────────────┬───────────────┐
│  Outline /    │     Live proposal preview     │  Inspector    │
│  sections     │     (themed React render,     │  (context-    │
│               │      WYSIWYG, page-accurate)  │   sensitive)  │
│  - Cover      │                               │               │
│  - Summary  ◀ │   [ branded document here ]   │ Copy fields / │
│  - Pricing    │                               │ data grid /   │
│   [table]     │                               │ variant picker│
│  - Compare    │                               │ / theme / code│
│  + Add section│                               │ ↻ Regenerate  │
└───────────────┴──────────────────────────────┴───────────────┘
   Top bar: brief · template picker · theme picker · Export PDF
```

- **Left — Outline:** sections with reorder/add/remove (when unlocked) and per-section status; shows the chosen variant as a tag; flags fallback/unstyled and locked sections.
- **Centre — Live preview:** the proposal exactly as it will export, paginated. Click any element to select its section; inline text editing for editable fields.
- **Right — Inspector (context-sensitive):** for a text section, editable fields with live limit meters and AI regenerate/refine; for a data section, the editable/paste-aware grid plus column-mapping and a variant picker; for a choice slot, the sanctioned-type toggle; document-level tabs for theme tokens and the live code editor.

**Builder (back-of-house).** A separate admin view manages section types (fields, limits, registered variants, fallback flag) and templates (slots, lock states, choice slots with allowlist + default, pinned theme). This is where schemas are created from the frontend and where the type→variant→component bindings are visible.

**Principles.** Generation is a starting point, never overwriting manual edits silently. Instant feedback for copy and theme changes (local state, no round-trip). Users assemble from known, branded section types and pick from designed variants rather than designing from scratch. Tokens are user-editable; layout is not.

---

## 12. Data model (persistence)

| Table | Key fields |
|---|---|
| `proposals` | `id`, `owner_id`, `title`, `client`, `theme_id`, `template_id`, `document` (JSONB), `created_at`, `updated_at` |
| `proposal_versions` | `id`, `proposal_id`, `document` (JSONB), `created_at` |
| `themes` | `id`, `owner_id`, `name`, `tokens` (JSONB) |
| `templates` | `id`, `name`, `theme_id`, `locked` (bool), `slots` (JSONB), `overrides` (JSONB) |
| `assets` | `id`, `owner_id`, `url`, `kind` (logo/image), `created_at` |

The document is stored as JSONB to keep the content/structure/presentation split intact. The section-type schemas and the component/variant registry live in **application code**, not the database, because they are versioned design assets.

---

## 13. Build sequence (suggested, sliced for Claude Code)

Each slice has a natural validation point; build and review one at a time rather than all at once.

1. **Schemas first.** Implement the types and JSON Schema in §14 as shared code. Validation point: a sample `ProposalDocument` passes schema validation.
2. **Component + variant registry + fallback.** Branded components per section type, all style from CSS variables, plus the generic fallback. Validation: a type with no component renders via fallback; a registered variant renders designed.
3. **Static renderer.** Render a hand-written sample document. Validation: preview, theming, and variant swapping work end-to-end with no backend.
4. **Theme controls + live code editor.** Token form and Monaco + Ajv editor. Validation: editing token/template JSON recompiles the preview live.
5. **Data grid + charts + comparison matrix.** Paste-aware grid, import endpoint, column mapping, table/chart variants, the options×metrics matrix with add-column. Validation: paste from Excel → table → chart with no re-entry; add a third option as a column.
6. **Claude proxy.** Endpoints with structured outputs + server-side schema validation; stream a full draft; per-section regenerate merges without clobbering edits.
7. **Locks + templates.** Slot lock states, choice slots, pinned theme, field-level locks, export gate enforcement.
8. **Persistence.** Autosave, themes, templates, versions, export snapshots.
9. **PDF export.** Headless Chromium print route; pagination, page breaks, font loading; verify charts and matrices render crisply.
10. **Polish.** Auth, asset uploads, error states, generation status, variant content-range warnings, unstyled/fallback flags.

---

## 14. Concrete schema & type definitions

These are the contract every layer binds to (AI generation, editor inputs, validation, export). Treat them as the source of truth; the prose above explains them.

### 14.1 TypeScript types

```ts
// ---- Theme ----
interface ThemeTokens {
  id: string;
  name: string;
  colors: { primary: string; accent: string; text: string;
            muted: string; surface: string; line: string };
  fonts: { heading: string; body: string };
  radius: number;        // px
  spacing: number;       // scale multiplier, 1.0 = base
  logoUrl?: string;
}

// ---- Section type schema (one per TYPE, in app code) ----
type FieldType = "text" | "paragraph" | "dataset" | "matrix" | "list";

interface FieldSchema {
  key: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  maxChars?: number;     // text
  maxWords?: number;     // paragraph
  maxRows?: number;      // dataset
  maxColumns?: number;   // dataset | matrix
  maxSeries?: number;    // dataset (charting)
}

interface SectionTypeSchema {
  type: string;                 // e.g. "pricing_capex"
  label: string;
  category: "text" | "data";
  fields: FieldSchema[];
  variants: string[];           // registered layout keys; [] → fallback only
  defaultVariant?: string;
  schemaVersion: number;        // for component/schema drift checks
}

// ---- Content: the proposal document ----
interface ProposalDocument {
  id: string;
  title: string;
  client: { name: string; contact?: string };
  themeId: string;
  templateId: string;
  sections: Section[];
}

interface Section {
  id: string;
  type: string;                 // references a SectionTypeSchema
  variant?: string;             // chosen layout; absent → defaultVariant or fallback
  data: Record<string, unknown>;// shape validated against the type's fields
  locked?: Record<string, boolean>; // per-field lock, merged from template
}

// ---- Canonical dataset (paste/import/grid → table/chart) ----
interface Dataset {
  columns: { key: string; label: string; type: "text" | "number" }[];
  rows: Record<string, string | number>[];
  mapping?: { categoryColumn?: string; valueColumns?: string[] };
  chartType?: "bar" | "line" | "pie" | "area";
}

// ---- Comparison matrix (options × metrics) ----
interface ComparisonMatrix {
  metrics: string[];
  options: { name: string; values: Record<string, string> }[]; // value or "—"
}

// ---- Template: structure + locks ----
type Slot =
  | { kind: "fixed"; type: string; variant?: string; lock: SlotLock }
  | { kind: "choice"; allowed: string[]; default: string; lock: "choice" };

type SlotLock = "open" | "fixed" | "editable-copy" | "editable-data";

interface Template {
  id: string;
  name: string;
  themeId: string;
  locked: boolean;              // structure read-only downstream
  slots: Slot[];
  overrides?: Record<string, Partial<Record<string, FieldSchema>>>;
  // overrides[type][fieldKey] patches the base schema for THIS template
}
```

### 14.2 JSON Schema — a section (used to constrain Claude output & validate)

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://proposal.studio/schemas/section.json",
  "type": "object",
  "required": ["id", "type", "data"],
  "properties": {
    "id": { "type": "string" },
    "type": { "type": "string" },
    "variant": { "type": "string" },
    "data": { "type": "object" }
  },
  "allOf": [
    {
      "if": { "properties": { "type": { "const": "executive_summary" } } },
      "then": {
        "properties": {
          "data": {
            "type": "object",
            "required": ["heading", "body"],
            "properties": {
              "heading": { "type": "string", "maxLength": 40 },
              "body":    { "type": "string" }      // word-limit enforced in app layer
            },
            "additionalProperties": false
          }
        }
      }
    },
    {
      "if": { "properties": { "type": { "const": "commercial_comparison" } } },
      "then": {
        "properties": {
          "data": {
            "type": "object",
            "required": ["metrics", "options"],
            "properties": {
              "metrics": { "type": "array", "items": { "type": "string" }, "maxItems": 8 },
              "options": {
                "type": "array", "maxItems": 4,
                "items": {
                  "type": "object",
                  "required": ["name", "values"],
                  "properties": {
                    "name":   { "type": "string", "maxLength": 24 },
                    "values": { "type": "object", "additionalProperties": { "type": "string" } }
                  }
                }
              }
            },
            "additionalProperties": false
          }
        }
      }
    }
  ]
}
```

> Word limits (`maxWords`) and dimensional cross-checks (every option's `values` keys match `metrics`) are enforced in the application validation layer, since JSON Schema can't count words or cross-reference array contents cleanly. The JSON Schema handles structure and character/array bounds; the app layer handles the rest. Both run at the export gate.

---

## 15. Build-readiness & open items

**Ready now.** Architecture, the three-layer model, registry + fallback, schemas-per-type, template slots with locks and forks, the comparison matrix, and the concrete contracts in §14. Scaffolding through to a statically-rendered, themeable, variant-swapping document (slices 1–5) can proceed directly.

**Confirm during build, in this order.**

1. **Claude API surface.** Verify the current structured-output request shape, headers, and streaming format against Anthropic's docs before slice 6. Validated against reality, not a snapshot.
2. **PDF pipeline specifics.** Pagination strategy, page-break rules across sections, font loading/registration, and the render service's deployment shape (container vs serverless) are the highest-effort unknowns; firm them up at slice 9 against a real render.
3. **Override semantics depth.** §14's `overrides` patches field schemas; if deeper per-template behaviour is needed later, extend this rather than introducing a parallel mechanism.

**Deliberately deferred (non-goals).** In-browser component authoring, real-time multi-user collaboration, e-signature.
