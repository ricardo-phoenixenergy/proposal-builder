# Task 9 Report — Store: `templates` state, `loadTemplates`, `applyTemplate` from state

## TDD Evidence

### RED (failing run before implementation)
Command: `npx vitest run apps/web/src/__tests__/slice-13-store-templates.test.ts`

- `initialises templates to the built-ins` — PASS (1) — `setState` coerces the field even before it's typed
- `loadTemplates hydrates from the API` — FAIL — `useProposalStore.getState().loadTemplates is not a function`
- `applyTemplate scaffolds a document from a hydrated template` — FAIL — `expected 'tmpl_open' to be 'tmpl_sales'` (store used `getTemplate` from shared registry, not `get().templates`)

Result: **2 failed | 1 passed**

### GREEN (passing run after implementation)
Command: `npx vitest run apps/web/src/__tests__/slice-13-store-templates.test.ts`

- `initialises templates to the built-ins` — PASS
- `loadTemplates hydrates from the API` — PASS
- `applyTemplate scaffolds a document from a hydrated template` — PASS

Result: **3/3 passed**

## Typecheck Result

Command: `npm run typecheck` (repo root)

Exit: **0** — no errors.

## Files Changed

### Modified
- `apps/web/src/state/proposalStore.ts`
  - Import line: removed `getTemplate`, added `builtInTemplates`; added `Template` to type import
  - Added `fetchTemplates` import from `../client/templates`
  - `ProposalState` interface: added `templates: Template[]` and `loadTemplates: () => Promise<void>`
  - `applyTemplate` action: rewritten to `get().templates.find((t) => t.id === templateId)` instead of `getTemplate(templateId)`
  - Store body: added `templates: builtInTemplates` initialiser and `loadTemplates` async action (catch → notify "Couldn't load templates.")

### Created
- `apps/web/src/__tests__/slice-13-store-templates.test.ts` — verbatim from spec, 3 tests

## Self-Review

- The shared `applyTemplate` (pure scaffolder) and the store action `applyTemplate` coexist correctly — the store action wraps the pure function; no naming clash.
- `loadSectionTypes`/`fetchSectionTypes` wiring is untouched.
- `exactOptionalPropertyTypes` is respected — no optional properties assigned without a defined value.
- Imports are extensionless per monorepo convention.
- The `loadTemplates` catch block mirrors the established pattern from `loadSectionTypes`.

## Concerns

None. The implementation is a straightforward parallel to the existing `sectionTypes`/`loadSectionTypes` pattern. The `builtInTemplates` initialiser ensures the store is immediately usable before any API call, and `loadTemplates` hydrates it with the merged (built-in + authored) list from the API.
