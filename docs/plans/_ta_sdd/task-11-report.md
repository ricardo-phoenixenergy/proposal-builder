# Task 11 Report — TemplateEditor component

## TDD Evidence

### RED (before implementation)
Run: `npx vitest run apps/web/src/__tests__/slice-13-template-editor.test.tsx`
Result: FAIL — `Error: Failed to resolve import "../ui/admin/TemplateEditor"` (file did not exist)
Tests collected: 0

### GREEN (after implementation)
Run: `npx vitest run apps/web/src/__tests__/slice-13-template-editor.test.tsx`
Result: PASS — 2/2
- ✓ creates a template: fills name + a slot, then POSTs
- ✓ disables Save while the draft is invalid (no slots)
Duration: ~2.1s

## Typecheck
`npm run typecheck` — exit 0, no errors.

## Files Changed

### Created
- `apps/web/src/ui/admin/TemplateEditor.tsx` — the editor component
- `apps/web/src/__tests__/slice-13-template-editor.test.tsx` — the test file

## Self-Review

The implementation follows the brief exactly:
- `mode: "create" | "edit"` prop; `id` input disabled when editing.
- `DraftSlot = { type, lock, data }` internal state.
- `toDef` builds `kind:"fixed"` slots with a conditional `data` spread — only when `lock==="fixed"` and at least one non-empty value — satisfying `exactOptionalPropertyTypes`.
- `validateTemplateDefinition(def, { sectionTypes, themeIds: themes.map(t => t.id) })` drives validation; Save button is disabled while `!result.valid || busy`.
- Create path calls `createTemplate` (POST); edit path calls `updateTemplate` (PUT).
- Choice slots in `initial` are dropped from the draft (v1 scope).
- Reuses `steditor` / `field` / `btn` / `notice` CSS classes, mirroring `SectionTypeEditor`.
- `"use client"` directive at top; extensionless imports throughout.

## Concerns

None. The implementation is a straight mirror of `SectionTypeEditor` adapted for templates. The `toDef` conditional data spread pattern is identical to the pattern used in `SectionTypeEditor` for optional field properties, satisfying strict TypeScript.
