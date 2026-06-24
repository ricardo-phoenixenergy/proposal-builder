# Audit Phase 3a — Editor Refactor (selector perf + god-component splits) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit H-8 (Inspector selector over-subscription → editor jank at scale) and split the two oversized "god components" (`Inspector` 488 LOC, `LayoutEditor` 731 LOC) into focused, independently-subscribing pieces — with zero behaviour change.

**Architecture:** `Inspector` is decomposed into panes under `apps/web/src/ui/inspector/`, each subscribing to **only its own narrow store slices** (so a keystroke in a section field no longer re-renders the document/brief panels). The over-broad `useProposalStore((s) => s.document)` and `s.document.sections` subscriptions are eliminated. `LayoutEditor` is decomposed into `BlockTree` + `BlockStylePanel` + a thin shell under `apps/web/src/ui/admin/layout/` (pure size/readability — it has no store-perf problem). The existing Inspector/LayoutEditor test suites are the behaviour-preserving safety net; they must stay green after every extraction.

**Tech Stack:** Next 15 (App Router) · React 19 · Zustand 5 (`useShallow` from `zustand/react/shallow` — already a transitive export of the installed `zustand`, **no new dependency**) · Vitest 2 + Testing Library.

## Global Constraints

- Commands at REPO ROOT: single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; lint `npm run lint`; format `npm run format:check`/`format`; build `npm run build -w @proposal/web`.
- This IS a git repo; work on a branch off `main`. Commit per task. A pre-commit hook (lint-staged) runs `eslint --fix` + `prettier --write` on staged files — let it run; do NOT use `--no-verify`.
- TS strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); **extensionless imports** (no `.js`). After EVERY task: `npm run typecheck` 0, `npm run lint` 0 errors, `npm run format:check` clean, full suite green (currently **452/452**, plus the isolated tests this plan adds).
- **NO new runtime dependencies.** `useShallow` ships inside the already-installed `zustand`. New files/folders only.
- **Behaviour-preserving refactor.** The rendered DOM, ARIA labels, text, and component public APIs (`Inspector` takes no props; `LayoutEditor`'s prop signature) must NOT change — the existing test suites assert them and must stay green. Do not "improve" copy, markup, or logic while extracting.
- **No three-layer violations.** No styling/markup leaks into content; components keep reading theme tokens; no JSX is authored into data. (Unaffected here, but the invariant stands.)
- **Out of scope (deferred to their own slices — do NOT build here):** M-9 (RSC print — touches the Phase-0-hardened PDF readiness contract at `renderProposalPdf.ts:20`), M-3 (parallelize `generate/proposal` — server-only, no UI caller today, must respect the Phase-2 rate limiter). These belong to Phase 3b/later.

## Existing safety-net tests (must stay green throughout)

- Inspector: `slice-06-frontend`, `slice-07-frontend`, `slice-10-frontend`, `slice-13-inspector-templates`, `slice-17-inspector-theme`, `slice-18-inspector`, `slice-19-inspector-pagebreak`, `slice-20-inspector-page`, `slice-21-inspector-image`, `slice-24-inspector-variants`.
- LayoutEditor: `slice-24-layout-editor`, `slice-25-style-inspector`, `slice-25-keyvalue`, `slice-25-columns-authoring`, `slice-25-background-group`.

Run the relevant subset after each task; run the FULL suite before each commit.

## File structure (created by this plan)

- `apps/web/src/ui/inspector/BriefPane.tsx` — proposal-brief textarea (Task 1)
- `apps/web/src/ui/inspector/DocumentPane.tsx` — template / page format / page mode / theme (Task 2)
- `apps/web/src/ui/inspector/SectionPane.tsx` — selected-section header, warnings, rewrite, page-break, variant (Task 3)
- `apps/web/src/ui/inspector/FieldArea.tsx` — schema-driven field editors incl. per-field AI (Task 4)
- `apps/web/src/ui/inspector/useSelectedSection.ts` — narrow selector hook for the selected section (Task 3)
- `apps/web/src/ui/Inspector.tsx` — becomes a thin shell composing the panes (Task 5)
- `apps/web/src/ui/admin/layout/BlockTree.tsx`, `BlockStylePanel.tsx` — LayoutEditor split (Task 6)

---

### Task 1: Extract `BriefPane` (establish the narrow-subscription pattern)

**Files:**
- Create: `apps/web/src/ui/inspector/BriefPane.tsx`
- Modify: `apps/web/src/ui/Inspector.tsx` (render `<BriefPane />` in place of the inline brief panel; drop the now-unused `setBrief` selector and the `brief` derivation)
- Test: `apps/web/src/__tests__/slice-26-inspector-briefpane.test.tsx`

**Interfaces:**
- Produces: `export function BriefPane(): JSX.Element` — takes NO props; subscribes to exactly `s.document.brief` and `s.setBrief`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-inspector-briefpane.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BriefPane } from "../ui/inspector/BriefPane";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);

describe("BriefPane", () => {
  it("renders the brief and writes edits to the store via setBrief", () => {
    render(<BriefPane />);
    const ta = screen.getByLabelText(/proposal brief/i) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "New brief text" } });
    expect(useProposalStore.getState().document.brief).toBe("New brief text");
  });
});
```
(If the brief control is not currently labelled "Proposal brief", match the EXACT existing label/text from `Inspector.tsx` lines 260–272 — do not rename it; adjust the query to the real label.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-inspector-briefpane.test.tsx`
Expected: FAIL — `../ui/inspector/BriefPane` does not exist.

- [ ] **Step 3: Create `BriefPane`**

Create `apps/web/src/ui/inspector/BriefPane.tsx` with `"use client";` at the top. Move the brief panel JSX from `Inspector.tsx` (lines ~260–272) verbatim. Subscribe narrowly:
```tsx
"use client";
import { useProposalStore } from "../../state/proposalStore";

export function BriefPane() {
  const brief = useProposalStore((s) => s.document.brief);
  const setBrief = useProposalStore((s) => s.setBrief);
  return (
    // …the exact brief-panel JSX moved from Inspector.tsx (same wrapper class,
    // same label text, same textarea aria-label), using `brief` and `setBrief`.
  );
}
```
Keep every className, label, and aria attribute identical to the original.

- [ ] **Step 4: Wire it into `Inspector.tsx`**

Replace the inline brief panel with `<BriefPane />`. Remove the `setBrief` selector (line 43) and the `brief` derivation (line 60) from `Inspector.tsx` if they are now unused there. Add `import { BriefPane } from "./inspector/BriefPane";`.

- [ ] **Step 5: Verify**

Run the new test (PASS) + the Inspector safety-net suite:
`npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx apps/web/src/__tests__/slice-06-frontend.test.tsx apps/web/src/__tests__/slice-26-inspector-briefpane.test.tsx`
Then full suite `npm test`, `npm run typecheck` (0), `npm run lint` (0 errors), `npm run format:check`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(inspector): extract BriefPane with a narrow brief subscription (H-8)"
```

---

### Task 2: Extract `DocumentPane` (template / page format / page mode / theme)

**Files:**
- Create: `apps/web/src/ui/inspector/DocumentPane.tsx`
- Modify: `apps/web/src/ui/Inspector.tsx` (render `<DocumentPane />`; remove the moved selectors/derivations)
- Test: `apps/web/src/__tests__/slice-26-inspector-documentpane.test.tsx`

**Interfaces:**
- Produces: `export function DocumentPane(): JSX.Element` — NO props. Owns local `docOpen`/`tab` state. Subscribes narrowly (use ONE `useShallow` selector for the bundle of document fields it needs to avoid multiple subscriptions):
```tsx
import { useShallow } from "zustand/react/shallow";
const { templateId, pageFormat, pageMode } = useProposalStore(
  useShallow((s) => ({
    templateId: s.document.templateId,
    pageFormat: s.document.pageFormat,
    pageMode: s.document.pageMode,
  })),
);
```
plus `s.theme` (or `s.theme.id` where only the id is read), `s.templates`, and the actions `applyTemplate`, `setPageFormat`, `setPageMode`, `forkTheme`, `unforkTheme`, `selectPreset`. Each action via its own `useProposalStore((s) => s.action)` selector (stable refs).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-inspector-documentpane.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DocumentPane } from "../ui/inspector/DocumentPane";

afterEach(cleanup);

describe("DocumentPane", () => {
  it("renders the document disclosure (template + page controls)", () => {
    render(<DocumentPane />);
    // Match the EXACT existing labels from Inspector.tsx lines 133–177.
    expect(screen.getByLabelText(/template/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page mode/i)).toBeInTheDocument();
  });
});
```
(Adjust label queries to the real labels/aria in `Inspector.tsx` — do not rename controls.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-inspector-documentpane.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Create `DocumentPane`**

Create `apps/web/src/ui/inspector/DocumentPane.tsx` (`"use client";`). Move the document-disclosure JSX (Inspector lines ~121–258): template selector, page-format selector, page-mode selector, and the full theme sub-panel (including `<ThemeForm />`, `<CodeEditor />`, `<AssetUpload />` and the `isForked` derivation `theme.id !== s.document.theme?.…` — replicate the exact original derivation). Move local state `docOpen` and `tab`. Keep all imports (`ThemeForm`, `CodeEditor`, `AssetUpload`, `themes`) pointing at their current modules (fix the relative depth: `../` → `../../`).

- [ ] **Step 4: Wire into `Inspector.tsx`**

Replace the inline document panel with `<DocumentPane />`. Remove from `Inspector.tsx` the now-unused selectors (`applyTemplateAction`, `templates`, `forkTheme`, `unforkTheme`, `selectPreset`, `setPageFormat`, `setPageMode`, and `theme` if unused elsewhere) and the `docOpen`/`tab`/`isForked` locals. Add the import.

- [ ] **Step 5: Verify**

Run new test + theme/template/page safety-net:
`npx vitest run apps/web/src/__tests__/slice-13-inspector-templates.test.tsx apps/web/src/__tests__/slice-17-inspector-theme.test.tsx apps/web/src/__tests__/slice-20-inspector-page.test.tsx apps/web/src/__tests__/slice-21-inspector-image.test.tsx apps/web/src/__tests__/slice-26-inspector-documentpane.test.tsx`
Then `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(inspector): extract DocumentPane (template/page/theme) with narrow subscriptions (H-8)"
```

---

### Task 3: Extract `SectionPane` + `useSelectedSection` (the core H-8 fix)

**Files:**
- Create: `apps/web/src/ui/inspector/useSelectedSection.ts`
- Create: `apps/web/src/ui/inspector/SectionPane.tsx`
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-26-inspector-sectionpane.test.tsx`

**Interfaces:**
- Produces:
  - `export function useSelectedSection(): { section: Section | null; index: number }` — selects ONLY the selected section by id, not the whole array. Because Zustand compares results by `Object.is`, editing a *different* section won't re-render consumers of this hook (the selected section's object reference is unchanged). Implementation:
    ```ts
    import { useShallow } from "zustand/react/shallow";
    import { useProposalStore } from "../../state/proposalStore";

    export function useSelectedSection() {
      return useProposalStore(
        useShallow((s) => {
          const index = s.document.sections.findIndex((x) => x.id === s.selectedId);
          return { section: index >= 0 ? s.document.sections[index]! : null, index };
        }),
      );
    }
    ```
  - `export function SectionPane(): JSX.Element | null` — NO props. Uses `useSelectedSection`; owns local `sectionInstruction` + `busy`; renders the section header/warnings (Inspector ~274–308), the Rewrite area (~310–330), and the page-break + variant controls (~452–479); renders `<FieldArea section={section} index={index} />` (Task 4) in place of the inline field loop. Returns `null` when no section is selected (so the empty-placeholder stays in the shell, matching current behaviour).
- Consumes: `requestSectionGeneration` (`client/generate`), store actions `setSectionType`, `setSectionData`, `setPageBreakBefore`, `setVariant`, `notify`, and the merged `sectionTypes`/`templates` needed to derive `typeSchema`, `isUnstyled`, `rangeWarnings`, `choiceSlot`, `variants`, `structureLocked`, `hasAiFields` (replicate the EXACT derivations from `Inspector.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-inspector-sectionpane.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { SectionPane } from "../ui/inspector/SectionPane";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: sampleProposal,
    selectedId: sampleProposal.sections[0]!.id,
  });
});
afterEach(cleanup);

describe("SectionPane", () => {
  it("renders controls for the selected section", () => {
    render(<SectionPane />);
    // The first sample section renders its type/variant controls — match an
    // existing stable label from Inspector's section header (e.g. "Variant").
    expect(screen.getByLabelText(/variant/i)).toBeInTheDocument();
  });

  it("renders nothing when no section is selected", () => {
    useProposalStore.setState({ selectedId: null });
    const { container } = render(<SectionPane />);
    expect(container).toBeEmptyDOMElement();
  });
});
```
(Confirm `sampleProposal` is exported from `@proposal/shared`; if the variant control is conditionally shown, pick a label that is always present for a selected section. Adjust to the real labels.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-inspector-sectionpane.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Create `useSelectedSection` then `SectionPane`**

Create the hook file exactly as in Interfaces. Create `SectionPane.tsx` (`"use client";`): move the section header/warnings, rewrite area (with `sectionInstruction`/`busy` local state and the `rewriteSection` handler from Inspector ~80–96), and page-break/variant controls. Where the original looped over `typeSchema.fields`, render `<FieldArea section={section} index={index} />` (created in Task 4 — for THIS task, temporarily inline the field loop OR create a minimal `FieldArea` stub that renders the fields; cleanest is to do Task 3 and 4 together if the reviewer prefers, but the plan keeps them separate: in Task 3, keep the field loop inline inside SectionPane, then Task 4 extracts it). **Decision: in Task 3 keep the field loop inline inside SectionPane; Task 4 extracts it to `FieldArea`.**

- [ ] **Step 4: Wire into `Inspector.tsx`**

Replace the inline section block (header/warnings/rewrite/fields/pagebreak/variant) with `<SectionPane />`. Keep the empty-selection placeholder in the shell, shown when `selectedId` is null. Remove now-unused section selectors/derivations from the shell.

- [ ] **Step 5: Verify**

Run new test + section safety-net:
`npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx apps/web/src/__tests__/slice-24-inspector-variants.test.tsx apps/web/src/__tests__/slice-07-frontend.test.tsx apps/web/src/__tests__/slice-26-inspector-sectionpane.test.tsx`
Then `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(inspector): extract SectionPane + useSelectedSection (H-8 core)"
```

---

### Task 4: Extract `FieldArea` (schema-driven field editors incl. per-field AI)

**Files:**
- Create: `apps/web/src/ui/inspector/FieldArea.tsx`
- Modify: `apps/web/src/ui/inspector/SectionPane.tsx` (render `<FieldArea section={section} index={index} />`)
- Test: `apps/web/src/__tests__/slice-26-inspector-fieldarea.test.tsx`

**Interfaces:**
- Produces: `export function FieldArea({ section, index }: { section: Section; index: number }): JSX.Element` — receives the selected section + its index as props (it lives inside SectionPane which already subscribes via `useSelectedSection`; no extra store subscription for the section). Owns local `fieldInstr` state and the `rewriteField` handler (Inspector ~98–117). Subscribes to the actions it calls (`setSectionData`/`setField`, `notify`) and the merged registries it needs to derive `typeSchema`/`template`. Renders the three field branches verbatim (`kind === "data"` ~339–359, `"manual"` ~361–390, `"ai"` ~392–448).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-inspector-fieldarea.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { FieldArea } from "../ui/inspector/FieldArea";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => useProposalStore.setState({ document: sampleProposal }));
afterEach(cleanup);

describe("FieldArea", () => {
  it("renders an editor for each field of the section's type", () => {
    const section = sampleProposal.sections[0]!;
    render(<FieldArea section={section} index={0} />);
    // At least one field editor renders (match a known field label/aria from
    // the first sample section's type schema).
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-inspector-fieldarea.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Create `FieldArea`**

Create `FieldArea.tsx` (`"use client";`). Move the field loop and the three branches from SectionPane (originally Inspector ~332–450), plus `fieldInstr` state and `rewriteField`. Derive `typeSchema`/`template` from the store registries exactly as before. Use `section`/`index` from props.

- [ ] **Step 4: Wire into `SectionPane`**

Replace the inline field loop in `SectionPane` with `<FieldArea section={section} index={index} />`. Remove the now-unused field-loop locals/handlers from `SectionPane` (`fieldInstr`, `rewriteField`).

- [ ] **Step 5: Verify**

Run new test + field-related safety-net:
`npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx apps/web/src/__tests__/slice-21-inspector-image.test.tsx apps/web/src/__tests__/slice-10-frontend.test.tsx apps/web/src/__tests__/slice-26-inspector-fieldarea.test.tsx`
Then `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(inspector): extract FieldArea (schema fields + per-field AI)"
```

---

### Task 5: Slim the `Inspector` shell + assert H-8 is closed

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-26-inspector-shell.test.tsx`

**Interfaces:**
- After Tasks 1–4, `Inspector` should be a thin shell: it composes `<DocumentPane />`, `<BriefPane />`, and either `<SectionPane />` or the empty placeholder (based on `selectedId`). It must NOT subscribe to `s.document` or `s.document.sections` anymore — at most `s.selectedId` (a primitive) to choose section-vs-placeholder.

- [ ] **Step 1: Write the failing/guard test**

Create `apps/web/src/__tests__/slice-26-inspector-shell.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../ui/Inspector.tsx"), "utf8");

describe("Inspector shell (H-8)", () => {
  it("no longer subscribes to the whole document or sections array", () => {
    expect(src).not.toMatch(/useProposalStore\(\s*\(s\)\s*=>\s*s\.document\s*\)/);
    expect(src).not.toMatch(/=>\s*s\.document\.sections\s*\)/);
  });

  it("still renders the panes and the empty placeholder path", () => {
    useProposalStore.setState({ document: sampleProposal, selectedId: null });
    render(<Inspector />);
    expect(screen.getByLabelText(/proposal brief/i)).toBeInTheDocument(); // BriefPane present
  });
});
```
(Match the brief label to the real one. The regex guards are the H-8 deliverable: the shell must not re-subscribe to the whole document/sections.)

- [ ] **Step 2: Run to verify the current state**

Run: `npx vitest run apps/web/src/__tests__/slice-26-inspector-shell.test.tsx`
Expected: the first test FAILS if any whole-`document`/`sections` subscription still lingers in the shell after Tasks 1–4; PASS once removed. (If Tasks 1–4 already removed them, the test passes immediately — then this task is just the guard + any final cleanup.)

- [ ] **Step 3: Remove residual broad subscriptions**

In `Inspector.tsx`, delete any remaining `const document = useProposalStore((s) => s.document)` / `s.document.sections` lines and replace the only legitimate need (section-vs-placeholder branch) with `const selectedId = useProposalStore((s) => s.selectedId);`. Delete dead derivations/imports. The shell renders: `<DocumentPane /> <BriefPane /> {selectedId ? <SectionPane /> : <EmptyPlaceholder/>}` (keep the existing empty-placeholder JSX, lines ~481–485).

- [ ] **Step 4: Verify**

Run the shell test (PASS) + the FULL Inspector safety-net suite (all `slice-*inspector*` + `slice-06/07/10-frontend`) + `npm test`. `npm run typecheck` 0, `npm run lint` 0, `npm run format:check` clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(inspector): slim shell to thin composition; close H-8 over-subscription"
```

---

### Task 6: Split `LayoutEditor` → `BlockTree` + `BlockStylePanel` + shell

**Files:**
- Create: `apps/web/src/ui/admin/layout/BlockTree.tsx`
- Create: `apps/web/src/ui/admin/layout/BlockStylePanel.tsx`
- Modify: `apps/web/src/ui/admin/LayoutEditor.tsx` (becomes the shell: metadata fields, palette, live preview, validation, save/cancel — composing the two new components)
- Test: `apps/web/src/__tests__/slice-26-layout-split.test.tsx`

**Interfaces:**
- `LayoutEditor`'s PUBLIC props are UNCHANGED (`{ type, pageFormat, initial, mode, onDone, onCancel }`). The split is internal. `root: Block` + `selected: number[]` state stays in the `LayoutEditor` shell (single source of truth); the two children are controlled via props + callbacks:
  - `export function BlockTree({ root, selected, typeSchema, onRootChange, onSelect }: { root: Block; selected: number[]; typeSchema: SectionTypeSchema; onRootChange: (next: Block) => void; onSelect: (path: number[]) => void }): JSX.Element` — the recursive `renderRow` (LayoutEditor ~141–307): row header, field binding select, static text input, up/down/remove, the `keyValue` sub-panel, recursive `stack`/`columns` rendering.
  - `export function BlockStylePanel({ root, selected, typeSchema, onRootChange }: { root: Block; selected: number[]; typeSchema: SectionTypeSchema; onRootChange: (next: Block) => void }): JSX.Element | null` — the style panel (LayoutEditor ~370–690): typography, color/background swatches, gap, columns count, container background fieldset. Returns `null` when nothing is selected.
- The module-scoped pure helpers (`setStyleProp`, `patchBackground`, `blankBlock`, and tree ops like `insertChild`/`updateAt`/`removeAt` — wherever they live) move to a shared module if used by both children, e.g. `apps/web/src/ui/admin/layout/blockOps.ts`, OR stay in the shell and are passed down. **Decision: extract the pure block/tree helpers into `apps/web/src/ui/admin/layout/blockOps.ts` and import from both children + the shell** (avoids duplication; DRY).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-26-layout-split.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Block, SectionTypeSchema } from "@proposal/shared";
import { BlockTree } from "../ui/admin/layout/BlockTree";

afterEach(cleanup);

const typeSchema: SectionTypeSchema = {
  type: "text",
  label: "Text",
  category: "text",
  variants: [],
  schemaVersion: 1,
  fields: [{ key: "heading", type: "text" }],
};
const root: Block = { kind: "stack", children: [] } as unknown as Block; // match the real Block shape

describe("LayoutEditor split", () => {
  it("BlockTree renders a root and reports selection via onSelect", () => {
    const onSelect = vi.fn();
    render(
      <BlockTree root={root} selected={[]} typeSchema={typeSchema} onRootChange={vi.fn()} onSelect={onSelect} />,
    );
    // The empty stack root renders without throwing; the add/palette lives in
    // the shell, so just assert the tree container mounts.
    expect(screen.getByTestId?.("block-tree") ?? document.body).toBeTruthy();
  });
});
```
(Use the REAL `Block` constructor/shape from `@proposal/shared` — replace the cast with a valid empty root, e.g. the same shape `blankBlock("stack")` produces. If BlockTree has no test id, assert on a stable element it renders.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-26-layout-split.test.tsx` — FAIL (module missing).

- [ ] **Step 3: Extract `blockOps.ts`, then `BlockTree`, then `BlockStylePanel`**

Move the pure helpers to `blockOps.ts` (no React). Create `BlockTree.tsx` (`"use client";`) with the recursive renderer, controlled via props/callbacks (replace direct `setRoot`/`setSelected` calls with `onRootChange`/`onSelect`). Create `BlockStylePanel.tsx` (`"use client";`) with the style panel, controlled via `onRootChange`. Keep all classNames/labels/aria identical.

- [ ] **Step 4: Recompose the `LayoutEditor` shell**

`LayoutEditor` keeps `name`/`variant`/`root`/`selected`/`busy` state, the derived `layout`/`result`/`canSave`/`selectedBlock`/`selStyle`, the metadata fields, the Add-Block palette, the live `<LayoutRenderer>` preview, validation warnings, and Save/Cancel. It renders `<BlockTree root={root} selected={selected} typeSchema={…} onRootChange={setRoot} onSelect={setSelected} />` and `<BlockStylePanel root={root} selected={selected} typeSchema={…} onRootChange={setRoot} />`. The `notify` subscription stays in the shell.

- [ ] **Step 5: Verify**

Run new test + the FULL LayoutEditor safety-net:
`npx vitest run apps/web/src/__tests__/slice-24-layout-editor.test.tsx apps/web/src/__tests__/slice-25-style-inspector.test.tsx apps/web/src/__tests__/slice-25-keyvalue.test.tsx apps/web/src/__tests__/slice-25-columns-authoring.test.tsx apps/web/src/__tests__/slice-25-background-group.test.tsx apps/web/src/__tests__/slice-26-layout-split.test.tsx`
Then `npm test`, typecheck 0, lint 0, format clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(layout-editor): split into BlockTree + BlockStylePanel + shell (+blockOps)"
```

---

## Self-Review

**1. Audit coverage:** Closes H-8 (Inspector over-subscription — Tasks 1–5, with the Task-5 guard test asserting the broad subscriptions are gone) and the "split the two god components" item (Inspector Tasks 1–5; LayoutEditor Task 6). M-9 and M-3 are explicitly deferred with rationale (Global Constraints / out-of-scope) — NOT built ahead.

**2. Placeholder scan:** New code (selector hooks, component signatures, `useShallow` bundles, the H-8 guard regexes) is concrete. Moved JSX is identified by exact source line range + target file rather than re-pasted — appropriate for a behaviour-preserving extraction where the existing test suites pin the output. Every task names the specific safety-net tests to run.

**3. Type/consistency:** `useSelectedSection` (Task 3) returns `{ section, index }` consumed by `SectionPane` and passed as props to `FieldArea` (Task 4). `BlockTree`/`BlockStylePanel` (Task 6) are controlled via `root`/`selected`/`onRootChange`/`onSelect` with the shell as the single state owner. `LayoutEditor`'s public props are unchanged. No new dependencies (`useShallow` is part of installed `zustand`).

**Risk notes:** (a) Label/aria queries in the new tests MUST match the real strings in the current components — the implementer adjusts them while extracting (the safety-net suites are the real guard). (b) The H-8 win depends on the section reducers preserving sibling section object references on edit; if `setSectionData` rebuilds the whole array with new refs for unchanged sections, `useSelectedSection` still re-renders only when the selected section changes (it selects by id and compares the result), so the win holds regardless — but note it. (c) Task 3/4 boundary: the field loop stays inline in SectionPane at the end of Task 3, then moves to FieldArea in Task 4 (stated explicitly to avoid a dangling reference).

## Execution Handoff

This plan implements audit **Phase 3a** (editor refactor: selector perf + god-component splits). Behaviour-preserving; the existing Inspector/LayoutEditor suites are the safety net. Two execution options:
1. **Subagent-Driven (recommended)** — fresh implementer + reviewer per task, on a branch `feat/audit-phase3a-editor-refactor`.
2. **Inline Execution** — here with checkpoints.

**Deferred to later slices (noted, not built here):** M-9 (RSC print — PDF-readiness-contract sensitive), M-3 (parallelize generation — server-only, no UI caller). Phase **3b** carries the UX features (undo/redo via `zundo`, up/down section reordering, native-dialog→modal replacement, per-field AI busy state, Outline keyboard nav).

Which approach?
