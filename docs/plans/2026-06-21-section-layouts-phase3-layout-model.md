# Section Layout Authoring — Phase 3: declarative layout model + interpreter (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a declarative, token-only **block-tree layout model** and a **safe interpreter** (`LayoutRenderer`) so a section type can be rendered from authored JSON — including cover backgrounds/overlays — with format-aware resolution, **without ever executing user-authored code**. No authoring UI and no DB/API yet (Phases 4–5); this phase is verified by tests and seeded registry rows.

**Architecture:** `packages/shared` gains the block-tree types (`types/layout.ts`), a pure token→CSS compiler (`render/layoutStyle.ts`), a `validateLayout` validator, and an in-memory active-layouts registry (`registry/layouts.ts`, mirroring the section-type registry). `apps/web` gains `LayoutRenderer` — a recursive `switch` over known block kinds that reuses the existing `DataTable`/`ChartView`/`ComparisonMatrix` and reads only theme CSS variables — and a **format-aware `resolveSection`** whose precedence is authored layout → code component → generic fallback, plus an `availableVariants(type, pageFormat)` helper. Backgrounds are a property of container blocks (no new block kind); the image is an asset/field, the overlay stays a brand token.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Vitest. Monorepo `packages/shared` + `apps/web`.

This is **Phase 3 of 5** from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§A, §B, §C, §I-renderer, §J-resolution). Phases 1 (page formats) and 2 (image field) are merged. It ships on its own: with no authored layouts in the registry, `resolveSection` behaves exactly as today (code component → generic), so production is unaffected. Phase 4 (storage + API + hydration) and Phase 5 (authoring UI) follow.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- **This IS a git repo** (the env banner wrongly says otherwise); work on a feature branch off `main`. Commit per task. (After Windows `.next` flakiness — `EINVAL readlink … .next` — `rm -rf apps/web/.next` and rebuild.)
- **`npm test` (vitest) ignores TypeScript types** — always run `npm run typecheck` after editing any test file or `.tsx`. Use a non-null assertion `!` on `getAllBy…[i]`/array indexing.
- **NO user code execution** (hard invariant): the interpreter is a closed `switch` over known kinds; **no `eval`, no `dangerouslySetInnerHTML`, no `new Function`**. Unknown kinds/props are **skipped, never thrown**. Styling is **token-only** — every style prop compiles to a theme CSS variable (`var(--c-*)`, `var(--f-*)`, `calc(px * var(--space))`); no raw hex/px is representable in `BlockStyle`.
- **Backward-compatible:** `resolveSection` keeps its current behaviour when no authored layout matches; existing callers and tests must stay green. The change is additive.
- **Three-layer invariant:** layouts are **presentation**; the AI never authors them; the content schema is unchanged. Data blocks reuse the existing render components.
- **Exact token mappings (§A):** color/background → `var(--c-<token>)`; font → `var(--f-<token>)`; size → font-size rem `xs .8 · sm .9 · md 1 · lg 1.35 · xl 1.9`; SpaceScale (gap/padding) → `calc(<px> * var(--space))` with `none 0 · xs 4 · sm 8 · md 16 · lg 24 · xl 40`; weight → `regular 400 · medium 550 · bold 700`.
- **Layout identity = (type, variant, pageFormat)** (§A/§J). `getLayout`/`listLayoutVariants` normalise an absent format to `DEFAULT_PAGE_FORMAT`.
- TypeScript strict; extensionless imports (no `.js`).

---

### Task 1: Block-tree types + token→CSS style compiler (`packages/shared`)

**Files:**
- Create: `packages/shared/src/types/layout.ts`
- Create: `packages/shared/src/render/layoutStyle.ts`
- Modify: `packages/shared/src/types/index.ts` (re-export layout types)
- Modify: `packages/shared/src/index.ts` (export the compiler)
- Test: `packages/shared/src/__tests__/slice-22-layout-style.test.ts`

**Interfaces:**
- Produces: the §A types (`BlockStyle`, `LeafBlock`, `ImageRef`, `BlockBackground`, `ContainerBlock`, `Block`, `SectionLayout`, the token unions) and the vocabulary const arrays (`TOKEN_COLORS`, `TOKEN_FONTS`, `SIZE_SCALES`, `SPACE_SCALES`, `ALIGNS`, `WEIGHTS`, `CHART_KINDS`, `LEAF_KINDS`, `CONTAINER_KINDS`); `compileBlockStyle(style?): Record<string,string>` and `spaceToken(scale): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-22-layout-style.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileBlockStyle, spaceToken } from "../render/layoutStyle";
import { TOKEN_COLORS, SIZE_SCALES, LEAF_KINDS, CONTAINER_KINDS } from "../types/layout";

describe("layout token vocabularies", () => {
  it("exposes the v1 vocabularies", () => {
    expect(TOKEN_COLORS).toContain("primary");
    expect(SIZE_SCALES).toEqual(["xs", "sm", "md", "lg", "xl"]);
    expect(LEAF_KINDS).toContain("heading");
    expect(CONTAINER_KINDS).toEqual(["stack", "columns"]);
  });
});

describe("compileBlockStyle", () => {
  it("returns an empty object for no style", () => {
    expect(compileBlockStyle()).toEqual({});
  });

  it("maps every token prop to a theme CSS variable or scale value", () => {
    expect(compileBlockStyle({ color: "primary" })).toMatchObject({ color: "var(--c-primary)" });
    expect(compileBlockStyle({ background: "surface" })).toMatchObject({ background: "var(--c-surface)" });
    expect(compileBlockStyle({ font: "heading" })).toMatchObject({ fontFamily: "var(--f-heading)" });
    expect(compileBlockStyle({ size: "lg" })).toMatchObject({ fontSize: "1.35rem" });
    expect(compileBlockStyle({ weight: "bold" })).toMatchObject({ fontWeight: "700" });
    expect(compileBlockStyle({ align: "center" })).toMatchObject({ textAlign: "center" });
    expect(compileBlockStyle({ padding: "md" })).toMatchObject({ padding: "calc(16px * var(--space))" });
  });

  it("spaceToken maps the scale to a theme-aware calc length", () => {
    expect(spaceToken("none")).toBe("calc(0px * var(--space))");
    expect(spaceToken("xl")).toBe("calc(40px * var(--space))");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-layout-style.test.ts`
Expected: FAIL — `../render/layoutStyle` and `../types/layout` do not exist.

- [ ] **Step 3: Create the layout types**

Create `packages/shared/src/types/layout.ts`:

```ts
/**
 * Declarative section-layout model (§A). A layout is a tree of token-styled
 * blocks, interpreted by a safe renderer — never executed. The vocabulary const
 * arrays are the validator's source of truth; the union types derive from them so
 * the two cannot drift.
 */

export const TOKEN_COLORS = ["primary", "accent", "text", "muted", "surface", "line"] as const;
export const TOKEN_FONTS = ["heading", "body"] as const;
export const SIZE_SCALES = ["xs", "sm", "md", "lg", "xl"] as const;
export const SPACE_SCALES = ["none", "xs", "sm", "md", "lg", "xl"] as const;
export const ALIGNS = ["left", "center", "right"] as const;
export const WEIGHTS = ["regular", "medium", "bold"] as const;
export const CHART_KINDS = ["bar", "line", "pie", "area"] as const;

export type TokenColor = (typeof TOKEN_COLORS)[number];
export type TokenFont = (typeof TOKEN_FONTS)[number];
export type SizeScale = (typeof SIZE_SCALES)[number];
export type SpaceScale = (typeof SPACE_SCALES)[number];
export type Align = (typeof ALIGNS)[number];
export type Weight = (typeof WEIGHTS)[number];
export type LayoutChartKind = (typeof CHART_KINDS)[number];

export interface BlockStyle {
  color?: TokenColor;
  background?: TokenColor;
  font?: TokenFont;
  size?: SizeScale;
  weight?: Weight;
  align?: Align;
  padding?: SpaceScale;
}

export type LeafBlock =
  | { kind: "heading"; field: string; style?: BlockStyle }
  | { kind: "paragraph"; field: string; style?: BlockStyle }
  | { kind: "list"; field: string; style?: BlockStyle }
  | { kind: "keyValue"; fields: string[]; style?: BlockStyle }
  | { kind: "table"; field: string; style?: BlockStyle }
  | { kind: "chart"; field: string; chart: LayoutChartKind; style?: BlockStyle }
  | { kind: "matrix"; field: string; style?: BlockStyle }
  | { kind: "logo"; style?: BlockStyle }
  | { kind: "divider"; style?: BlockStyle }
  | { kind: "callout"; text: string; style?: BlockStyle }
  | { kind: "text"; text: string; style?: BlockStyle };

/** A background image is a fixed asset URL OR a bound per-proposal image field (§I). */
export type ImageRef = { assetUrl: string } | { field: string };

export interface BlockBackground {
  image?: ImageRef;
  overlay?: { color: TokenColor; opacity: number }; // opacity 0..100, brand-token tint
  position?: "cover" | "contain";
  minHeight?: SizeScale | "page"; // "page" → the document format's content height (§J)
}

export type ContainerBlock =
  | { kind: "stack"; gap?: SpaceScale; style?: BlockStyle; background?: BlockBackground; children: Block[] }
  | {
      kind: "columns";
      gap?: SpaceScale;
      widths?: number[];
      style?: BlockStyle;
      background?: BlockBackground;
      columns: Block[][];
    };

export type Block = LeafBlock | ContainerBlock;

export const LEAF_KINDS = [
  "heading", "paragraph", "list", "keyValue", "table", "chart", "matrix", "logo", "divider", "callout", "text",
] as const;
export const CONTAINER_KINDS = ["stack", "columns"] as const;

export interface SectionLayout {
  type: string; // section-type key
  variant: string; // design-identity slug
  pageFormat: string; // the page format this layout is designed for (§J)
  name: string; // display label
  root: Block; // normally a stack
  version: number;
}
```

- [ ] **Step 4: Create the style compiler**

Create `packages/shared/src/render/layoutStyle.ts`:

```ts
import type { BlockStyle, SizeScale, SpaceScale, Weight } from "../types/layout";

/** size scale → font-size rem (§A). */
const SIZE_REM: Record<SizeScale, number> = { xs: 0.8, sm: 0.9, md: 1, lg: 1.35, xl: 1.9 };
/** SpaceScale → base px (multiplied by the theme --space at compile time). */
const SPACE_PX: Record<SpaceScale, number> = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };
/** weight token → numeric font-weight. */
const WEIGHT_N: Record<Weight, number> = { regular: 400, medium: 550, bold: 700 };

/** A SpaceScale as a theme-aware length: `calc(<px> * var(--space))`. */
export function spaceToken(scale: SpaceScale): string {
  return `calc(${SPACE_PX[scale]}px * var(--space))`;
}

/**
 * Compile a token-only BlockStyle into inline CSS (string values only). Every
 * value resolves to a theme CSS variable or a fixed scale unit — never a raw
 * colour/length — so brand consistency is structural. Returns a plain map the
 * renderer spreads into `style`.
 */
export function compileBlockStyle(style?: BlockStyle): Record<string, string> {
  const css: Record<string, string> = {};
  if (!style) return css;
  if (style.color) css.color = `var(--c-${style.color})`;
  if (style.background) css.background = `var(--c-${style.background})`;
  if (style.font) css.fontFamily = `var(--f-${style.font})`;
  if (style.size) css.fontSize = `${SIZE_REM[style.size]}rem`;
  if (style.weight) css.fontWeight = String(WEIGHT_N[style.weight]);
  if (style.align) css.textAlign = style.align;
  if (style.padding) css.padding = spaceToken(style.padding);
  return css;
}
```

- [ ] **Step 5: Re-export the types + compiler**

In `packages/shared/src/types/index.ts`, add (next to the other `export * from "./…"` lines):

```ts
export * from "./layout";
```

In `packages/shared/src/index.ts`, add a render-block export (next to the existing `export { PAGE, … } from "./render/page";` block):

```ts
export { compileBlockStyle, spaceToken } from "./render/layoutStyle";
```

(Types flow through `export * from "./types/index"` already at the top of `index.ts`; no separate type export line is needed, but if the existing file exports types explicitly per-module, mirror that for `./types/layout`. Report which pattern you used.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-layout-style.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/layout.ts packages/shared/src/render/layoutStyle.ts packages/shared/src/types/index.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-22-layout-style.test.ts
git commit -m "feat(layout): block-tree types + token-only style compiler"
```

---

### Task 2: `validateLayout` (`packages/shared`)

**Files:**
- Create: `packages/shared/src/validation/validateLayout.ts`
- Modify: `packages/shared/src/index.ts` (export `validateLayout`)
- Test: `packages/shared/src/__tests__/slice-22-validate-layout.test.ts`

**Interfaces:**
- Consumes: layout types + vocabularies (Task 1), `SectionTypeSchema`/`FieldSchema`, `ValidationResult`/`ValidationError`.
- Produces: `validateLayout(layout: unknown, typeSchema: SectionTypeSchema): ValidationResult` with JSON-pointer-ish paths.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-22-validate-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateLayout } from "../validation/validateLayout";
import type { SectionLayout } from "../types/layout";
import type { SectionTypeSchema } from "../types/section";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "subtitle", type: "paragraph", label: "Subtitle" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
    { key: "compare", type: "matrix", label: "Compare" },
    { key: "cover_image", type: "image", label: "Cover image" },
  ],
  variants: [],
  schemaVersion: 1,
};

const layout = (root: SectionLayout["root"]): SectionLayout => ({
  type: "cover", variant: "cover", pageFormat: "widescreen_16_9", name: "Cover", root, version: 1,
});

describe("validateLayout", () => {
  it("accepts a valid token-styled tree with kind-correct bindings", () => {
    const res = validateLayout(
      layout({
        kind: "stack",
        gap: "md",
        children: [
          { kind: "heading", field: "title", style: { color: "primary", size: "xl", align: "center" } },
          { kind: "paragraph", field: "subtitle" },
          { kind: "list", field: "bullets" },
          { kind: "keyValue", fields: ["title"] },
          { kind: "table", field: "metrics" },
          { kind: "chart", field: "metrics", chart: "bar" },
          { kind: "matrix", field: "compare" },
          { kind: "logo" },
          { kind: "divider" },
          { kind: "callout", text: "Static note" },
        ],
      }),
      coverType,
    );
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects an unknown block kind", () => {
    const res = validateLayout(layout({ kind: "stack", children: [{ kind: "marquee" } as never] }), coverType);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "/root/children/0/kind")).toBe(true);
  });

  it("rejects a heading bound to a dataset field (kind mismatch)", () => {
    const res = validateLayout(layout({ kind: "stack", children: [{ kind: "heading", field: "metrics" }] }), coverType);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path === "/root/children/0/field")).toBe(true);
  });

  it("rejects a binding to a nonexistent field", () => {
    const res = validateLayout(layout({ kind: "stack", children: [{ kind: "heading", field: "nope" }] }), coverType);
    expect(res.valid).toBe(false);
  });

  it("rejects an off-vocabulary style token", () => {
    const res = validateLayout(
      layout({ kind: "stack", children: [{ kind: "heading", field: "title", style: { color: "brandRed" as never } }] }),
      coverType,
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.endsWith("/style/color"))).toBe(true);
  });

  it("requires static text on callout/text", () => {
    const res = validateLayout(layout({ kind: "stack", children: [{ kind: "callout", text: "" }] }), coverType);
    expect(res.valid).toBe(false);
  });

  it("enforces 2–4 columns and matching widths", () => {
    const oneCol = validateLayout(layout({ kind: "columns", columns: [[]] }), coverType);
    expect(oneCol.valid).toBe(false);
    const badWidths = validateLayout(layout({ kind: "columns", widths: [1], columns: [[], []] }), coverType);
    expect(badWidths.valid).toBe(false);
  });

  it("enforces a max nesting depth of 4", () => {
    let node: SectionLayout["root"] = { kind: "heading", field: "title" };
    for (let i = 0; i < 5; i++) node = { kind: "stack", children: [node] };
    const res = validateLayout(layout(node), coverType);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => /depth/i.test(e.message))).toBe(true);
  });

  it("validates a background: image-field binding kind, overlay opacity, position, minHeight", () => {
    const ok = validateLayout(
      layout({
        kind: "stack",
        background: { image: { field: "cover_image" }, overlay: { color: "primary", opacity: 50 }, position: "cover", minHeight: "page" },
        children: [{ kind: "heading", field: "title" }],
      }),
      coverType,
    );
    expect(ok.valid).toBe(true);

    const badField = validateLayout(
      layout({ kind: "stack", background: { image: { field: "title" } }, children: [] }),
      coverType,
    );
    expect(badField.valid).toBe(false); // title is text, not image

    const badOpacity = validateLayout(
      layout({ kind: "stack", background: { overlay: { color: "primary", opacity: 150 } }, children: [] }),
      coverType,
    );
    expect(badOpacity.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-validate-layout.test.ts`
Expected: FAIL — `validateLayout` does not exist.

- [ ] **Step 3: Implement the validator**

Create `packages/shared/src/validation/validateLayout.ts`:

```ts
import type { ValidationError, ValidationResult } from "./result";
import type { FieldType, SectionTypeSchema } from "../types/section";
import {
  ALIGNS, CHART_KINDS, CONTAINER_KINDS, LEAF_KINDS, SIZE_SCALES, SPACE_SCALES,
  TOKEN_COLORS, TOKEN_FONTS, WEIGHTS,
} from "../types/layout";

const MAX_DEPTH = 4;

/** Which content field types each binding block accepts (§A). */
const BINDING_KINDS: Record<string, FieldType[]> = {
  heading: ["text", "paragraph"],
  paragraph: ["text", "paragraph"],
  list: ["list"],
  table: ["dataset"],
  chart: ["dataset"],
  matrix: ["matrix"],
};

const STYLE_VOCAB: Record<string, readonly string[]> = {
  color: TOKEN_COLORS,
  background: TOKEN_COLORS,
  font: TOKEN_FONTS,
  size: SIZE_SCALES,
  weight: WEIGHTS,
  align: ALIGNS,
  padding: SPACE_SCALES,
};

/**
 * Meta-validate an authored SectionLayout against its section type (§B). Field
 * bindings are kind-checked; styling must be in-vocabulary; containers are bounded
 * (2–4 columns, depth ≤ 4). Errors use JSON-pointer-ish paths. The renderer also
 * degrades defensively, so this is the authoring gate, not the only line of defence.
 */
export function validateLayout(layout: unknown, typeSchema: SectionTypeSchema): ValidationResult {
  const errors: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message, source: "app" });
  const fieldType = (key: string): FieldType | undefined => typeSchema.fields.find((f) => f.key === key)?.type;

  if (typeof layout !== "object" || layout === null) {
    return { valid: false, errors: [{ path: "", message: "Expected a layout object", source: "app" }] };
  }
  const root = (layout as { root?: unknown }).root;
  if (root === undefined || root === null) {
    return { valid: false, errors: [{ path: "/root", message: "layout.root is required", source: "app" }] };
  }

  const validateStyle = (style: unknown, path: string) => {
    if (style === undefined) return;
    if (typeof style !== "object" || style === null) {
      push(path, "style must be an object");
      return;
    }
    for (const [prop, value] of Object.entries(style as Record<string, unknown>)) {
      const vocab = STYLE_VOCAB[prop];
      if (!vocab) {
        push(`${path}/${prop}`, `unknown style prop "${prop}"`);
      } else if (typeof value !== "string" || !vocab.includes(value)) {
        push(`${path}/${prop}`, `${prop} must be one of ${vocab.join(", ")}`);
      }
    }
  };

  const validateBackground = (bg: unknown, path: string) => {
    if (bg === undefined) return;
    if (typeof bg !== "object" || bg === null) {
      push(path, "background must be an object");
      return;
    }
    const b = bg as Record<string, unknown>;
    if (b["image"] !== undefined) {
      const img = b["image"] as Record<string, unknown>;
      if (typeof img !== "object" || img === null) {
        push(`${path}/image`, "image must be an object");
      } else if (typeof img["assetUrl"] === "string") {
        // fixed asset — ok
      } else if (typeof img["field"] === "string") {
        if (fieldType(img["field"]) !== "image") {
          push(`${path}/image/field`, `background image field must bind to an image field`);
        }
      } else {
        push(`${path}/image`, "image must have an assetUrl or a field");
      }
    }
    if (b["overlay"] !== undefined) {
      const ov = b["overlay"] as Record<string, unknown>;
      if (typeof ov !== "object" || ov === null) {
        push(`${path}/overlay`, "overlay must be an object");
      } else {
        if (typeof ov["color"] !== "string" || !TOKEN_COLORS.includes(ov["color"] as never)) {
          push(`${path}/overlay/color`, `overlay.color must be one of ${TOKEN_COLORS.join(", ")}`);
        }
        const op = ov["opacity"];
        if (typeof op !== "number" || !Number.isInteger(op) || op < 0 || op > 100) {
          push(`${path}/overlay/opacity`, "overlay.opacity must be an integer 0–100");
        }
      }
    }
    if (b["position"] !== undefined && b["position"] !== "cover" && b["position"] !== "contain") {
      push(`${path}/position`, 'position must be "cover" or "contain"');
    }
    if (b["minHeight"] !== undefined && b["minHeight"] !== "page" && !SIZE_SCALES.includes(b["minHeight"] as never)) {
      push(`${path}/minHeight`, 'minHeight must be a size scale or "page"');
    }
  };

  const walk = (block: unknown, path: string, depth: number) => {
    if (depth > MAX_DEPTH) {
      push(path, `nesting depth exceeds ${MAX_DEPTH}`);
      return;
    }
    if (typeof block !== "object" || block === null) {
      push(path, "block must be an object");
      return;
    }
    const b = block as Record<string, unknown>;
    const kind = b["kind"];
    if (typeof kind !== "string" || (!LEAF_KINDS.includes(kind as never) && !CONTAINER_KINDS.includes(kind as never))) {
      push(`${path}/kind`, `unknown block kind "${String(kind)}"`);
      return;
    }
    validateStyle(b["style"], `${path}/style`);

    // Field-binding leaf blocks.
    if (kind in BINDING_KINDS) {
      const allowed = BINDING_KINDS[kind]!;
      const f = b["field"];
      if (typeof f !== "string") {
        push(`${path}/field`, `${kind} requires a field`);
      } else {
        const ft = fieldType(f);
        if (ft === undefined) push(`${path}/field`, `field "${f}" does not exist on this type`);
        else if (!allowed.includes(ft)) push(`${path}/field`, `${kind} cannot bind to a ${ft} field`);
      }
      if (kind === "chart" && !CHART_KINDS.includes(b["chart"] as never)) {
        push(`${path}/chart`, `chart must be one of ${CHART_KINDS.join(", ")}`);
      }
      return;
    }
    if (kind === "keyValue") {
      const fields = b["fields"];
      if (!Array.isArray(fields) || fields.length === 0) {
        push(`${path}/fields`, "keyValue requires at least one field");
      } else {
        fields.forEach((f, i) => {
          const ft = typeof f === "string" ? fieldType(f) : undefined;
          if (ft !== "text" && ft !== "paragraph") push(`${path}/fields/${i}`, "keyValue fields must be text/paragraph");
        });
      }
      return;
    }
    if (kind === "callout" || kind === "text") {
      if (typeof b["text"] !== "string" || b["text"].trim() === "") push(`${path}/text`, `${kind} requires non-empty text`);
      return;
    }
    if (kind === "logo" || kind === "divider") return; // bind nothing

    // Containers.
    if (kind === "stack") {
      validateBackground(b["background"], `${path}/background`);
      const children = b["children"];
      if (!Array.isArray(children)) push(`${path}/children`, "stack requires a children array");
      else children.forEach((c, i) => walk(c, `${path}/children/${i}`, depth + 1));
      return;
    }
    if (kind === "columns") {
      validateBackground(b["background"], `${path}/background`);
      const cols = b["columns"];
      if (!Array.isArray(cols) || cols.length < 2 || cols.length > 4) {
        push(`${path}/columns`, "columns must have 2–4 columns");
      } else {
        const widths = b["widths"];
        if (widths !== undefined) {
          if (!Array.isArray(widths) || widths.length !== cols.length || widths.some((w) => typeof w !== "number" || w <= 0)) {
            push(`${path}/widths`, "widths must match the column count and be positive");
          }
        }
        cols.forEach((col, i) => {
          if (!Array.isArray(col)) push(`${path}/columns/${i}`, "each column must be an array of blocks");
          else col.forEach((c, j) => walk(c, `${path}/columns/${i}/${j}`, depth + 1));
        });
      }
      return;
    }
  };

  walk(root, "/root", 1);
  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, add to the validation export block (next to `validateSectionTypeDefinition`):

```ts
export { validateLayout } from "./validation/validateLayout";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-validate-layout.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/validation/validateLayout.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-22-validate-layout.test.ts
git commit -m "feat(layout): validateLayout — kind-checked bindings, token vocab, bounds, backgrounds"
```

---

### Task 3: Active-layouts registry (`packages/shared`)

**Files:**
- Create: `packages/shared/src/registry/layouts.ts`
- Modify: `packages/shared/src/index.ts` (export the registry API)
- Test: `packages/shared/src/__tests__/slice-22-layouts-registry.test.ts`

**Interfaces:**
- Consumes: `SectionLayout` (Task 1), `DEFAULT_PAGE_FORMAT` (from `render/page`).
- Produces: `setActiveLayouts(list)`, `getLayout(type, variant, pageFormat?)`, `listLayoutVariants(type, pageFormat?)`, `layoutsRevision()`, `resetLayoutsForTests()`. Identity = `(type, variant, pageFormat)`, absent format → `DEFAULT_PAGE_FORMAT`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-22-layouts-registry.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  setActiveLayouts, getLayout, listLayoutVariants, layoutsRevision, resetLayoutsForTests,
} from "../registry/layouts";
import type { SectionLayout } from "../types/layout";

const mk = (variant: string, pageFormat: string): SectionLayout => ({
  type: "cover", variant, pageFormat, name: variant, root: { kind: "stack", children: [] }, version: 1,
});

afterEach(() => resetLayoutsForTests());

describe("layouts registry", () => {
  it("get/list by (type, variant, format); absent format → a4_portrait default", () => {
    setActiveLayouts([mk("cover", "widescreen_16_9"), mk("hero", "a4_portrait")]);
    expect(getLayout("cover", "cover", "widescreen_16_9")?.name).toBe("cover");
    expect(getLayout("cover", "cover", "a4_portrait")).toBeUndefined();
    expect(getLayout("cover", "hero", undefined)?.name).toBe("hero"); // default format
    expect(listLayoutVariants("cover", "widescreen_16_9")).toEqual(["cover"]);
    expect(listLayoutVariants("cover", "a4_portrait")).toEqual(["hero"]);
  });

  it("bumps the revision on set/reset", () => {
    const r0 = layoutsRevision();
    setActiveLayouts([mk("cover", "a4_portrait")]);
    expect(layoutsRevision()).toBeGreaterThan(r0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-layouts-registry.test.ts`
Expected: FAIL — `../registry/layouts` does not exist.

- [ ] **Step 3: Implement the registry**

Create `packages/shared/src/registry/layouts.ts`:

```ts
import type { SectionLayout } from "../types/layout";
import { DEFAULT_PAGE_FORMAT } from "../render/page";

/**
 * Active-layouts registry (§C) — mirrors the section-type registry. Holds the
 * authored layouts pushed in from the DB (Phase 4) or seeded in tests. Identity is
 * (type, variant, pageFormat); an absent format resolves to the default.
 */
const activeLayouts = new Map<string, SectionLayout>();
let revision = 0;

const lkey = (type: string, variant: string, pageFormat: string) => `${type}:${variant}:${pageFormat}`;

export function setActiveLayouts(list: SectionLayout[]): void {
  activeLayouts.clear();
  for (const l of list) activeLayouts.set(lkey(l.type, l.variant, l.pageFormat), l);
  revision++;
}

export function getLayout(type: string, variant: string, pageFormat?: string): SectionLayout | undefined {
  return activeLayouts.get(lkey(type, variant, pageFormat ?? DEFAULT_PAGE_FORMAT));
}

/** Authored variant slugs for a type that have a layout for the given format. */
export function listLayoutVariants(type: string, pageFormat?: string): string[] {
  const fmt = pageFormat ?? DEFAULT_PAGE_FORMAT;
  return [...activeLayouts.values()].filter((l) => l.type === type && l.pageFormat === fmt).map((l) => l.variant);
}

export function layoutsRevision(): number {
  return revision;
}

/** Test seam: clear the registry. */
export function resetLayoutsForTests(): void {
  activeLayouts.clear();
  revision++;
}
```

- [ ] **Step 4: Export the registry API**

In `packages/shared/src/index.ts`, add (near the section-types registry export block):

```ts
export {
  setActiveLayouts,
  getLayout,
  listLayoutVariants,
  layoutsRevision,
  resetLayoutsForTests,
} from "./registry/layouts";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-22-layouts-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/registry/layouts.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-22-layouts-registry.test.ts
git commit -m "feat(layout): active-layouts registry keyed by (type, variant, pageFormat)"
```

---

### Task 4: `LayoutRenderer` interpreter — leaf + container blocks (`apps/web`)

**Files:**
- Create: `apps/web/src/render/LayoutRenderer.tsx`
- Test: `apps/web/src/__tests__/slice-22-layout-renderer.test.tsx`

**Interfaces:**
- Consumes: `SectionLayout`/`Block`, `compileBlockStyle`/`spaceToken`, `getSectionType`, `ThemeTokens`; the existing `DataTable`, `ChartView`, `ComparisonMatrix`.
- Produces: `LayoutRenderer({ layout, data, theme }) → JSX`. A recursive `switch` over block kinds; each block root carries `data-block="<kind>"`; data blocks reuse the real components (wrapping the bound field into the `{ dataset }`/`{ matrix }` shape each expects); unknown kinds render `null` (never throw). Backgrounds come in Task 5.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-22-layout-renderer.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import { setActiveSectionTypes, resetSectionTypesForTests } from "@proposal/shared";
import type { SectionLayout, SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "subtitle", type: "paragraph", label: "Subtitle" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
  ],
  variants: [], schemaVersion: 1,
};

const data = {
  title: "Solar for Acme",
  subtitle: "A turnkey path.",
  bullets: ["One", "Two"],
  metrics: { columns: [{ key: "y", label: "Year", type: "text" }], rows: [{ y: "2026" }] },
};

const layout = (root: SectionLayout["root"]): SectionLayout => ({
  type: "cover", variant: "cover", pageFormat: "widescreen_16_9", name: "Cover", root, version: 1,
});

afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
});

describe("LayoutRenderer", () => {
  it("renders leaf blocks bound to data, with token styles", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack", gap: "md",
          children: [
            { kind: "heading", field: "title", style: { color: "primary", align: "center" } },
            { kind: "paragraph", field: "subtitle" },
            { kind: "list", field: "bullets" },
            { kind: "text", text: "Static caption" },
            { kind: "divider" },
          ],
        })}
        data={data}
        theme={defaultTheme}
      />,
    );
    const heading = container.querySelector('[data-block="heading"]') as HTMLElement;
    expect(heading.textContent).toBe("Solar for Acme");
    expect(heading.style.color).toBe("var(--c-primary)");
    expect(heading.style.textAlign).toBe("center");
    expect(container.querySelector('[data-block="paragraph"]')!.textContent).toBe("A turnkey path.");
    expect(container.querySelectorAll('[data-block="list"] li').length).toBe(2);
    expect(container.querySelector('[data-block="text"]')!.textContent).toBe("Static caption");
    expect(container.querySelector('[data-block="divider"]')).toBeTruthy();
  });

  it("renders a table block by reusing DataTable on the bound field", () => {
    setActiveSectionTypes([coverType]);
    const { container } = render(
      <LayoutRenderer layout={layout({ kind: "stack", children: [{ kind: "table", field: "metrics" }] })} data={data} theme={defaultTheme} />,
    );
    expect(container.querySelector('[data-block="table"] table')).toBeTruthy();
  });

  it("nests columns with per-column width", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "columns", widths: [2, 1],
          columns: [[{ kind: "heading", field: "title" }], [{ kind: "paragraph", field: "subtitle" }]],
        })}
        data={data}
        theme={defaultTheme}
      />,
    );
    const cols = container.querySelectorAll('[data-block="columns"] > [data-column]');
    expect(cols.length).toBe(2);
    expect((cols[0] as HTMLElement).style.flex).toBe("2");
  });

  it("skips an unknown block kind without throwing", () => {
    const { container } = render(
      <LayoutRenderer layout={layout({ kind: "stack", children: [{ kind: "marquee" } as never] })} data={data} theme={defaultTheme} />,
    );
    expect(container.querySelector('[data-block="stack"]')).toBeTruthy();
    expect(container.querySelector('[data-block="marquee"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-22-layout-renderer.test.tsx`
Expected: FAIL — `../render/LayoutRenderer` does not exist.

- [ ] **Step 3: Implement the interpreter**

Create `apps/web/src/render/LayoutRenderer.tsx`:

```tsx
import type { Key, ReactNode } from "react";
import type { Block, SectionLayout, ThemeTokens } from "@proposal/shared";
import { compileBlockStyle, spaceToken, getSectionType } from "@proposal/shared";
import { DataTable } from "../components/sections/DataTable";
import { ComparisonMatrix } from "../components/sections/ComparisonMatrix";
import { ChartView } from "../components/charts/ChartView";

type Data = Record<string, unknown>;

const asText = (v: unknown): string => (typeof v === "string" ? v : "");
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/**
 * Safe layout interpreter (§C): a recursive `switch` over known block kinds. There
 * is NO code execution and NO raw-HTML injection — content is rendered as text,
 * data blocks reuse the registered render components, and styling is the compiled
 * token CSS only. Unknown kinds/props are skipped (never thrown), so a layout
 * authored against an older schema degrades gracefully.
 */
function renderBlock(block: Block, data: Data, theme: ThemeTokens, layoutType: string, k: Key): ReactNode {
  const style = compileBlockStyle(block.style);
  switch (block.kind) {
    case "heading":
      return (
        <div key={k} data-block="heading" style={{ fontFamily: "var(--f-heading)", ...style }}>
          {asText(data[block.field])}
        </div>
      );
    case "paragraph":
      return (
        <p key={k} data-block="paragraph" style={style}>
          {asText(data[block.field])}
        </p>
      );
    case "list":
      return (
        <ul key={k} data-block="list" style={style}>
          {asList(data[block.field]).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "keyValue": {
      const fields = getSectionType(layoutType)?.fields ?? [];
      const labelFor = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
      return (
        <dl key={k} data-block="keyValue" style={style}>
          {block.fields.map((fk) => (
            <div key={fk} data-kv={fk}>
              <dt>{labelFor(fk)}</dt>
              <dd>{asText(data[fk])}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case "table":
      return (
        <div key={k} data-block="table" style={style}>
          <DataTable data={{ dataset: data[block.field] }} theme={theme} />
        </div>
      );
    case "chart":
      return (
        <div key={k} data-block="chart" style={style}>
          <ChartView data={{ dataset: data[block.field] }} theme={theme} kind={block.chart} />
        </div>
      );
    case "matrix":
      return (
        <div key={k} data-block="matrix" style={style}>
          <ComparisonMatrix data={{ matrix: data[block.field] }} theme={theme} />
        </div>
      );
    case "logo":
      return theme.logoUrl ? <img key={k} data-block="logo" src={theme.logoUrl} alt="" style={style} /> : null;
    case "divider":
      return <hr key={k} data-block="divider" style={{ borderColor: "var(--c-line)", ...style }} />;
    case "callout":
      return (
        <div key={k} data-block="callout" style={{ background: "var(--c-surface)", padding: spaceToken("md"), ...style }}>
          {block.text}
        </div>
      );
    case "text":
      return (
        <span key={k} data-block="text" style={style}>
          {block.text}
        </span>
      );
    case "stack":
      return (
        <div
          key={k}
          data-block="stack"
          style={{ display: "flex", flexDirection: "column", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.children.map((child, i) => renderBlock(child, data, theme, layoutType, i))}
        </div>
      );
    case "columns":
      return (
        <div
          key={k}
          data-block="columns"
          style={{ display: "flex", flexDirection: "row", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.columns.map((col, i) => (
            <div key={i} data-column={i} style={{ flex: block.widths?.[i] ?? 1 }}>
              {col.map((child, j) => renderBlock(child, data, theme, layoutType, j))}
            </div>
          ))}
        </div>
      );
    default:
      return null; // unknown kind — skip, never throw
  }
}

export function LayoutRenderer({
  layout,
  data,
  theme,
}: {
  layout: SectionLayout;
  data: Data;
  theme: ThemeTokens;
}) {
  return (
    <div data-layout={`${layout.type}:${layout.variant}`}>
      {renderBlock(layout.root, data, theme, layout.type, "root")}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-22-layout-renderer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (The `default` branch handles malformed runtime input; the `{ kind: "marquee" } as never` test input exercises it.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/render/LayoutRenderer.tsx apps/web/src/__tests__/slice-22-layout-renderer.test.tsx
git commit -m "feat(layout): LayoutRenderer interpreter (leaf + container blocks, safe switch)"
```

---

### Task 5: Backgrounds & overlays in `LayoutRenderer` (§I)

**Files:**
- Modify: `apps/web/src/render/LayoutRenderer.tsx`
- Test: `apps/web/src/__tests__/slice-22-layout-background.test.tsx`

**Interfaces:**
- Consumes: `BlockBackground`/`ImageRef`, `getPageFormat` (page content height for `minHeight: "page"`).
- Produces: `LayoutRenderer` gains an optional `pageFormat?: string` prop; a container (`stack`/`columns`) with `background` renders a positioned wrapper — `background-image` (asset URL or `data[field]`), `background-size` from `position`, optional `minHeight`, an overlay layer (`var(--c-<color>)` at `opacity%`) between image and children. Missing image → no background image (graceful), never throws.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-22-layout-background.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { SectionLayout } from "@proposal/shared";

const layout = (root: SectionLayout["root"]): SectionLayout => ({
  type: "cover", variant: "cover", pageFormat: "widescreen_16_9", name: "Cover", root, version: 1,
});

afterEach(() => cleanup());

describe("LayoutRenderer backgrounds", () => {
  it("renders a fixed-asset background with an overlay tint", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack",
          background: { image: { assetUrl: "https://blob/cover.jpg" }, overlay: { color: "primary", opacity: 50 }, position: "cover" },
          children: [{ kind: "text", text: "Hi" }],
        })}
        data={{}}
        theme={defaultTheme}
        pageFormat="widescreen_16_9"
      />,
    );
    const wrap = container.querySelector('[data-bg="true"]') as HTMLElement;
    expect(wrap.style.backgroundImage).toBe('url(https://blob/cover.jpg)');
    expect(wrap.style.backgroundSize).toBe("cover");
    const overlay = container.querySelector('[data-bg-overlay="true"]') as HTMLElement;
    expect(overlay.style.background).toBe("var(--c-primary)");
    expect(overlay.style.opacity).toBe("0.5");
  });

  it("binds a background image to a per-proposal image field", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({ kind: "stack", background: { image: { field: "cover_image" } }, children: [] })}
        data={{ cover_image: "https://blob/p1.png" }}
        theme={defaultTheme}
      />,
    );
    expect((container.querySelector('[data-bg="true"]') as HTMLElement).style.backgroundImage).toBe('url(https://blob/p1.png)');
  });

  it('minHeight "page" resolves to the format content height in mm', () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({ kind: "stack", background: { minHeight: "page" }, children: [] })}
        data={{}}
        theme={defaultTheme}
        pageFormat="a4_portrait"
      />,
    );
    // a4_portrait: 297 - 2*18 = 261mm
    expect((container.querySelector('[data-bg="true"]') as HTMLElement).style.minHeight).toBe("261mm");
  });

  it("degrades gracefully with no image (no background-image, no throw)", () => {
    const { container } = render(
      <LayoutRenderer layout={layout({ kind: "stack", background: { overlay: { color: "text", opacity: 20 } }, children: [] })} data={{}} theme={defaultTheme} />,
    );
    const wrap = container.querySelector('[data-bg="true"]') as HTMLElement;
    expect(wrap.style.backgroundImage).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-22-layout-background.test.tsx`
Expected: FAIL — no `data-bg` wrapper; `LayoutRenderer` has no `pageFormat` prop / no background handling.

- [ ] **Step 3: Add background support + the `pageFormat` prop**

Edit `apps/web/src/render/LayoutRenderer.tsx`:

Extend the import from `@proposal/shared` to include the background types + `getPageFormat`:

```ts
import type { Block, BlockBackground, ImageRef, SectionLayout, ThemeTokens } from "@proposal/shared";
import { compileBlockStyle, spaceToken, getSectionType, getPageFormat } from "@proposal/shared";
```

Add these helpers above `renderBlock`:

```tsx
/** minHeight scale → a rem block-height (v1 choice; "page" is handled separately). */
const MINH_REM: Record<string, number> = { xs: 8, sm: 12, md: 16, lg: 24, xl: 36 };

function resolveImageUrl(image: ImageRef | undefined, data: Data): string | undefined {
  if (!image) return undefined;
  if ("assetUrl" in image) return image.assetUrl || undefined;
  const v = data[image.field];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Wrap a container's children in a positioned background (image + token overlay, §I). */
function withBackground(
  bg: BlockBackground,
  data: Data,
  pageFormat: string | undefined,
  inner: ReactNode,
  k: Key,
): ReactNode {
  const url = resolveImageUrl(bg.image, data);
  const minHeight =
    bg.minHeight === "page"
      ? `${getPageFormat(pageFormat).heightMm - 2 * getPageFormat(pageFormat).marginMm}mm`
      : bg.minHeight
        ? `${MINH_REM[bg.minHeight]}rem`
        : undefined;
  return (
    <div
      key={k}
      data-bg="true"
      style={{
        position: "relative",
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: bg.position ?? "cover",
        backgroundPosition: "center",
        minHeight,
        overflow: "hidden",
      }}
    >
      {bg.overlay ? (
        <div
          data-bg-overlay="true"
          style={{ position: "absolute", inset: 0, background: `var(--c-${bg.overlay.color})`, opacity: bg.overlay.opacity / 100 }}
        />
      ) : null}
      <div style={{ position: "relative" }}>{inner}</div>
    </div>
  );
}
```

Thread `pageFormat` through `renderBlock` and apply the background to containers. Change the `renderBlock` signature and the `stack`/`columns` cases:

```tsx
function renderBlock(block: Block, data: Data, theme: ThemeTokens, layoutType: string, pageFormat: string | undefined, k: Key): ReactNode {
```

(Update the two recursive calls inside `stack` and `columns` to pass `pageFormat`: `renderBlock(child, data, theme, layoutType, pageFormat, i)` etc.)

Replace the `stack` case body's return with a background-aware version:

```tsx
    case "stack": {
      const inner = (
        <div
          data-block="stack"
          style={{ display: "flex", flexDirection: "column", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.children.map((child, i) => renderBlock(child, data, theme, layoutType, pageFormat, i))}
        </div>
      );
      return block.background ? withBackground(block.background, data, pageFormat, inner, k) : <div key={k}>{inner}</div>;
    }
```

Replace the `columns` case similarly:

```tsx
    case "columns": {
      const inner = (
        <div
          data-block="columns"
          style={{ display: "flex", flexDirection: "row", gap: block.gap ? spaceToken(block.gap) : undefined, ...style }}
        >
          {block.columns.map((col, i) => (
            <div key={i} data-column={i} style={{ flex: block.widths?.[i] ?? 1 }}>
              {col.map((child, j) => renderBlock(child, data, theme, layoutType, pageFormat, j))}
            </div>
          ))}
        </div>
      );
      return block.background ? withBackground(block.background, data, pageFormat, inner, k) : <div key={k}>{inner}</div>;
    }
```

(The other cases keep their existing `key={k}`; only `stack`/`columns` now wrap. Leave the non-container cases' recursive-call arity unchanged — they have none.)

Finally, update `LayoutRenderer` to accept + pass `pageFormat`:

```tsx
export function LayoutRenderer({
  layout,
  data,
  theme,
  pageFormat,
}: {
  layout: SectionLayout;
  data: Data;
  theme: ThemeTokens;
  pageFormat?: string;
}) {
  return (
    <div data-layout={`${layout.type}:${layout.variant}`}>
      {renderBlock(layout.root, data, theme, layout.type, pageFormat, "root")}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-22-layout-background.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify the Task-4 renderer test still passes**

Run: `npx vitest run apps/web/src/__tests__/slice-22-layout-renderer.test.tsx`
Expected: PASS (the no-background `stack`/`columns` now render inside a keyed wrapper `<div>`; the `[data-block="stack"]`/`[data-block="columns"]` and `> [data-column]` selectors still match — the wrapper is transparent to them).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/render/LayoutRenderer.tsx apps/web/src/__tests__/slice-22-layout-background.test.tsx
git commit -m "feat(layout): container backgrounds + token overlays + page-height (§I)"
```

---

### Task 6: Format-aware `resolveSection` + `availableVariants` (`apps/web`)

**Files:**
- Modify: `apps/web/src/registry/componentRegistry.tsx`
- Modify: `apps/web/src/render/SectionRenderer.tsx`
- Modify: `apps/web/src/render/DocumentRenderer.tsx`
- Test: `apps/web/src/__tests__/slice-22-resolve-layout.test.tsx`

**Interfaces:**
- Consumes: `getLayout`/`listLayoutVariants` (Task 3), `LayoutRenderer` (Tasks 4–5).
- Produces: `resolveSection(section, registry?, pageFormat?)` precedence **authored layout → code component → generic**; `availableVariants(type, pageFormat?, registry?)` = code variants ∪ authored variants for that format. `SectionRenderer`/`DocumentRenderer` thread `pageFormat`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-22-resolve-layout.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { resolveSection, availableVariants, defaultRegistry } from "../registry/componentRegistry";
import { setActiveLayouts, resetLayoutsForTests } from "@proposal/shared";
import type { Section, SectionLayout } from "@proposal/shared";
import { defaultTheme } from "../theme/defaultTheme";

const authored: SectionLayout = {
  type: "text", variant: "standard", pageFormat: "widescreen_16_9", name: "Slide",
  root: { kind: "stack", children: [{ kind: "heading", field: "heading" }] }, version: 1,
};

afterEach(() => {
  cleanup();
  resetLayoutsForTests();
});

describe("format-aware resolveSection", () => {
  const section: Section = { id: "s1", type: "text", variant: "standard", data: { heading: "Hello" } };

  it("prefers an authored layout for the document format over the code component", () => {
    setActiveLayouts([authored]);
    const { Component, unstyled, variant } = resolveSection(section, defaultRegistry, "widescreen_16_9");
    expect(unstyled).toBe(false);
    expect(variant).toBe("standard");
    const { container } = render(<Component data={section.data} theme={defaultTheme} />);
    expect(container.querySelector('[data-block="heading"]')!.textContent).toBe("Hello");
  });

  it("falls back to the code component when no authored layout matches the format", () => {
    setActiveLayouts([authored]); // only exists for widescreen_16_9
    const resolved = resolveSection(section, defaultRegistry, "a4_portrait");
    expect(resolved.unstyled).toBe(false);
    // the code component is TextSection, not the LayoutRenderer wrapper
    const { container } = render(<resolved.Component data={section.data} theme={defaultTheme} />);
    expect(container.querySelector('[data-block="heading"]')).toBeNull();
  });

  it("availableVariants = code variants ∪ authored variants for the format", () => {
    setActiveLayouts([{ ...authored, variant: "slide_only" }]);
    const variants = availableVariants("text", "widescreen_16_9");
    expect(variants).toContain("standard"); // code
    expect(variants).toContain("slide_only"); // authored
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-22-resolve-layout.test.tsx`
Expected: FAIL — `availableVariants` is not exported; `resolveSection` ignores authored layouts / has no `pageFormat` param.

- [ ] **Step 3: Make `resolveSection` format-aware + add `availableVariants`**

Edit `apps/web/src/registry/componentRegistry.tsx`:

Add imports:

```ts
import { getSectionType, getLayout, listLayoutVariants, type Section } from "@proposal/shared";
import { LayoutRenderer } from "../render/LayoutRenderer";
```

(Keep the existing `import { getSectionType, type Section } from "@proposal/shared";` — merge `getLayout`/`listLayoutVariants` into it rather than duplicating.)

Replace the `resolveSection` function with:

```tsx
/**
 * Resolve a section to a component (§C/§J). Precedence: an authored layout for
 * (type, variant, pageFormat) → the registered code component → the generic
 * fallback. An authored layout renders via the safe `LayoutRenderer`.
 */
export function resolveSection(
  section: Section,
  registry: ComponentRegistry = defaultRegistry,
  pageFormat?: string,
): ResolvedSection {
  const typeSchema = getSectionType(section.type);
  const variant = section.variant ?? typeSchema?.defaultVariant;

  // 1. Authored layout wins (format-aware).
  if (variant) {
    const layout = getLayout(section.type, variant, pageFormat);
    if (layout) {
      const Layout = (props: SectionComponentProps) => (
        <LayoutRenderer layout={layout} data={props.data} theme={props.theme} pageFormat={pageFormat} />
      );
      Layout.displayName = `Layout(${section.type}:${variant})`;
      return { Component: Layout, unstyled: false, variant };
    }
  }

  // 2. Code component.
  const entry = variant ? registry.get(key(section.type, variant)) : undefined;
  if (entry && variant) {
    if (typeSchema && entry.schemaVersion !== typeSchema.schemaVersion) {
      console.warn(
        `[registry] ${section.type}:${variant} was authored against schemaVersion ` +
          `${entry.schemaVersion} but the type is now at ${typeSchema.schemaVersion}.`,
      );
    }
    return { Component: entry.component, unstyled: false, variant };
  }

  // 3. Generic fallback.
  return { Component: GenericSection, unstyled: true };
}

/** Selectable variants for a type at a format: code variants ∪ authored variants (§C). */
export function availableVariants(
  type: string,
  pageFormat?: string,
  registry: ComponentRegistry = defaultRegistry,
): string[] {
  const prefix = `${type}:`;
  const code = [...registry.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  const authored = listLayoutVariants(type, pageFormat);
  return [...new Set([...code, ...authored])];
}
```

(`SectionComponentProps` is already imported at the top of the file.)

- [ ] **Step 4: Thread `pageFormat` through `SectionRenderer`**

In `apps/web/src/render/SectionRenderer.tsx`, add a `pageFormat` prop and pass it:

```tsx
export function SectionRenderer({
  section,
  theme,
  registry,
  pageFormat,
}: {
  section: Section;
  theme: ThemeTokens;
  registry?: ComponentRegistry;
  pageFormat?: string;
}) {
  const { Component, unstyled, variant } = resolveSection(section, registry, pageFormat);
  return (
    <div
      data-section-type={section.type}
      data-variant={variant}
      data-unstyled={unstyled ? "true" : undefined}
    >
      <Component data={section.data} theme={theme} />
    </div>
  );
}
```

- [ ] **Step 5: Pass the document format from `DocumentRenderer`**

In `apps/web/src/render/DocumentRenderer.tsx`, pass `pageFormat={document.pageFormat}` to each `SectionRenderer`. Both the slides and report branches render `<SectionRenderer section={section} theme={theme} />` — add the prop to each:

```tsx
<SectionRenderer section={section} theme={theme} pageFormat={document.pageFormat} />
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-22-resolve-layout.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify resolution + render regressions**

Run: `npx vitest run apps/web/src/__tests__/slice-02-registry.test.tsx apps/web/src/__tests__/slice-19-renderer.test.tsx apps/web/src/__tests__/slice-20-renderer-formats.test.tsx`
Expected: PASS (no authored layouts set → resolveSection behaves exactly as before; the added optional params are backward-compatible).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/registry/componentRegistry.tsx apps/web/src/render/SectionRenderer.tsx apps/web/src/render/DocumentRenderer.tsx apps/web/src/__tests__/slice-22-resolve-layout.test.tsx
git commit -m "feat(layout): format-aware resolveSection (authored>code>generic) + availableVariants"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (existing + new slice-22).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 4: Commit (only if incidental fixes were needed)**

```bash
git add -A
git commit -m "test: phase-3 layout model green (suite + typecheck + build)"
```

---

## Self-Review

**1. Spec coverage:**
- §A block-tree types + token mappings → Task 1 (types) + the compiler (`compileBlockStyle`/`spaceToken`). ✅
- §B `validateLayout` (root, known kinds, kind-checked bindings, static text, keyValue, style vocab, chart kind, columns 2–4 + widths, depth ≤ 4, background rules, JSON-pointer paths) → Task 2. ✅
- §C active-layouts registry (`setActiveLayouts`/`getLayout`/`listLayoutVariants`/revision) → Task 3. ✅
- §C `LayoutRenderer` safe interpreter, reusing DataTable/ChartView/ComparisonMatrix, token styling, unknown-kind skip → Task 4. ✅
- §I backgrounds + token overlays + `minHeight: "page"` + graceful no-image → Task 5. ✅
- §C/§J format-aware `resolveSection` (authored > code > generic) + `availableVariants` + thread `pageFormat` from the document → Task 6. ✅
- Correctly **out of scope** (later phases): storage/migration/CRUD routes + hydration into the registry (Phase 4); `SectionLayoutsView`/`LayoutEditor` authoring UI + Inspector/Outline variant pickers wired to `availableVariants` + `sampleDataForType` (Phase 5). `print-color-adjust: exact` lands with the export-route wiring in Phase 4/5 where backgrounds reach the PDF. Noted; not implemented here.

**2. Placeholder scan:** No TBD/TODO; every code step is complete with the actual code. The `minHeight` SizeScale→rem map (`MINH_REM`) is an explicit v1 design choice (the spec leaves SizeScale minHeight unspecified; `"page"` is exact), documented inline.

**3. Type consistency:** `SectionLayout` fields (`type/variant/pageFormat/name/root/version`) are identical across Tasks 1–6. `Block`/`BlockStyle`/`BlockBackground`/`ImageRef` consumed consistently by the validator (Task 2) and renderer (Tasks 4–5). The compiler `compileBlockStyle(style?)`/`spaceToken(scale)` signatures match every call site. `getLayout(type, variant, pageFormat?)`/`listLayoutVariants(type, pageFormat?)` match Task 6's calls. `resolveSection(section, registry?, pageFormat?)` keeps the existing 1–2-arg call sites valid (backward-compatible) and adds the 3rd optional param used by `SectionRenderer`. The `LayoutRenderer` prop set grows from `{layout,data,theme}` (Task 4) to `+pageFormat?` (Task 5) and Task 6 passes all four. Token vocabularies are single-sourced in `types/layout.ts` and reused by both the validator and the compiler.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase3-layout-model.md`. This is Phase 3 of 5; Phase 4 (storage + API + hydration) and Phase 5 (authoring UI) get their own plans after this ships.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
