# Section Layout Authoring — Phase 5b: styling, columns & backgrounds (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the in-admin layout composer: a token-only **style inspector** per block, a **columns** container (2–4 columns), a **background/overlay** group for cover pages, and the **keyValue** multi-field block — finishing the spec's authoring surface (§A/§E/§I).

**Architecture:** Extend the pure tree helpers (`layoutTree.ts`) to traverse `columns` (a `columns` node consumes two path indices — column, then block — while a `stack` consumes one; each column holds one nested `stack` so column content reuses the stack model). Extend the existing `LayoutEditor`: a selected-block **style inspector** (token swatches + scale selects writing `block.style`); a **Columns** palette entry + per-column rendering + a 2–4 count control; a **Background** group for the selected container (fixed-asset upload via `/api/assets` or a bound `image` field, token overlay + opacity, position, minHeight); and a **keyValue** block with a multi-field binding editor. Everything stays declarative JSON gated by `validateLayout`; the live preview keeps using the safe `LayoutRenderer`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Vitest. Monorepo `packages/shared` + `apps/web`.

This is **Phase 5b**, the final increment, from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§A style/columns, §E inspector/background controls, §I backgrounds). Phases 1–4 and **5a** (the authoring core — composer with stacks + binding + preview + save) are merged + deployed.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- **This IS a git repo** (env banner wrongly says otherwise); feature branch off `main`; commit per task. (Windows `.next` flakiness → `rm -rf apps/web/.next` and rebuild. The suite can show a rare environmental flake under machine load — re-run before treating a single failure as real.)
- **`npm test` ignores TS types** — run `npm run typecheck` after editing any test/`.tsx`. Project has `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` ON: index access yields `T | undefined` (use `!` or guards); pass optional props via conditional spread (`{...(x ? { p: x } : {})}`), not `p={undefined}`. For `fetchMock` payloads use `fetchMock.mock.calls[0] as unknown as [string, RequestInit]`.
- **Invariants unchanged:** the editor produces only declarative `SectionLayout` JSON; **no `eval`/`dangerouslySetInnerHTML`/`new Function`**; styling is token-only (every style value is a vocabulary token compiled by the existing `compileBlockStyle`); Save stays gated by `validateLayout`; the preview is `LayoutRenderer`. The background image is a CSS `url(...)` in a style object (already handled by `LayoutRenderer` from Phase 3) — the editor only sets the declarative `BlockBackground`.
- **Backward-compatible with 5a:** stack-only paths (e.g. `[0]`, `[1,0]`) keep working; the columns traversal is additive. Existing slice-24 tests must stay green.
- **Columns model:** a `columns` block's `columns` is `Block[][]`; in the editor each column is initialised as a single nested `stack` (`[{ kind: "stack", children: [] }]`), so column content is authored with the existing stack tooling. Count is 2–4.
- TS strict; extensionless imports; reuse existing CSS classes (`.field`, `.field__label`, `.btn`, `.btn--ghost`, `.notice`, `.steditor`, `.ltree*`, `.meter`, `.editor-frame`) + a few additive classes.

---

### Task 1: Extend `layoutTree` to traverse `columns`

**Files:**
- Modify: `apps/web/src/ui/admin/layoutTree.ts`
- Test: `apps/web/src/__tests__/slice-25-layout-tree-columns.test.ts`

**Interfaces:**
- Produces (generalised; path is still `number[]` — a `stack` consumes ONE index, a `columns` consumes TWO `[column, block]`): `getAtPath`, `updateAtPath`, `removeAtPath`, `moveAtPath` now traverse both `stack` and `columns`. `insertChild(root, parentPath, block)` still appends to a **stack** at `parentPath` (used for a column's nested stack). 5a stack-only behaviour is unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-layout-tree-columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAtPath, updateAtPath, insertChild, removeAtPath } from "../ui/admin/layoutTree";
import type { Block } from "@proposal/shared";

// root stack → [ columns[ [stack[heading]], [stack[paragraph]] ] ]
const tree = (): Block => ({
  kind: "stack",
  children: [
    {
      kind: "columns",
      columns: [
        [{ kind: "stack", children: [{ kind: "heading", field: "title" }] }],
        [{ kind: "stack", children: [{ kind: "paragraph", field: "body" }] }],
      ],
    },
  ],
});

describe("layoutTree — columns traversal", () => {
  it("getAtPath descends columns via [col, block] then into the column's stack", () => {
    expect(getAtPath(tree(), [0])).toMatchObject({ kind: "columns" });
    expect(getAtPath(tree(), [0, 0, 0])).toMatchObject({ kind: "stack" }); // column 0's stack
    expect(getAtPath(tree(), [0, 1, 0, 0])).toMatchObject({ kind: "paragraph", field: "body" });
  });

  it("updateAtPath rewrites a block inside a column immutably", () => {
    const root = tree();
    const next = updateAtPath(root, [0, 0, 0, 0], (b) => ({ ...b, field: "subtitle" }) as Block);
    expect(getAtPath(next, [0, 0, 0, 0])).toMatchObject({ field: "subtitle" });
    expect(getAtPath(root, [0, 0, 0, 0])).toMatchObject({ field: "title" }); // original unchanged
  });

  it("insertChild appends to a column's nested stack", () => {
    const next = insertChild(tree(), [0, 0, 0], { kind: "divider" });
    expect(getAtPath(next, [0, 0, 0, 1])).toMatchObject({ kind: "divider" });
  });

  it("removeAtPath deletes a block inside a column", () => {
    const next = removeAtPath(tree(), [0, 0, 0, 0]);
    const stack = getAtPath(next, [0, 0, 0]) as { children: Block[] };
    expect(stack.children.length).toBe(0);
  });

  it("still handles pure stack paths (5a behaviour)", () => {
    const flat: Block = { kind: "stack", children: [{ kind: "heading", field: "h" }, { kind: "divider" }] };
    expect(getAtPath(flat, [1])).toMatchObject({ kind: "divider" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-layout-tree-columns.test.ts`
Expected: FAIL — the current helpers only traverse `stack.children` (a `columns` node returns null past `[0]`).

- [ ] **Step 3: Generalise the traversal**

Replace `getAtPath`, `updateAtPath`, `removeAtPath`, and `moveAtPath` in `apps/web/src/ui/admin/layoutTree.ts` with the type-driven versions below (keep `childrenOf` and `insertChild` as they are — `insertChild` already appends to a stack and is reused for a column's nested stack):

```ts
/** The block at `path`; a stack consumes 1 index, a columns consumes 2 ([col, block]). null if invalid. */
export function getAtPath(root: Block, path: number[]): Block | null {
  let node: Block | null = root;
  let i = 0;
  while (i < path.length && node) {
    if (node.kind === "stack") {
      node = node.children[path[i]!] ?? null;
      i += 1;
    } else if (node.kind === "columns") {
      const col = node.columns[path[i]!];
      node = (col ? col[path[i + 1]!] : undefined) ?? null;
      i += 2;
    } else {
      return null;
    }
  }
  return node;
}

/** Replace the block at `path` via `fn`, returning a new root. Traverses stack + columns. */
export function updateAtPath(root: Block, path: number[], fn: (b: Block) => Block): Block {
  if (path.length === 0) return fn(root);
  if (root.kind === "stack") {
    const [head, ...rest] = path;
    return {
      ...root,
      children: root.children.map((c, i) => (i === head ? updateAtPath(c, rest, fn) : c)),
    } as Block;
  }
  if (root.kind === "columns") {
    const [col, idx, ...rest] = path;
    return {
      ...root,
      columns: root.columns.map((column, ci) =>
        ci === col ? column.map((c, bi) => (bi === idx ? updateAtPath(c, rest, fn) : c)) : column,
      ),
    } as Block;
  }
  return root; // leaf with a non-empty path → no-op
}
```

`removeAtPath` and `moveAtPath` keep their current shape (parentPath = `path.slice(0, -1)`, last index = the block position), because a block's immediate parent is always a `stack` (a column holds a nested stack). They already delegate to `updateAtPath`/`childrenOf`, so they now work through columns automatically — **leave their bodies unchanged.** (Verify: the `removeAtPath`/`moveAtPath` tests in the new file + the 5a `slice-24-layout-tree` tests both pass.)

- [ ] **Step 4: Run the new test + the 5a regression**

Run: `npx vitest run apps/web/src/__tests__/slice-25-layout-tree-columns.test.ts apps/web/src/__tests__/slice-24-layout-tree.test.ts`
Expected: PASS (5 new + 5 existing).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/admin/layoutTree.ts apps/web/src/__tests__/slice-25-layout-tree-columns.test.ts
git commit -m "feat(layout): layoutTree traverses columns ([col, block]); stack paths unchanged"
```

---

### Task 2: Style inspector (per-block token style) + container gap

**Files:**
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx`
- Test: `apps/web/src/__tests__/slice-25-style-inspector.test.tsx`

**Interfaces:**
- Consumes: `TOKEN_COLORS`, `TOKEN_FONTS`, `SIZE_SCALES`, `SPACE_SCALES`, `ALIGNS`, `WEIGHTS` (shared vocab), `defaultTheme.colors` (swatch colours), `getAtPath`/`updateAtPath`.
- Produces: when a block is selected, a **Style** panel writes `block.style` (color/background/font/size/weight/align/padding); a selected `stack`/`columns` also gets a **gap** control writing `block.gap`. All values are vocabulary tokens.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-style-inspector.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }], variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor style inspector", () => {
  it("applies a token color + size to the selected block and reflects it in the preview", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.click(screen.getByLabelText("select-0")); // select the heading

    // the style panel appears for the selected block
    fireEvent.change(screen.getByLabelText("style-size"), { target: { value: "xl" } });
    fireEvent.click(screen.getByLabelText("color-primary")); // color swatch

    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });
    const heading = document.querySelector('[data-layout-preview] [data-block="heading"]') as HTMLElement;
    expect(heading.style.fontSize).toBe("1.9rem"); // size xl
    expect(heading.style.color).toBe("var(--c-primary)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-style-inspector.test.tsx`
Expected: FAIL — no `style-size` / `color-primary` controls.

- [ ] **Step 3: Add the style inspector to `LayoutEditor`**

In `apps/web/src/ui/admin/LayoutEditor.tsx`:

Extend the `@proposal/shared` import to add the vocab arrays:

```ts
import {
  getSectionType, validateLayout, LEAF_KINDS, sampleDataForType,
  TOKEN_COLORS, TOKEN_FONTS, SIZE_SCALES, SPACE_SCALES, ALIGNS, WEIGHTS,
  type Block, type BlockStyle, type FieldType, type SectionLayout,
} from "@proposal/shared";
```

Add a helper above the component to write a single style prop on the selected block:

```ts
/** Set one BlockStyle prop (or clear it when value is "") on the block at `path`. */
function setStyleProp(root: Block, path: number[], prop: keyof BlockStyle, value: string): Block {
  return updateAtPath(root, path, (b) => {
    const style: BlockStyle = { ...(("style" in b ? b.style : undefined) ?? {}) };
    if (value === "") delete style[prop];
    else (style as Record<string, string>)[prop] = value;
    return { ...b, style } as Block;
  });
}
```

Inside the component, after `const selectedBlock = ...` (add this derived value near `addBlock`):

```ts
  const selectedBlock = getAtPath(root, selected);
  const selStyle: BlockStyle = (selectedBlock && "style" in selectedBlock ? selectedBlock.style : undefined) ?? {};
```

Render the Style panel after the "Blocks" `<div className="field">` and before the Preview field (only when a block is selected):

```tsx
      {selectedBlock ? (
        <div className="field">
          <span className="field__label">Style · {selectedBlock.kind}</span>
          <div className="lstyle">
            <label className="lstyle__row">Font
              <select aria-label="style-font" value={selStyle.font ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "font", e.target.value))}>
                <option value="">default</option>
                {TOKEN_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Size
              <select aria-label="style-size" value={selStyle.size ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "size", e.target.value))}>
                <option value="">default</option>
                {SIZE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Weight
              <select aria-label="style-weight" value={selStyle.weight ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "weight", e.target.value))}>
                <option value="">default</option>
                {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Align
              <select aria-label="style-align" value={selStyle.align ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "align", e.target.value))}>
                <option value="">default</option>
                {ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="lstyle__row">Padding
              <select aria-label="style-padding" value={selStyle.padding ?? ""} onChange={(e) => setRoot(setStyleProp(root, selected, "padding", e.target.value))}>
                <option value="">default</option>
                {SPACE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="lstyle__row">Color
              <div className="lswatches">
                <button type="button" aria-label="color-none" className="lswatch lswatch--none" onClick={() => setRoot(setStyleProp(root, selected, "color", ""))}>—</button>
                {TOKEN_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`color-${c}`} className="lswatch"
                    style={{ background: defaultTheme.colors[c] }} onClick={() => setRoot(setStyleProp(root, selected, "color", c))} />
                ))}
              </div>
            </div>
            <div className="lstyle__row">Background
              <div className="lswatches">
                <button type="button" aria-label="bg-none" className="lswatch lswatch--none" onClick={() => setRoot(setStyleProp(root, selected, "background", ""))}>—</button>
                {TOKEN_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`bg-${c}`} className="lswatch"
                    style={{ background: defaultTheme.colors[c] }} onClick={() => setRoot(setStyleProp(root, selected, "background", c))} />
                ))}
              </div>
            </div>
            {selectedBlock.kind === "stack" || selectedBlock.kind === "columns" ? (
              <label className="lstyle__row">Gap
                <select aria-label="style-gap" value={"gap" in selectedBlock ? selectedBlock.gap ?? "" : ""}
                  onChange={(e) => setRoot(updateAtPath(root, selected, (b) => ({ ...b, gap: e.target.value || undefined }) as Block))}>
                  <option value="">default</option>
                  {SPACE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
```

(`defaultTheme.colors[c]` is typed because `TOKEN_COLORS` members match the theme `colors` keys. The `selected` path drives which block the panel edits.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-25-style-inspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the 5a editor regression**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx`
Expected: PASS (the panel is additive; it only renders when a block is selected).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-25-style-inspector.test.tsx
git commit -m "feat(layout): per-block token style inspector + container gap"
```

---

### Task 3: `columns` container authoring

**Files:**
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx`
- Test: `apps/web/src/__tests__/slice-25-columns-authoring.test.tsx`

**Interfaces:**
- Consumes: the columns-aware tree (Task 1).
- Produces: a **Columns** palette entry that inserts `{ kind: "columns", columns: [[stack],[stack]] }`; `renderRow` renders a `columns` block as N column groups, each recursing into its nested stack (path `[…columns, c, 0]`); a **column count** control (2–4) on a selected `columns` block adds/removes columns (each new column = one empty stack).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-columns-authoring.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }], variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor columns authoring", () => {
  it("adds a 2-column block, binds a heading inside column 1, and saves", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Two col" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "two_col" } });

    fireEvent.click(screen.getByRole("button", { name: /add columns/i }));
    // two columns render
    expect(screen.getAllByLabelText(/^add-to-column-/).length).toBe(2);

    // add a heading into column 0's stack, bind it
    fireEvent.click(screen.getByLabelText("add-to-column-0-0-0")); // adds a heading to column 0 stack
    fireEvent.change(screen.getByLabelText("bind-0-0-0-0"), { target: { value: "title" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { children: { kind: string; columns: { kind: string; children: { kind: string; field?: string }[] }[][] }[] };
    };
    const cols = body.root.children[0]!;
    expect(cols.kind).toBe("columns");
    expect(cols.columns.length).toBe(2);
    expect(cols.columns[0]![0]!.children[0]).toMatchObject({ kind: "heading", field: "title" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-columns-authoring.test.tsx`
Expected: FAIL — no Columns palette entry / no per-column controls.

- [ ] **Step 3: Add columns authoring to `LayoutEditor`**

In `apps/web/src/ui/admin/LayoutEditor.tsx`:

(a) Add `columns` to the palette and a column-block factory. Update `PALETTE`:

```ts
const PALETTE: { kind: string; label: string }[] = [
  { kind: "stack", label: "Stack" },
  { kind: "columns", label: "Columns" },
  ...LEAF_KINDS.filter((k) => k !== "keyValue").map((k) => ({ kind: k, label: k })),
];
```

In `blankBlock`, add a `columns` branch (two columns, each one empty stack) before the generic return:

```ts
  if (kind === "columns")
    return { kind: "columns", columns: [[{ kind: "stack", children: [] }], [{ kind: "stack", children: [] }]] } as Block;
```

(b) In `renderRow`, render a `columns` block's columns (after the existing `stack` children branch). Replace the trailing `{block.kind === "stack" ? (…children…) : null}` with handling for BOTH:

```tsx
        {block.kind === "stack" ? (
          <ul className="ltree__children">{block.children.map((c, i) => renderRow(c, [...path, i]))}</ul>
        ) : block.kind === "columns" ? (
          <div className="ltree__columns">
            {block.columns.map((col, ci) => (
              <div key={ci} className="ltree__column" data-column={ci}>
                <div className="meter">col {ci + 1}</div>
                <button type="button" className="btn btn--ghost" aria-label={`add-to-column-${path.join("-")}-${ci}-0`}
                  onClick={() => setRoot(insertChild(root, [...path, ci, 0], blankBlock("heading")))}>
                  + heading
                </button>
                {/* each column holds one nested stack at index 0 */}
                <ul className="ltree__children">
                  {(col[0] && col[0].kind === "stack" ? col[0].children : []).map((c, j) => renderRow(c, [...path, ci, 0, j]))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
```

(Note: the `add-to-column-<path>-<ci>-0` button seeds a heading into column ci's stack; the author then re-binds/restyles it or adds more via selecting that stack. For 5b the per-column quick-add is a heading; richer per-column palettes are out of scope — selecting the column's stack and using the main palette also works because `addBlock` targets the selected stack.)

(c) Add a **column count** control in the Style panel (Task 2) when the selected block is `columns` — insert inside the `selectedBlock.kind === "columns"` area (next to gap). Add after the gap control block:

```tsx
            {selectedBlock.kind === "columns" ? (
              <label className="lstyle__row">Columns
                <select aria-label="style-columns" value={selectedBlock.columns.length}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setRoot(updateAtPath(root, selected, (b) => {
                      const cols = (b as { columns: Block[][] }).columns;
                      const next = cols.slice(0, n);
                      while (next.length < n) next.push([{ kind: "stack", children: [] }]);
                      return { ...b, columns: next } as Block;
                    }));
                  }}>
                  {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ) : null}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-25-columns-authoring.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify regressions**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx apps/web/src/__tests__/slice-25-style-inspector.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-25-columns-authoring.test.tsx
git commit -m "feat(layout): columns container authoring (palette, per-column tree, 2-4 count)"
```

---

### Task 4: Background / overlay group (selected container)

**Files:**
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx`
- Test: `apps/web/src/__tests__/slice-25-background-group.test.tsx`

**Interfaces:**
- Consumes: `TOKEN_COLORS`, `SIZE_SCALES`, `BlockBackground`, `ImageRef`; the type's `image` fields (for binding); `/api/assets` (fixed upload).
- Produces: when the selected block is a `stack`/`columns`, a **Background** group writing `block.background`: image source (Fixed asset → upload to `/api/assets`, sets `{ assetUrl }`; or Bind field → `{ field }` from the type's image fields), overlay token color + opacity (0–100), position (cover/contain), minHeight (a SizeScale or "page"). A "Clear" removes the background.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-background-group.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "cover_image", type: "image", label: "Cover image" },
  ],
  variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor background group", () => {
  it("binds a background image field + overlay on the root stack and saves it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Cover" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "cover" } });

    // add a block so the root stack has content + select the ROOT to edit its background
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.click(screen.getByLabelText("select-root"));

    fireEvent.change(screen.getByLabelText("bg-image-field"), { target: { value: "cover_image" } });
    fireEvent.change(screen.getByLabelText("bg-overlay-color"), { target: { value: "primary" } });
    fireEvent.change(screen.getByLabelText("bg-overlay-opacity"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("bg-minheight"), { target: { value: "page" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { background?: { image?: { field?: string }; overlay?: { color: string; opacity: number }; minHeight?: string } };
    };
    expect(body.root.background).toMatchObject({
      image: { field: "cover_image" },
      overlay: { color: "primary", opacity: 50 },
      minHeight: "page",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-background-group.test.tsx`
Expected: FAIL — no `select-root` / `bg-*` controls.

- [ ] **Step 3: Add a root selector + the Background group**

In `apps/web/src/ui/admin/LayoutEditor.tsx`:

(a) Extend the shared import with the background types:

```ts
  type BlockBackground, type ImageRef,
```
(add these to the existing `@proposal/shared` type import list.)

(b) Add a **root select** control so the author can target the root stack's background. In the "Blocks" field, before the `<ul className="ltree">`, add:

```tsx
        <button type="button" className="btn btn--ghost" aria-label="select-root" onClick={() => setSelected([])}>
          {selected.length === 0 ? "▸ " : ""}root ({root.kind})
        </button>
```

(c) Add a helper above the component to patch the selected container's background:

```ts
/** Merge a partial BlockBackground into the container at `path` (creates it if absent). */
function patchBackground(root: Block, path: number[], patch: Partial<BlockBackground>): Block {
  return updateAtPath(root, path, (b) => {
    if (b.kind !== "stack" && b.kind !== "columns") return b;
    const bg: BlockBackground = { ...(b.background ?? {}), ...patch };
    return { ...b, background: bg } as Block;
  });
}
```

(d) Render the Background group inside the Style panel (Task 2), only when the selected block is a container. Add after the columns-count control:

```tsx
            {selectedBlock.kind === "stack" || selectedBlock.kind === "columns" ? (
              <fieldset className="lbg">
                <legend className="field__label">Background</legend>
                <label className="lstyle__row">Bind image field
                  <select aria-label="bg-image-field"
                    value={selectedBlock.background?.image && "field" in selectedBlock.background.image ? selectedBlock.background.image.field : ""}
                    onChange={(e) => {
                      const field = e.target.value;
                      const image: ImageRef | undefined = field ? { field } : undefined;
                      setRoot(patchBackground(root, selected, image ? { image } : {}));
                    }}>
                    <option value="">— none —</option>
                    {(typeSchema?.fields ?? []).filter((f) => f.type === "image").map((f) => (
                      <option key={f.key} value={f.key}>{f.label ?? f.key}</option>
                    ))}
                  </select>
                </label>
                <label className="lstyle__row">Overlay color
                  <select aria-label="bg-overlay-color"
                    value={selectedBlock.background?.overlay?.color ?? ""}
                    onChange={(e) => {
                      const color = e.target.value;
                      const prev = selectedBlock.background?.overlay;
                      setRoot(patchBackground(root, selected, { overlay: color ? { color: color as (typeof TOKEN_COLORS)[number], opacity: prev?.opacity ?? 50 } : undefined } as Partial<BlockBackground>));
                    }}>
                    <option value="">— none —</option>
                    {TOKEN_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="lstyle__row">Overlay opacity
                  <input aria-label="bg-overlay-opacity" type="number" min={0} max={100}
                    value={selectedBlock.background?.overlay?.opacity ?? 0}
                    onChange={(e) => {
                      const opacity = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      const color = selectedBlock.background?.overlay?.color ?? "text";
                      setRoot(patchBackground(root, selected, { overlay: { color, opacity } }));
                    }} />
                </label>
                <label className="lstyle__row">Position
                  <select aria-label="bg-position" value={selectedBlock.background?.position ?? ""}
                    onChange={(e) => setRoot(patchBackground(root, selected, { position: (e.target.value || undefined) as "cover" | "contain" | undefined }))}>
                    <option value="">default</option>
                    <option value="cover">cover</option>
                    <option value="contain">contain</option>
                  </select>
                </label>
                <label className="lstyle__row">Min height
                  <select aria-label="bg-minheight" value={selectedBlock.background?.minHeight ?? ""}
                    onChange={(e) => setRoot(patchBackground(root, selected, { minHeight: (e.target.value || undefined) as never }))}>
                    <option value="">default</option>
                    {SIZE_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
                    <option value="page">page</option>
                  </select>
                </label>
                <button type="button" className="btn btn--ghost" aria-label="bg-clear"
                  onClick={() => setRoot(updateAtPath(root, selected, (b) => {
                    if (b.kind !== "stack" && b.kind !== "columns") return b;
                    const { background, ...rest } = b as Block & { background?: BlockBackground };
                    return rest as Block;
                  }))}>
                  Clear background
                </button>
              </fieldset>
            ) : null}
```

(The fixed-asset upload path — `{ assetUrl }` via `/api/assets` — can reuse `ImageField`; for 5b the field-binding + overlay path is the tested surface. If you also wire a fixed-asset upload control, use the existing `ImageField` writing `patchBackground(root, selected, { image: { assetUrl: url } })`, and report it. Not required for the test.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-25-background-group.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify regressions**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx apps/web/src/__tests__/slice-25-style-inspector.test.tsx apps/web/src/__tests__/slice-25-columns-authoring.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-25-background-group.test.tsx
git commit -m "feat(layout): background/overlay group on container blocks (image field, overlay, minHeight)"
```

---

### Task 5: `keyValue` multi-field block

**Files:**
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx`
- Test: `apps/web/src/__tests__/slice-25-keyvalue.test.tsx`

**Interfaces:**
- Produces: a **keyValue** palette entry inserting `{ kind: "keyValue", fields: [] }`; in `renderRow`, a keyValue block shows a list of its bound fields with add/remove, each a `<select>` of the type's `text`/`paragraph` fields. Saves a valid `keyValue` once it has ≥1 field.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-keyvalue.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const specType: SectionTypeSchema = {
  type: "spec", label: "Spec", category: "text",
  fields: [
    { key: "term", type: "text", label: "Term" },
    { key: "rate", type: "text", label: "Rate" },
  ],
  variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([specType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor keyValue", () => {
  it("adds a keyValue block, binds two fields, and saves", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="spec" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Spec" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "spec" } });

    fireEvent.click(screen.getByRole("button", { name: /add keyValue/i }));
    fireEvent.click(screen.getByLabelText("kv-add-0")); // add a field row
    fireEvent.change(screen.getByLabelText("kv-field-0-0"), { target: { value: "term" } });
    fireEvent.click(screen.getByLabelText("kv-add-0"));
    fireEvent.change(screen.getByLabelText("kv-field-0-1"), { target: { value: "rate" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { children: { kind: string; fields?: string[] }[] };
    };
    expect(body.root.children[0]).toMatchObject({ kind: "keyValue", fields: ["term", "rate"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-keyvalue.test.tsx`
Expected: FAIL — keyValue is not in the palette / no kv controls.

- [ ] **Step 3: Add keyValue authoring**

In `apps/web/src/ui/admin/LayoutEditor.tsx`:

(a) Include `keyValue` in the palette (remove the exclusion filter):

```ts
const PALETTE: { kind: string; label: string }[] = [
  { kind: "stack", label: "Stack" },
  { kind: "columns", label: "Columns" },
  ...LEAF_KINDS.map((k) => ({ kind: k, label: k })),
];
```

(b) Give `keyValue` its own `blankBlock` branch (before the generic return):

```ts
  if (kind === "keyValue") return { kind: "keyValue", fields: [] } as Block;
```

(c) In `renderRow`, render the keyValue field editor. Add a branch (e.g. right after the `STATIC_KINDS` input, still inside `.ltree__bar` or just below it). Insert this block inside the `<li>` after the controls `<div className="ltree__bar">…</div>` and before the stack/columns children handling:

```tsx
        {block.kind === "keyValue" ? (
          <div className="ltree__kv">
            {block.fields.map((fk, fi) => (
              <div key={fi} className="lstyle__row">
                <select aria-label={`kv-field-${pid}-${fi}`} value={fk}
                  onChange={(e) => setRoot(updateAtPath(root, path, (b) => {
                    const fields = [...(b as { fields: string[] }).fields];
                    fields[fi] = e.target.value;
                    return { ...b, fields } as Block;
                  }))}>
                  <option value="">— field —</option>
                  {(typeSchema?.fields ?? []).filter((f) => f.type === "text" || f.type === "paragraph").map((f) => (
                    <option key={f.key} value={f.key}>{f.label ?? f.key}</option>
                  ))}
                </select>
                <button type="button" className="btn btn--ghost" aria-label={`kv-remove-${pid}-${fi}`}
                  onClick={() => setRoot(updateAtPath(root, path, (b) => ({ ...b, fields: (b as { fields: string[] }).fields.filter((_, i) => i !== fi) }) as Block))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn--ghost" aria-label={`kv-add-${pid}`}
              onClick={() => setRoot(updateAtPath(root, path, (b) => ({ ...b, fields: [...(b as { fields: string[] }).fields, ""] }) as Block))}>
              + field
            </button>
          </div>
        ) : null}
```

(Empty `""` field entries are invalid per `validateLayout` (keyValue fields must be text/paragraph), so Save stays disabled until each row binds a real field — the validator already enforces this.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-25-keyvalue.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify regressions**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx apps/web/src/__tests__/slice-25-columns-authoring.test.tsx apps/web/src/__tests__/slice-25-background-group.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-25-keyvalue.test.tsx
git commit -m "feat(layout): keyValue multi-field block editor"
```

---

### Task 6: Editor CSS + final verification

**Files:**
- Modify: `apps/web/app/globals.css`
- (verification)

- [ ] **Step 1: Add the inspector/columns/background classes**

In `apps/web/app/globals.css`, append (additive; reuse tokens):

```css
/* Layout style inspector + columns + background (§E/5b) */
.lstyle { display: flex; flex-direction: column; gap: 6px; }
.lstyle__row { display: flex; align-items: center; gap: 8px; font: 12px ui-sans-serif; color: var(--ui-muted, #6b7280); }
.lswatches { display: flex; gap: 4px; flex-wrap: wrap; }
.lswatch { width: 20px; height: 20px; border-radius: 4px; border: 1px solid var(--c-line, #e2e2e2); cursor: pointer; }
.lswatch--none { background: #fff; font-size: 11px; line-height: 1; }
.lbg { border: 1px solid var(--c-line, #e2e2e2); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
.ltree__columns { display: flex; gap: 8px; padding-left: 16px; border-left: 1px solid var(--c-line, #e2e2e2); margin-top: 4px; }
.ltree__column { flex: 1; border: 1px dashed var(--c-line, #e2e2e2); border-radius: 6px; padding: 6px; }
.ltree__kv { padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
```

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: all pass (existing + slice-25). (Re-run once if a single test flakes under load.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(layout): style inspector / columns / background editor styles; phase-5b green"
```

---

## Self-Review

**1. Spec coverage (§A/§E/§I, 5b slice):**
- Token style inspector (font/size/weight/align/padding + color/background swatches), container gap → Task 2. ✅
- `columns` container authoring (palette, per-column nested-stack tree, 2–4 count) → Tasks 1 (tree) + 3 (UI). ✅
- Background/overlay group (bound image field, overlay token+opacity, position, minHeight incl. "page") → Task 4. ✅
- keyValue multi-field editor → Task 5. ✅
- The interpreter already renders all of these (Phase 3); this phase only adds the authoring controls. The fixed-asset background upload is offered as an optional add-on in Task 4 (the bound-field path is the tested surface).
- **Whole feature now complete** across the 5 phases: page formats, image field, layout model+interpreter, storage+API, and the full authoring UI.

**2. Placeholder scan:** No TBD/TODO; every code step is complete. Task 4's fixed-asset upload is explicitly optional (the declarative `{assetUrl}` path is identical to `{field}` from the renderer's view; the bound-field path is fully specified + tested).

**3. Type consistency:** The columns traversal keeps `path: number[]` (stack → 1 index, columns → 2) so 5a's stack paths and tests are unaffected (Task 1 verifies the 5a tree test still passes). `setStyleProp`/`patchBackground` operate via `updateAtPath` and return `Block`. `BlockStyle` keys (color/background/font/size/weight/align/padding) match the vocab arrays and `compileBlockStyle`. `BlockBackground` (image `ImageRef`, overlay `{color,opacity}`, position, minHeight) matches the validator + renderer. keyValue `fields: string[]` matches the validator's keyValue rule (text/paragraph). The `columns` count control rebuilds `columns: Block[][]` with one stack per new column — exactly what `renderRow`/`getAtPath` expect. `defaultTheme.colors[c]` is keyed by `TOKEN_COLORS` members. Every new `aria-label` matches its test query.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase5b-styling-columns-backgrounds.md`. This is the **final** plan — it completes the Section Layout Authoring feature (Phases 1→5b).

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
