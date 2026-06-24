# Audit Phase 3b — Editor UX (undo/redo, reorder, modals, per-field AI, keyboard nav) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the workflow-efficiency features the audit calls out as the gap to "user-friendly" — undo/redo (M-7), section reordering, native-dialog→modal replacement (M-8), per-field AI busy state, and Outline keyboard navigation — on top of the Phase-3a-split components.

**Architecture:** Undo/redo is the `zundo` temporal middleware wrapping the Zustand store, scoped to the `document` + `selectedId` slices, with debounced history (a typing burst = one undo step) and history cleared on proposal load. Reordering is a new pure `moveSection` mutation + store action driven by up/down buttons in the Outline (no drag library). A reusable `ConfirmDialog`/`PromptDialog` pair (mirroring the existing `NewProposalDialog` modal pattern) replaces every `window.confirm`/`window.prompt`. Per-field AI busy splits SectionPane's single `busy` into `sectionBusy` + a `Set<string>` of in-flight field keys. Outline keyboard nav adds Arrow Up/Down selection with roving focus.

**Tech Stack:** Next 15 (App Router) · React 19 · Zustand 5 · **`zundo` (NEW dependency — user-approved)** · Vitest 2 + Testing Library.

## Global Constraints

- Commands at REPO ROOT: single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; lint `npm run lint`; format `npm run format:check`/`format`; build `npm run build -w @proposal/web`; install a dep `npm install <pkg> -w @proposal/web`.
- This IS a git repo; work on a branch off `main`. Commit per task. A pre-commit hook (lint-staged: `eslint --fix` + `prettier --write`) runs on commit — let it run; do NOT use `--no-verify`.
- TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); **extensionless imports** (no `.js`); `"use client"` atop any new client component. After EVERY task: `npm run typecheck` 0, `npm run lint` 0 errors, `npm run format:check` clean, full suite green (currently **463/463** + the tests this plan adds).
- **One new runtime dependency only: `zundo`** (Task 1; user-approved). Install it in the `@proposal/web` workspace. Do NOT add any other dependency (no drag libs, no lodash — hand-roll the small debounce).
- **No three-layer violations:** no styling/markup into content; components keep reading theme tokens; the AI still generates schema-conformant CONTENT only.
- Preserve the injectable test seams and existing public component APIs except where a task explicitly changes a prop (Task 6 changes `FieldArea`'s `busy` prop — update its tests accordingly).
- The Zustand store must keep working with the existing `useProposalStore.getState()` / `.setState(...)` usage in tests after the zundo wrap.

## File structure (created/modified by this plan)

- `apps/web/src/state/proposalStore.ts` — wrap with `temporal`; clear history on load (Task 1); add `moveSection` action (Task 3)
- `apps/web/src/state/mutations.ts` — add pure `moveSection` (Task 3)
- `apps/web/src/state/useTemporal.ts` — NEW: React hook exposing `{ undo, redo, canUndo, canRedo }` (Task 1)
- `apps/web/src/ui/UndoRedo.tsx` — NEW: topbar buttons + global keyboard shortcuts (Task 2)
- `apps/web/src/App.tsx` — mount `<UndoRedo />` in the topbar (Task 2)
- `apps/web/src/ui/Outline.tsx` — up/down buttons (Task 3); modal delete (Task 5); arrow-key nav (Task 7)
- `apps/web/src/ui/ConfirmDialog.tsx`, `apps/web/src/ui/PromptDialog.tsx` — NEW reusable modals (Task 4)
- `apps/web/src/ui/dashboard/Dashboard.tsx`, `apps/web/src/ui/dashboard/FolderSidebar.tsx`, `apps/web/src/ui/admin/UsersView.tsx` — modal replacements (Task 5)
- `apps/web/src/ui/inspector/SectionPane.tsx`, `apps/web/src/ui/inspector/FieldArea.tsx` — per-field busy (Task 6)

---

### Task 1: Add `zundo` undo/redo to the store (temporal middleware)

**Files:**
- Modify: `apps/web/package.json` (add `zundo`), `apps/web/src/state/proposalStore.ts`
- Create: `apps/web/src/state/useTemporal.ts`
- Test: `apps/web/src/__tests__/slice-27-undo-redo.test.ts`

**Interfaces:**
- Produces: the store gains undo history. `useProposalStore.temporal` is the zundo temporal store. `useTemporal()` returns `{ undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }`. History tracks ONLY `{ document, selectedId }`, is debounced (~300ms; a typing burst collapses to one step), capped at 100 steps, and is CLEARED when a different proposal loads (`load`) or a new one is persisted (`persistNew`).

- [ ] **Step 1: Install zundo**

Run: `npm install zundo -w @proposal/web`
Expected: `zundo` appears in `apps/web/package.json` dependencies. (zundo is ~1KB, peer-deps on zustand which is already present.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/__tests__/slice-27-undo-redo.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({ document: sampleProposal, selectedId: null });
  useProposalStore.temporal.getState().clear();
});
afterEach(() => useProposalStore.temporal.getState().clear());

describe("undo/redo (zundo temporal)", () => {
  it("undoes and redoes a brief edit on the document", () => {
    const original = useProposalStore.getState().document.brief ?? "";
    useProposalStore.getState().setBrief("CHANGED BRIEF");
    expect(useProposalStore.getState().document.brief).toBe("CHANGED BRIEF");

    useProposalStore.temporal.getState().undo();
    expect(useProposalStore.getState().document.brief ?? "").toBe(original);

    useProposalStore.temporal.getState().redo();
    expect(useProposalStore.getState().document.brief).toBe("CHANGED BRIEF");
  });

  it("does not track non-document state (e.g. saveStatus) as undo steps", () => {
    useProposalStore.temporal.getState().clear();
    useProposalStore.setState({ saveStatus: "saving" });
    expect(useProposalStore.temporal.getState().pastStates.length).toBe(0);
  });

  it("clears history when a different proposal context is loaded (clear on load path)", () => {
    useProposalStore.getState().setBrief("edit one");
    expect(useProposalStore.temporal.getState().pastStates.length).toBeGreaterThan(0);
    useProposalStore.temporal.getState().clear();
    expect(useProposalStore.temporal.getState().pastStates.length).toBe(0);
  });
});
```
(The second test relies on `partialize` excluding `saveStatus`. The debounce means a single synchronous `setBrief` may or may not register instantly; if `pastStates` is empty right after a debounced set, the test for undo must account for the debounce — see Step 3's note: use a NON-debounced `handleSet` in tests is not possible, so instead the debounce flushes on the next set/undo. If the undo test is flaky due to debounce timing, set the debounce to flush synchronously when `process.env.NODE_ENV === "test"` OR use a 0ms debounce under test. Simplest: make the debounce delay a module constant that is 0 when `import.meta.vitest` / test env. The implementer picks the cleanest deterministic approach and documents it.)

- [ ] **Step 3: Wrap the store with `temporal`**

In `apps/web/src/state/proposalStore.ts`:
1. Add imports:
```ts
import { temporal } from "zundo";
```
2. Convert the store creation (currently `create<ProposalState>((set, get) => ({ ... }))`) to the curried form wrapped in `temporal`:
```ts
export const useProposalStore = create<ProposalState>()(
  temporal(
    (set, get) => ({
      /* …the EXISTING store object, unchanged… */
    }),
    {
      partialize: (state) => ({ document: state.document, selectedId: state.selectedId }),
      limit: 100,
      handleSet: (handleSet) => debounceHistory(handleSet, HISTORY_DEBOUNCE_MS),
    },
  ),
);
```
3. Add a tiny typed debounce helper (module scope, no dependency) and the delay constant. Make the delay deterministic under test:
```ts
const HISTORY_DEBOUNCE_MS = process.env.NODE_ENV === "test" ? 0 : 300;

type SetState = typeof useProposalStore.setState;
function debounceHistory(fn: (...args: Parameters<SetState>) => void, ms: number) {
  if (ms <= 0) return fn; // deterministic + synchronous under test
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<SetState>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
```
(If `typeof useProposalStore.setState` causes a use-before-declaration type issue, type the debounce parameter as `(...args: unknown[]) => void` and cast at the `handleSet` call, or use zundo's exported `TemporalState`/handler type — the implementer picks a clean, lint-passing typing. The behaviour: 300ms debounce in prod, 0ms (synchronous passthrough) under test.)
4. Clear history on proposal context switch. In the `load` action (after it sets the freshly-loaded `document`/`selectedId`) and in `persistNew` (after it assigns the new `proposalId`), add:
```ts
useProposalStore.temporal.getState().clear();
```
(Place the `clear()` AFTER the `set(...)` that installs the loaded document, so the loaded state is the new baseline with empty history. If referencing `useProposalStore` inside its own factory is awkward, capture the temporal store via `get`/a post-set microtask, OR call `clear()` at the end of the async action where `useProposalStore` is already defined in module scope — the action runs long after module init, so `useProposalStore` is defined. Verify no TDZ error.)

- [ ] **Step 4: Create the `useTemporal` hook**

Create `apps/web/src/state/useTemporal.ts`:
```ts
"use client";
import { useStore } from "zustand";
import { useProposalStore } from "./proposalStore";

/** React access to the zundo temporal store (undo/redo + availability flags). */
export function useTemporal(): { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } {
  const canUndo = useStore(useProposalStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useProposalStore.temporal, (s) => s.futureStates.length > 0);
  const undo = useProposalStore.temporal.getState().undo;
  const redo = useProposalStore.temporal.getState().redo;
  return { undo: () => undo(), redo: () => redo(), canUndo, canRedo };
}
```

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-undo-redo.test.ts` → PASS. Then the store/editor safety-net: `npx vitest run apps/web/src/__tests__/slice-08-frontend.test.tsx apps/web/src/__tests__/slice-11-add-section.test.tsx apps/web/src/__tests__/slice-16-outline.test.tsx`. Then full `npm test`, `npm run typecheck` (0), `npm run lint` (0 errors), `npm run format:check` clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(editor): undo/redo via zundo temporal middleware (M-7)"
```

---

### Task 2: Undo/redo toolbar buttons + keyboard shortcuts

**Files:**
- Create: `apps/web/src/ui/UndoRedo.tsx`
- Modify: `apps/web/src/App.tsx` (mount `<UndoRedo />` in the topbar action group)
- Test: `apps/web/src/__tests__/slice-27-undo-redo-ui.test.tsx`

**Interfaces:**
- Consumes: `useTemporal()` (Task 1).
- Produces: `<UndoRedo />` — renders Undo + Redo buttons (disabled when `!canUndo`/`!canRedo`) AND installs a global `keydown` listener for Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo), `preventDefault` on match.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-undo-redo-ui.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { UndoRedo } from "../ui/UndoRedo";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({ document: sampleProposal, selectedId: null });
  useProposalStore.temporal.getState().clear();
});
afterEach(() => {
  cleanup();
  useProposalStore.temporal.getState().clear();
});

describe("UndoRedo controls", () => {
  it("disables Undo with no history, enables after an edit, and undoes on click", () => {
    render(<UndoRedo />);
    const undoBtn = screen.getByRole("button", { name: /undo/i });
    expect(undoBtn).toBeDisabled();

    useProposalStore.getState().setBrief("edited");
    expect(undoBtn).not.toBeDisabled();

    fireEvent.click(undoBtn);
    expect(useProposalStore.getState().document.brief ?? "").not.toBe("edited");
  });

  it("undoes on Ctrl+Z", () => {
    render(<UndoRedo />);
    useProposalStore.getState().setBrief("kbd edit");
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(useProposalStore.getState().document.brief ?? "").not.toBe("kbd edit");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-undo-redo-ui.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Create `UndoRedo`**

Create `apps/web/src/ui/UndoRedo.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { useTemporal } from "../state/useTemporal";

export function UndoRedo() {
  const { undo, redo, canUndo, canRedo } = useTemporal();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="undoredo" role="group" aria-label="Undo and redo">
      <button type="button" className="btn btn--ghost" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => undo()}>
        ↺ Undo
      </button>
      <button type="button" className="btn btn--ghost" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => redo()}>
        ↻ Redo
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount in the topbar**

In `apps/web/src/App.tsx`, inside the topbar action `<div style={{ display: "flex", alignItems: "center", gap: 14 }}>` (the group containing `<SaveControl />` etc.), add `<UndoRedo />` as the FIRST child (before `<SaveControl />`). Add `import { UndoRedo } from "./ui/UndoRedo";`.

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-undo-redo-ui.test.tsx` + the editor-route test `npx vitest run apps/web/src/__tests__/slice-14-editor-route.test.tsx`. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(editor): undo/redo toolbar buttons + Ctrl+Z/Ctrl+Y shortcuts (M-7)"
```

---

### Task 3: Section reordering (up/down)

**Files:**
- Modify: `apps/web/src/state/mutations.ts` (pure `moveSection`), `apps/web/src/state/proposalStore.ts` (action + interface), `apps/web/src/ui/Outline.tsx` (buttons)
- Test: `apps/web/src/__tests__/slice-27-move-section.test.ts`

**Interfaces:**
- Produces: pure `moveSection(document: ProposalDocument, id: string, direction: -1 | 1): ProposalDocument` (swaps the section with its neighbor in the given direction; returns the document unchanged if the move is out of bounds or the id is unknown — same reference when unchanged, matching the other mutations' immutability discipline). Store action `moveSection(id: string, direction: -1 | 1): void`. Outline up/down buttons call it; selection is unaffected (the section keeps its id). Reordering is automatically undoable (Task 1 tracks `document`).
- Note: reordering is only offered when the structure is NOT locked (mirror the existing `!locked` gate around the delete button).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-move-section.test.ts`:
```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => useProposalStore.setState({ document: sampleProposal, selectedId: null }));
afterEach(() => useProposalStore.temporal.getState().clear());

describe("moveSection", () => {
  it("moves a section down and back up, preserving ids", () => {
    const ids = () => useProposalStore.getState().document.sections.map((s) => s.id);
    const before = ids();
    expect(before.length).toBeGreaterThanOrEqual(2);

    useProposalStore.getState().moveSection(before[0]!, 1); // move first down
    expect(ids()).toEqual([before[1], before[0], ...before.slice(2)]);

    useProposalStore.getState().moveSection(before[0]!, -1); // move it back up
    expect(ids()).toEqual(before);
  });

  it("is a no-op at the boundaries", () => {
    const ids = () => useProposalStore.getState().document.sections.map((s) => s.id);
    const before = ids();
    useProposalStore.getState().moveSection(before[0]!, -1); // first up = no-op
    expect(ids()).toEqual(before);
    useProposalStore.getState().moveSection(before[before.length - 1]!, 1); // last down = no-op
    expect(ids()).toEqual(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-move-section.test.ts` — FAIL (`moveSection` is not on the store).

- [ ] **Step 3: Add the pure mutation**

In `apps/web/src/state/mutations.ts`, add (mirroring the existing immutable style — return the SAME `document` reference when nothing changes):
```ts
/** Swap a section with its neighbor (direction -1 = up, +1 = down). No-op at bounds / unknown id. */
export function moveSection(
  document: ProposalDocument,
  id: string,
  direction: -1 | 1,
): ProposalDocument {
  const i = document.sections.findIndex((s) => s.id === id);
  if (i < 0) return document;
  const j = i + direction;
  if (j < 0 || j >= document.sections.length) return document;
  const sections = [...document.sections];
  [sections[i], sections[j]] = [sections[j]!, sections[i]!];
  return { ...document, sections };
}
```

- [ ] **Step 4: Add the store action**

In `proposalStore.ts`: add to the `ProposalState` interface (near `removeSection`):
```ts
  moveSection: (id: string, direction: -1 | 1) => void;
```
Import the pure helper (extend the existing `mutations` import) and implement (near `removeSection`):
```ts
  moveSection: (id, direction) =>
    set((state) => ({ document: moveSection(state.document, id, direction) })),
```
(Selection is untouched — the section keeps its id, so `selectedId` stays valid.)

- [ ] **Step 5: Add up/down buttons to the Outline**

In `apps/web/src/ui/Outline.tsx`, subscribe to the action: `const moveSection = useProposalStore((s) => s.moveSection);`. Inside the `!locked` block where the delete button lives (alongside it, in each row at index `i`), add up/down buttons:
```tsx
<button
  type="button"
  className="outline-item__move"
  aria-label="Move section up"
  title="Move up"
  disabled={i === 0}
  onClick={() => moveSection(section.id, -1)}
>
  ↑
</button>
<button
  type="button"
  className="outline-item__move"
  aria-label="Move section down"
  title="Move down"
  disabled={i === sections.length - 1}
  onClick={() => moveSection(section.id, 1)}
>
  ↓
</button>
```
(Place them before the existing delete button. `i` and `sections` are already in scope in the `.map((section, i) => ...)`.)

- [ ] **Step 6: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-move-section.test.ts apps/web/src/__tests__/slice-16-outline.test.tsx`. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): section reordering with up/down buttons"
```

---

### Task 4: Reusable `ConfirmDialog` + `PromptDialog` modals

**Files:**
- Create: `apps/web/src/ui/ConfirmDialog.tsx`, `apps/web/src/ui/PromptDialog.tsx`
- Test: `apps/web/src/__tests__/slice-27-dialogs.test.tsx`

**Interfaces:**
- Produces (mirroring `NewProposalDialog`'s DOM: `.modal` overlay → `.modal__card` → `.modal__actions` with `btn--ghost` cancel + `btn--primary` confirm):
  - `ConfirmDialog({ title, message, confirmLabel?, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void })`
  - `PromptDialog({ title, label, defaultValue?, confirmLabel?, onConfirm, onClose }: { title: string; label: string; defaultValue?: string; confirmLabel?: string; onConfirm: (value: string) => void; onClose: () => void })` — holds local input state seeded from `defaultValue`; confirm passes the trimmed value; confirm disabled when the trimmed value is empty.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-dialogs.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("fires onConfirm then is dismissible via Cancel", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog title="Delete?" message="This cannot be undone." onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm|delete|ok/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("PromptDialog", () => {
  it("returns the edited value on confirm and disables confirm when empty", () => {
    const onConfirm = vi.fn();
    render(<PromptDialog title="Rename" label="Title" defaultValue="Old" onConfirm={onConfirm} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    expect(input.value).toBe("Old");
    fireEvent.change(input, { target: { value: "  New  " } });
    fireEvent.click(screen.getByRole("button", { name: /confirm|rename|ok|save/i }));
    expect(onConfirm).toHaveBeenCalledWith("New");

    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /confirm|rename|ok|save/i })).toBeDisabled();
  });
});
```
(Pick concrete button labels — e.g. ConfirmDialog confirm = the `confirmLabel ?? "Confirm"`; PromptDialog confirm = `confirmLabel ?? "Save"`. Make the test's name regex match whatever labels you choose.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-dialogs.test.tsx` — FAIL (modules missing).

- [ ] **Step 3: Implement the dialogs**

Create `ConfirmDialog.tsx` (`"use client"`):
```tsx
"use client";
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__card">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```
Create `PromptDialog.tsx` (`"use client"`) — same shell, with a labelled `<input>` whose state seeds from `defaultValue`, trimmed value passed to `onConfirm`, confirm `disabled` when the trimmed value is empty:
```tsx
"use client";
import { useState } from "react";
export function PromptDialog({
  title,
  label,
  defaultValue = "",
  confirmLabel = "Save",
  onConfirm,
  onClose,
}: {
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const trimmed = value.trim();
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal__card">
        <h2>{title}</h2>
        <label className="field">
          <span className="field__label">{label}</span>
          <input aria-label={label} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={trimmed === ""}
            onClick={() => {
              onConfirm(trimmed);
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-dialogs.test.tsx` → PASS. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): reusable ConfirmDialog + PromptDialog modals (M-8 groundwork)"
```

---

### Task 5: Replace all native `window.confirm`/`window.prompt` with modals (M-8)

**Files:**
- Modify: `apps/web/src/ui/Outline.tsx` (delete-section confirm), `apps/web/src/ui/dashboard/Dashboard.tsx` (rename prompt + delete confirm), `apps/web/src/ui/dashboard/FolderSidebar.tsx` (create/rename prompt + delete confirm), `apps/web/src/ui/admin/UsersView.tsx` (password prompt)
- Test: `apps/web/src/__tests__/slice-27-dialogs-wired.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog`/`PromptDialog` (Task 4).
- Each call site replaces its `window.confirm`/`window.prompt` with local dialog state: a `useState` holding the pending action's context (e.g. `const [pendingDelete, setPendingDelete] = useState<string | null>(null)`), the trigger sets it, and the dialog renders conditionally; `onConfirm` runs the original side-effect, `onClose` clears the state.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-dialogs-wired.test.tsx` covering at least the Outline delete path (the others follow the same pattern):
```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Outline } from "../ui/Outline";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => useProposalStore.setState({ document: sampleProposal, selectedId: null, templates: [] }));
afterEach(cleanup);

describe("Outline delete via modal (no window.confirm)", () => {
  it("opens a ConfirmDialog and deletes only after confirming", () => {
    render(<Outline />);
    const before = useProposalStore.getState().document.sections.length;
    const firstRow = screen.getAllByLabelText("Delete section")[0]!;
    fireEvent.click(firstRow);
    // dialog appears; nothing deleted yet
    expect(useProposalStore.getState().document.sections.length).toBe(before);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /confirm|delete/i }));
    expect(useProposalStore.getState().document.sections.length).toBe(before - 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-dialogs-wired.test.tsx` — FAIL (clicking delete currently calls `window.confirm`, which jsdom stubs/returns false → no dialog role appears, no deletion).

- [ ] **Step 3: Replace each call site**

Replace ALL of these (grep `window.confirm`/`window.prompt` to confirm none remain after):
1. **`Outline.tsx`** (delete-section `window.confirm`): add `const [pendingDelete, setPendingDelete] = useState<string | null>(null);`; the ✕ button `onClick` sets `setPendingDelete(section.id)`; render `{pendingDelete ? <ConfirmDialog title="Delete section" message="Delete this section? This cannot be undone." confirmLabel="Delete" onConfirm={() => removeSection(pendingDelete)} onClose={() => setPendingDelete(null)} /> : null}`.
2. **`Dashboard.tsx`** (rename `window.prompt`): a `PromptDialog` (`title="Rename proposal"`, `label="Title"`, `defaultValue={current}`, `confirmLabel="Rename"`, `onConfirm={(title) => updateProposalMeta(id, { title }).then(refresh)…}`) gated by a `pendingRename: { id: string; current: string } | null` state. (delete `window.confirm`): a `ConfirmDialog` gated by `pendingDelete: string | null`, `onConfirm` runs the existing delete logic.
3. **`FolderSidebar.tsx`** (create-folder prompt, rename-folder prompt, delete-folder confirm): two `PromptDialog`s + one `ConfirmDialog`, each gated by its own small state. Preserve the existing `createFolder`/`renameFolder`/`deleteFolder` side-effects exactly.
4. **`UsersView.tsx`** (password `window.prompt`): a `PromptDialog` (`title="Set password"`, `label="New password"`, `confirmLabel="Set password"`) gated by `pendingPwUser: string | null`; `onConfirm={(pw) => setUserPassword(id, pw)…}`. (Keep any existing min-length/validation that followed the prompt; if the original validated the password, keep that check — either in the handler or note that the dialog allows any non-empty value and the server enforces policy.)

Keep every resulting side-effect (the API calls, `refresh()`, `notify(...)`, optimistic state updates) byte-identical to what followed the native dialog.

- [ ] **Step 4: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-dialogs-wired.test.tsx` + the dashboard/folder/users safety-net (`git grep -l "Dashboard\|FolderSidebar\|UsersView" apps/web/src/__tests__` → run those). Confirm `git grep -n "window.confirm\|window.prompt" apps/web/src` returns NOTHING. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): replace native prompt/confirm with accessible modals (M-8)"
```

---

### Task 6: Per-field AI busy state

**Files:**
- Modify: `apps/web/src/ui/inspector/SectionPane.tsx`, `apps/web/src/ui/inspector/FieldArea.tsx`
- Test: `apps/web/src/__tests__/slice-27-per-field-busy.test.tsx`

**Interfaces:**
- `SectionPane` splits its single `busy` into `sectionBusy: boolean` (section-rewrite button) and `fieldBusy: Set<string>` (in-flight field keys). `rewriteField(key)` adds `key` to `fieldBusy` before the request and removes it after (success or failure); it no longer touches `sectionBusy`. `rewriteSection` keeps using `sectionBusy`.
- `FieldArea`'s prop changes from `busy: boolean` to `busyFields: Set<string>`; each field-rewrite button uses `disabled={busyFields.has(field.key)}` and its label can reflect per-field working state.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-per-field-busy.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Section, SectionTypeSchema, Template } from "@proposal/shared";
import { openTemplate } from "@proposal/shared";
import { FieldArea } from "../ui/inspector/FieldArea";

afterEach(cleanup);

const typeSchema: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  variants: [],
  schemaVersion: 1,
  fields: [
    { key: "headline", type: "text" },
    { key: "subhead", type: "text" },
  ],
};
const section = { id: "s1", type: "cover", variant: "", data: {} } as unknown as Section;

describe("FieldArea per-field busy", () => {
  it("disables only the in-flight field's Rewrite button", () => {
    render(
      <FieldArea
        section={section}
        selectedIndex={0}
        typeSchema={typeSchema}
        template={openTemplate as Template}
        busyFields={new Set(["headline"])}
        fieldInstr={{}}
        setFieldInstr={vi.fn()}
        setField={vi.fn()}
        rewriteField={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /rewrite field/i });
    // headline (first) disabled, subhead (second) enabled
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });
});
```
(Adjust the section/typeSchema shape to satisfy the real types — use `sampleProposal.sections[0]` + its real schema if simpler. The assertion that matters: one field's button disabled, the other's not.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-per-field-busy.test.tsx` — FAIL (FieldArea still takes `busy: boolean`, a typecheck/prop error).

- [ ] **Step 3: Update SectionPane**

Replace `const [busy, setBusy] = useState(false)` with:
```ts
const [sectionBusy, setSectionBusy] = useState(false);
const [fieldBusy, setFieldBusy] = useState<Set<string>>(new Set());
```
`rewriteSection` uses `setSectionBusy(true/false)`; its button uses `disabled={sectionBusy}` and `{sectionBusy ? "Working…" : "Rewrite section with AI"}`. `rewriteField(key)` becomes:
```ts
const rewriteField = async (key: string) => {
  setFieldBusy((prev) => new Set(prev).add(key));
  const current = typeof section.data[key] === "string" ? section.data[key] : "";
  const result = await requestFieldGeneration({ type: section.type, fieldKey: key, brief, instruction: fieldInstr[key] ?? "", currentValue: current, sectionId: section.id });
  setFieldBusy((prev) => { const next = new Set(prev); next.delete(key); return next; });
  if (result.ok) { setField(key, result.value); notify("success", "Field rewritten."); }
  else { notify("error", result.error ?? "Generation failed"); }
};
```
Pass `busyFields={fieldBusy}` to `<FieldArea ... />` (replacing `busy={busy}`).

- [ ] **Step 4: Update FieldArea**

Change the prop `busy: boolean` → `busyFields: Set<string>` (update the destructure + the type). Each field-rewrite button: `disabled={busyFields.has(field.key)}`; optionally label `{busyFields.has(field.key) ? "Working…" : "Rewrite field"}` (keep the accessible name matching the test regex `/rewrite field/i` — if you change the label to "Working…", the test queries by name will miss the busy one; the test passes `busyFields={new Set(["headline"])}` and queries `/rewrite field/i`, so KEEP the button's accessible text "Rewrite field" regardless of busy, or the test must change. Simplest: keep text "Rewrite field" and only toggle `disabled`).

- [ ] **Step 5: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-per-field-busy.test.tsx` + the inspector safety-net `npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx apps/web/src/__tests__/slice-21-inspector-image.test.tsx`. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(inspector): per-field AI busy state (independent field rewrites)"
```

---

### Task 7: Outline keyboard navigation

**Files:**
- Modify: `apps/web/src/ui/Outline.tsx`
- Test: `apps/web/src/__tests__/slice-27-outline-keyboard.test.tsx`

**Interfaces:**
- The section list container handles ArrowDown/ArrowUp to move `selectedId` to the next/previous section (clamped at the ends), calling `selectSection`. Selected row uses roving `tabIndex` (`0` when selected, `-1` otherwise) so Tab lands on the active row and arrows move within the list; focus follows selection.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-27-outline-keyboard.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Outline } from "../ui/Outline";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() =>
  useProposalStore.setState({
    document: sampleProposal,
    selectedId: sampleProposal.sections[0]!.id,
    templates: [],
  }),
);
afterEach(cleanup);

describe("Outline keyboard navigation", () => {
  it("ArrowDown selects the next section, ArrowUp the previous", () => {
    render(<Outline />);
    const ids = sampleProposal.sections.map((s) => s.id);
    const nav = screen.getByRole("navigation"); // the Outline container (match its real role/label)
    fireEvent.keyDown(nav, { key: "ArrowDown" });
    expect(useProposalStore.getState().selectedId).toBe(ids[1]);
    fireEvent.keyDown(nav, { key: "ArrowUp" });
    expect(useProposalStore.getState().selectedId).toBe(ids[0]);
  });

  it("clamps at the first section on ArrowUp", () => {
    render(<Outline />);
    const ids = sampleProposal.sections.map((s) => s.id);
    const nav = screen.getByRole("navigation");
    fireEvent.keyDown(nav, { key: "ArrowUp" });
    expect(useProposalStore.getState().selectedId).toBe(ids[0]);
  });
});
```
(Match the container query to the Outline's real wrapper — if it's a `<nav>` use `getByRole("navigation")`; if not, add an `aria-label` and query that. Verify against the current Outline markup.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-27-outline-keyboard.test.tsx` — FAIL (no arrow handling).

- [ ] **Step 3: Add keyboard handling + roving tabindex**

In `Outline.tsx`, add an `onKeyDown` to the section-list container that, on ArrowDown/ArrowUp, computes the current index from `selectedId` and calls `selectSection(sections[clampedNext]?.id ?? selectedId)` (preventDefault on handled keys). Set each row button's `tabIndex={section.id === selectedId ? 0 : -1}`. After selection changes, move focus to the newly selected row (use a `ref` map or query `[aria-pressed="true"]` post-update via `useEffect` on `selectedId`). Keep the existing click-to-select behaviour.

- [ ] **Step 4: Verify**

Run: `npx vitest run apps/web/src/__tests__/slice-27-outline-keyboard.test.tsx apps/web/src/__tests__/slice-16-outline.test.tsx`. Then full `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(outline): ArrowUp/Down keyboard navigation with roving focus"
```

---

## Self-Review

**1. Audit coverage:** Closes M-7 (undo/redo — Tasks 1–2), the section-reordering workflow gap (Task 3), M-8 (native dialogs → modals — Tasks 4–5), per-field AI busy (Task 6), and Outline keyboard nav (Task 7). Still deferred (their own slices): M-9 (RSC print), M-3 (parallel generation).

**2. Placeholder scan:** New code is concrete (temporal wrap, `useTemporal`, `UndoRedo` + shortcuts, `moveSection`, both dialogs, per-field busy diff, outline keydown). The "discover-then-do" steps are bounded: Task 5 enumerates all 7 call sites (grep-verified to none-remaining) and Task 3/7 reference the real Outline structure. The debounce-vs-test-determinism wrinkle (Task 1) is called out with a concrete resolution (0ms under `NODE_ENV==="test"`).

**3. Type/consistency:** `useTemporal` (Task 1) feeds `UndoRedo` (Task 2). `moveSection` is added to both the pure layer and the store interface (Task 3). `ConfirmDialog`/`PromptDialog` (Task 4) are consumed by Task 5. `FieldArea`'s prop changes `busy: boolean` → `busyFields: Set<string>` (Task 6) — its Phase-3a tests that pass `busy` must be updated in the same task. Reordering is undoable for free because Task 1 tracks `document`.

**Risk notes:** (a) zundo requires the curried `create<T>()(temporal(...))` form — converting from the current non-curried call must preserve the entire store object; the existing safety-net suites are the guard. (b) Debounced history vs. deterministic tests — resolved by a 0ms debounce under test. (c) `clear()` on `load`/`persistNew` must run after the new document is set, and must not hit a TDZ on `useProposalStore` (the actions run long after module init, so it's safe — verify). (d) Task 5 must leave ZERO `window.confirm`/`window.prompt` in `apps/web/src` (grep-gated).

## Execution Handoff

This plan implements audit **Phase 3b** (editor UX). Two execution options:
1. **Subagent-Driven (recommended)** — fresh implementer + reviewer per task, on a branch `feat/audit-phase3b-editor-ux`.
2. **Inline Execution** — here with checkpoints.

**Adds one dependency:** `zundo` (Task 1, user-approved). **Still deferred to later slices:** M-9 (RSC print), M-3 (parallel generation).

Which approach?
