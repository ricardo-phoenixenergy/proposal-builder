# Task 2 Report: Runtime-settable registry (shared)

**Status: DONE**

---

## Files Created

- `packages/shared/src/registry/activeRegistry.test.ts` — new test (5 tests)

## Files Modified

- `packages/shared/src/types/section.ts` — added `deprecated?: boolean` to `SectionTypeSchema`
- `packages/shared/src/registry/sectionTypes.ts` — renamed `sectionTypes` array to `sectionTypeList`; removed `sectionTypeMap` and old `getSectionType`; added `builtInSectionTypes`, `activeMap`, `rebuild()`, `setActiveSectionTypes`, `resetSectionTypesForTests`, `sectionTypeRevision`, `getSectionType`, `listSectionTypes`, `activeSectionTypes`
- `packages/shared/src/schema/section.schema.ts` — changed import from `sectionTypes` to `builtInSectionTypes`; updated static export to use `builtInSectionTypes`
- `packages/shared/src/validation/validateSection.ts` — replaced static `ajv.compile(sectionSchema)` with memoized `sectionValidator()` that recompiles when `sectionTypeRevision()` changes
- `packages/shared/src/index.ts` — replaced `sectionTypes`, `sectionTypeMap`, `getSectionType` exports with `builtInSectionTypes`, `getSectionType`, `listSectionTypes`, `activeSectionTypes`, `setActiveSectionTypes`, `sectionTypeRevision`, `resetSectionTypesForTests`
- `packages/shared/src/__tests__/slice-01-schema.test.ts` — consumer fix: updated import from `sectionTypes` to `builtInSectionTypes`, updated all usages

---

## Commands Run

| Command | Result |
|---|---|
| `npx vitest run packages/shared/src/registry/activeRegistry.test.ts` (failing) | FAIL — 5 failed (expected) |
| `npx vitest run packages/shared/src/registry/activeRegistry.test.ts` (after impl) | PASS — 5 passed |
| `npx vitest run packages/shared` | PASS — 8 files, 57 tests |
| `npx vitest run apps/web` | PASS — 19 files, 90 tests |
| `npm run typecheck` | PASS — exit 0 |

---

## Deviations

1. **Test fix for `exactOptionalPropertyTypes`**: The plan's step 1 test used `{ ...builtInSectionTypes[0], type: "text", label: "Custom text" }` directly, which TypeScript rejected under `exactOptionalPropertyTypes: true` because array indexing produces `T | undefined`. Fixed by extracting to `const base = builtInSectionTypes[0]!; setActiveSectionTypes([{ ...base, ... }])`. This is a correct non-functional deviation — test semantics unchanged.

2. **`apps/web` had no consumers** of `sectionTypes` or `sectionTypeMap` to fix (grep confirmed zero hits). All consumer fixes were in `packages/shared`.

---

## Concerns

None. The Ajv `$id` reuse concern (recompiling a schema with the same `$id` on a shared Ajv instance) was tested implicitly by the 5-test suite which calls `setActiveSectionTypes` multiple times and then `validateSection`; all passed without issue because `strict: false` in the shared Ajv instance allows schema overwrites without throwing.
