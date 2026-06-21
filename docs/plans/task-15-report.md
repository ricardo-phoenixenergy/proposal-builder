# Task 15 Report — Outline "+ Add section"

## Status

COMPLETE — test green, typecheck exit 0, no regressions.

## Files changed

- **Created:** `apps/web/src/__tests__/slice-11-add-section.test.tsx`
- **Modified:** `apps/web/src/ui/Outline.tsx`
  - Added `listSectionTypes` to the `@proposal/shared` import.
  - Added `const addSection = useProposalStore((s) => s.addSection);` to the component body.
  - Appended the `{!locked ? (<div className="outline__add">…</div>) : null}` block after the section list, before `</nav>`.

## Test output

```
✓ |web| apps/web/src/__tests__/slice-11-add-section.test.tsx (1 test) 53ms
Test Files  1 passed (1)
Tests       1 passed (1)
```

## Outline regression

No Outline tests existed prior. Adjacent tests confirmed clean:
- `slice-04-editor.test.tsx` — 7 tests PASS
- `slice-10-frontend.test.tsx` — 3 tests PASS

## Typecheck

`npm run typecheck` — exit 0 (both `packages/shared` and `apps/web` tsconfig).

## Deviations

None. Implementation follows Task 15 Step 3 verbatim.

- `appendSection` and `addSection` were already implemented (Tasks 14 were completed before this run).
- `listSectionTypes` was already exported from `@proposal/shared` (Task 2 was already completed).
- The control renders only when `!locked` (computed from `isStructureLocked(getTemplate(templateId) ?? openTemplate)`), which was already in the component.

## Concerns

None. The `sampleProposal` fixture uses `templateId: "tmpl_open"` which is unlocked, so the test exercises the happy path correctly. A locked-template regression test could be added later, but is not required by the task spec.
