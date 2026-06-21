# Task 14 Report — Store: `addSection` + section-type hydration

## Status

COMPLETE — all steps passed, no regressions.

## Files Changed

- **Modified** `apps/web/src/state/mutations.ts`
  - Added `getSectionType` to shared import
  - Added `appendSection(document, type): ProposalDocument` pure mutation (uses `getSectionType` for `defaultVariant`, `emptyDataForType` for blank data, `sec_<uuid-slice>` id)

- **Created** `apps/web/src/__tests__/slice-11-store.test.ts`
  - 1 test: verifies `appendSection` appends a section with correct type, truthy id, object data, and does NOT mutate the original document

- **Created** `apps/web/src/client/sectionTypes.ts`
  - `fetchSectionTypes()` — GET `/api/section-types`
  - `createSectionType(def)` — POST `/api/section-types`
  - `updateSectionType(type, def)` — PUT `/api/section-types/:type`
  - `setSectionTypeDeprecated(type, deprecated)` — POST `/api/section-types/:type/deprecate`

- **Modified** `apps/web/src/state/proposalStore.ts`
  - Added imports: `SectionTypeSchema`, `setActiveSectionTypes` from `@proposal/shared`; `appendSection` from `./mutations`; `fetchSectionTypes` from `../client/sectionTypes`
  - Added `ProposalState` fields: `sectionTypes: SectionTypeSchema[]`, `loadSectionTypes: () => Promise<void>`, `addSection: (type: string) => void`
  - Added store body: `sectionTypes: []`, `loadSectionTypes` (fetch → setActiveSectionTypes → set state; notify on error), `addSection` (set doc via appendSection)

## Test Output

```
slice-11-store.test.ts   1 test  PASS
slice-08-frontend.test.tsx  3 tests PASS (regression)
slice-07-frontend.test.tsx  5 tests PASS (regression)
npm run typecheck            exit 0
```

## Deviations

**Client helpers typing fix:** The plan's original `(await res.json().catch(() => ({})))?.error` pattern would produce type `any` at the optional-chaining site, which may warn under strict. The implementation casts the resolved value to `{ error?: string }` before accessing `.error`, making it typecheck-clean without any `as any` escape:

```ts
const err = (await res.json().catch(() => ({}))) as { error?: string };
throw new Error(err.error ?? "Create failed");
```

This applies in both `createSectionType` and `updateSectionType`.

## Concerns

None. `loadSectionTypes` is deliberately NOT wired into App.tsx as instructed (that is Task 19).
