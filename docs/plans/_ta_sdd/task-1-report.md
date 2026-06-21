# Task 1 Report — Shared: `Template.deprecated`, `builtInTemplates`, `validateTemplateDefinition`

## TDD Evidence

### RED — failing run (before implementation)

Command:
```
npx vitest run packages/shared/src/validation/validateTemplateDefinition.test.ts
```

Output (truncated):
```
❯ |shared| packages/shared/src/validation/validateTemplateDefinition.test.ts (0 test)
FAIL |shared|  packages/shared/src/validation/validateTemplateDefinition.test.ts
Error: Failed to load url ./validateTemplateDefinition (resolved id: ./validateTemplateDefinition) in ...
Does the file exist?
Test Files  1 failed (1)
      Tests  no tests
```

Why expected: The test imports `./validateTemplateDefinition` which did not yet exist — correct RED state; the module-not-found error means no tests could even be collected.

---

### GREEN — passing run (after implementation)

Command:
```
npx vitest run packages/shared/src/validation/validateTemplateDefinition.test.ts
```

Output:
```
 RUN  v2.1.9

 ✓ |shared| packages/shared/src/validation/validateTemplateDefinition.test.ts (6 tests) 4ms

 Test Files  1 passed (1)
       Tests  6 passed (6)
    Start at  21:26:52
    Duration  605ms (transform 60ms, setup 0ms, collect 77ms, tests 4ms)
```

All 6 tests pass.

---

## Typecheck Result

Command: `npm run typecheck` (from repo root)
Result: Exit 0 — no errors. Both `packages/shared/tsconfig.json` and `apps/web/tsconfig.json` passed.

---

## Files Changed

| File | Action |
|------|--------|
| `packages/shared/src/types/template.ts` | Modified — added `deprecated?: boolean` to `Template` interface |
| `packages/shared/src/validation/validateTemplateDefinition.ts` | Created — pure meta-validator for template definitions |
| `packages/shared/src/validation/validateTemplateDefinition.test.ts` | Created — 6 Vitest tests (verbatim from plan) |
| `packages/shared/src/index.ts` | Modified — added `templates as builtInTemplates` alias + `validateTemplateDefinition` export |

---

## Self-Review

- `deprecated?` added exactly as specified in the plan; placed after `overrides?` as the brief showed.
- `builtInTemplates` exported as an alias of `templates` — the original `templates` export is preserved, so existing importers are unaffected.
- `validateTemplateDefinition` is pure (no side effects, no imports from React/DB/Next), lives in `packages/shared`, and mirrors the pattern of `validateSectionTypeDefinition`.
- Rejects `choice` slots, unknown section types, invalid lock values, unknown `themeId`, and `data` keys that don't map to `text`/`paragraph` fields — exactly as specified.
- `exactOptionalPropertyTypes` compliance: the validator reads optional fields with bracket notation against `Record<string, unknown>` casts, which is correct.
- Extensionless imports throughout; no `.js` suffixes.

---

## Concerns

None. Implementation is straightforward and mirrors the existing `validateSectionTypeDefinition` pattern exactly. All 6 plan tests pass, typecheck is clean.
