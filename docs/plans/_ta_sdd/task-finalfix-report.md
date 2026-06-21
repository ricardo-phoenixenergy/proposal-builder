# Final-Fix Report — Builder Template Authoring Branch Review

Date: 2026-06-18

---

## Finding 1 (Critical) — resolve current template from merged/hydrated set in all four call sites

### (a) `apps/web/app/api/proposals/[id]/export/route.ts`
- Line 2: removed `getTemplate` from `@proposal/shared` import (kept `openTemplate`, `validateForExport`).
- Line 7 (new): added `import { getMergedTemplates } from "../../../../../src/server/registry/activeTemplates";`
- Line 26: replaced `const template = getTemplate(stored.document.templateId) ?? openTemplate;` with an async two-liner that awaits `getMergedTemplates()` then does `.find((t) => t.id === ...)  ?? openTemplate`.

### (b) `apps/web/src/ui/CopyFields.tsx`
- Line 3: removed `getTemplate` from `@proposal/shared` import.
- Line 15 (new): `const templates = useProposalStore((s) => s.templates);`
- Line 17: replaced `getTemplate(templateId) ?? openTemplate` with `templates.find((t) => t.id === templateId) ?? openTemplate`.

### (c) `apps/web/src/ui/ExportGate.tsx`
- Line 4: removed `getTemplate` from `@proposal/shared` import.
- Line 16 (new): `const templates = useProposalStore((s) => s.templates);`
- Line 19: replaced `getTemplate(document.templateId) ?? openTemplate` with `templates.find((t) => t.id === document.templateId) ?? openTemplate`.

### (d) `apps/web/src/ui/Outline.tsx`
- Line 1: removed `getTemplate` from `@proposal/shared` import.
- Line 15 (new): `const templates = useProposalStore((s) => s.templates);`
- Line 16: replaced `isStructureLocked(getTemplate(templateId) ?? openTemplate)` with `isStructureLocked(templates.find((t) => t.id === templateId) ?? openTemplate)`.

---

## Finding 2 (Regression test) — `apps/web/src/__tests__/slice-13-export-authored-template.test.ts`

Created hermetic node-env test with two cases:

1. **422 / no render when a fixed field is tampered.** Seeds authored locked template (`tmpl_fixed_x`, `locked:true`, single fixed slot with `data:{heading:"Legal",body:"Immutable."}`), creates a proposal via `applyTemplate(authored)`, mutates `sections[0].data.heading` to `"TAMPERED"` and saves, then POSTs to the export route. Asserts `status === 422` and `renderUrlToPdf` not called.

2. **200 when fixed fields are intact.** Uses the same authored template but leaves data as-is; asserts `status === 200` and `renderUrlToPdf` called.

**RED→GREEN evidence:** Before Finding-1 the route called `getTemplate("tmpl_fixed_x")` which returns `undefined` (authored id, not in shared registry), fell back to `openTemplate` (`locked:false`), skipped all lock checks, and returned 200 even on the tampered doc. After the fix, `getMergedTemplates()` returns the authored template from the DB; `validateForExport` sees `locked:true` + `data.heading:"Legal"`, detects the mismatch, and returns 422. Test confirmed green post-fix.

---

## Finding 3 (Minor) — stable React keys in TemplateEditor

File: `apps/web/src/ui/admin/TemplateEditor.tsx`

- `DraftSlot` type extended with `id: string` (editor-only draft state).
- `useState` initializer: each seeded slot now receives `id: crypto.randomUUID()`.
- `addSlot`: new slots receive `id: crypto.randomUUID()`.
- JSX render: `key={i}` replaced with `key={s.id}` on the slot row `<div>`.
- `toDef` function: destructures `{ type, lock, data }` (not `id`) before building the slot output — `id` never appears in the `Template` result.
- Existing `slice-13-template-editor.test.tsx` re-run: still green (2/2).

---

## Finding 4 (Spec note correction)

File: `docs/specs/2026-06-18-builder-template-authoring-design.md` §C

Replaced the sentence "only the store called `getTemplate`" with an accurate correction note documenting that `getTemplate` was also called in the export route, CopyFields, ExportGate, and Outline, and stating the fix applied (server: `getMergedTemplates()`; client: store `templates.find(...) ?? openTemplate`).

---

## Verification results

### Targeted tests
```
apps/web/src/__tests__/slice-13-export-authored-template.test.ts   2 passed
apps/web/src/__tests__/slice-09-export.test.ts                      3 passed
apps/web/src/__tests__/slice-13-template-editor.test.tsx            2 passed
```
All green (7/7).

### Full suite
**62 test files, 258 tests — all passed.**

### Typecheck
`npm run typecheck` — exit 0, no errors.

### Build
`npm run build -w @proposal/web` — clean build, 25 routes compiled successfully, no errors.

---

## Concerns

None. All four call sites now resolve from the live merged/hydrated template set. The server export route is the authoritative gate; `getMergedTemplates()` is async and cached, so no performance concern. Client components use the already-hydrated store array which is initialised to built-ins before `loadTemplates()` completes, making the `.find(...) ?? openTemplate` fallback always safe.
