# Task 4 Report — Server active-template registry

## TDD Evidence

**RED:** `npx vitest run apps/web/src/__tests__/slice-13-active-templates.test.ts`
Result: FAIL — `Failed to load url ../server/registry/activeTemplates … Does the file exist?`
(0 tests collected; module not found as expected)

**GREEN:** Same command after implementing `activeTemplates.ts`
Result: PASS — 2/2 tests passed in 852ms

## Files Changed

- Created: `apps/web/src/__tests__/slice-13-active-templates.test.ts`
- Created: `apps/web/src/server/registry/activeTemplates.ts`

## Self-Review

- Merge logic mirrors `activeRegistry.ts` exactly: built-ins loaded into Map first, then DB rows overlay by id.
- `null` template row with unknown id is silently ignored (as specified).
- `null` template row for a known built-in id spreads the built-in with `deprecated: row.deprecated` (overlay).
- Deprecated templates remain in the merged list (carrying `deprecated: true`) — not filtered out.
- No `setActiveSectionTypes`-equivalent call needed (as specified — no shared mutable singleton).
- Cache invalidated by `invalidateActiveTemplates()`, re-hydrated lazily on next `getMergedTemplates()` call.
- Imports are extensionless; TypeScript strict; no new dependencies.

## Concerns

None. The implementation is structurally identical to the existing `activeRegistry.ts` with the appropriate type substitutions (`Template` / `TemplateRow` / `builtInTemplates` / `listTemplateRows`). Both tests pass cleanly.
