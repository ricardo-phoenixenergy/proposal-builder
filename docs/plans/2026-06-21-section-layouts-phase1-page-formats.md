# Section Layout Authoring — Phase 1: Page formats & modes (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a proposal choose a page **format** (A4 portrait/landscape, Letter, 16:9, 4:3) and a **mode** (Report flow / Slides one-section-per-page), driving on-screen rendering and the PDF page size — the foundation for the page-aware layout editor.

**Architecture:** A `PAGE_FORMATS` registry in `packages/shared` (generalising the existing fixed `PAGE`); additive `document.pageFormat` + `document.pageMode`; a format-aware `DocumentRenderer` (used by both editor and `/print`); the `/print` route injects an `@page { size }` rule (Chromium already runs `preferCSSPageSize: true` + `printBackground: true`, so no PDF-pipeline change); and Document-settings controls in the editor Inspector.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Ajv, Vitest. Monorepo `packages/shared` + `apps/web`.

This is **Phase 1 of 5** from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§J). It ships working software on its own (documents render and export at the chosen format/mode). Phases 2–5 (image field, layout model+interpreter, storage+API, authoring UI) follow in their own plans.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- **This IS a git repo** (the env banner wrongly says otherwise); work on `main`. Commit per task. (After Windows `.next` build flakiness — `EINVAL readlink … app-path-routes-manifest.json` — `rm -rf apps/web/.next` and rebuild; it's an OneDrive artifact, not a code error.)
- **`npm test` (vitest) ignores TypeScript types** — always run `npm run typecheck` after editing any test file. Use a non-null assertion `!` on `getAllBy…[i]` indexing.
- **Additive + optional:** `document.pageFormat`/`pageMode` are optional; documents without them render as **A4 portrait, Report** (today's behaviour) and keep validating. Do **not** change the existing `PAGE` constant's shape (a test asserts it verbatim).
- **Page formats (v1, exact dims, mm):** `a4_portrait` 210×297; `a4_landscape` 297×210; `letter_portrait` 215.9×279.4; `widescreen_16_9` 338.67×190.5; `standard_4_3` 254×190.5. Margins: 18mm for paged formats, 0 for slides.
- **No PDF-pipeline change:** `renderProposalPdf` already sets `printBackground: true` + `preferCSSPageSize: true`. Do not touch `anthropic.ts` or the puppeteer launcher.
- TypeScript strict; extensionless imports (no `.js`). Three-layer invariant intact.

---

### Task 1: Page-format registry (`packages/shared`)

**Files:**
- Modify: `packages/shared/src/render/page.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/slice-20-page-formats.test.ts`

**Interfaces:**
- Produces: `interface PageFormat { id; label; widthMm; heightMm; marginMm }`; `PAGE_FORMATS: PageFormat[]`; `DEFAULT_PAGE_FORMAT: string`; `getPageFormat(id?: string): PageFormat`; `pageCss(fmt: PageFormat): string`. Keeps existing `PAGE`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-20-page-formats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PAGE, PAGE_FORMATS, DEFAULT_PAGE_FORMAT, getPageFormat, pageCss } from "../render/page";

describe("page formats", () => {
  it("keeps the legacy PAGE (A4 portrait) intact", () => {
    expect(PAGE).toEqual({ size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 });
  });

  it("lists the five v1 formats with the right dimensions", () => {
    expect(PAGE_FORMATS.map((f) => f.id)).toEqual([
      "a4_portrait", "a4_landscape", "letter_portrait", "widescreen_16_9", "standard_4_3",
    ]);
    expect(getPageFormat("widescreen_16_9")).toMatchObject({ widthMm: 338.67, heightMm: 190.5, marginMm: 0 });
    expect(getPageFormat("a4_landscape")).toMatchObject({ widthMm: 297, heightMm: 210 });
  });

  it("getPageFormat falls back to A4 portrait for unknown/undefined", () => {
    expect(getPageFormat(undefined).id).toBe("a4_portrait");
    expect(getPageFormat("nope").id).toBe("a4_portrait");
    expect(DEFAULT_PAGE_FORMAT).toBe("a4_portrait");
  });

  it("pageCss emits an @page size + margin rule", () => {
    expect(pageCss(getPageFormat("a4_landscape"))).toBe("@page { size: 297mm 210mm; margin: 18mm; }");
    expect(pageCss(getPageFormat("widescreen_16_9"))).toBe("@page { size: 338.67mm 190.5mm; margin: 0mm; }");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-20-page-formats.test.ts`
Expected: FAIL — `PAGE_FORMATS`/`getPageFormat`/`pageCss`/`DEFAULT_PAGE_FORMAT` not exported.

- [ ] **Step 3: Implement the registry**

Replace `packages/shared/src/render/page.ts` with:

```ts
/** Fixed page geometry for the paged document model (§10.3). A4 portrait, mm. */
export const PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 } as const;

/** A selectable page format (§J): physical size + print margin, in millimetres. */
export interface PageFormat {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  marginMm: number;
}

/** The v1 formats. Slides use a 0 margin (the layout owns the bleed). */
export const PAGE_FORMATS: PageFormat[] = [
  { id: "a4_portrait", label: "A4 portrait", widthMm: 210, heightMm: 297, marginMm: 18 },
  { id: "a4_landscape", label: "A4 landscape", widthMm: 297, heightMm: 210, marginMm: 18 },
  { id: "letter_portrait", label: "Letter", widthMm: 215.9, heightMm: 279.4, marginMm: 18 },
  { id: "widescreen_16_9", label: "16:9 slide", widthMm: 338.67, heightMm: 190.5, marginMm: 0 },
  { id: "standard_4_3", label: "4:3 slide", widthMm: 254, heightMm: 190.5, marginMm: 0 },
];

export const DEFAULT_PAGE_FORMAT = "a4_portrait";

/** Resolve a format id; unknown/undefined → the default (A4 portrait). */
export function getPageFormat(id: string | undefined): PageFormat {
  return PAGE_FORMATS.find((f) => f.id === id) ?? PAGE_FORMATS[0]!;
}

/** The print `@page` rule for a format. `preferCSSPageSize` makes Chromium honour it. */
export function pageCss(fmt: PageFormat): string {
  return `@page { size: ${fmt.widthMm}mm ${fmt.heightMm}mm; margin: ${fmt.marginMm}mm; }`;
}
```

- [ ] **Step 4: Export from the shared index**

In `packages/shared/src/index.ts`, replace the line `export { PAGE } from "./render/page";` with:

```ts
export {
  PAGE,
  PAGE_FORMATS,
  DEFAULT_PAGE_FORMAT,
  getPageFormat,
  pageCss,
  type PageFormat,
} from "./render/page";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-20-page-formats.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Verify the existing paged test still passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-19-paged.test.ts`
Expected: PASS (the `PAGE` constant is unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/render/page.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-20-page-formats.test.ts
git commit -m "feat(paged): PAGE_FORMATS registry + getPageFormat/pageCss (A4/Letter/16:9/4:3)"
```

---

### Task 2: `document.pageFormat` + `pageMode` (type + schema)

**Files:**
- Modify: `packages/shared/src/types/document.ts`
- Modify: `packages/shared/src/schema/document.schema.ts`
- Test: `packages/shared/src/__tests__/slice-20-document-page.test.ts`

**Interfaces:**
- Produces: `ProposalDocument.pageFormat?: string`, `ProposalDocument.pageMode?: "report" | "slides"`; both optional; `validateDocument` accepts/validates them.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-20-document-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDocument } from "../validation/validateDocument";
import { sampleProposal } from "../samples/sample-proposal";

describe("document page settings", () => {
  it("accepts pageFormat + pageMode", () => {
    expect(validateDocument({ ...sampleProposal, pageFormat: "widescreen_16_9", pageMode: "slides" }).valid).toBe(true);
  });

  it("still accepts a document without them", () => {
    expect(validateDocument(sampleProposal).valid).toBe(true);
  });

  it("rejects an invalid pageMode", () => {
    const result = validateDocument({ ...sampleProposal, pageMode: "deck" as unknown as "report" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith("/pageMode"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-20-document-page.test.ts`
Expected: FAIL — `additionalProperties` rejects `pageFormat`/`pageMode` (the envelope is `additionalProperties: false`).

- [ ] **Step 3: Add the type fields**

In `packages/shared/src/types/document.ts`, add inside `ProposalDocument` (after the `brief?: string;` line):

```ts
  /** Page format id (§J); absent → A4 portrait. */
  pageFormat?: string;
  /** Render mode (§J): flowing "report" (default) or one-section-per-page "slides". */
  pageMode?: "report" | "slides";
```

- [ ] **Step 4: Allow them in the envelope schema**

In `packages/shared/src/schema/document.schema.ts`, add to `properties` (after the `brief: { type: "string" },` line):

```ts
    pageFormat: { type: "string" },
    pageMode: { enum: ["report", "slides"] },
```

(They are NOT added to `required`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-20-document-page.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the envelope regression**

Run: `npx vitest run packages/shared/src/__tests__/slice-01-schema.test.ts packages/shared/src/__tests__/slice-17-document-theme.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types/document.ts packages/shared/src/schema/document.schema.ts packages/shared/src/__tests__/slice-20-document-page.test.ts
git commit -m "feat(paged): optional document.pageFormat + pageMode (additive, validated)"
```

---

### Task 3: Store actions `setPageFormat` / `setPageMode`

**Files:**
- Modify: `apps/web/src/state/proposalStore.ts`
- Test: `apps/web/src/__tests__/slice-20-store-page.test.ts`

**Interfaces:**
- Consumes: `ProposalDocument.pageFormat`/`pageMode`.
- Produces: store actions `setPageFormat(id: string): void`, `setPageMode(mode: "report" | "slides"): void` (write the document).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-20-store-page.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: { id: "p1", title: "T", client: { name: "C" }, themeId: "theme_phoenix_default", templateId: "open", sections: [] },
  });
});

describe("store page settings", () => {
  it("setPageFormat writes document.pageFormat", () => {
    useProposalStore.getState().setPageFormat("widescreen_16_9");
    expect(useProposalStore.getState().document.pageFormat).toBe("widescreen_16_9");
  });

  it("setPageMode writes document.pageMode", () => {
    useProposalStore.getState().setPageMode("slides");
    expect(useProposalStore.getState().document.pageMode).toBe("slides");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-20-store-page.test.ts`
Expected: FAIL — `setPageFormat`/`setPageMode` not on the store.

- [ ] **Step 3: Add the actions**

In `apps/web/src/state/proposalStore.ts`:

Add to the `ProposalState` interface (after the `setPageBreakBefore` line):

```ts
  /** Set the document page format (§J). */
  setPageFormat: (id: string) => void;
  /** Set the document render mode (§J). */
  setPageMode: (mode: "report" | "slides") => void;
```

Add the implementations (after the `setPageBreakBefore:` action):

```ts
  setPageFormat: (id) => set((state) => ({ document: { ...state.document, pageFormat: id } })),
  setPageMode: (mode) => set((state) => ({ document: { ...state.document, pageMode: mode } })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-20-store-page.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/proposalStore.ts apps/web/src/__tests__/slice-20-store-page.test.ts
git commit -m "feat(paged): store setPageFormat/setPageMode actions"
```

---

### Task 4: Format-aware `DocumentRenderer` + slides mode + paged CSS

**Files:**
- Modify: `apps/web/src/render/DocumentRenderer.tsx`
- Modify: `apps/web/src/render/paged.css`
- Test: `apps/web/src/__tests__/slice-20-renderer-formats.test.tsx`

**Interfaces:**
- Consumes: `getPageFormat`, `document.pageFormat`/`pageMode`.
- Produces: `.paged-document` sized to the format width; `data-page-mode` attr; in slides mode one `.paged-slide` per section at the format height; report mode keeps `.paged-section` + `data-page-break-before`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-20-renderer-formats.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

afterEach(() => cleanup());

const base: ProposalDocument = {
  id: "p1", title: "T", client: { name: "C" }, themeId: "theme_phoenix_default", templateId: "open",
  sections: [
    { id: "a", type: "text", data: { heading: "A", body: "Body A" } },
    { id: "b", type: "text", data: { heading: "B", body: "Body B" } },
  ],
};

describe("DocumentRenderer page formats", () => {
  it("report mode (default): A4 width, sections flow", () => {
    const { container } = render(<DocumentRenderer document={base} theme={defaultTheme} />);
    const doc = container.querySelector(".paged-document") as HTMLElement;
    expect(doc.getAttribute("data-page-mode")).toBe("report");
    expect(doc.style.width).toBe("210mm");
    expect(container.querySelectorAll(".paged-slide").length).toBe(0);
    expect(container.querySelectorAll(".paged-section").length).toBe(2);
  });

  it("slides mode at 16:9: one slide per section, format width + height", () => {
    const doc: ProposalDocument = { ...base, pageFormat: "widescreen_16_9", pageMode: "slides" };
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    const root = container.querySelector(".paged-document") as HTMLElement;
    expect(root.getAttribute("data-page-mode")).toBe("slides");
    expect(root.style.width).toBe("338.67mm");
    const slides = container.querySelectorAll(".paged-slide");
    expect(slides.length).toBe(2);
    expect((slides[0] as HTMLElement).style.height).toBe("190.5mm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-20-renderer-formats.test.tsx`
Expected: FAIL — renderer doesn't set width/`data-page-mode`/`.paged-slide`.

- [ ] **Step 3: Rewrite the DocumentRenderer**

Replace `apps/web/src/render/DocumentRenderer.tsx` with:

```tsx
import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { getPageFormat } from "@proposal/shared";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SectionRenderer } from "./SectionRenderer";
import "./paged.css";

/**
 * Renders a proposal at its chosen page format (§J). Report mode flows sections
 * (break-safe, honouring manual page breaks); Slides mode renders one section per
 * page at the format's exact dimensions. The same paged CSS + format size drive
 * the editor preview and the PDF.
 */
export function DocumentRenderer({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  const fmt = getPageFormat(document.pageFormat);
  const slides = document.pageMode === "slides";
  return (
    <ThemeProvider theme={theme}>
      <article
        data-document={document.id}
        data-page-mode={slides ? "slides" : "report"}
        className="paged-document"
        style={{
          width: `${fmt.widthMm}mm`,
          color: "var(--c-text)",
          fontFamily: "var(--f-body)",
          padding: slides ? 0 : "calc(56px * var(--space))",
          display: "flex",
          flexDirection: "column",
          gap: slides ? 0 : "calc(32px * var(--space))",
        }}
      >
        {document.sections.map((section) =>
          slides ? (
            <div key={section.id} className="paged-slide" style={{ height: `${fmt.heightMm}mm` }}>
              <SectionRenderer section={section} theme={theme} />
            </div>
          ) : (
            <div
              key={section.id}
              className="paged-section"
              data-page-break-before={section.pageBreakBefore ? "true" : undefined}
            >
              <SectionRenderer section={section} theme={theme} />
            </div>
          ),
        )}
      </article>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Update the paged CSS**

Replace `apps/web/src/render/paged.css` with (the page **size** now comes from the format via the print route's injected `@page`, §Task 5; this file no longer hard-codes A4):

```css
/* Paged document model (§10.3, §J). The page SIZE is set per-format by the
   /print route's injected @page rule; this file carries break rules + screen
   chrome. Chromium paginates the PDF via @page + these rules (printBackground on). */
.paged-document {
  margin: 0 auto;
  box-sizing: border-box;
}

/* Report mode: sections flow, stay break-safe, honour manual breaks. */
.paged-section {
  break-inside: avoid;
}
.paged-section[data-page-break-before="true"] {
  break-before: page;
}

/* Slides mode: one section per page. */
.paged-slide {
  break-after: page;
  overflow: hidden;
  box-sizing: border-box;
}
.paged-slide:last-child {
  break-after: auto;
}

/* On screen only: show each sheet/slide as a discrete card. */
@media screen {
  .paged-document {
    background: var(--c-surface);
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  }
  .paged-document[data-page-mode="slides"] {
    background: transparent;
    box-shadow: none;
    gap: 16px;
  }
  .paged-document[data-page-mode="slides"] .paged-slide {
    background: var(--c-surface);
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-20-renderer-formats.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the existing renderer test still passes**

Run: `npx vitest run apps/web/src/__tests__/slice-19-renderer.test.tsx`
Expected: PASS (report-mode default still yields `.paged-document` + one `[data-page-break-before="true"]`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/render/DocumentRenderer.tsx apps/web/src/render/paged.css apps/web/src/__tests__/slice-20-renderer-formats.test.tsx
git commit -m "feat(paged): format-aware DocumentRenderer + slides one-per-page"
```

---

### Task 5: `/print` injects the format `@page` size

**Files:**
- Modify: `apps/web/app/print/[id]/page.tsx`

**Interfaces:**
- Consumes: `getPageFormat`, `pageCss`, `document.pageFormat`.

> No new unit test: `pageCss` is already covered (Task 1), and this is server-component wiring that can't be hermetically unit-tested here. Verified by typecheck + build, with the PDF page size confirmed manually after deploy. (`renderProposalPdf` already runs `preferCSSPageSize: true` + `printBackground: true`, so the injected `@page` governs the PDF page size.)

- [ ] **Step 1: Add the format style to the print page**

In `apps/web/app/print/[id]/page.tsx`:

Add to the shared import:

```ts
import { getPageFormat, pageCss } from "@proposal/shared";
```

Replace the final `return <PrintDocument document={stored.document} theme={theme} />;` with:

```tsx
  return (
    <>
      <style>{pageCss(getPageFormat(stored.document.pageFormat))}</style>
      <PrintDocument document={stored.document} theme={theme} />
    </>
  );
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build (confirm the print route compiles)**

Run: `npm run build -w @proposal/web`
Expected: clean build; `/print/[id]` compiles. (If the build throws `EINVAL readlink … .next`, run `rm -rf apps/web/.next` and rebuild.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/print/[id]/page.tsx"
git commit -m "feat(paged): /print emits the document format's @page size"
```

---

### Task 6: Document-settings controls in the Inspector

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-20-inspector-page.test.tsx`

**Interfaces:**
- Consumes: store `setPageFormat`/`setPageMode`; `PAGE_FORMATS`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-20-inspector-page.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: { id: "p1", title: "T", client: { name: "C" }, themeId: "theme_phoenix_default", templateId: "open", sections: [], brief: "" },
    theme: defaultTheme,
    selectedId: null,
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector document page settings", () => {
  it("changes page format and mode on the document", () => {
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText("Page format"), { target: { value: "widescreen_16_9" } });
    expect(useProposalStore.getState().document.pageFormat).toBe("widescreen_16_9");
    fireEvent.change(screen.getByLabelText("Page mode"), { target: { value: "slides" } });
    expect(useProposalStore.getState().document.pageMode).toBe("slides");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-20-inspector-page.test.tsx`
Expected: FAIL — no "Page format" / "Page mode" controls.

- [ ] **Step 3: Add the imports + selectors**

In `apps/web/src/ui/Inspector.tsx`:

Add `PAGE_FORMATS` to the `@proposal/shared` import (alongside the existing named imports):

```ts
  PAGE_FORMATS,
```

Add the store selectors (next to the other `useProposalStore` selectors near the top of the component, e.g. after the `setPageBreakBefore` selector):

```ts
  const setPageFormat = useProposalStore((s) => s.setPageFormat);
  const setPageMode = useProposalStore((s) => s.setPageMode);
```

- [ ] **Step 4: Add the controls to the Document disclosure**

In `apps/web/src/ui/Inspector.tsx`, find the Template `<div className="field">` inside the Document disclosure (the one whose `<select aria-label="Template" …>` calls `applyTemplateAction`). Immediately **after** that closing `</div>` (still inside `docOpen`), add:

```tsx
            <div className="field">
              <span className="field__label">Page format</span>
              <select aria-label="Page format" value={document.pageFormat ?? "a4_portrait"} onChange={(e) => setPageFormat(e.target.value)}>
                {PAGE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="field__label">Mode</span>
              <select aria-label="Page mode" value={document.pageMode ?? "report"} onChange={(e) => setPageMode(e.target.value as "report" | "slides")}>
                <option value="report">Report (flowing pages)</option>
                <option value="slides">Slides (one section per page)</option>
              </select>
            </div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-20-inspector-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-20-inspector-page.test.tsx
git commit -m "feat(paged): page format + mode controls in the Document disclosure"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (existing + new slice-20).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 4: Commit (only if incidental fixes were needed)**

```bash
git add -A
git commit -m "test: phase-1 page formats green (suite + typecheck + build)"
```

---

## Self-Review

**1. Spec coverage (§J, Phase 1):**
- `PAGE_FORMATS` + `getPageFormat` + `pageCss` + `DEFAULT_PAGE_FORMAT`, `PAGE` kept → Task 1. ✅
- `document.pageFormat`/`pageMode` additive + validated → Task 2. ✅
- Format-aware rendering; slides one-per-page; report flow retained → Task 4. ✅
- PDF page size from format (injected `@page`; `printBackground`/`preferCSSPageSize` already on) → Task 5. ✅
- Editor Document control (format + mode) → Task 6 (store: Task 3). ✅
- Backward-compatible default (A4 report) → guaranteed by `getPageFormat` fallback + optional fields (Tasks 1,2,4). ✅
- Out of Phase 1 (correctly deferred): layout model/interpreter, image field, storage/API, authoring UI — later phases.

**2. Placeholder scan:** No TBD/TODO; every code step is complete. Task 5 has a stated, justified no-unit-test exception (server-component wiring over an already-tested helper) — not a placeholder.

**3. Type consistency:** `PageFormat` fields (`id/label/widthMm/heightMm/marginMm`) consistent across Tasks 1/4/5/6. `getPageFormat(id?)` and `pageCss(fmt)` signatures match their call sites. `document.pageFormat?: string` / `pageMode?: "report"|"slides"` consistent across Tasks 2/3/4/6. Store actions `setPageFormat(id)`/`setPageMode(mode)` match Task 6 usage. `PAGE` shape unchanged (Task 1) so `slice-19-paged` stays green.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase1-page-formats.md`. This is Phase 1 of 5; Phases 2–5 get their own plans after this ships.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
