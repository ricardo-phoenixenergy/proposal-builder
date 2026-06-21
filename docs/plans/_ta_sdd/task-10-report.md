# Task 10 Report — Inspector reads store templates; App hydrates on mount

## TDD Evidence

**RED (Step 2):**
Ran `npx vitest run apps/web/src/__tests__/slice-13-inspector-templates.test.tsx`
- 2 tests FAILED as expected:
  - `expected [ 'tmpl_open', 'tmpl_prelim' ] to include 'tmpl_active'`
  - `expected [ 'tmpl_open', 'tmpl_prelim' ] to include 'tmpl_dead'`
- Confirmed: Inspector was still mapping the in-code `templates` import from `@proposal/shared`.

**GREEN (Step 6):**
Ran all three test files: `slice-13-inspector-templates.test.tsx`, `slice-03-static.test.tsx`, `slice-07-frontend.test.tsx`
- 15/15 tests PASSED.

## App-render Test Stub Changes

Both `slice-03-static.test.tsx` and `slice-07-frontend.test.tsx` had a fetch stub that returned a single shape regardless of URL:
```ts
vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ sectionTypes: [] }) })
```

Replaced with a URL-aware stub in both files:
```ts
vi.stubGlobal("fetch", vi.fn((url: string) => {
  const body = String(url).includes("/api/templates") ? { templates: [] } : { sectionTypes: [] };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}));
```
The section-types shape (`{ sectionTypes: [] }`) is preserved for all non-templates URLs. Neither test asserts specific section types, so no further changes were needed.

## Three-file Test Result

```
3 test files passed (15 tests total)
  slice-13-inspector-templates.test.tsx  2/2 PASS
  slice-03-static.test.tsx               8/8 PASS
  slice-07-frontend.test.tsx             5/5 PASS
```

## Typecheck Result

`npm run typecheck` — exit 0. No errors.

## Files Changed

- `apps/web/src/__tests__/slice-13-inspector-templates.test.tsx` — CREATED (new test file)
- `apps/web/src/ui/Inspector.tsx` — removed `getTemplate` and `templates` from `@proposal/shared` import; added `const templates = useProposalStore((s) => s.templates)`; changed template resolution to `templates.find((t) => t.id === document.templateId) ?? openTemplate`; changed dropdown to filter `!t.deprecated || t.id === document.templateId`
- `apps/web/src/App.tsx` — added `loadTemplates` selector; added `void loadTemplates()` to the mount `useEffect`
- `apps/web/src/__tests__/slice-03-static.test.tsx` — URL-aware fetch stub
- `apps/web/src/__tests__/slice-07-frontend.test.tsx` — URL-aware fetch stub

## Self-review

All five changes are minimal and exactly per brief. The three-layer invariant is preserved: templates remain STRUCTURE, Inspector reads from store (hydrated), not the in-code import. No new dependencies added. TypeScript strict + exactOptionalPropertyTypes compliant (no optional property assignments were added).

## Concerns

None. The `loadTemplates` store action (added in Task 9) was already present and functional. The fetch stub pattern uses `Response` constructor directly which is available in jsdom — confirmed passing.
