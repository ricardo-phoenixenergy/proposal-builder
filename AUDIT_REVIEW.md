# Proposal Builder — Engineering & Architecture Audit

**Date:** 2026-06-23
**Reviewer:** Principal engineering audit (full codebase, architecture, features, fitness-for-purpose)
**Revision under review:** `main` @ `c1f39ce` (Section Layout Authoring feature complete, Phases 1→5b)
**Method:** Five parallel subsystem deep-dives (architecture/three-layer, AI integration, data/API/auth, frontend/UX/PDF, quality/tooling), followed by direct verification of every load-bearing Critical claim against source.

---

## How to read this document

- **Part I — Audit** scores the product against its four stated goals, then lists findings by severity. Each finding cites `file:line`, says *why it matters*, and gives a concrete fix. Findings marked **✓ verified** were confirmed by me reading the source directly (not just relayed from a sub-agent); one widely-reported "Critical" was **investigated and dismissed** — see the box in §3.
- **Part II — Enterprise Roadmap** turns the findings into a sequenced, phased plan to take the tool to enterprise grade in performance, product fit, and usability, including justified refactors, reorganisation, and deletions.

Severities reflect *my* consolidated judgement after verification, which in several places differs from the raw sub-agent ratings (noted inline).

---

# Part I — Audit

## 1. Executive summary

This is a **well-architected codebase with an unusually disciplined core** and a **thin operational/production shell**. The defining principle — the strict three-layer separation of content / structure / presentation — is not aspirational; it is genuinely enforced at the type, schema, validation, mutation, and render layers simultaneously, which is rare. The declarative block-tree layout model with its closed-`switch` interpreter is a genuinely safe design with no code-execution sinks. TypeScript strictness is best-in-class and almost never circumvented.

The gaps are **not structural — they are operational and around-the-code**:

- **No CI, no linter config, no formatter, no coverage, no observability, no audit log.** The strong type checks and behavioural tests exist but are never automatically enforced, and production has no eyes on it.
- **The AI and PDF paths — the two riskiest runtime surfaces — lack robustness**: no `stop_reason` handling, fixed `max_tokens`, no retries, no input-size limits, an un-awaited font-readiness wait, and a hardcoded page `format`.
- **Auth and data are single-tenant MVP-grade**: blocking password hashing, no session revocation on account-disable, no `owner_id` indexes (full-table scans), and a model that is a dead end for multi-tenant/workspace selling.
- **The editor workflow has real friction**: no undo/redo, no section reordering, native `window.prompt`/`confirm` dialogs, and selector over-subscription that will jank on large documents.

**Verdict:** The foundation is strong enough to build an enterprise product on **without a rewrite**. What's missing is the production-hardening, observability, and workflow polish layer. The single most urgent *correctness* risk is the PDF font-readiness race (silent bad exports); the single most urgent *engineering* gap is the absence of CI.

**Fitness scorecard (1–5):**

| Goal | Score | One-line |
|---|---|---|
| **AI-enabled** | 3.5 / 5 | Correct, current API usage and a clean content-only contract; but brittle under load (no `stop_reason`/retry/limits/observability). |
| **Brand-consistent** | 4.5 / 5 | Token-only theming and limits are genuinely enforced end-to-end incl. the hard export gate. Minor leaks (a few hardcoded type sizes; free-text font input). |
| **Flexible / customizable** | 4 / 5 | The type/variant/layout/template authoring system is powerful and safe. Held back by missing undo, reorder, and some workflow friction. |
| **Workflow efficiency** | 3 / 5 | Solid for a power user, but no undo/redo, no reorder, native dialogs, sequential AI, and re-render jank at scale. |
| **Enterprise-grade (perf/ops/security)** | 2 / 5 | The biggest gap. No CI/observability/audit, single-tenant, blocking auth, no rate limiting, no session revocation, unindexed queries. |

---

## 2. Scope & method

Audited: the `packages/shared` framework-agnostic core (types, schema, validation, registries, generation, render helpers) and the `apps/web` Next.js app (route handlers, repo layer, auth, state, editor UI, admin Builder, PDF pipeline). ~9,700 LOC of source across 120 files; 106 test files.

Stack confirmed: Next 15 (App Router) · React 19 · Zustand 5 · Drizzle 0.38 + Neon serverless · Auth.js (next-auth) v5 **beta** · `@anthropic-ai/sdk` 0.104 · Recharts · `puppeteer-core` + `@sparticuz/chromium-min` · Monaco · Vercel Blob.

---

## 3. Architecture assessment against the product goals

**Three-layer separation — genuinely enforced.** Content types (`packages/shared/src/types/document.ts`, `section.ts`) carry no markup; the generation schema only emits text/array fields (`generationSchema.ts`); the system prompt forbids HTML/CSS (`prompts.ts:11`); theming is exclusively CSS variables (`ThemeProvider`, `compileBlockStyle` in `render/layoutStyle.ts`). The section JSON Schema is *derived from the registry* (`section.schema.ts:127`) so the validator and the type definitions cannot drift. Per-section regeneration returns only `{ data }` and merges client-side (`Inspector.tsx:91` does `{ ...selected.data, ...result.data }`), so manual edits and other sections are structurally safe from clobbering. **This is the product's crown jewel — protect it.**

**The safe layout interpreter is sound.** `LayoutRenderer.tsx` is a closed `switch` over `LEAF_KINDS`/`CONTAINER_KINDS`; there is no `eval`, `new Function`, or `dangerouslySetInnerHTML` anywhere in the repo; unknown kinds return `null`; the validator caps tree depth. Admin-authored layouts are declarative JSON, never code. The Phase 1–5b work landed cleanly here.

> ### ⚠️ Correction: a reported "Critical" that is NOT real
> A sub-agent reported (as two Criticals) that the export gate does not enforce `maxChars` or per-field limits on open/unlocked templates, allowing off-brand content to export. **I verified this is false.** `validateForExport` (`validateForExport.ts:21`) always runs `validateDocument().errors` *before* any locked-template logic, for every template. `section.schema.ts:23` emits `maxLength` from `maxChars`, and `:28,55,58,96` emit `maxItems` from `maxRows`/`maxColumns`; `validateSection.ts:49` enforces `maxWords` in the app layer (JSON Schema cannot count words). **Brand limits are enforced at the hard export gate regardless of template lock state.** The only real, minor gap is that *live edit-time meters* for data fields (rows/series) are advisory warnings (`variantRange.ts`), not the gate — which is by design. This is recorded as **Low L-8**, not Critical.

**Where the architecture helps the goals:** the registry-as-single-source-of-truth and token-only presentation directly serve brand consistency and customizability without letting either bleed into content. **Where it fights them:** module-level mutable registries (below) make the "live" registry implicitly global, and a few code components hardcode presentation values that `ThemeTokens` cannot reach.

---

## 4. Findings

### 4.1 Critical

**C-1 · PDF font/chart readiness is not actually awaited — silent bad exports** ✓ verified
`apps/web/src/server/pdf/renderProposalPdf.ts:17` does `await page.evaluateHandle("document.fonts.ready")`. `evaluateHandle` resolves as soon as the *handle* to the `fonts.ready` Promise exists — it does **not** wait for that Promise to resolve. So Chromium can capture the PDF before web fonts (and Recharts SVG paint) are ready, producing exports with fallback fonts or missing/partial charts intermittently. This is the highest-impact correctness bug because it is non-deterministic and affects the client-facing deliverable.
**Fix:** `await page.evaluate(() => document.fonts.ready);` (returns the resolved value, genuinely blocking), keep the existing `[data-print-ready="true"]` wait, and add an explicit Recharts-rendered assertion (e.g. wait for an `svg .recharts-surface` count to stabilise) before `page.pdf()`.

**C-2 · AI calls have no `stop_reason` handling and a fixed `max_tokens: 2048`** ✓ verified
`apps/web/src/server/anthropic.ts:19,25`. The text blocks are joined with no check of `response.stop_reason`. If output hits `max_tokens` the JSON is truncated and `JSON.parse` throws a generic "not valid JSON" error; if the model refuses (`stop_reason:"refusal"`, relevant for Opus 4.8+/Fable 5) the content is empty and the same opaque error appears. `max_tokens` is a constant, so multi-paragraph sections silently truncate. The user/operator gets no signal *why* generation failed.
**Fix:** branch on `stop_reason` (`max_tokens` → retry with larger budget or surface "response too long"; `refusal` → log + friendly message; opt into server-side refusal fallbacks if you adopt Fable 5). Derive `max_tokens` from the section schema's summed `maxChars` (with a cap), not a constant.

### 4.2 High

**H-1 · No CI, no enforced quality gate** ✓ verified (no `.github/`)
The excellent strict-TS config and 106 behavioural tests are never run automatically. Broken code can land on `main` (which auto-deploys to Vercel). This is the biggest *process* risk.
**Fix:** GitHub Actions on every push/PR: `npm run typecheck && npm test && npm run build -w @proposal/web`. Block merge on failure.

**H-2 · No retry/backoff and raw SDK errors leak to the client** ✓ verified
`anthropic.ts` makes a single `messages.create` with no retry; transient 429/5xx aborts a client-facing draft. `generateSection.ts:74` returns `e.message` (raw SDK text, possibly leaking internals) in the 422 body.
**Fix:** use the SDK's `maxRetries` (or a small backoff wrapper) for 429/5xx; log full errors server-side with a correlation id; return sanitised messages.

**H-3 · No input-size limits on AI inputs (cost/DoS)** ✓ verified
`/generate/section`, `/generate/field`, `/refine/section`, `/generate/proposal` accept `brief`/`instruction`/`data` with only a `typeof` check. `refine/section/route.ts:36` injects `JSON.stringify(data)` verbatim into the prompt. A large payload burns tokens/$ unbounded.
**Fix:** enforce `MAX_BRIEF_CHARS`, `MAX_INSTRUCTION_CHARS`, `MAX_DATA_CHARS` at the route layer (400 on exceed); share one `validateGenerationInput()` util.

**H-4 · No upload/import size limits (memory exhaustion)** ✓ verified
`app/api/assets/route.ts` streams any `File` to Blob and `app/api/data/import/route.ts` reads the whole CSV into memory with no `file.size` guard. A large upload OOMs the function (512 MB).
**Fix:** reject above a cap (e.g. 10 MB images, 5 MB CSV) with 413 before processing.

**H-5 · Disabled accounts keep working until JWT expiry (no session revocation)** ✓ verified
The `disabled` flag is only checked at sign-in (`authenticateUser`). An existing JWT (≈30-day) stays valid after an admin disables the user. There is no revocation path. This is the principal security gap.
**Fix:** add an Auth.js `authorized`/`jwt` callback that re-checks `getUserById(token.id).disabled` with a short (≈60 s) cache; or maintain a revocation list keyed on `jti`.

**H-6 · No `owner_id` / `proposal_id` indexes — every list is a full table scan** ✓ verified
`apps/web/src/server/db/schema.ts`: only PKs and `users.email` are indexed. `listProposals`/`listFolders`/`listThemes`/`listVersions` scan the whole table. Fine at demo scale, linear degradation in production.
**Fix:** migration adding `proposals(owner_id)`, `proposals(folder_id)`, `folders(owner_id)`, `themes(owner_id)`, `proposal_versions(proposal_id)`; partial index for the admin-count query.

**H-7 · Blocking `scryptSync` on the auth hot path** ✓ verified
`apps/web/src/server/auth/password.ts:12,21` uses synchronous scrypt, blocking the event loop ~50–300 ms per call. Concurrent logins serialise and can starve the function.
**Fix:** `await promisify(crypto.scrypt)` (async), or move to `argon2`/`bcrypt` async APIs. Keep the constant-time compare.

**H-8 · `Inspector` selector over-subscription → editor jank at scale** ✓ verified
`Inspector.tsx:34` subscribes to the whole `s.document`; since every mutation produces a new `document` reference, every keystroke anywhere re-renders the entire 402-line Inspector. Same anti-pattern in `DataGrid.tsx:21` / `ColumnMapping.tsx:21` (subscribe to all sections to find one). Noticeable at 20+ sections.
**Fix:** subscribe to narrow slices (`document.brief`, `document.templateId`, …) and the selected section via `useShallow`; pass section data down as props from the already-selected Inspector.

### 4.3 Medium

**M-1 · No observability — no token/latency/usage logging** ✓ verified
`anthropic.ts` discards `response.usage`; nothing logs model, tokens, `stop_reason`, latency, or validation outcome. Cost attribution, debugging, and quality monitoring are impossible in production.
**Fix:** structured log per AI call `{reqId, model, input_tokens, output_tokens, stop_reason, type, latencyMs, validationOk}`; adopt a lightweight logger and propagate a request id through routes.

**M-2 · No rate limiting on auth or generation** — an authenticated user can hammer `/api/generate/proposal` (N sequential Claude calls) at the company's cost. Add per-owner token-bucket limits (separate budgets for bulk vs single).

**M-3 · `/api/generate/proposal` runs sections sequentially** ✓ verified
`generate/proposal/route.ts` `for … await` serialises independent sections → 10–20 s wall-clock for 5 sections. The SSE framing already supports progressive emit.
**Fix:** `Promise.allSettled` over text types, emit each `section` SSE event as it settles.

**M-4 · `refine/section` bypasses the admin model policy** ✓ verified (constrained)
`refine/section/route.ts:24,43` forwards the client `model`. `generateSection` *does* allowlist via `isSelectableModel` (so it is **not** arbitrary injection, contra one sub-agent), but it still bypasses the admin's chosen model — a policy inconsistency vs every other route.
**Fix:** drop the body `model`; call `getActiveModel()`.

**M-5 · Module-level mutable registries are implicitly global / no TTL** ✓ verified
`activeRegistry.ts`, `activeTemplates.ts`, `activeLayouts.ts`, and the compiled-validator cache in `validateSection.ts:9` are process-level singletons. On Vercel an admin edit on one instance is invisible to others until cold start; in local dev server and client share state. Low risk on isolated serverless, but a correctness smell and a multi-instance staleness bug.
**Fix:** add a short TTL + re-hydrate on miss; longer term, request-scope via `AsyncLocalStorage` or pass registries explicitly.

**M-6 · `snapshotVersion` is a non-transactional read-then-insert** (`postgres.ts`) and **`updateProposalMeta` doesn't bump `updatedAt`** (rename/move won't resurface in the `updatedAt`-sorted list). Wrap the snapshot in a transaction (or `INSERT … SELECT`); add `updatedAt: new Date()` to both repo impls.

**M-7 · No undo/redo** — the most-expected document-editor affordance is absent; a bad AI rewrite or accidental delete is unrecoverable. Add `zundo` (Zustand temporal middleware) scoped to `document`, with `Ctrl+Z`/`Ctrl+Y`.

**M-8 · Native `window.prompt`/`confirm` for rename/delete** (`Dashboard.tsx:95,112`, `Outline.tsx:81`) — inaccessible, break in embedded contexts, visually off-brand. Replace with in-UI modals (the `NewProposalDialog` pattern already exists).

**M-9 · `PrintDocument` is a client component in the RSC print route** — adds a hydration + 2×rAF round-trip before `data-print-ready`, slowing every PDF and widening the font race (C-1). Make it an RSC that sets readiness server-side where possible.

**M-10 · Render-token secret silently falls back to a public constant** (`renderToken.ts`) if `AUTH_SECRET` is unset — a production deploy missing the env var would sign render tokens with `"dev-only-render-secret"`. **Fix:** throw on missing `AUTH_SECRET` in production.

**M-11 · Repo duplication & brittle driver unwrap** — `memory.ts` and `postgres.ts` (~330 LOC each) duplicate projection helpers (`toProposalSummary`/`toUserSummary`); `postgres.ts:176,274` uses an `as unknown as {rows?}` double-unwrap that will silently return `[]` after any Neon driver upgrade. Extract shared projection utils and one typed `executeRaw<T>()` normaliser.

**M-12 · Two-step, non-atomic user PATCH** (`users/[id]/route.ts`) applies `isAdmin` then `disabled` in separate calls; add a single `patchUser({isAdmin?,disabled?})` repo method.

### 4.4 Low (selected)

- **L-1 · `evaluateHandle`/`format:"A4"` page sizing** ✓ verified — `format:"A4"` is hardcoded in `page.pdf` alongside `preferCSSPageSize:true`. Because `pageCss()` injects an `@page { size }` and `preferCSSPageSize` is honoured, non-A4 formats *probably* render correctly, but the literal `"A4"` is misleading and an incorrect fallback. Derive the format (or width/height mm) from `document.pageFormat`. (Several sub-agents rated this Critical; on verification the CSS path likely saves it — but fix it for clarity and safety.)
- **L-2 · Hardcoded typography in code components** — `TextSection.tsx:19-33` (`1.05rem`, `lineHeight`, `letterSpacing`), `fontWeight:600` in `DataTable`/`ComparisonMatrix`. Re-theming via `ThemeTokens` can't reach these. Add a `typography` token group or accept them as fixed design decisions explicitly.
- **L-3 · Free-text font input** — `ThemeForm.tsx:37` lets any string become `--f-heading`. Constrain to a curated `<select>` allowlist in `validateTheme`.
- **L-4 · Duplicated `isDataset` guards** with divergent strictness across `GenericSection`/`DataTable`/`ChartView`. Export one canonical guard from `shared`.
- **L-5 · `Outline` recomputes `listSectionTypes()` and re-creates `InsertControl` every render** — memoise; lift the inner component out (resets focus/scroll today).
- **L-6 · `defaultValue` (uncontrolled) Monaco theme editor** — preset switches don't update the code editor (stale JSON vs live preview). Make it controlled.
- **L-7 · Dashboard export bypasses the client gate** — surfaces only "Export failed" with no error list. Run `validateForExport` or surface server errors.
- **L-8 · Live data-field meters are advisory** (by design; the hard gate enforces). Wire row/series warnings into the variant range UI for parity with text meters.
- **L-9 · Default editor document is the demo sample** (`proposalStore.ts` seeds `sampleProposal`) — cold-start editor flashes demo content. Seed a blank/template-derived doc.
- **L-10 · DataGrid/row React keys use array index** — focus/flash bugs on insert/delete; add stable row ids.
- **L-11 · `/p/[id]` RSC doesn't redirect unauthenticated** — flashes loading then 401-redirects; add `if(!user) redirect('/signin')`.

---

## 5. Dead / outdated code

- **`buildGenerationDataSchema`** (`packages/shared/src/generation/generationSchema.ts:36`) — exported, never imported; superseded by `buildTextFieldsGenerationSchema`. Misleading (returns `null` if any field is data). **Delete.**
- **`sectionSchema`** static export (`section.schema.ts:151`) — a frozen built-ins-only snapshot that will silently miss authored types if misused. **Rename `builtInSectionSchema` or remove**; expose only `buildSectionSchema`.
- **`getTemplate`** in `packages/shared/src/templates/registry.ts` — only sees in-code templates, superseded by the server-side merged registry. **Rename `getBuiltInTemplate` or remove from public API.**
- **`PAGE`** back-compat alias (`render/page.ts`) — remove if only legacy tests import it.
- **`DEFAULT_OWNER`** (`repo/index.ts:27`) — pre-auth stub; move to test setup only.
- **Dynamic `require()`** in `repo/index.ts:14` (ESM file, needs an eslint-disable) — convert `getRepo()` to async `import()`.
- **`docs/plans/` accumulation** — 20+ AI planning artefacts tracked in git with no lifecycle. Archive or move under the `.git/sdd/` convention.

---

## 6. What is genuinely strong — do not regress these

- The three-layer invariant and the registry-derived schema (no drift).
- The closed-`switch` layout interpreter (no code-exec sinks) and token-only styling.
- Export-gate limit enforcement (verified solid).
- TypeScript strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) with ~2 production escape hatches total.
- Behavioural, low-mock test suite; clean `Repository` abstraction; correct render-token crypto (HMAC + `timingSafeEqual` + short TTL); correct per-section regen merge.

---

# Part II — Enterprise Roadmap

Goal: take the tool to **enterprise grade in performance, product fit, and usability** without sacrificing the architectural invariants. Five phases, ordered by risk-reduction-per-effort. Each phase is independently shippable and closes a named set of findings. Effort is relative (S ≈ ½–1 day, M ≈ 2–4 days, L ≈ 1–2 weeks).

### Phase 0 — Stop the bleeding (1–2 days, do first)
*Closes: C-1, C-2, H-2, H-3, H-4, M-10*
1. **PDF readiness fix** (C-1): real `await page.evaluate(()=>document.fonts.ready)` + chart-paint wait. **S** — highest correctness ROI in the codebase.
2. **AI robustness wrapper** (C-2, H-2): one `anthropicCreateMessage` that handles `stop_reason`, derives `max_tokens` from schema, retries 429/5xx, logs usage, and sanitises errors. **M**
3. **Input/upload size guards** (H-3, H-4): shared `validateGenerationInput` + `file.size` gates. **S**
4. **Throw on missing `AUTH_SECRET` in prod** (M-10). **S**

### Phase 1 — Engineering foundation (2–4 days)
*Closes: H-1, plus tooling gaps; protects everything after.*
1. **GitHub Actions CI**: typecheck + test + build on push/PR; block deploy on red. **S**
2. **ESLint (flat config, type-checked) + Prettier + lint-staged + Husky pre-commit.** **M**
3. **Add `tsc -p apps/web/tsconfig.json` to `typecheck`** (production config currently only checked via the test tsconfig). **S**
4. **Coverage** (`@vitest/coverage-v8`) with a ratchet; **pin `next-auth`** to an exact beta; **README + runbook** (CLAUDE.md still says `Commands: TBD`). **S–M**

### Phase 2 — Production hardening: security, data, observability (1 week)
*Closes: H-5, H-6, H-7, M-1, M-2, M-5, M-6, M-11, M-12*
1. **Auth**: async password hashing (H-7); session revocation on disable (H-5); rate limiting on auth + generation (M-2). **M**
2. **Data**: index migration (H-6); `updatedAt` on meta update + transactional snapshot (M-6); registry TTL/invalidation (M-5); repo de-dup + typed `executeRaw` (M-11); `patchUser` (M-12). **M**
3. **Observability**: structured logging + request ids + AI usage/latency metrics (M-1); error tracking (e.g. Sentry); a `/health` and basic dashboards. **M**

### Phase 3 — Workflow & UX leveling (1–2 weeks)
*Closes: H-8, M-3, M-7, M-8, M-9, and the workflow-friction list; this is where "user-friendly" is won.*
1. **Undo/redo** (`zundo`) with keyboard shortcuts (M-7). **M**
2. **Section reordering** (drag or up/down) — currently impossible without delete+re-insert. **M**
3. **Selector-perf refactor** (H-8): narrow slices + `useShallow`; split the two god components (`Inspector` 402 → DocumentPane/BriefPane/SectionPane/FieldArea; `LayoutEditor` 416 → BlockTree/BlockStylePanel/shell). **M–L**
4. **Replace native dialogs with modals** (M-8); **per-field AI busy state + optimistic skeletons**; **parallelise bulk generation** (M-3); **keyboard navigation in the Outline**. **M**
5. **Editor polish**: controlled Monaco theme editor (L-6), in-UI export errors (L-7), blank default doc (L-9), stable row keys (L-10), auth redirect on `/p/[id]` (L-11).

### Phase 4 — Enterprise product-fit (2–4 weeks, scope to demand)
*The dead-end to break for selling into organisations.*
1. **Multi-tenant / workspaces**: introduce `workspace_id` on owned resources and a `workspace_members(user_id, workspace_id, role)` table; migrate `owner_id` → workspace scoping. This is a **breaking schema change** — design it once, deliberately. **L**
2. **RBAC beyond admin/owner**: viewer / editor / approver roles; per-folder or per-proposal sharing; client-preview (read-only) links built on the existing render-token pattern. **L**
3. **Audit log** (`audit_events`): who changed what, role changes, exports — table-stakes for SOC 2 / procurement. **M**
4. **Soft-delete + version retention policy** (bounded `proposal_versions` growth; restore from trash). **M**
5. **Asset hardening**: content-type/size validation, virus scan hook, signed asset URLs, SSRF guards on any URL ingestion. **M**

### Phase 5 — Differentiators (ongoing)
*Lean into the three goals as competitive edges.*
1. **AI quality**: token-streaming into the editor (perceived latency), brand-aware prompts (feed theme/voice into generation), section-level "improve/shorten/expand" quick actions, and `messages.parse()` for SDK-level schema validation. Consider Fable 5 with server-side refusal fallbacks for the hardest drafts.
2. **Brand kit management**: first-class brand kits (logo, palette, type, voice) as reusable theme bundles; "apply brand kit" across a proposal in one action — directly serves brand consistency at scale.
3. **Template & layout marketplace** (internal): the authoring system already supports this safely; add discovery, preview, and versioning UI on top of the merged registry.
4. **Analytics**: proposal engagement (if hosted previews), generation cost dashboards, win-rate hooks.

### Suggested sequencing
**Phase 0 → 1 immediately and together** (a week): they make every subsequent change safe and fix the two real correctness bugs. **Phase 2** before any real customer load. **Phase 3** as the headline "v2 editor" release. **Phase 4** when a multi-seat/enterprise deal is in sight (don't pay the multi-tenant tax early — but design the schema migration before the user table grows). **Phase 5** continuously.

### Refactors/reorg explicitly recommended (justified)
- **Split the two god components** (Inspector, LayoutEditor) — both exceed 400 LOC and re-render too broadly; the split also reduces selector scope (Phase 3.3).
- **Centralise the AI call** into one robust wrapper (Phase 0.2) — removes the single riskiest 12-line function.
- **De-duplicate the repo layer** and add a typed driver-unwrap (Phase 2.2) — kills drift risk between memory/postgres and a latent driver-upgrade bug.
- **Delete the dead exports** in §5 — they are active footguns (silently-wrong validation), not just clutter.
- **Add a `typography` token group** (or formally document the fixed values) so re-theming is complete (L-2).

---

## Appendix — finding index

| ID | Sev | Area | File |
|---|---|---|---|
| C-1 | Critical | PDF font/chart race | `server/pdf/renderProposalPdf.ts:17` |
| C-2 | Critical | AI stop_reason/max_tokens | `server/anthropic.ts:19,25` |
| H-1 | High | No CI | (repo) |
| H-2 | High | No AI retry / leaked errors | `server/anthropic.ts`, `generateSection.ts:74` |
| H-3 | High | No AI input size limits | `api/generate/*`, `api/refine/section/route.ts:36` |
| H-4 | High | No upload/import size limits | `api/assets`, `api/data/import` |
| H-5 | High | No session revocation on disable | `server/auth/*` |
| H-6 | High | Missing DB indexes | `server/db/schema.ts` |
| H-7 | High | Blocking scryptSync | `server/auth/password.ts:12,21` |
| H-8 | High | Inspector selector over-subscription | `ui/Inspector.tsx:34` |
| M-1 | Med | No observability | `server/anthropic.ts` |
| M-2 | Med | No rate limiting | `api/*` |
| M-3 | Med | Sequential bulk generation | `api/generate/proposal/route.ts` |
| M-4 | Med | refine bypasses model policy | `api/refine/section/route.ts:24` |
| M-5 | Med | Global mutable registries / no TTL | `server/registry/*`, `validateSection.ts:9` |
| M-6 | Med | Non-tx snapshot / stale updatedAt | `server/repo/postgres.ts`, `memory.ts` |
| M-7 | Med | No undo/redo | `state/*` |
| M-8 | Med | Native dialogs | `Dashboard.tsx`, `Outline.tsx` |
| M-9 | Med | Client PrintDocument in RSC route | `print/PrintDocument.tsx` |
| M-10 | Med | Render-secret fallback | `server/auth/renderToken.ts` |
| M-11 | Med | Repo dup / brittle driver unwrap | `server/repo/*` |
| M-12 | Med | Non-atomic user PATCH | `api/users/[id]/route.ts` |
| L-1…L-11 | Low | see §4.4 | — |

*Severities are the reviewer's consolidated post-verification judgement. The reported export-gate "Criticals" were verified false and dismissed (see §3).*
