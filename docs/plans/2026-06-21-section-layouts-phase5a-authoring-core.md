# Section Layout Authoring — Phase 5a: authoring core (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a working in-app block composer: from a section type in `/admin`, list its authored layouts and create/edit/delete one in a `LayoutEditor` — composing a nested **stack** of field-bound blocks with a live preview — and surface authored layouts in the editor's variant picker.

**Architecture:** A pure, well-tested immutable tree-update module (`layoutTree.ts`) drives a `LayoutEditor` client component (palette + recursive block tree + field-binding dropdown + live preview via the existing `LayoutRenderer` + `validateLayout` gating + Save through the existing `client/layouts.ts`). A `SectionLayoutsView` (reached from `SectionTypeList`, mirroring the `SectionTypeEditor` mount/unmount toggle) lists a type's layouts and hosts the editor. A shared `sampleDataForType` provides deterministic placeholder content for the preview. The Inspector variant picker switches to `availableVariants(type, pageFormat)` so authored layouts become selectable.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Vitest. Monorepo `packages/shared` + `apps/web`.

This is **Phase 5a of the final phase** (the authoring UI) from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§E, §F, §J-editor). Phases 1–4 are merged (model, validator, registry, interpreter, format-aware resolution, storage, CRUD API, hydration). **Phase 5b** (the token style inspector — swatches/size/align/weight/spacing — plus the `columns` container with widths/gap, and the background/overlay group) follows in its own plan, building on this editor.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- **This IS a git repo** (the env banner wrongly says otherwise); work on a feature branch off `main`. Commit per task. (Windows `.next` flakiness — `EINVAL readlink … .next` — `rm -rf apps/web/.next` and rebuild.)
- **`npm test` (vitest) ignores TypeScript types** — always run `npm run typecheck` after editing any test file or `.tsx`. Use a non-null assertion `!` on `getAllBy…[i]` indexing.
- **No user-code execution / token-only styling invariants are unchanged** — the editor only produces declarative `SectionLayout` JSON; it never emits styles outside the token vocabulary; the preview uses the safe `LayoutRenderer`. Save is gated by `validateLayout`.
- **Phase-5a scope (deliberate):** containers are **`stack` only** (nesting via `children`); leaf blocks are all 11 kinds with **field binding** but **no per-block style controls yet** (blocks save with no `style` → render at component defaults). `columns`, the token **style inspector**, and **backgrounds/overlays** are **Phase 5b** — do NOT build them here.
- **Layout identity = (type, variant, pageFormat)**; `variant` + `pageFormat` are immutable on edit (like a section-type key); `name` is editable.
- TypeScript strict (`exactOptionalPropertyTypes` ON — omit optional props rather than passing `undefined`); extensionless imports (no `.js`). Reuse existing CSS classes (`.field`, `.field__label`, `.btn`, `.btn--primary`, `.btn--ghost`, `.notice`, `.notice--warn`, `.steditor`, `.steditor__actions`, `.meter`, `.editor-frame`).

---

### Task 1: `sampleDataForType` (shared)

**Files:**
- Create: `packages/shared/src/render/sampleData.ts`
- Modify: `packages/shared/src/index.ts` (export it)
- Test: `packages/shared/src/__tests__/slice-24-sample-data.test.ts`

**Interfaces:**
- Consumes: `getSectionType`, `FieldSchema`.
- Produces: `sampleDataForType(type: string): Record<string, unknown>` — deterministic placeholder content per field kind (used by the editor's live preview).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-24-sample-data.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { sampleDataForType } from "../render/sampleData";
import { setActiveSectionTypes, resetSectionTypesForTests } from "../registry/sectionTypes";
import type { SectionTypeSchema } from "../types/section";

const t: SectionTypeSchema = {
  type: "cover_s", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "body", type: "paragraph", label: "Body" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
    { key: "compare", type: "matrix", label: "Compare" },
    { key: "cover_image", type: "image", label: "Cover image" },
  ],
  variants: [], schemaVersion: 1,
};

afterEach(() => resetSectionTypesForTests());

describe("sampleDataForType", () => {
  it("produces representative placeholder data per field kind", () => {
    setActiveSectionTypes([t]);
    const d = sampleDataForType("cover_s");
    expect(typeof d.title).toBe("string");
    expect((d.title as string).length).toBeGreaterThan(0);
    expect(typeof d.body).toBe("string");
    expect(Array.isArray(d.bullets)).toBe(true);
    expect((d.bullets as string[]).length).toBeGreaterThan(0);
    expect(d.metrics).toMatchObject({ columns: expect.any(Array), rows: expect.any(Array) });
    expect((d.metrics as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
    expect(d.compare).toMatchObject({ metrics: expect.any(Array), options: expect.any(Array) });
    expect(typeof d.cover_image).toBe("string");
    expect((d.cover_image as string).startsWith("http")).toBe(true);
  });

  it("returns {} for an unknown type", () => {
    expect(sampleDataForType("nope")).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-24-sample-data.test.ts`
Expected: FAIL — `../render/sampleData` does not exist.

- [ ] **Step 3: Implement it**

Create `packages/shared/src/render/sampleData.ts`:

```ts
import { getSectionType } from "../registry/sectionTypes";
import type { FieldSchema } from "../types/section";

/** A 1×1 transparent PNG data URL — a safe placeholder cover image for the editor preview. */
const SAMPLE_IMAGE =
  "https://placehold.co/1280x720/0b5d3b/ffffff?text=Cover+image";

function sampleField(field: FieldSchema): unknown {
  switch (field.type) {
    case "text":
      return `Sample ${field.label ?? field.key}`;
    case "paragraph":
      return "Sample paragraph copy that shows how this block flows across a couple of lines in the live preview.";
    case "list":
      return ["First sample point", "Second sample point", "Third sample point"];
    case "dataset":
      return {
        columns: [
          { key: "label", label: "Label", type: "text" },
          { key: "value", label: "Value", type: "number" },
        ],
        rows: [
          { label: "2024", value: 42 },
          { label: "2025", value: 58 },
          { label: "2026", value: 71 },
        ],
      };
    case "matrix":
      return {
        metrics: ["Cost", "Speed", "Support"],
        options: [
          { name: "Option A", values: { Cost: "$$", Speed: "Fast", Support: "24/7" } },
          { name: "Option B", values: { Cost: "$", Speed: "Medium", Support: "Business hours" } },
        ],
      };
    case "image":
      return SAMPLE_IMAGE;
    default:
      return "";
  }
}

/**
 * Deterministic placeholder `data` for a section type, used to render the editor's
 * live preview (§E). Returns {} for an unknown type.
 */
export function sampleDataForType(type: string): Record<string, unknown> {
  const schema = getSectionType(type);
  if (!schema) return {};
  const data: Record<string, unknown> = {};
  for (const field of schema.fields) data[field.key] = sampleField(field);
  return data;
}
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, add (next to the `compileBlockStyle`/`spaceToken` render export):

```ts
export { sampleDataForType } from "./render/sampleData";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-24-sample-data.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/render/sampleData.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-24-sample-data.test.ts
git commit -m "feat(layout): sampleDataForType for the editor live preview"
```

---

### Task 2: Immutable block-tree helpers (`apps/web`)

**Files:**
- Create: `apps/web/src/ui/admin/layoutTree.ts`
- Test: `apps/web/src/__tests__/slice-24-layout-tree.test.ts`

**Interfaces:**
- Consumes: `Block` (a container is a `stack` with `children: Block[]`; leaves have no children).
- Produces (all pure, returning a NEW root; path = indices into successive `stack.children`):
  - `childrenOf(block): Block[] | null` — a stack's children, else null.
  - `getAtPath(root, path): Block | null`
  - `updateAtPath(root, path, fn: (b: Block) => Block): Block`
  - `insertChild(root, parentPath, block): Block` — append to the stack at `parentPath` (root if `[]`).
  - `removeAtPath(root, path): Block` — remove the block at `path` (no-op on `[]`).
  - `moveAtPath(root, path, dir: -1 | 1): Block` — swap with the sibling in that direction (clamped).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-24-layout-tree.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getAtPath, updateAtPath, insertChild, removeAtPath, moveAtPath } from "../ui/admin/layoutTree";
import type { Block } from "@proposal/shared";

const tree = (): Block => ({
  kind: "stack",
  children: [
    { kind: "heading", field: "title" },
    { kind: "stack", children: [{ kind: "paragraph", field: "body" }] },
  ],
});

describe("layoutTree", () => {
  it("getAtPath returns the block (or root for [])", () => {
    expect(getAtPath(tree(), [0])).toMatchObject({ kind: "heading" });
    expect(getAtPath(tree(), [1, 0])).toMatchObject({ kind: "paragraph" });
    expect(getAtPath(tree(), [])!.kind).toBe("stack");
    expect(getAtPath(tree(), [9])).toBeNull();
  });

  it("updateAtPath replaces immutably", () => {
    const root = tree();
    const next = updateAtPath(root, [0], (b) => ({ ...b, field: "subtitle" }) as Block);
    expect(getAtPath(next, [0])).toMatchObject({ field: "subtitle" });
    expect(getAtPath(root, [0])).toMatchObject({ field: "title" }); // original unchanged
  });

  it("insertChild appends to the stack at parentPath", () => {
    const next = insertChild(tree(), [], { kind: "divider" });
    expect((next as { children: Block[] }).children.length).toBe(3);
    const nested = insertChild(tree(), [1], { kind: "logo" });
    expect(getAtPath(nested, [1, 1])).toMatchObject({ kind: "logo" });
  });

  it("removeAtPath deletes a block", () => {
    const next = removeAtPath(tree(), [0]);
    expect((next as { children: Block[] }).children.length).toBe(1);
    expect(getAtPath(next, [0])!.kind).toBe("stack");
  });

  it("moveAtPath swaps with a sibling (clamped at the ends)", () => {
    const down = moveAtPath(tree(), [0], 1);
    expect((down as { children: Block[] }).children[0]!.kind).toBe("stack");
    expect((down as { children: Block[] }).children[1]!.kind).toBe("heading");
    const clamped = moveAtPath(tree(), [0], -1); // already first → unchanged order
    expect((clamped as { children: Block[] }).children[0]!.kind).toBe("heading");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-tree.test.ts`
Expected: FAIL — `../ui/admin/layoutTree` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `apps/web/src/ui/admin/layoutTree.ts`:

```ts
import type { Block } from "@proposal/shared";

/** A stack's children array, or null for a leaf / non-stack block. */
export function childrenOf(block: Block): Block[] | null {
  return block.kind === "stack" ? block.children : null;
}

/** The block at `path` (indices into successive stack children); [] → root; null if invalid. */
export function getAtPath(root: Block, path: number[]): Block | null {
  let node: Block | undefined = root;
  for (const i of path) {
    const kids = node ? childrenOf(node) : null;
    if (!kids) return null;
    node = kids[i];
  }
  return node ?? null;
}

/** Replace the block at `path` via `fn`, returning a new root (structural sharing elsewhere). */
export function updateAtPath(root: Block, path: number[], fn: (b: Block) => Block): Block {
  if (path.length === 0) return fn(root);
  const kids = childrenOf(root);
  if (!kids) return root;
  const [head, ...rest] = path;
  return {
    ...root,
    children: kids.map((child, i) => (i === head ? updateAtPath(child, rest, fn) : child)),
  } as Block;
}

/** Append `block` to the stack at `parentPath` ([] = root). No-op if the target is not a stack. */
export function insertChild(root: Block, parentPath: number[], block: Block): Block {
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    return { ...parent, children: [...kids, block] } as Block;
  });
}

/** Remove the block at `path`. No-op for the root ([]). */
export function removeAtPath(root: Block, path: number[]): Block {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    return { ...parent, children: kids.filter((_, i) => i !== idx) } as Block;
  });
}

/** Swap the block at `path` with its sibling in direction `dir` (-1 up / +1 down); clamped. */
export function moveAtPath(root: Block, path: number[], dir: -1 | 1): Block {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1]!;
  return updateAtPath(root, parentPath, (parent) => {
    const kids = childrenOf(parent);
    if (!kids) return parent;
    const j = idx + dir;
    if (j < 0 || j >= kids.length) return parent; // clamp at ends
    const next = [...kids];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    return { ...parent, children: next } as Block;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-tree.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/admin/layoutTree.ts apps/web/src/__tests__/slice-24-layout-tree.test.ts
git commit -m "feat(layout): immutable block-tree helpers (get/update/insert/remove/move)"
```

---

### Task 3: `LayoutEditor` — palette + tree + binding + preview + save

**Files:**
- Create: `apps/web/src/ui/admin/LayoutEditor.tsx`
- Test: `apps/web/src/__tests__/slice-24-layout-editor.test.tsx`

**Interfaces:**
- Consumes: `layoutTree` helpers (Task 2), `sampleDataForType` (Task 1), `getSectionType`, `validateLayout`, `LEAF_KINDS`, `Block`, `SectionLayout`, `FieldType`; `LayoutRenderer`; `ThemeProvider` + `defaultTheme`; `createLayout`/`updateLayout` (client); `useProposalStore` `notify`.
- Produces: `LayoutEditor({ type, pageFormat, mode, initial?, onDone, onCancel })`. Palette adds blocks into the selected stack (or root); the tree shows each block with select/↑/↓/✕ + a kind-filtered field-binding `<select aria-label="bind-<path>">` for binding blocks and a static-text `<input>` for callout/text; a live preview renders `LayoutRenderer` with `sampleDataForType`; Save is disabled while `validateLayout` fails and calls `createLayout`/`updateLayout` then `onDone`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-24-layout-editor.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "body", type: "paragraph", label: "Body" },
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

describe("LayoutEditor", () => {
  it("composes a heading bound to a field and POSTs the layout on save", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();

    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={onDone} onCancel={vi.fn()} />);

    // name + variant required before save is valid
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Classic" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "classic" } });

    // add a heading block, bind it to the title field
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });

    // live preview shows the bound sample text
    expect(screen.getByText(/Sample Title/i)).toBeTruthy();

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-layouts", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      type: string; variant: string; pageFormat: string; name: string; root: { kind: string; children: { kind: string; field?: string }[] };
    };
    expect(body).toMatchObject({ type: "cover", variant: "classic", pageFormat: "a4_portrait", name: "Classic" });
    expect(body.root.children[0]).toMatchObject({ kind: "heading", field: "title" });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables Save while the layout is invalid (no variant)", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "X" } });
    // no variant slug yet → save disabled
    expect(screen.getByRole("button", { name: /^save/i })).toBeDisabled();
  });

  it("removes a block", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add paragraph/i }));
    expect(screen.getByLabelText("bind-0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "remove-0" }));
    expect(screen.queryByLabelText("bind-0")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx`
Expected: FAIL — `../ui/admin/LayoutEditor` does not exist.

- [ ] **Step 3: Implement the editor**

Create `apps/web/src/ui/admin/LayoutEditor.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  getSectionType, validateLayout, LEAF_KINDS,
  type Block, type FieldType, type SectionLayout,
} from "@proposal/shared";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { defaultTheme } from "../../theme/defaultTheme";
import { sampleDataForType } from "@proposal/shared";
import { LayoutRenderer } from "../../render/LayoutRenderer";
import { createLayout, updateLayout } from "../../client/layouts";
import { useProposalStore } from "../../state/proposalStore";
import { getAtPath, insertChild, moveAtPath, removeAtPath, updateAtPath } from "./layoutTree";

/** Which content field types each binding block accepts (mirrors the validator). */
const BINDING: Partial<Record<string, FieldType[]>> = {
  heading: ["text", "paragraph"],
  paragraph: ["text", "paragraph"],
  list: ["list"],
  table: ["dataset"],
  chart: ["dataset"],
  matrix: ["matrix"],
};
const STATIC_KINDS = ["callout", "text"];
const PALETTE: { kind: string; label: string }[] = [
  { kind: "stack", label: "Stack" },
  ...LEAF_KINDS.map((k) => ({ kind: k, label: k })),
];

/** A default block for a palette kind. */
function blankBlock(kind: string): Block {
  if (kind === "stack") return { kind: "stack", children: [] };
  if (kind === "chart") return { kind: "chart", field: "", chart: "bar" } as Block;
  if (STATIC_KINDS.includes(kind)) return { kind, text: "" } as Block;
  if (kind === "logo" || kind === "divider") return { kind } as Block;
  return { kind, field: "" } as Block; // heading/paragraph/list/keyValue(simplified)/table/matrix
}

export function LayoutEditor({
  type,
  pageFormat,
  initial,
  mode,
  onDone,
  onCancel,
}: {
  type: string;
  pageFormat: string;
  initial?: SectionLayout;
  mode: "create" | "edit";
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const editing = mode === "edit";
  const [name, setName] = useState(initial?.name ?? "");
  const [variant, setVariant] = useState(initial?.variant ?? "");
  const [root, setRoot] = useState<Block>(initial?.root ?? { kind: "stack", children: [] });
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const typeSchema = getSectionType(type);
  const sample = useMemo(() => sampleDataForType(type), [type]);

  const layout: SectionLayout = {
    type, variant: variant.trim(), pageFormat, name: name.trim(),
    root, version: (initial?.version ?? 0) + (editing ? 1 : 1),
  };
  const slugOk = /^[a-z][a-z0-9_]*$/.test(variant.trim());
  const result = typeSchema ? validateLayout(layout, typeSchema) : { valid: false, errors: [] };
  const canSave = !!name.trim() && slugOk && result.valid && !busy;

  // Add into the selected stack (or root if the selection isn't a stack).
  const addBlock = (kind: string) => {
    const target = getAtPath(root, selected);
    const parentPath = target && target.kind === "stack" ? selected : [];
    setRoot(insertChild(root, parentPath, blankBlock(kind)));
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      if (editing) await updateLayout(type, layout.variant, pageFormat, layout);
      else await createLayout(layout);
      notify("success", editing ? "Layout updated." : "Layout created.");
      await onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  // Recursive tree rows. `path` identifies a block; binding/static controls render inline.
  const renderRow = (block: Block, path: number[]): React.ReactNode => {
    const pid = path.join("-");
    const allowed = BINDING[block.kind];
    const isSelected = path.join() === selected.join();
    return (
      <li key={pid} className="ltree__row" data-block-kind={block.kind}>
        <div className="ltree__bar">
          <button type="button" className="btn btn--ghost" aria-label={`select-${pid}`} onClick={() => setSelected(path)}>
            {isSelected ? "▸ " : ""}{block.kind}
          </button>
          {allowed ? (
            <select
              aria-label={`bind-${pid}`}
              value={"field" in block ? block.field : ""}
              onChange={(e) => setRoot(updateAtPath(root, path, (b) => ({ ...b, field: e.target.value }) as Block))}
            >
              <option value="">— field —</option>
              {(typeSchema?.fields ?? [])
                .filter((f) => allowed.includes(f.type))
                .map((f) => (
                  <option key={f.key} value={f.key}>{f.label ?? f.key}</option>
                ))}
            </select>
          ) : null}
          {STATIC_KINDS.includes(block.kind) ? (
            <input
              aria-label={`text-${pid}`}
              value={"text" in block ? block.text : ""}
              onChange={(e) => setRoot(updateAtPath(root, path, (b) => ({ ...b, text: e.target.value }) as Block))}
              placeholder="Static text"
            />
          ) : null}
          <button type="button" className="btn btn--ghost" aria-label={`up-${pid}`} onClick={() => setRoot(moveAtPath(root, path, -1))}>↑</button>
          <button type="button" className="btn btn--ghost" aria-label={`down-${pid}`} onClick={() => setRoot(moveAtPath(root, path, 1))}>↓</button>
          <button type="button" className="btn btn--ghost" aria-label={`remove-${pid}`} onClick={() => setRoot(removeAtPath(root, path))}>✕</button>
        </div>
        {block.kind === "stack" ? (
          <ul className="ltree__children">{block.children.map((c, i) => renderRow(c, [...path, i]))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="steditor">
      <h2>{editing ? "Edit layout" : "New layout"} · {typeSchema?.label ?? type}</h2>

      <label className="field">
        <span className="field__label">Layout name</span>
        <input aria-label="Layout name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cover" />
      </label>
      <label className="field">
        <span className="field__label">Layout variant (slug, immutable on edit)</span>
        <input aria-label="Layout variant" value={variant} disabled={editing} onChange={(e) => setVariant(e.target.value)} placeholder="cover" />
      </label>
      <p className="meter">Format: <strong>{pageFormat}</strong></p>

      <div className="field">
        <span className="field__label">Add block</span>
        <div className="ltree__palette">
          {PALETTE.map((p) => (
            <button key={p.kind} type="button" className="btn" aria-label={`add ${p.label}`} onClick={() => addBlock(p.kind)}>
              + {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Blocks</span>
        <ul className="ltree">{(root as { children: Block[] }).children.map((c, i) => renderRow(c, [i]))}</ul>
      </div>

      <div className="field">
        <span className="field__label">Preview ({type})</span>
        <div className="editor-frame" data-layout-preview>
          <ThemeProvider theme={defaultTheme}>
            <LayoutRenderer layout={layout} data={sample} theme={defaultTheme} pageFormat={pageFormat} />
          </ThemeProvider>
        </div>
      </div>

      {!result.valid && root && (root as { children: Block[] }).children.length > 0 ? (
        <ul className="notice notice--warn">
          {result.errors.slice(0, 6).map((e, i) => (
            <li key={i}><code>{e.path}</code> — {e.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="steditor__actions">
        <button type="button" className="btn btn--primary" disabled={!canSave} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx`
Expected: PASS (3 tests). (If the "Sample Title" preview assertion is brittle due to casing, the renderer outputs `Sample Title` from `sampleDataForType` — the test uses a case-insensitive regex; keep it.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (Note the `blankBlock`/`updateAtPath` casts to `Block` are intentional — the editor builds partial blocks the validator then gates.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/admin/LayoutEditor.tsx apps/web/src/__tests__/slice-24-layout-editor.test.tsx
git commit -m "feat(layout): LayoutEditor core — palette, nested stack tree, field binding, live preview, validated save"
```

---

### Task 4: `SectionLayoutsView` + SectionTypeList "Layouts" entry

**Files:**
- Create: `apps/web/src/ui/admin/SectionLayoutsView.tsx`
- Modify: `apps/web/src/ui/admin/SectionTypeList.tsx`
- Test: `apps/web/src/__tests__/slice-24-section-layouts-view.test.tsx`

**Interfaces:**
- Consumes: `fetchLayouts`/`deleteLayout` (client), `PAGE_FORMATS`, `SectionLayout`, `SectionTypeSchema`; `LayoutEditor` (Task 3).
- Produces: `SectionLayoutsView({ type, onBack })` — fetches layouts, filters to this `type`, groups by `pageFormat`, lists name+variant with Edit/Delete, a "New layout" control (picks a format → opens `LayoutEditor` in create mode), and a Back action. `SectionTypeList` rows gain a **Layouts** button that mounts `SectionLayoutsView` for that type (a `layoutsFor: SectionTypeSchema | null` toggle, mirroring its `editor` toggle).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-24-section-layouts-view.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionLayoutsView } from "../ui/admin/SectionLayoutsView";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionLayout, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }], variants: [], schemaVersion: 1,
};
const existing: SectionLayout = {
  type: "cover", variant: "classic", pageFormat: "a4_portrait", name: "Classic",
  root: { kind: "stack", children: [] }, version: 1,
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

describe("SectionLayoutsView", () => {
  it("lists this type's layouts and deletes one", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ layouts: [existing, { ...existing, type: "other", variant: "x" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<SectionLayoutsView type="cover" onBack={vi.fn()} />);
    // only this type's layout is listed
    await waitFor(() => expect(screen.getByText("Classic")).toBeTruthy());
    expect(screen.queryByText("x")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "delete-classic-a4_portrait" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/section-layouts/cover/classic/a4_portrait", expect.objectContaining({ method: "DELETE" })),
    );
  });

  it("opens the editor in create mode from New", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ layouts: [] }), { status: 200 })) as unknown as typeof fetch);
    render(<SectionLayoutsView type="cover" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /new layout/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /new layout/i }));
    expect(screen.getByLabelText("Layout name")).toBeTruthy(); // the editor mounted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-24-section-layouts-view.test.tsx`
Expected: FAIL — `../ui/admin/SectionLayoutsView` does not exist.

- [ ] **Step 3: Implement `SectionLayoutsView`**

Create `apps/web/src/ui/admin/SectionLayoutsView.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getSectionType, PAGE_FORMATS, type SectionLayout } from "@proposal/shared";
import { fetchLayouts, deleteLayout } from "../../client/layouts";
import { useProposalStore } from "../../state/proposalStore";
import { LayoutEditor } from "./LayoutEditor";

type EditorState = { mode: "create" | "edit"; pageFormat: string; initial?: SectionLayout };

export function SectionLayoutsView({ type, onBack }: { type: string; onBack: () => void }) {
  const notify = useProposalStore((s) => s.notify);
  const [all, setAll] = useState<SectionLayout[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [newFormat, setNewFormat] = useState(PAGE_FORMATS[0]!.id);
  const typeSchema = getSectionType(type);

  const refresh = async () => {
    try {
      setAll(await fetchLayouts());
    } catch {
      notify("error", "Couldn't load layouts.");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const mine = all.filter((l) => l.type === type);

  if (editor) {
    return (
      <LayoutEditor
        type={type}
        pageFormat={editor.pageFormat}
        mode={editor.mode}
        {...(editor.initial ? { initial: editor.initial } : {})}
        onDone={async () => {
          setEditor(null);
          await refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  const remove = async (l: SectionLayout) => {
    try {
      await deleteLayout(l.type, l.variant, l.pageFormat);
      notify("success", "Layout deleted.");
      await refresh();
    } catch {
      notify("error", "Delete failed.");
    }
  };

  return (
    <div className="steditor">
      <div className="stlist__head">
        <h2>Layouts · {typeSchema?.label ?? type}</h2>
        <button type="button" className="btn btn--ghost" onClick={onBack}>← Back</button>
      </div>

      <div className="field field--row">
        <select aria-label="New layout format" value={newFormat} onChange={(e) => setNewFormat(e.target.value)}>
          {PAGE_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setEditor({ mode: "create", pageFormat: newFormat })}>
          New layout
        </button>
      </div>

      {mine.length === 0 ? (
        <p className="meter">No authored layouts yet. Code variants still apply.</p>
      ) : (
        <ul className="stlist__rows">
          {mine.map((l) => (
            <li key={`${l.variant}:${l.pageFormat}`} className="stlist__row">
              <div className="stlist__main">
                <span>{l.name}</span>
                <span className="stlist__key">{l.variant} · {l.pageFormat}</span>
              </div>
              <div className="stlist__actions">
                <button type="button" className="btn" onClick={() => setEditor({ mode: "edit", pageFormat: l.pageFormat, initial: l })}>
                  Edit
                </button>
                <button type="button" className="btn btn--ghost" aria-label={`delete-${l.variant}-${l.pageFormat}`} onClick={() => void remove(l)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the "Layouts" entry to `SectionTypeList`**

In `apps/web/src/ui/admin/SectionTypeList.tsx`:

Add the import:

```ts
import { SectionLayoutsView } from "./SectionLayoutsView";
```

Add a toggle state next to the existing `editor` state:

```ts
  const [layoutsFor, setLayoutsFor] = useState<string | null>(null);
```

Add an early return (next to the existing `if (editor) { … }` block):

```tsx
  if (layoutsFor) {
    return <SectionLayoutsView type={layoutsFor} onBack={() => setLayoutsFor(null)} />;
  }
```

Add a **Layouts** button in each row's `.stlist__actions` (next to Edit/Duplicate):

```tsx
            <button type="button" className="btn" onClick={() => setLayoutsFor(t.type)}>
              Layouts
            </button>
```

(Match the file's actual row/action JSX; place the button inside the existing `.stlist__actions` container.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-24-section-layouts-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the SectionTypeList regression**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx apps/web/src/__tests__/slice-11-admin-shell.test.tsx`
Expected: PASS (the Layouts button + toggle are additive).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ui/admin/SectionLayoutsView.tsx apps/web/src/ui/admin/SectionTypeList.tsx apps/web/src/__tests__/slice-24-section-layouts-view.test.tsx
git commit -m "feat(layout): SectionLayoutsView (list/create/edit/delete) + Layouts entry in SectionTypeList"
```

---

### Task 5: Inspector variant picker uses `availableVariants`

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-24-inspector-variants.test.tsx`

**Interfaces:**
- Consumes: `availableVariants` (from `../registry/componentRegistry`), `setActiveLayouts` (to seed an authored layout in the test), `document.pageFormat`.
- Produces: the section variant `<select>` lists code ∪ authored variants for the document's format.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-24-inspector-variants.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { setActiveLayouts, resetLayoutsForTests, type SectionLayout } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

const authored: SectionLayout = {
  type: "executive_summary", variant: "authored_slide", pageFormat: "widescreen_16_9", name: "Slide",
  root: { kind: "stack", children: [] }, version: 1,
};

beforeEach(() => {
  resetLayoutsForTests();
  setActiveLayouts([authored]);
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "H", body: "B" } }],
      brief: "", pageFormat: "widescreen_16_9",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  resetLayoutsForTests();
  setActiveLayouts([]);
});

describe("Inspector variant picker", () => {
  it("offers authored variants for the document's format alongside code variants", () => {
    render(<Inspector />);
    const select = screen.getByLabelText("Variant") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("standard"); // code variant
    expect(values).toContain("authored_slide"); // authored, for widescreen_16_9
  });
});
```

(Note: this assumes the variant `<select>` has `aria-label="Variant"`. If it currently lacks one, add `aria-label="Variant"` to it in Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-24-inspector-variants.test.tsx`
Expected: FAIL — the picker lists only `typeSchema.variants` (no `authored_slide`).

- [ ] **Step 3: Rewire the picker**

In `apps/web/src/ui/Inspector.tsx`:

Add the import:

```ts
import { availableVariants } from "../registry/componentRegistry";
```

Replace the current variants source (the line `const variants = typeSchema?.variants ?? [];`, ~line 70) with:

```ts
  const variants = selected ? availableVariants(selected.type, document.pageFormat) : [];
```

Ensure the variant `<select>` has `aria-label="Variant"` (add it if missing).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-24-inspector-variants.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the Inspector regression**

Run: `npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx apps/web/src/__tests__/slice-20-inspector-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-24-inspector-variants.test.tsx
git commit -m "feat(layout): Inspector variant picker offers authored variants (availableVariants)"
```

---

### Task 6: Editor CSS + final verification

**Files:**
- Modify: `apps/web/app/globals.css` (small additive classes for the block-tree editor)
- (verification)

- [ ] **Step 1: Add the block-tree editor classes**

In `apps/web/app/globals.css`, append (reusing existing tokens; additive — no changes to existing rules):

```css
/* Layout block-tree editor (§E) */
.ltree { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ltree__children { list-style: none; margin: 4px 0 0; padding-left: 16px; border-left: 1px solid var(--c-line, #e2e2e2); display: flex; flex-direction: column; gap: 4px; }
.ltree__row { display: flex; flex-direction: column; }
.ltree__bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ltree__palette { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: all tests pass (existing + new slice-24).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(layout): block-tree editor styles; phase-5a green (suite + typecheck + build)"
```

---

## Self-Review

**1. Spec coverage (§E/§F/§J-editor, Phase-5a slice):**
- Entry from `SectionTypeList` → `SectionLayoutsView` for a type → Task 4. ✅
- `SectionLayoutsView`: list authored layouts (name + variant + format), New/Edit/Delete → Task 4. ✅
- `LayoutEditor`: palette to add blocks; nested **stack** tree with up/down/remove; field-binding dropdown (kind-filtered); static-text inputs for callout/text; live preview via `LayoutRenderer` + `sampleDataForType`; inline validation + Save disabled while invalid; create asks variant+name (+ format chosen in the view) → Task 3. ✅
- `sampleDataForType` → Task 1. ✅
- Variant pickers use `availableVariants` (Inspector) → Task 5. ✅
- **Deferred to Phase 5b (correctly NOT here):** the token style inspector (Color swatches/Font/Size/Align/Weight/Spacing); the `columns` container + widths/gap controls; the Background/overlay group; the Outline new-section picker is unchanged (it lists types, not variants — no change needed). Documented in Global Constraints.

**2. Placeholder scan:** No TBD/TODO; every code step is complete. The `keyValue` block is addable but binds a single field in 5a's simplified model (the full multi-field keyValue editor + the style/columns/background controls are 5b) — it still validates (its `fields` defaults via `blankBlock`… note: see Type-consistency below).

**3. Type consistency:** `blankBlock` must produce blocks the validator accepts once bound. `keyValue` needs a `fields: string[]` — `blankBlock("keyValue")` currently returns `{ kind, field: "" }` (the generic branch), which is WRONG for keyValue (it has `fields`, not `field`). **Fix in Task 3:** give `keyValue` its own branch in `blankBlock` → `{ kind: "keyValue", fields: [] }`, and render its binding as a 5b concern (in 5a, a keyValue with empty `fields` is invalid until 5b adds its multi-field editor — acceptable, but to avoid shipping an unbindable block, EXCLUDE `keyValue` from the 5a `PALETTE`). Updated decision: **`PALETTE` in Task 3 excludes `keyValue`** (add it in 5b with its multi-field editor). `LEAF_KINDS` minus `keyValue`: build `PALETTE` as `["stack", ...LEAF_KINDS.filter((k) => k !== "keyValue")]`. The tree-helper and binding types are otherwise consistent (`getAtPath`/`updateAtPath`/`insertChild`/`removeAtPath`/`moveAtPath` operate on `stack.children`; the editor only nests stacks in 5a). `availableVariants(type, pageFormat?)` matches Task 5's call. `createLayout(layout)`/`updateLayout(type,variant,format,layout)` signatures match the client module. `LayoutRenderer` props `{layout,data,theme,pageFormat}` match.

> **Task 3 implementers:** apply the self-review fix — `PALETTE` excludes `keyValue`, and give `chart` its `{ chart: "bar" }` default (already in `blankBlock`). Everything else as written.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase5a-authoring-core.md`. This is Phase **5a** (authoring core); Phase **5b** (token style inspector + `columns` container + backgrounds/overlays) gets its own plan after this ships.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
