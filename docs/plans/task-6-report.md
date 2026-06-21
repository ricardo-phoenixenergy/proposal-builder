# Task 6 Report — Server Active-Registry Hydration

## Status
COMPLETE — all steps passed.

## Files Changed
- **Created:** `apps/web/src/__tests__/slice-11-active-registry.test.ts` (test file, Step 1)
- **Created:** `apps/web/src/server/registry/activeRegistry.ts` (implementation, Step 3)
- **Created:** `apps/web/src/server/registry/` (new directory)

## Commands and Output
1. `npx vitest run apps/web/src/__tests__/slice-11-active-registry.test.ts` — FAIL (module not found, as expected).
2. Implementation written.
3. `npx vitest run apps/web/src/__tests__/slice-11-active-registry.test.ts` — **2 passed**.
4. `npm run typecheck` — **exit 0** (both `packages/shared` and `apps/web` clean).

## Test Summary
2 tests, 2 passed:
- `merges authored rows (incl. deprecation overlay) into the shared registry`
- `caches until invalidated`

## Merge Approach
Used the **simpler `setActiveSectionTypes(merged)`** (pass the full merged list) rather than the plan's `isPlainBuiltIn` reference-equality filter. Reason: `setActiveSectionTypes` calls `rebuild()` which clears the map and re-adds built-ins first, then the authored set — so passing the already-merged list causes built-ins to be set once (from `builtInSectionTypes` in `rebuild`) and then immediately overwritten by the merged entries that include authored overrides and deprecation flags. The final state is correct: authored definitions and deprecation overlays win. The `isPlainBuiltIn` filter would have skipped unchanged built-in references, but passing them again is harmless and simpler (no reference identity risk across module boundaries).

## Deviations
None from the plan's stated intent. The simplification is explicitly endorsed in the plan's note: *"If the `isPlainBuiltIn` reference check proves brittle, simplify `refreshActiveRegistry` to `setActiveSectionTypes(merged)` — built-ins-win-by-key semantics make duplicates harmless."*

## Concerns
None. The implementation is straightforward, hermetic (no network/DB in tests), and the cache invalidation path is exercised by the test.
