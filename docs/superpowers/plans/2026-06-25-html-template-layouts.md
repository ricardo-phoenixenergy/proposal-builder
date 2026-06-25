# HTML/CSS Template Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Builder's declarative block-tree layout authoring with in-app HTML/CSS templates that bind to a section type's schema fields, are themed by brand tokens, and render via a safe interpolate → sanitize → scope pipeline (no code execution).

**Architecture:** Three pure functions in `packages/shared` (interpolate, sanitize, scope CSS) compose into an `apps/web` `TemplateRenderer` used by both the editor preview and the `/print` + `/share` server renders, guaranteeing parity. `resolveSection` gains a template tier ahead of the legacy block tier. The Monaco-based editor replaces the block palette/tree. Legacy block layouts keep rendering through the existing `LayoutRenderer`.

**Tech Stack:** TypeScript (strict), React 19 / Next.js App Router, Vitest, Monaco (`@monaco-editor/react`, already present), `sanitize-html` (new dependency, approved). Drizzle/Neon unchanged — template/css live in the existing `section_layouts.layout` JSONB (no migration).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-25-html-template-layouts-design.md`.
- TypeScript strict; module imports are **extensionless** (no `.js`).
- Shared types/schema/validation live in `packages/shared` (framework-agnostic), imported by app + route handlers. The three pure functions go there.
- **No arbitrary code execution.** Templates are interpolated + sanitized data/markup only. The AI still emits content only; users never author JS/JSX.
- Run from repo root: single test `npx vitest run <path>`; suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- `npm test` (vitest) ignores TS types — run `npm run typecheck` after any type change.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch: `feat/html-template-layouts` (already has the `fix/variant-autoresolve` prerequisite merged in).
- Lint must stay at **0 errors** (warnings allowed). Typecheck must be 0.

---

## File Structure

**`packages/shared` (new):**
- `src/template/interpolate.ts` — logic-less template engine.
- `src/template/sanitizeLayoutHtml.ts` — `sanitize-html` wrapper + allowlist.
- `src/template/scopeCss.ts` — selector-prefixing + CSS safety stripping.

**`packages/shared` (modify):**
- `src/types/layout.ts` — `SectionLayout` gains `template?`, `css?`; `root?` becomes optional.
- `src/validation/validateLayout.ts` — accept a template layout OR a legacy block layout.
- `src/index.ts` — export the new template functions + `LAYOUT_FIELD_CONTEXT` helper.

**`apps/web` (new):**
- `src/render/TemplateRenderer.tsx` — composes the three functions + theme/page-geometry wrapper.
- `src/ui/admin/layout/TemplateLayoutEditor.tsx` — Monaco HTML/CSS + live preview + field reference + sanitizer notice.
- `src/ui/admin/layout/fieldReference.ts` — derive `{{key}}` hints from a section type.

**`apps/web` (modify):**
- `apps/web/package.json` — add `sanitize-html` + `@types/sanitize-html`.
- `src/registry/componentRegistry.tsx` — `resolveSection` dispatch: template → legacy block → code → fallback.
- `src/ui/admin/LayoutEditor.tsx` — swap block UI for `TemplateLayoutEditor`.
- `src/render/paged.css` — visual page boundaries (both modes) + page-geometry CSS vars.
- `src/render/DocumentRenderer.tsx` — pass page geometry vars.

**Tests:** `packages/shared/src/__tests__/slice-39-*.test.ts`, `apps/web/src/__tests__/slice-40-*.test.tsx`.

---

## Task 1: Add `sanitize-html` and the HTML sanitizer

**Files:**
- Modify: `apps/web/package.json` (dependencies)
- Create: `packages/shared/src/template/sanitizeLayoutHtml.ts`
- Test: `packages/shared/src/__tests__/slice-39-sanitize.test.ts`

**Interfaces:**
- Produces: `sanitizeLayoutHtml(dirty: string): string`

> Note: `sanitize-html` is a dependency of `packages/shared` logically, but this monorepo hoists deps; add it to `apps/web/package.json` (the app that bundles shared) AND ensure `packages/shared` can import it. If `packages/shared/package.json` lists deps, add it there too. Verify import resolves in a shared vitest test before proceeding.

- [ ] **Step 1: Install the dependency**

Run from repo root:
```bash
npm install sanitize-html@^2.13.0 -w @proposal/web
npm install -D @types/sanitize-html@^2.13.0 -w @proposal/web
```
Expected: both added to `apps/web/package.json`.

- [ ] **Step 2: Write the failing adversarial test**

```ts
// packages/shared/src/__tests__/slice-39-sanitize.test.ts
import { describe, expect, it } from "vitest";
import { sanitizeLayoutHtml } from "../template/sanitizeLayoutHtml";

describe("sanitizeLayoutHtml", () => {
  it("keeps structural + text markup and class/style", () => {
    const html = '<section class="c"><h1 style="position:absolute">Hi</h1><p>x</p></section>';
    expect(sanitizeLayoutHtml(html)).toContain("<h1");
    expect(sanitizeLayoutHtml(html)).toContain("position:absolute");
  });
  it("keeps https and data:image img src, drops other schemes", () => {
    expect(sanitizeLayoutHtml('<img src="https://x/y.png">')).toContain("https://x/y.png");
    expect(sanitizeLayoutHtml('<img src="data:image/png;base64,AAA">')).toContain("data:image");
    expect(sanitizeLayoutHtml('<img src="javascript:alert(1)">')).not.toContain("javascript:");
  });
  it("strips <script>, <iframe>, on* handlers and javascript: hrefs", () => {
    expect(sanitizeLayoutHtml('<script>alert(1)</script><p>ok</p>')).not.toContain("script");
    expect(sanitizeLayoutHtml('<iframe src="x"></iframe>')).not.toContain("iframe");
    expect(sanitizeLayoutHtml('<div onclick="x()">a</div>')).not.toContain("onclick");
    expect(sanitizeLayoutHtml('<a href="javascript:x()">a</a>')).not.toContain("javascript:");
  });
  it("strips <style> and <link> from the template body", () => {
    expect(sanitizeLayoutHtml('<style>body{}</style><link rel="x">')).toBe("");
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-sanitize.test.ts`
Expected: FAIL — `sanitizeLayoutHtml` not found.

- [ ] **Step 4: Implement the sanitizer**

```ts
// packages/shared/src/template/sanitizeLayoutHtml.ts
import sanitizeHtml from "sanitize-html";

/**
 * Sanitize assembled layout HTML (§3 safety). Authors are trusted but rendering
 * happens server-side with secrets in scope and ships to external share viewers,
 * so this is defense in depth: an allowlist of structural/text/image tags, no
 * scripts, no event handlers, no non-https/data:image URLs, no <style>/<link>.
 */
export function sanitizeLayoutHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "section","article","div","span","header","footer","main","aside",
      "h1","h2","h3","h4","h5","h6","p","blockquote","small","sup","sub",
      "ul","ol","li","table","thead","tbody","tfoot","tr","th","td",
      "img","figure","figcaption","strong","em","b","i","u","br","hr","a",
    ],
    allowedAttributes: {
      "*": ["class", "style"],
      img: ["src", "alt", "width", "height"],
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["https"],
    allowedSchemesByTag: { img: ["https", "data"], a: ["https", "mailto"] },
    // sanitize-html keeps inline style but neutralises javascript:/expression().
    disallowedTagsMode: "discard",
  });
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-sanitize.test.ts`
Expected: PASS. If the `data:image` case fails, confirm `allowedSchemesByTag.img` includes `data`.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add apps/web/package.json package-lock.json packages/shared/src/template/sanitizeLayoutHtml.ts packages/shared/src/__tests__/slice-39-sanitize.test.ts
git commit -m "feat(template): add sanitize-html and the layout HTML sanitizer"
```

---

## Task 2: Logic-less template engine (`interpolate`)

**Files:**
- Create: `packages/shared/src/template/interpolate.ts`
- Test: `packages/shared/src/__tests__/slice-39-interpolate.test.ts`

**Interfaces:**
- Produces: `interpolate(template: string, data: Record<string, unknown>): string` — returns HTML with all interpolated values HTML-escaped. Supports `{{key}}`, `{{#each key}}…{{this}}…{{/each}}`, `{{#each key.rows}}…{{col}}…{{/each}}`, `{{#if key}}…{{else}}…{{/if}}`. Unknown keys → empty string.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/slice-39-interpolate.test.ts
import { describe, expect, it } from "vitest";
import { interpolate } from "../template/interpolate";

describe("interpolate", () => {
  it("substitutes and HTML-escapes a field", () => {
    expect(interpolate("<h1>{{title}}</h1>", { title: "A & B <x>" })).toBe(
      "<h1>A &amp; B &lt;x&gt;</h1>",
    );
  });
  it("renders empty for an unknown key", () => {
    expect(interpolate("[{{nope}}]", {})).toBe("[]");
  });
  it("loops a list with {{this}}", () => {
    expect(interpolate("{{#each bullets}}<li>{{this}}</li>{{/each}}", { bullets: ["a", "b"] })).toBe(
      "<li>a</li><li>b</li>",
    );
  });
  it("loops dataset rows resolving bare keys against the row", () => {
    const data = { ds: { rows: [{ label: "2024", value: "42" }, { label: "2025", value: "58" }] } };
    expect(interpolate("{{#each ds.rows}}{{label}}:{{value}};{{/each}}", data)).toBe(
      "2024:42;2025:58;",
    );
  });
  it("renders #if branch by presence, else otherwise", () => {
    expect(interpolate("{{#if a}}Y{{else}}N{{/if}}", { a: "x" })).toBe("Y");
    expect(interpolate("{{#if a}}Y{{else}}N{{/if}}", {})).toBe("N");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-interpolate.test.ts`
Expected: FAIL — `interpolate` not found.

- [ ] **Step 3: Implement the engine**

```ts
// packages/shared/src/template/interpolate.ts

const ESCAPE: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESCAPE[c]!);
}

/** Resolve a dotted path (e.g. "ds.rows") against a context object. */
function lookup(ctx: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
    return undefined;
  }, ctx);
}

/**
 * A deliberately tiny, logic-less template engine (§2). NO arbitrary expressions,
 * helpers, or function calls — only field substitution, list/row iteration, and
 * presence conditionals. Substituted values are HTML-escaped so interpolated data
 * (AI text, uploaded URLs) can never inject markup.
 */
export function interpolate(template: string, data: Record<string, unknown>): string {
  // Recursive block parser for {{#each}} / {{#if}} … handles nesting by matching
  // the corresponding {{/each}} / {{/if}} via a depth counter.
  return render(template, data);
}

function render(tpl: string, ctx: Record<string, unknown>): string {
  let out = "";
  let i = 0;
  const tag = /\{\{(#each |#if |\/each|\/if|else|)([^}]*)\}\}/g;
  let m: RegExpExecArray | null;
  tag.lastIndex = 0;
  while ((m = tag.exec(tpl)) !== null) {
    out += tpl.slice(i, m.index);
    const [raw, kind, argRaw] = m;
    const arg = argRaw.trim();
    if (kind === "#each " || kind === "#if ") {
      const close = kind === "#each " ? "/each" : "/if";
      const { inner, end } = block(tpl, tag.lastIndex, close);
      if (kind === "#each ") {
        const list = lookup(ctx, arg);
        if (Array.isArray(list)) {
          for (const item of list) {
            const itemCtx =
              item && typeof item === "object"
                ? { ...ctx, ...(item as Record<string, unknown>), this: item }
                : { ...ctx, this: item };
            out += render(inner, itemCtx);
          }
        }
      } else {
        const [truthy, falsy] = splitElse(inner);
        out += lookup(ctx, arg) ? render(truthy, ctx) : render(falsy, ctx);
      }
      i = end;
      tag.lastIndex = end;
    } else if (kind === "" && arg) {
      out += esc(lookup(ctx, arg)); // {{key}} or {{this}}
      i = m.index + raw.length;
    } else {
      // stray {{/each}} {{else}} {{/if}} handled by their openers; skip
      i = m.index + raw.length;
    }
  }
  return out + tpl.slice(i);
}

/** Return the inner text up to the matching close tag and the index past it. */
function block(tpl: string, from: number, close: string): { inner: string; end: number } {
  const open = close === "/each" ? "#each " : "#if ";
  const re = new RegExp(`\\{\\{(${open.replace(" ", " ")}|\\${close})[^}]*\\}\\}`, "g");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m[1].startsWith(open.trim())) depth++;
    else if (depth-- === 1) return { inner: tpl.slice(from, m.index), end: re.lastIndex };
  }
  return { inner: tpl.slice(from), end: tpl.length };
}

function splitElse(inner: string): [string, string] {
  const m = /\{\{else\}\}/.exec(inner);
  return m ? [inner.slice(0, m.index), inner.slice(m.index + m[0].length)] : [inner, ""];
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-interpolate.test.ts`
Expected: PASS. If nested-block matching fails, add a test with nested `{{#each}}` inside `{{#if}}` and fix the depth counter before continuing.

- [ ] **Step 5: Add a nested-block test (hardening)**

```ts
it("handles an each nested inside an if", () => {
  const tpl = "{{#if items}}<ul>{{#each items}}<li>{{this}}</li>{{/each}}</ul>{{/if}}";
  expect(interpolate(tpl, { items: ["a"] })).toBe("<ul><li>a</li></ul>");
});
```
Run the file again; expected PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add packages/shared/src/template/interpolate.ts packages/shared/src/__tests__/slice-39-interpolate.test.ts
git commit -m "feat(template): logic-less interpolation engine with escaping"
```

---

## Task 3: CSS scoper (`scopeCss`)

**Files:**
- Create: `packages/shared/src/template/scopeCss.ts`
- Test: `packages/shared/src/__tests__/slice-39-scope-css.test.ts`

**Interfaces:**
- Produces: `scopeCss(css: string, scopeSelector: string): string` — prefixes every rule selector with `scopeSelector`, passes `@media` blocks through (scoping their inner rules), and strips unsafe constructs (`@import`, `url()` with non-https/data schemes, `expression(`, `behavior:`, `javascript:`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/slice-39-scope-css.test.ts
import { describe, expect, it } from "vitest";
import { scopeCss } from "../template/scopeCss";

const S = '[data-layout="cover:hero"]';

describe("scopeCss", () => {
  it("prefixes a simple selector", () => {
    expect(scopeCss(".title{color:red}", S)).toBe(`${S} .title{color:red}`);
  });
  it("prefixes each selector in a comma list", () => {
    expect(scopeCss("h1,h2{margin:0}", S)).toBe(`${S} h1,${S} h2{margin:0}`);
  });
  it("scopes rules inside @media", () => {
    const out = scopeCss("@media print{.x{color:#000}}", S);
    expect(out).toContain("@media print{");
    expect(out).toContain(`${S} .x{color:#000}`);
  });
  it("strips @import and javascript/expression payloads", () => {
    expect(scopeCss('@import url("http://evil");', S)).not.toContain("@import");
    expect(scopeCss(".x{width:expression(alert(1))}", S)).not.toContain("expression(");
    expect(scopeCss(".x{background:url(javascript:x)}", S)).not.toContain("javascript:");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-scope-css.test.ts`
Expected: FAIL — `scopeCss` not found.

- [ ] **Step 3: Implement the scoper**

```ts
// packages/shared/src/template/scopeCss.ts

/**
 * Scope authored CSS (§3) so a layout's styles cannot leak into the app shell or
 * sibling sections: every rule selector is prefixed with `scope`. @media blocks are
 * preserved and their inner rules scoped. Exfiltration/execution vectors are stripped.
 * Deliberately conservative — @keyframes/@font-face names pass through unscoped.
 */
export function scopeCss(css: string, scope: string): string {
  const cleaned = stripUnsafe(css);
  return scopeRules(cleaned, scope);
}

function stripUnsafe(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/behavior\s*:[^;}]*/gi, "")
    .replace(/url\(\s*['"]?\s*(?:javascript|vbscript|http):[^)]*\)/gi, "url()");
}

/** Walk top-level rules; recurse into @media; prefix selector lists. */
function scopeRules(css: string, scope: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf("{", i);
    if (brace === -1) break;
    const prelude = css.slice(i, brace).trim();
    const body = matchBlock(css, brace);
    if (/^@media/i.test(prelude) || /^@supports/i.test(prelude)) {
      out += `${prelude}{${scopeRules(body.inner, scope)}}`;
    } else if (/^@(keyframes|font-face|page)/i.test(prelude)) {
      out += `${prelude}{${body.inner}}`; // pass through, do not scope
    } else if (prelude) {
      const scoped = prelude
        .split(",")
        .map((s) => `${scope} ${s.trim()}`)
        .join(",");
      out += `${scoped}{${body.inner}}`;
    }
    i = body.end;
  }
  return out;
}

function matchBlock(css: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}" && --depth === 0)
      return { inner: css.slice(open + 1, j), end: j + 1 };
  }
  return { inner: css.slice(open + 1), end: css.length };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-scope-css.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
```bash
git add packages/shared/src/template/scopeCss.ts packages/shared/src/__tests__/slice-39-scope-css.test.ts
git commit -m "feat(template): scope + harden authored CSS"
```

---

## Task 4: Types + validator + exports

**Files:**
- Modify: `packages/shared/src/types/layout.ts`
- Modify: `packages/shared/src/validation/validateLayout.ts:43-61` (the early shape checks)
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/slice-39-validate-template.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SectionLayout` with optional `template?: string`, `css?: string`, and `root?: Block` (now optional). `validateLayout` returns `{valid:true}` for a layout with a non-empty `template` (css optional) and no `root`, and continues to validate legacy `root` layouts.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/slice-39-validate-template.test.ts
import { describe, expect, it } from "vitest";
import { validateLayout } from "../validation/validateLayout";
import type { SectionTypeSchema } from "../types/section";

const type: SectionTypeSchema = {
  type: "cover_page", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [], schemaVersion: 1,
};
const base = { type: "cover_page", variant: "hero", pageFormat: "a4_portrait", name: "Hero", version: 1 };

describe("validateLayout — template layouts", () => {
  it("accepts a layout with a non-empty template", () => {
    expect(validateLayout({ ...base, template: "<h1>{{title}}</h1>", css: "" }, type).valid).toBe(true);
  });
  it("rejects a layout with neither template nor root", () => {
    expect(validateLayout({ ...base }, type).valid).toBe(false);
  });
  it("still accepts a legacy block layout", () => {
    expect(
      validateLayout({ ...base, root: { kind: "stack", children: [] } }, type).valid,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-validate-template.test.ts`
Expected: FAIL (template layout currently hits "layout.root is required").

- [ ] **Step 3: Update the type**

In `packages/shared/src/types/layout.ts`, change the `SectionLayout` interface:
```ts
export interface SectionLayout {
  type: string;
  variant: string;
  pageFormat: string;
  name: string;
  version: number;
  /** Template layout (current): authored HTML with {{…}} placeholders. */
  template?: string;
  /** Template layout: authored CSS, scoped at render time. */
  css?: string;
  /** Legacy block layout (read-only; no longer authored). */
  root?: Block;
}
```

- [ ] **Step 4: Update the validator**

In `packages/shared/src/validation/validateLayout.ts`, replace the `root` required-check block (around lines 55-61) with:
```ts
  const lay = layout as { root?: unknown; template?: unknown };
  // Template layout: a non-empty string template is sufficient (css optional).
  if (typeof lay.template === "string") {
    if (lay.template.trim() === "") {
      return { valid: false, errors: [{ path: "/template", message: "template is empty", source: "app" }] };
    }
    return { valid: true, errors: [] };
  }
  const root = lay.root;
  if (root === undefined || root === null) {
    return {
      valid: false,
      errors: [{ path: "/root", message: "a template or a block root is required", source: "app" }],
    };
  }
```

- [ ] **Step 5: Export the template functions**

In `packages/shared/src/index.ts`, add:
```ts
export { interpolate } from "./template/interpolate";
export { sanitizeLayoutHtml } from "./template/sanitizeLayoutHtml";
export { scopeCss } from "./template/scopeCss";
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run packages/shared/src/__tests__/slice-39-validate-template.test.ts` → PASS
Run: `npm run typecheck` → 0 errors (fix any `SectionLayout` construction sites that now need `root` optional — there should be none breaking since fields are additive/optional).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types/layout.ts packages/shared/src/validation/validateLayout.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-39-validate-template.test.ts
git commit -m "feat(template): SectionLayout template/css fields + validator"
```

---

## Task 5: `TemplateRenderer` + `resolveSection` dispatch

**Files:**
- Create: `apps/web/src/render/TemplateRenderer.tsx`
- Modify: `apps/web/src/registry/componentRegistry.tsx:59-108` (resolveSection)
- Test: `apps/web/src/__tests__/slice-40-template-renderer.test.tsx`

**Interfaces:**
- Consumes: `interpolate`, `sanitizeLayoutHtml`, `scopeCss` from `@proposal/shared`; `SectionLayout`.
- Produces: `TemplateRenderer({ layout, data, pageFormat }): JSX` rendering a scoped wrapper `[data-layout="type:variant"]` with `dangerouslySetInnerHTML` (sanitized) + a scoped `<style>`. `resolveSection` returns this for layouts with a `template`, before the legacy block path.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/slice-40-template-renderer.test.tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { setActiveSectionTypes, resetSectionTypesForTests, setActiveLayouts, resetLayoutsForTests, type SectionLayout, type SectionTypeSchema } from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { defaultTheme } from "../theme/defaultTheme";

const type: SectionTypeSchema = {
  type: "cover_page", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }, { key: "hero", type: "image", label: "Hero" }],
  variants: [], schemaVersion: 1,
};
const layout: SectionLayout = {
  type: "cover_page", variant: "hero", pageFormat: "a4_portrait", name: "Hero", version: 1,
  template: '<section class="cover"><img src="{{hero}}"/><h1>{{title}}</h1><script>alert(1)</script></section>',
  css: ".cover h1{color:var(--c-primary)}",
};

beforeEach(() => { resetSectionTypesForTests(); resetLayoutsForTests(); setActiveSectionTypes([type]); setActiveLayouts([layout]); });
afterEach(() => { cleanup(); resetSectionTypesForTests(); resetLayoutsForTests(); });

describe("template layout rendering", () => {
  it("resolves a template layout and renders sanitized, data-bound HTML", () => {
    const { Component, unstyled, variant } = resolveSection(
      { id: "s1", type: "cover_page", data: { title: "Acme", hero: "https://x/y.png" } },
      undefined, "a4_portrait",
    );
    expect(unstyled).toBe(false);
    expect(variant).toBe("hero");
    const { container } = render(<Component data={{ title: "Acme", hero: "https://x/y.png" }} theme={defaultTheme} />);
    expect(container.querySelector("h1")?.textContent).toBe("Acme");
    expect(container.querySelector('img[src="https://x/y.png"]')).not.toBeNull();
    expect(container.querySelector("script")).toBeNull(); // sanitized
    expect(container.querySelector('[data-layout="cover_page:hero"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-40-template-renderer.test.tsx`
Expected: FAIL — template layout currently falls through to the block path (no `root`) → fallback.

- [ ] **Step 3: Implement `TemplateRenderer`**

```tsx
// apps/web/src/render/TemplateRenderer.tsx
import type { SectionLayout, ThemeTokens } from "@proposal/shared";
import { interpolate, sanitizeLayoutHtml, scopeCss, getPageFormat } from "@proposal/shared";

type Data = Record<string, unknown>;

/** Render an authored HTML/CSS template layout (§4): interpolate data (escaped),
 *  sanitize the HTML, scope the CSS to this layout's wrapper. No JS executes. */
export function TemplateRenderer({
  layout, data, pageFormat,
}: { layout: SectionLayout; data: Data; pageFormat?: string }) {
  const scope = `[data-layout="${layout.type}:${layout.variant}"]`;
  const html = sanitizeLayoutHtml(interpolate(layout.template ?? "", data));
  const css = layout.css ? scopeCss(layout.css, scope) : "";
  const fmt = getPageFormat(pageFormat ?? layout.pageFormat);
  return (
    <div
      data-layout={`${layout.type}:${layout.variant}`}
      style={
        {
          "--page-w": `${fmt.widthMm}mm`,
          "--page-h": `${fmt.heightMm}mm`,
          "--page-margin": `${fmt.marginMm}mm`,
        } as React.CSSProperties
      }
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

- [ ] **Step 4: Wire `resolveSection`**

In `apps/web/src/registry/componentRegistry.tsx`, add the import:
```tsx
import { TemplateRenderer } from "../render/TemplateRenderer";
```
Then inside the `if (variant) { const layout = getLayout(...) }` block, before constructing the block `Layout`, branch on template:
```tsx
    if (layout) {
      if (layout.template !== undefined) {
        const Tmpl = (props: SectionComponentProps) => (
          <TemplateRenderer layout={layout} data={props.data}
            {...(pageFormat !== undefined ? { pageFormat } : {})} />
        );
        Tmpl.displayName = `Template(${section.type}:${variant})`;
        return { Component: Tmpl, unstyled: false, variant };
      }
      // legacy block layout (existing LayoutRenderer path) unchanged below
      const Layout = (props: SectionComponentProps) => ( /* existing */ );
      ...
    }
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-40-template-renderer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite + typecheck + commit**

Run: `npm test` (expect all pass) and `npm run typecheck` (0 errors).
```bash
git add apps/web/src/render/TemplateRenderer.tsx apps/web/src/registry/componentRegistry.tsx apps/web/src/__tests__/slice-40-template-renderer.test.tsx
git commit -m "feat(template): TemplateRenderer + resolveSection template dispatch"
```

---

## Task 6: Field reference helper

**Files:**
- Create: `apps/web/src/ui/admin/layout/fieldReference.ts`
- Test: `apps/web/src/__tests__/slice-40-field-reference.test.ts`

**Interfaces:**
- Produces: `fieldReference(type: SectionTypeSchema): { token: string; label: string; kind: FieldType }[]` — a click-to-insert list: scalar fields → `{{key}}`, list/dataset/matrix → `{{#each key}}…{{/each}}` hint.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/__tests__/slice-40-field-reference.test.ts
import { describe, expect, it } from "vitest";
import { fieldReference } from "../ui/admin/layout/fieldReference";
import type { SectionTypeSchema } from "@proposal/shared";

const type: SectionTypeSchema = {
  type: "c", label: "C", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "bullets", type: "list", label: "Bullets" },
  ],
  variants: [], schemaVersion: 1,
};

describe("fieldReference", () => {
  it("maps scalar fields to {{key}} and list fields to an each hint", () => {
    const ref = fieldReference(type);
    expect(ref.find((r) => r.label === "Title")?.token).toBe("{{title}}");
    expect(ref.find((r) => r.label === "Bullets")?.token).toBe("{{#each bullets}}{{this}}{{/each}}");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-40-field-reference.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/ui/admin/layout/fieldReference.ts
import type { FieldType, SectionTypeSchema } from "@proposal/shared";

export function fieldReference(
  type: SectionTypeSchema,
): { token: string; label: string; kind: FieldType }[] {
  return type.fields.map((f) => {
    const token =
      f.type === "list"
        ? `{{#each ${f.key}}}{{this}}{{/each}}`
        : f.type === "dataset" || f.type === "matrix"
          ? `{{#each ${f.key}.rows}}{{/each}}`
          : `{{${f.key}}}`;
    return { token, label: f.label ?? f.key, kind: f.type };
  });
}
```

- [ ] **Step 4: Run, verify it passes; commit**

Run: `npx vitest run apps/web/src/__tests__/slice-40-field-reference.test.ts` → PASS
```bash
git add apps/web/src/ui/admin/layout/fieldReference.ts apps/web/src/__tests__/slice-40-field-reference.test.ts
git commit -m "feat(template): field reference helper for the editor"
```

---

## Task 7: `TemplateLayoutEditor` (Monaco + preview + field reference)

**Files:**
- Create: `apps/web/src/ui/admin/layout/TemplateLayoutEditor.tsx`
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx` (replace block UI with the template editor; keep name/variant/format fields + save flow)
- Test: `apps/web/src/__tests__/slice-40-template-editor.test.tsx`

**Interfaces:**
- Consumes: `fieldReference`, `TemplateRenderer`, `sampleDataForType`, `createLayout`/`updateLayout`, `getSectionType`.
- Produces: a controlled editor that builds a `SectionLayout` with `template`/`css` and saves via the existing layout client.

> Use the existing Monaco wrapper pattern from `apps/web/src/ui/CodeEditor.tsx`. Two editors (language `html` and `css`) or one with a tab toggle. The live preview renders `<TemplateRenderer layout={draft} data={sampleDataForType(type)} pageFormat={pageFormat} />` inside a page-format-sized frame.

- [ ] **Step 1: Write the failing test (save round-trip + preview)**

```tsx
// apps/web/src/__tests__/slice-40-template-editor.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";
import { TemplateLayoutEditor } from "../ui/admin/layout/TemplateLayoutEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, ["aria-label"]: al }: any) => (
    <textarea aria-label={al} value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const type: SectionTypeSchema = {
  type: "cover_page", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [], schemaVersion: 1,
};

beforeEach(() => { resetSectionTypesForTests(); setActiveSectionTypes([type]); });
afterEach(() => { cleanup(); resetSectionTypesForTests(); vi.unstubAllGlobals(); });

describe("TemplateLayoutEditor", () => {
  it("saves a template layout via the layouts API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(<TemplateLayoutEditor type="cover_page" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Hero" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "hero" } });
    fireEvent.change(screen.getByLabelText("template-html"), { target: { value: "<h1>{{title}}</h1>" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.template).toContain("{{title}}");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-40-template-editor.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement `TemplateLayoutEditor`**

Build a component mirroring the current `LayoutEditor` shell (name + variant + format + Save/Cancel) but with: a `template` textarea/Monaco (`aria-label="template-html"`), a `css` Monaco (`aria-label="template-css"`), a field-reference list (from `fieldReference(getSectionType(type))`, click inserts token into the template), and a live `<TemplateRenderer>` preview using `sampleDataForType(type)`. Save builds `{ type, variant, pageFormat, name, version: (initial?.version ?? 0) + 1, template, css }` and calls `createLayout`/`updateLayout`. Validate with `validateLayout` before enabling Save. (Full code: follow `LayoutEditor.tsx` structure; swap the block palette/tree/style panel for the two editors + reference + preview.)

- [ ] **Step 4: Wire it into `LayoutEditor`**

Replace `LayoutEditor`'s block-authoring body (palette, `BlockTree`, `BlockStylePanel`) with `<TemplateLayoutEditor … />`, preserving the create/edit + page-format props it already receives from `SectionLayoutsView`.

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-40-template-editor.test.tsx` → PASS
Run: `npm run typecheck` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/admin/layout/TemplateLayoutEditor.tsx apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-40-template-editor.test.tsx
git commit -m "feat(template): Monaco template editor with live preview + field reference"
```

---

## Task 8: Page-break visuals + page geometry

**Files:**
- Modify: `apps/web/src/render/paged.css`
- Modify: `apps/web/src/render/DocumentRenderer.tsx:24-37` (wrapper style)
- Test: `apps/web/src/__tests__/slice-40-paged-visuals.test.tsx`

**Interfaces:**
- Consumes: `document.pageMode`, `getPageFormat`.
- Produces: visible page boundaries — `.paged-slide` already sizes to a page; add a boundary/gap style and, in report mode, a page-break marker. Expose `--page-w/--page-h/--page-margin` on the document wrapper.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/__tests__/slice-40-paged-visuals.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import { sampleProposal } from "@proposal/shared";

afterEach(cleanup);

describe("paged visuals", () => {
  it("marks slide pages with a boundary class in slides mode", () => {
    const doc = { ...sampleProposal, pageMode: "slides" as const };
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    expect(container.querySelector(".paged-slide")).not.toBeNull();
    expect(getComputedStyle(container.querySelector(".paged-document")!).getPropertyValue("--page-w")).not.toBe("");
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-40-paged-visuals.test.tsx`
Expected: FAIL (— `--page-w` not set on the wrapper).

- [ ] **Step 3: Implement**

In `DocumentRenderer.tsx`, add the geometry vars to the `<article>` style:
```tsx
        style={{
          width: `${fmt.widthMm}mm`,
          ["--page-w" as string]: `${fmt.widthMm}mm`,
          ["--page-h" as string]: `${fmt.heightMm}mm`,
          ["--page-margin" as string]: `${fmt.marginMm}mm`,
          /* …existing props… */
        }}
```
In `paged.css`, add (editor-only, guarded so print stays clean):
```css
.paged-slide { box-shadow: 0 0 0 1px var(--c-line); margin-bottom: 16px; background: #fff; }
@media print { .paged-slide { box-shadow: none; margin-bottom: 0; } }
.paged-document[data-page-mode="report"] .paged-section[data-page-break-before="true"] {
  border-top: 1px dashed var(--c-line); margin-top: 16px; padding-top: 16px;
}
```

- [ ] **Step 4: Run test + visual check + commit**

Run: `npx vitest run apps/web/src/__tests__/slice-40-paged-visuals.test.tsx` → PASS
```bash
git add apps/web/src/render/paged.css apps/web/src/render/DocumentRenderer.tsx apps/web/src/__tests__/slice-40-paged-visuals.test.tsx
git commit -m "feat(template): visual page/slide separation + page geometry vars"
```

---

## Task 9: Remove block-authoring UI

**Files:**
- Delete: `apps/web/src/ui/admin/layout/BlockTree.tsx`, `BlockStylePanel.tsx`, `blockOps.ts` (authoring-only)
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx` (drop block imports if any remain)
- Keep: `apps/web/src/render/LayoutRenderer.tsx` (legacy block rendering stays)
- Verify: existing block-layout tests that exercise authoring are removed/replaced; block-render tests stay green.

- [ ] **Step 1: Find authoring-only references**

Run: `npx vitest run` first to capture the green baseline. Then search:
```bash
grep -rln "BlockTree\|BlockStylePanel\|blockOps" apps/web/src
```
Expected: only `LayoutEditor.tsx` and authoring tests (`slice-24/25*`).

- [ ] **Step 2: Remove authoring components + their tests**

Delete the three files and any test files that test block *authoring* (e.g. `slice-25-columns-authoring`, `slice-25-style-inspector`, `slice-25-keyvalue`, `slice-25-background-group`, `slice-24-layout-editor`). Do NOT delete block *rendering* tests (`slice-22-layout-renderer`) — `LayoutRenderer` stays.

- [ ] **Step 3: Run full suite + typecheck + lint**

Run: `npm test` → all pass; `npm run typecheck` → 0; `npm run lint` → 0 errors.
Fix any dangling imports.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(template): remove block-authoring UI (block renderer kept as legacy)"
```

---

## Final verification

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build -w @proposal/web` — succeeds
- [ ] Manual: author a `cover_page` template (full-bleed `<img src="{{hero}}">` + absolutely-positioned `<h1>{{title}}</h1>` overlay), confirm editor preview matches, export PDF, confirm parity and that `<script>`/`on*` are stripped.

## Self-Review notes (author → fix inline before handoff)

- Spec §1 data model → Task 4. §2 engine → Task 2. §3 safety (escape/sanitize/scope) → Tasks 1-3. §4 renderer/precedence → Task 5. §5 page model → Task 8. §6 editor → Tasks 6-7. Removal → Task 9. **All spec sections covered.**
- Type consistency: `SectionLayout.template/css/root` used identically across Tasks 4, 5, 7. `interpolate`/`sanitizeLayoutHtml`/`scopeCss` signatures match between definition (Tasks 1-3) and use (Task 5).
- Open risk carried from spec: CSS scoper is regex-based (Task 3) — if real templates expose gaps, escalate to a vetted CSS parser (separate dependency decision).
