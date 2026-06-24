# Section Layout Authoring — Phase 2: the `image` content FieldType (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `image` content FieldType end-to-end so a proposal section can carry a per-proposal image URL (e.g. a cover image), uploaded manually via the existing `/api/assets` route — never AI-composed.

**Architecture:** `image` is a string-valued (URL) content field. In `packages/shared` it joins the `FieldType` union and every field-dispatch site (JSON Schema property, empty-data scaffold, generation classification, section-type-definition validator). In `apps/web` the Builder section-type editor offers `image` (with no limit inputs), and the editor's schema-driven field area renders a manual upload control (file → `/api/assets` → store the returned URL in `data[field]`). This is the only content-schema change in the whole Section-Layout feature; layouts/backgrounds that *consume* image fields come in Phase 3.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Ajv, Vitest. Monorepo `packages/shared` + `apps/web`. Uploads reuse Vercel Blob via `POST /api/assets`.

This is **Phase 2 of 5** from `docs/specs/2026-06-21-section-layout-authoring-design.md` (§I, the field-type parts). Phase 1 (page formats) is merged. It ships on its own (admins can define image fields; users can upload images into them). Phase 3 (the declarative layout model + `LayoutRenderer`, which *renders* backgrounds from these image fields and adds `print-color-adjust: exact`) follows in its own plan.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- **This IS a git repo** (the env banner wrongly says otherwise); work on a feature branch off `main`. Commit per task. (After Windows `.next` build flakiness — `EINVAL readlink … app-path-routes-manifest.json` — `rm -rf apps/web/.next` and rebuild; it's a OneDrive artifact, not a code error.)
- **`npm test` (vitest) ignores TypeScript types** — always run `npm run typecheck` after editing any test file or any `.tsx`. Use a non-null assertion `!` on `getAllBy…[i]` indexing.
- **Exhaustive-switch trap:** `fieldToProperty` (`schema/section.schema.ts`) and `fieldToGenerationSchema` (`generation/generationSchema.ts`) are `switch (field.type)` statements with **no `default`** and a non-nullable return type. Adding `"image"` to `FieldType` makes them non-exhaustive → `tsc` strict error (TS2366). Therefore the `FieldType` change and BOTH switch updates must land in the **same task** (Task 1) so typecheck stays green.
- **`image` is "manual":** `fieldKind(image) = "manual"`, `fieldToGenerationSchema(image) = null` — never AI-generated. JSON Schema property is `{ type: "string" }` (a URL). Empty value is `""`. It carries **no limit inputs**.
- **Additive + backward-compatible:** no existing section type, proposal, or test changes behaviour. `image` is simply a new option.
- **No PDF-pipeline change in this phase.** `printBackground: true` is already set (Phase 1). `print-color-adjust: exact` belongs with Phase 3 (background rendering); do **not** add it here, and do not touch `renderProposalPdf`/puppeteer/`anthropic.ts`.
- TypeScript strict; extensionless imports (no `.js`). Three-layer invariant intact (image is content; the AI does not author it).

---

### Task 1: Shared `image` FieldType (type + schema + empty-data + generation + validator)

**Files:**
- Modify: `packages/shared/src/types/section.ts`
- Modify: `packages/shared/src/schema/section.schema.ts`
- Modify: `packages/shared/src/generation/generationSchema.ts`
- Modify: `packages/shared/src/template/emptyData.ts`
- Modify: `packages/shared/src/validation/validateSectionTypeDefinition.ts`
- Test: `packages/shared/src/__tests__/slice-21-image-field.test.ts`

**Interfaces:**
- Produces: `FieldType` includes `"image"`; `fieldKind({type:"image"}) === "manual"`; `fieldToGenerationSchema(image) === null` (so a type with an image field has `buildGenerationDataSchema(...) === null`); `buildSectionSchema` emits `{ type: "string" }` for an image field; `emptyDataForType` yields `""` for an image field; `validateSectionTypeDefinition` accepts a definition whose field is `type: "image"`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-21-image-field.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { fieldKind, buildGenerationDataSchema } from "../generation/generationSchema";
import { buildSectionSchema } from "../schema/section.schema";
import { emptyDataForType } from "../template/emptyData";
import { validateSectionTypeDefinition } from "../validation/validateSectionTypeDefinition";
import { setActiveSectionTypes, resetSectionTypesForTests } from "../registry/sectionTypes";
import type { SectionTypeSchema } from "../types/section";

const coverType: SectionTypeSchema = {
  type: "cover_test",
  label: "Cover (test)",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title", required: true, maxChars: 60 },
    { key: "coverImage", type: "image", label: "Cover image" },
  ],
  variants: [],
  schemaVersion: 1,
};

afterEach(() => resetSectionTypesForTests());

describe("image field type", () => {
  it("classifies image as a manual (non-AI) field", () => {
    expect(fieldKind({ key: "coverImage", type: "image" })).toBe("manual");
  });

  it("derives a string JSON Schema property for an image field", () => {
    const schema = buildSectionSchema([coverType]) as {
      allOf: { then: { properties: { data: { properties: Record<string, unknown> } } } }[];
    };
    const dataProps = schema.allOf[0]!.then.properties.data.properties;
    expect(dataProps.coverImage).toEqual({ type: "string" });
  });

  it("excludes a type with an image field from AI data generation", () => {
    expect(buildGenerationDataSchema(coverType)).toBeNull();
  });

  it("scaffolds an empty image field as an empty string", () => {
    setActiveSectionTypes([coverType]);
    expect(emptyDataForType("cover_test").coverImage).toBe("");
  });

  it("accepts a section-type definition with an image field", () => {
    const result = validateSectionTypeDefinition({
      type: "cover_test",
      label: "Cover",
      category: "text",
      fields: [{ key: "coverImage", type: "image", label: "Cover image" }],
    });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-21-image-field.test.ts`
Expected: FAIL — `image` is not assignable to `FieldType` (the `coverType` literal won't even type-check at runtime the test still runs, but the assertions fail: `fieldKind` returns `"manual"` via `default` so that one may pass; `buildSectionSchema` returns `undefined` for the image property; `validateSectionTypeDefinition` rejects `image`; `emptyDataForType` leaves `coverImage` undefined).

- [ ] **Step 3: Add `"image"` to the `FieldType` union**

In `packages/shared/src/types/section.ts`, change line 10:

```ts
export type FieldType = "text" | "paragraph" | "dataset" | "matrix" | "list" | "image";
```

- [ ] **Step 4: Map `image` to a string JSON Schema property**

In `packages/shared/src/schema/section.schema.ts`, inside `fieldToProperty`'s `switch`, add an `image` case (after the `list` case, before `dataset`):

```ts
    case "image":
      // A per-proposal image is stored as its uploaded URL (a string).
      return { type: "string" };
```

- [ ] **Step 5: Make `image` a manual, non-generated field**

In `packages/shared/src/generation/generationSchema.ts`:

In `fieldToGenerationSchema`'s `switch`, add (after `list`, before `dataset`):

```ts
    case "image":
      return null; // user-uploaded, never AI-generated
```

In `fieldKind`'s `switch`, add an explicit case before `default` (keeps it exhaustive + self-documenting):

```ts
    case "image":
      return "manual";
```

- [ ] **Step 6: Scaffold empty image data as `""`**

In `packages/shared/src/template/emptyData.ts`, inside the `switch`, add (after the `list` case):

```ts
      case "image":
        data[field.key] = "";
        break;
```

- [ ] **Step 7: Allow `image` in the section-type-definition validator**

In `packages/shared/src/validation/validateSectionTypeDefinition.ts`:

Change line 4:

```ts
const ALLOWED_FIELD_TYPES = ["text", "paragraph", "list", "dataset", "matrix", "image"] as const;
```

Update the error message (the `push(\`/fields/${i}/type\`, …)` call) to list `image`:

```ts
        push(`/fields/${i}/type`, "field type must be one of text, paragraph, list, dataset, matrix, image");
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-21-image-field.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Verify shared regressions (schema + generation + validator)**

Run: `npx vitest run packages/shared/src/__tests__/slice-01-schema.test.ts packages/shared/src/__tests__/slice-18-field-schemas.test.ts packages/shared/src/validation/validateSectionTypeDefinition.test.ts packages/shared/src/__tests__/slice-06-generation.test.ts`
Expected: PASS (no behavioural change to existing types).

- [ ] **Step 10: Typecheck (exhaustiveness)**

Run: `npm run typecheck`
Expected: 0 errors (confirms both no-default switches now handle `image`).

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/types/section.ts packages/shared/src/schema/section.schema.ts packages/shared/src/generation/generationSchema.ts packages/shared/src/template/emptyData.ts packages/shared/src/validation/validateSectionTypeDefinition.ts packages/shared/src/__tests__/slice-21-image-field.test.ts
git commit -m "feat(image): add image content FieldType (string URL, manual, validated)"
```

---

### Task 2: Builder section-type editor offers `image` (no limit inputs)

**Files:**
- Modify: `apps/web/src/ui/admin/SectionTypeEditor.tsx`
- Test: `apps/web/src/__tests__/slice-21-sectiontype-image.test.tsx`

**Interfaces:**
- Consumes: the shared `image` FieldType (Task 1).
- Produces: an `image` option in the field-type `<select>`; selecting it shows **no** limit inputs; saving yields a field `{ type: "image" }` and a `text`-category type.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-21-sectiontype-image.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionTypeEditor } from "../ui/admin/SectionTypeEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SectionTypeEditor — image field", () => {
  it("offers image and saves an image field with no limit inputs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SectionTypeEditor onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/type key/i), { target: { value: "cover" } });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Cover" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field key/i), { target: { value: "cover_image" } });
    fireEvent.change(screen.getByLabelText(/field label/i), { target: { value: "Cover image" } });
    fireEvent.change(screen.getByLabelText(/field type/i), { target: { value: "image" } });

    // image carries no limit inputs (no "max …" number fields)
    expect(screen.queryByLabelText(/^field max/i)).toBeNull();

    const save = screen.getByRole("button", { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-types", expect.objectContaining({ method: "POST" })));
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(call[1].body as string) as { category: string; fields: { type: string }[] };
    expect(sent.category).toBe("text");
    expect(sent.fields[0]!.type).toBe("image");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-21-sectiontype-image.test.tsx`
Expected: FAIL — the `<select>` has no `image` option, so `fireEvent.change(... "image")` doesn't set it and the saved field type isn't `"image"`.

- [ ] **Step 3: Add `image` to the editor's field-type model**

In `apps/web/src/ui/admin/SectionTypeEditor.tsx`:

Change the `DraftFieldType` alias (line 8):

```ts
type DraftFieldType = "text" | "paragraph" | "list" | "dataset" | "matrix" | "image";
```

Change the `FIELD_TYPES` list (line 23):

```ts
const FIELD_TYPES: DraftFieldType[] = ["text", "paragraph", "list", "dataset", "matrix", "image"];
```

In `limitsFor`'s `switch` (no `default` — must stay exhaustive), add before the closing brace:

```ts
    case "image":
      return [];
```

(`deriveCategory` is unchanged: an image field is neither dataset nor matrix, so the type stays `text`-category.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-21-sectiontype-image.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the editor regression**

Run: `npx vitest run apps/web/src/__tests__/slice-11-sectiontype-editor.test.tsx`
Expected: PASS (3 tests; existing field types unaffected).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/admin/SectionTypeEditor.tsx apps/web/src/__tests__/slice-21-sectiontype-image.test.tsx
git commit -m "feat(image): section-type editor offers image fields (no limits)"
```

---

### Task 3: Manual image upload in the editor field area

**Files:**
- Create: `apps/web/src/ui/ImageField.tsx`
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-21-image-upload.test.tsx`
- Test: `apps/web/src/__tests__/slice-21-inspector-image.test.tsx`

**Interfaces:**
- Consumes: shared `fieldKind`/`FieldType` (Task 1), `useProposalStore` `notify`, the existing `POST /api/assets` → `{ url }` route, Inspector's `setField`.
- Produces: `ImageField` component `({ label, fieldKey, value, disabled?, onChange }) → JSX` that uploads a file to `/api/assets` and calls `onChange(url)`; the Inspector renders it for any `field.type === "image"`.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/__tests__/slice-21-image-upload.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImageField } from "../ui/ImageField";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImageField", () => {
  it("uploads to /api/assets and reports the returned url", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: "https://blob/x.png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();

    render(<ImageField label="Cover image" fieldKey="cover_image" value="" onChange={onChange} />);
    const input = screen.getByLabelText("upload-cover_image") as HTMLInputElement;
    const file = new File(["x"], "x.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assets", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://blob/x.png"));
  });

  it("shows a preview when a value is present", () => {
    render(<ImageField label="Cover image" fieldKey="cover_image" value="https://blob/x.png" onChange={vi.fn()} />);
    const img = screen.getByAltText("Cover image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://blob/x.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-21-image-upload.test.tsx`
Expected: FAIL — `../ui/ImageField` does not exist.

- [ ] **Step 3: Create the `ImageField` component**

Create `apps/web/src/ui/ImageField.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useProposalStore } from "../state/proposalStore";

/**
 * Manual upload control for an `image` content field (§I). Posts the file to the
 * shared `/api/assets` route (Vercel Blob) and reports the returned URL via
 * `onChange`; the caller writes it into `data[field]`. Never AI-composed —
 * mirrors the logo uploader, but writes section content instead of the theme.
 */
export function ImageField({
  label,
  fieldKey,
  value,
  disabled,
  onChange,
}: {
  label: string;
  fieldKey: string;
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [busy, setBusy] = useState(false);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/assets", { method: "POST", body });
      if (!res.ok) {
        notify("error", res.status === 415 ? "That file isn't an image." : "Upload failed. Please try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
      notify("success", "Image uploaded.");
    } catch {
      notify("error", "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        aria-label={`upload-${fieldKey}`}
        type="file"
        accept="image/*"
        disabled={disabled || busy}
        onChange={(e) => void upload(e)}
      />
      {value ? <img src={value} alt={label} className="asset-thumb" /> : null}
      {busy ? <small className="meter">Uploading…</small> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-21-image-upload.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing Inspector-wiring test**

Create `apps/web/src/__tests__/slice-21-inspector-image.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { setActiveSectionTypes } from "@proposal/shared";
import type { SectionTypeSchema } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

const coverType: SectionTypeSchema = {
  type: "cover_test",
  label: "Cover (test)",
  category: "text",
  fields: [{ key: "coverImage", type: "image", label: "Cover image" }],
  variants: [],
  schemaVersion: 1,
};

beforeEach(() => {
  setActiveSectionTypes([coverType]);
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "cover_test", data: { coverImage: "" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  setActiveSectionTypes([]); // restore built-ins only
  vi.restoreAllMocks();
});

describe("Inspector image field", () => {
  it("renders an upload control (not a text input) for an image field", () => {
    render(<Inspector />);
    expect(screen.getByLabelText("upload-coverImage")).toBeTruthy();
    expect(screen.queryByLabelText("field-coverImage")).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-21-inspector-image.test.tsx`
Expected: FAIL — the image field currently renders the generic manual text `<input>` (`field-coverImage`), not an upload control.

- [ ] **Step 7: Wire `ImageField` into the Inspector**

In `apps/web/src/ui/Inspector.tsx`:

Add the import alongside the other sibling-component imports (near `import { AssetUpload } from "./AssetUpload";`):

```ts
import { ImageField } from "./ImageField";
```

In the schema-driven field area, inside the `if (kind === "manual") { … }` block, render `ImageField` for image fields **before** the generic text input. Replace the existing manual block:

```tsx
              if (kind === "manual") {
                const value = typeof selected.data[field.key] === "string" ? (selected.data[field.key] as string) : "";
                return (
                  <label className="field" key={field.key}>
                    <span className="field__label">{label}</span>
                    <input aria-label={`field-${field.key}`} value={value} readOnly={locked} disabled={locked} onChange={(e) => setField(field.key, e.target.value)} />
                  </label>
                );
              }
```

with:

```tsx
              if (kind === "manual") {
                const value = typeof selected.data[field.key] === "string" ? (selected.data[field.key] as string) : "";
                if (field.type === "image") {
                  return (
                    <ImageField
                      key={field.key}
                      label={label}
                      fieldKey={field.key}
                      value={value}
                      disabled={locked}
                      onChange={(url) => setField(field.key, url)}
                    />
                  );
                }
                return (
                  <label className="field" key={field.key}>
                    <span className="field__label">{label}</span>
                    <input aria-label={`field-${field.key}`} value={value} readOnly={locked} disabled={locked} onChange={(e) => setField(field.key, e.target.value)} />
                  </label>
                );
              }
```

- [ ] **Step 8: Run the Inspector test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-21-inspector-image.test.tsx`
Expected: PASS.

- [ ] **Step 9: Verify the Inspector regression**

Run: `npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx`
Expected: PASS (3 tests; non-image fields unchanged).

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/ui/ImageField.tsx apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-21-image-upload.test.tsx apps/web/src/__tests__/slice-21-inspector-image.test.tsx
git commit -m "feat(image): manual image upload in the editor field area"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (existing + new slice-21).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `rm -rf apps/web/.next && npm run build -w @proposal/web`
Expected: clean build; `/`, `/p/[id]`, `/print/[id]`, `/admin` compile.

- [ ] **Step 4: Commit (only if incidental fixes were needed)**

```bash
git add -A
git commit -m "test: phase-2 image field green (suite + typecheck + build)"
```

---

## Self-Review

**1. Spec coverage (§I, the `image` FieldType):**
- `FieldType` gains `"image"` → Task 1. ✅
- `image` field → `{ type: "string" }` JSON Schema → Task 1 (Step 4). ✅
- `emptyDataForType(image) = ""` → Task 1 (Step 6). ✅
- `fieldKind(image) = "manual"`, `fieldToGenerationSchema(image) = null` (never AI) → Task 1 (Step 5). ✅
- `validateSectionTypeDefinition` accepts `image` → Task 1 (Step 7). ✅
- Builder section-type editor: `image` selectable, no limit inputs → Task 2. ✅
- Editor field area: image field renders a manual upload (file → `/api/assets` → `data[field]`), never AI → Task 3. ✅
- Reuse `POST /api/assets` → Task 3 (ImageField posts there; route unchanged). ✅
- Correctly **out of Phase 2** (deferred to Phase 3): the `LayoutRenderer` background that *consumes* an image field, `background`/`overlay` validation, `sampleDataForType` placeholder image, and `print-color-adjust: exact` (only meaningful once backgrounds render). Noted in Global Constraints.

**2. Placeholder scan:** No TBD/TODO; every code step is complete with the actual code and exact commands.

**3. Type consistency:** `FieldType` member `"image"` used identically across Tasks 1–3. `fieldKind` returns the `FieldKind` union (`"ai"|"data"|"manual"`); image → `"manual"` matches the Inspector's `kind === "manual"` branch (Task 3). `ImageField` props (`label, fieldKey, value, disabled?, onChange`) match the Inspector call site exactly. `/api/assets` response `{ url: string }` matches both the existing route and `ImageField`'s parse. `setActiveSectionTypes(authored: SectionTypeSchema[])` and `resetSectionTypesForTests()` exist in `registry/sectionTypes.ts`; the apps/web test resets via `setActiveSectionTypes([])` (restores built-ins) since the test-only reset seam may not be re-exported from the package index, while the shared test imports `resetSectionTypesForTests` directly from the registry module.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-06-21-section-layouts-phase2-image-field.md`. This is Phase 2 of 5; Phase 3 (declarative layout model + interpreter, incl. backgrounds that consume image fields) gets its own plan after this ships.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach?
