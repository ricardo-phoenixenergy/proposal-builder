# Task 2 Report — TemplateRow + Row-Based Template Methods (Memory)

## TDD Evidence

### RED (Step 2)
Command: `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
Result: 3 failed / 3 total
Errors:
- `repo.listTemplateRows is not a function`
- `repo.setTemplateDeprecated is not a function`
- `repo.listInUseTemplateIds is not a function`
(Expected — methods not yet implemented)

### GREEN (Step 5)
Command: `npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
Result: 3 passed / 3 total — 7ms

## Files Changed

1. `apps/web/src/__tests__/slice-13-templates-repo.test.ts` — CREATED
   - Verbatim test from the brief (3 tests covering upsert+list, deprecation toggle + null-template overlay, listInUseTemplateIds).

2. `apps/web/src/server/repo/types.ts` — MODIFIED
   - Removed `StoredTemplate` interface (lines 26–29).
   - Added `TemplateRow` interface (mirrors `SectionTypeRow` shape).
   - Replaced `listTemplates(): Promise<StoredTemplate[]>` and `upsertTemplate(template: Template): Promise<StoredTemplate>` with four new methods: `listTemplateRows`, `upsertTemplate(row)`, `setTemplateDeprecated`, `listInUseTemplateIds`.

3. `apps/web/src/server/repo/memory.ts` — MODIFIED
   - Removed `StoredTemplate` from imports; added `TemplateRow`.
   - Removed unused `Template` from `@proposal/shared` import.
   - Changed templates Map type from `Map<string, StoredTemplate>` to `Map<string, TemplateRow>`.
   - Replaced old `listTemplates`/`upsertTemplate` methods with four row-based implementations mirroring section-type row methods.

## Self-Review

- All four new Repository methods are implemented in the memory repo with identical structural logic to the section-type row methods.
- `setTemplateDeprecated` correctly returns `null` when the row doesn't exist AND `deprecated` is `false` (no ghost creation), matching the test assertion.
- `listInUseTemplateIds` guards against proposals without a `templateId` (optional chaining check).
- TypeScript strict + exactOptionalPropertyTypes: no optional property violations introduced.
- Imports are extensionless; `packages/shared` stays framework-agnostic.

## Typecheck Interim State (Step 6) — Confirmed Expected

Command: `npm run typecheck`
Result: FAILS in:
- `apps/web/app/api/templates/route.ts` — calls old `listTemplates` (TS2551) and passes `Template` directly to `upsertTemplate` (TS2345).
- `apps/web/src/server/repo/postgres.ts` — implements old `upsertTemplate(template: Template)` signature incompatible with new row type (TS2322).

These are the exact two files identified in the brief as the intended handoff to Tasks 3 and 5. No other typecheck errors introduced.
