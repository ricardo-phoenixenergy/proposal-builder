# Builder template-authoring — execution ledger

Plan: docs/plans/2026-06-18-builder-template-authoring.md
Spec: docs/specs/2026-06-18-builder-template-authoring-design.md
Mode: subagent-driven, no git (checkpoints = named test file(s) pass + typecheck green).
Commands at REPO ROOT: single file `npx vitest run <path>`, full suite `npm test`, typecheck `npm run typecheck`, build `npm run build -w @proposal/web`, migration `npm run db:generate -w @proposal/web`.

**STATUS: COMPLETE.** All 12 tasks done + per-task reviewed. Final whole-branch review (opus) found one Critical — fixed + re-reviewed (FIX CONFIRMED).
Final state: full suite 258/258, typecheck exit 0, clean `next build` (/api/templates[/[id][/deprecate]] registered).
CRITICAL fixed: the current template was resolved via in-code `getTemplate` (built-ins only) in the export route + CopyFields + ExportGate + Outline → authored ids fell back to `openTemplate` (unlocked), bypassing lock/export enforcement. All four now resolve from the merged set (server: getMergedTemplates(); client: store templates). Added regression test slice-13-export-authored-template.test.ts (authored locked fixed-slot + mutated field → 422). T11 stable slot keys folded in. Spec §C note corrected. No git → finishing-a-development-branch step is N/A.

- [x] Task 1: shared — Template.deprecated + builtInTemplates + validateTemplateDefinition — review Approved (pure validator, rejects choice, alias export clean). 6/6, typecheck 0.
- [x] Task 2: repo memory — TemplateRow + row methods + listInUseTemplateIds (drop StoredTemplate) — review Approved, no issues. 3/3. (postgres+route typecheck failures = intended Task-3/5 handoff.)
- [x] Task 3: postgres parity + table reshape + migration 0004_loud_frightful_four.sql (additive) — review Approved, no Critical/Important. Repo layer typecheck clean; route error deferred to Task 5. repo test 3/3.
- [x] Task 4: server activeTemplates registry — controller-verified (exact mirror of activeRegistry; merge + deprecation overlay correct; no shared singleton). 2/2.
- [x] Task 5: GET + POST /api/templates (rewrite) — review Approved (requireOwner GET / requireAdmin POST, 409 vs merged set incl built-ins, invalidate-after-write). 5/5; full repo-layer typecheck now clean (exit 0).
- [x] Task 6: PUT /api/templates/[id] — review Approved (freeze order built-in→404→in-use→validate; path-id immutable; deprecated preserved; invalidate on success only). 4/4.
- [x] Task 7: POST /api/templates/[id]/deprecate — controller-verified (matches brief; 5-level imports; admin-gated; 404 on null; invalidate). 3/3.
- [x] Task 8: client/templates.ts — controller-verified (matches brief; 4 exports; mirrors sectionTypes.ts error handling). 5/5.
- [x] Task 9: store templates state + loadTemplates + applyTemplate-from-state — review Approved (getTemplate import removed, resolves from get().templates, theme pin preserved). 3/3, typecheck 0.
- [x] Task 10: Inspector from store + App hydration (+ URL-aware slice-03/07 stubs) — review Approved (filter keeps current deprecated, hides others; both loaders on mount). 15/15, typecheck 0.
- [x] Task 11: TemplateEditor — review Approved (toDef conditional-spread EOPT-safe, validate-gated Save, create→POST/edit→PUT, choice slots dropped, move bounds-checked). 2/2, typecheck 0.
- [x] Task 12: TemplateList + dashboard Templates panel + page wiring + full verify — review Approved. FULL SUITE 256/256, typecheck 0, clean build (/api/templates[/[id][/deprecate]] registered).

## Minor findings (for final review triage)
- Task 11: `TemplateEditor` slot rows use `key={i}` (array index). Under move-up/down reorder, controlled fixed-field text inputs can keep stale state because React reuses the node at the index. Bites only on reorder-then-edit of `fixed`-lock content. Fix: stable id on DraftSlot used as the key. (Reviewer: Minor; approved.)
