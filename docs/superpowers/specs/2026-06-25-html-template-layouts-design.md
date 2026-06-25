# HTML/CSS Template Layouts — Design

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan
**Supersedes:** the declarative block-tree layout authoring path (§A/§C of the spec). The
block *renderer* survives as a read-only legacy path; block *authoring* is removed.

## Problem

The Builder's declarative block-tree layout editor is too constrained for real design
work. Authors cannot position elements precisely, overlay text on imagery beyond a single
container background, or set per-field typography beyond a coarse `xs–xl` token scale. The
practical result: a "cover page" cannot be made to look like a cover page, and multi-section
documents read as one continuous flow with no visual page/slide separation.

Two narrower bugs found while diagnosing this are already fixed and are **prerequisites**,
not part of this work:

- Admin Builder never hydrated the client section-type registry, so authoring a layout for
  an authored type showed empty field bindings and a disabled Save. (merged `9e87023`)
- A section with no chosen variant and a type with no `defaultVariant` never resolved its
  authored layout. Fixed by defaulting to the first authored layout for the page format.
  (branch `fix/variant-autoresolve`, commit `0d9aaf9` — **merge before implementing**)

## Goals

- Authors compose **arbitrary HTML + CSS** per section layout: absolute positioning,
  overlays, full typographic control, full-bleed imagery.
- Layouts are **brand-themed** (read the existing CSS-variable tokens) and **data-bound**
  to the section's schema fields, so one layout serves every proposal of that type.
- **No arbitrary code execution.** Templates are data + markup only; rendering is
  interpolate → sanitize → style-scope, never `eval`.
- **Editor preview is byte-identical to the PDF** (same renderer, same sanitizer).
- Clear **visual page/slide separation** in the editor, in both report and slides modes.

## Non-goals

- User/admin-authored **JavaScript or React** (explicitly rejected: server-side execution
  would expose `DATABASE_URL`/`ANTHROPIC_API_KEY`/`AUTH_SECRET`). Developer-coded React
  section components remain a separate, code-only layer.
- AI authoring layout. The AI continues to emit schema-conformant **content** only.
- Migrating existing block-tree layouts to templates (they keep rendering via the legacy
  path; conversion is a possible later chore, not in scope).

## Constraints / context

- **Single-tenant**: the trusted owner authors templates. This lowers, but does not remove,
  risk — `/print` and previews render server-side with secrets in scope, so executed JS is
  still unacceptable; sanitized static HTML/CSS is the safe surface.
- Existing assets to reuse: **Monaco** (`@monaco-editor/react`, already a dependency) for the
  editor; theme tokens already exposed as CSS variables (`--c-primary`, `--c-accent`,
  `--c-text`, `--c-muted`, `--c-surface`, `--c-line`, `--f-heading`, `--f-body`) by
  `ThemeProvider`/`themeToCssVars`.
- **One new dependency, approved:** `sanitize-html` (server-capable HTML sanitizer). We do
  not hand-roll HTML sanitization.
- Honors the project invariants except the one the owner explicitly chose to revise:
  layout authoring moves in-app. The "safe interpreter, no code execution" invariant is
  **preserved** — templates are interpreted/sanitized data, not executed code.

## Architecture

### 1. Data model

`SectionLayout` keeps its identity tuple **(type, variant, pageFormat)** and `name`/`version`.
Its body becomes a template instead of a block tree:

```ts
interface SectionLayout {
  type: string;
  variant: string;
  pageFormat: string;
  name: string;
  version: number;
  // New (template layouts):
  template?: string; // authored HTML with {{…}} placeholders
  css?: string;      // authored CSS, scoped to this layout at render time
  // Legacy (block layouts) — read-only, no longer authored:
  root?: Block;
}
```

Persisted in the existing `section_layouts.layout` JSONB column — **no DB migration**. A row
is a template layout if `template` is present, else a legacy block layout (`root`). The
validator requires exactly one of `template` / `root`.

### 2. Template engine (`packages/shared`)

A small, dependency-free, **logic-less** interpolator. Grammar (deliberately minimal):

- `{{key}}` — field value, **HTML-escaped**.
- `{{#each listKey}} … {{this}} … {{/each}}` — iterate a `list` field (array of strings).
- `{{#each datasetKey.rows}} … {{columnKey}} … {{/each}}` — iterate dataset/matrix rows;
  inside the block, bare keys resolve against the current row.
- `{{#if key}} … {{else}} … {{/if}}` — render a branch by truthiness/presence of a field.
- Unknown keys render empty (graceful, like the current renderer). No expressions, no
  helpers, no function calls, no property access beyond the documented row shape.

**Context** = the section's `data`, shaped by the type's fields: text/paragraph → string,
`list` → string[], `dataset`/`matrix` → `{ columns, rows }` / matrix shape, `image` → URL
string. The engine output is an HTML string with data already escaped.

### 3. Safety pipeline

Defense in depth, applied on every render (editor preview and PDF alike):

1. **Escape on interpolation** — the engine HTML-escapes all `{{field}}` values, so
   AI-generated text or uploaded URLs cannot inject markup.
2. **Sanitize the assembled HTML** — `sanitize-html` with a strict allowlist: structural +
   text tags, `img`, lists, tables; allow `class`/`style`/`src`/`alt`/`href`; **strip**
   `<script>`, `<iframe>`, all `on*` handlers, `javascript:`/`vbscript:` and non-`https`/
   `data:image` URLs, `<style>`/`<link>` inside the template body.
3. **Scope the authored CSS** — parse the `css` and prefix every selector with the layout's
   unique wrapper attribute (e.g. `[data-layout="type:variant"] …`) so it cannot leak into
   the app shell or sibling sections; disallow `@import`/`url(http…)` exfiltration vectors.
4. **No JS, no network.** The result is static, themed HTML.

The sanitizer/scoper live in `packages/shared` (framework-agnostic) and are covered by
adversarial unit tests (script injection, `on*`, `javascript:` URLs, CSS breakout, `@import`).

### 4. Rendering pipeline

New `TemplateRenderer` (apps/web): `interpolate(template, data)` → `sanitizeHtml` →
render with `dangerouslySetInnerHTML` inside a theme-scoped wrapper, plus a scoped `<style>`
from the authored CSS. The same component is used by the editor preview and the `/print`
route, guaranteeing PDF parity.

`resolveSection` precedence (unchanged order, template slots into the "authored layout" tier):

```
authored template layout → legacy block layout → developer React component → generic fallback
```

### 5. Page model + visual breaks

The existing `pageMode` (`report` | `slides`) toggle stays; both modes gain real page
separation drawn in the editor (`paged.css`):

- **Slides** — each section's template fills one fixed page at the format's exact dimensions;
  visible gaps between pages.
- **Report** — templates flow; page-boundary markers indicate breaks.
- Templates receive the page geometry as CSS variables (`--page-w`, `--page-h`, margins) so a
  cover can be genuinely full-bleed and a slide can fill its frame.

### 6. Editor UX (Builder)

Replaces the block palette/tree/style-panel for the selected (type, variant, pageFormat):

- **Monaco** split editor: an **HTML** pane and a **CSS** pane.
- **Live preview** at the chosen page format, rendered through the exact production pipeline
  (interpolate → sanitize → scope) with `sampleDataForType`.
- **Field reference** panel listing the `{{keys}}` available for the type (with their kinds),
  click-to-insert.
- **Sanitizer notice** showing anything stripped, so authors learn the boundaries.
- Save/validate through the existing layout routes; validation rejects a layout that is
  neither a valid template nor a legacy block tree.

## Components & boundaries

- `packages/shared/src/template/interpolate.ts` — the logic-less engine. In: template string
  + context object. Out: HTML string (data escaped). No DOM, no app deps.
- `packages/shared/src/template/sanitizeLayoutHtml.ts` — wraps `sanitize-html` with the
  allowlist. In: HTML string. Out: safe HTML string.
- `packages/shared/src/template/scopeCss.ts` — prefixes selectors with the layout wrapper.
  In: css string + scope selector. Out: scoped css string.
- `packages/shared/src/validation/validateLayout.ts` — extended: a layout is valid if it has
  a sane `template`+`css` **or** a legacy `root` block tree (existing rules).
- `apps/web/src/render/TemplateRenderer.tsx` — composes the three pure functions + theme
  wrapper. Used by editor preview and `/print`.
- `apps/web/src/registry/componentRegistry.tsx` — `resolveSection` dispatches template vs
  legacy block vs code component.
- `apps/web/src/ui/admin/layout/TemplateLayoutEditor.tsx` — the Monaco editor + preview +
  field reference, replacing the block authoring UI.

## Testing

- **Engine:** interpolation, each/if/else, dataset row iteration, escaping, unknown-key
  graceful empty.
- **Sanitizer (adversarial):** `<script>`, `on*` handlers, `javascript:` URL, `<iframe>`,
  `<style>`/`<link>` injection, non-https `src` — all neutralised.
- **CSS scoper:** selectors prefixed; `@import`/`url(http…)` stripped; sibling sections
  unaffected.
- **TemplateRenderer:** data-bound render, theme tokens applied, parity between a direct
  render and the `/print` path.
- **resolveSection:** template wins over legacy/code/fallback; legacy block layouts still
  render.
- **Editor:** preview reflects sample data; field reference lists the type's keys; save
  round-trips `template`/`css`.

## Rough build order (each its own plan slice)

1. Engine + sanitizer + CSS scoper (pure `packages/shared`, adversarially tested).
2. `TemplateRenderer` + `resolveSection` wiring (+ legacy block fallback intact).
3. Types + layout save/load for `template`/`css`; validator update.
4. Builder `TemplateLayoutEditor` (Monaco HTML/CSS + live preview + field reference + sanitizer notice).
5. Page-break visuals in the editor for both modes; expose page geometry to templates.
6. Remove block-authoring UI (keep the block renderer as legacy).

## Open items / risks

- **CSS scoping fidelity:** selector-prefixing must handle commas, `@media`, nesting. If a
  robust hand-rolled scoper proves fragile, consider a tiny vetted CSS parser (separate
  dependency decision, not assumed here).
- **`data:` images:** allow `data:image/*` but cap size to avoid bloating stored documents.
- **Legacy block layouts:** remain renderable; a one-time "convert to template" tool is
  possible later but out of scope.
- Prerequisite: merge `fix/variant-autoresolve` so authored layouts resolve at all.
