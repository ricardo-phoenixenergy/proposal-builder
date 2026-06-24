# Audit Phase 0 — Production Hardening & Guardrails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two verified Critical correctness bugs (PDF font/chart race, AI `stop_reason`/`max_tokens` blindness) and the highest-RO1 robustness/security gaps from `AUDIT_REVIEW.md`, then stand up the CI guardrail that protects every change after.

**Architecture:** Surgical, additive fixes that preserve the three-layer invariant and the existing test seams (injectable `CreateMessageFn`, injectable `BrowserLauncher`, `setRepoForTests`/`setOwnerResolverForTests`). New pure helpers are unit-tested in isolation; thin SDK/Chromium glue stays behind its injection seam. No schema/DB migration in this phase.

**Tech Stack:** Next 15 (App Router) · React 19 · TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) · Vitest 2 · `@anthropic-ai/sdk` · `puppeteer-core` + `@sparticuz/chromium-min` · Drizzle/Neon (untouched here).

## Global Constraints

- Commands at REPO ROOT: single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`.
- This IS a git repo (the env banner wrongly says otherwise). Work on a branch off `main`. Commit per task.
- TypeScript strict; **module imports are extensionless** (no `.js`). `as unknown as X` / `path[i]!` are the project-standard strict escape hatches — use them, do not loosen tsconfig.
- vitest does NOT typecheck — run `npm run typecheck` before every commit; it must report 0 errors.
- **Do not break the three-layer invariant**, the export-gate behaviour, or the injectable test seams. No new runtime dependencies without calling it out in the task.
- Preserve existing public behaviour of routes except where a task explicitly changes it; update any test whose contract a task intentionally changes, in the same task.

---

### Task 1: Fix the PDF font/chart readiness race + page format (Critical C-1, Low L-1)

**Files:**
- Modify: `apps/web/src/server/pdf/renderProposalPdf.ts`
- Modify: `apps/web/app/api/proposals/[id]/export/route.ts`
- Modify: `apps/web/src/__tests__/slice-09-export.test.ts` (call-site assertion changed by the new signature)
- Test: `apps/web/src/__tests__/slice-25-pdf-readiness.test.ts` (new, node env, fake launcher)

**Interfaces:**
- Produces: `renderUrlToPdf(url: string, fmt: PageFormat, launch?: BrowserLauncher): Promise<Uint8Array>` — now takes the resolved `PageFormat` so the PDF sheet size is correct and explicit (no hardcoded `"A4"`), and genuinely awaits `document.fonts.ready`.
- Consumes: `PageFormat`, `getPageFormat` from `@proposal/shared`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/__tests__/slice-25-pdf-readiness.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getPageFormat } from "@proposal/shared";
import { renderUrlToPdf } from "../server/pdf/renderProposalPdf";
import type { BrowserLauncher } from "../server/pdf/launcher";

function fakeLauncher() {
  const calls = { evaluated: [] as unknown[], pdfOpts: undefined as unknown };
  const page = {
    goto: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    // genuine await path: render code must call page.evaluate (not evaluateHandle) for fonts.ready
    evaluate: vi.fn(async (fn: unknown) => { calls.evaluated.push(fn); return undefined; }),
    pdf: vi.fn(async (opts: unknown) => { calls.pdfOpts = opts; return new Uint8Array([0x25, 0x50, 0x44, 0x46]); }),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
  const launch = (async () => browser) as unknown as BrowserLauncher;
  return { launch, calls, page, browser };
}

describe("renderUrlToPdf — readiness & format", () => {
  it("awaits document.fonts.ready via page.evaluate and sizes the PDF from the format", async () => {
    const { launch, calls, page, browser } = fakeLauncher();
    const fmt = getPageFormat("widescreen_16_9"); // 338.67 x 190.5 mm

    const out = await renderUrlToPdf("http://x/print/p1?t=tok", fmt, launch);

    expect(out).toBeInstanceOf(Uint8Array);
    expect(page.waitForSelector).toHaveBeenCalledWith('[data-print-ready="true"]', expect.anything());
    expect(calls.evaluated.length).toBeGreaterThanOrEqual(1); // fonts.ready awaited through evaluate
    expect(calls.pdfOpts).toMatchObject({ width: "338.67mm", height: "190.5mm", printBackground: true });
    expect(browser.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-pdf-readiness.test.ts`
Expected: FAIL — current `renderUrlToPdf` takes only `(url, launch)`, calls `evaluateHandle` (not `evaluate`), and passes `{ format: "A4" }`.

- [ ] **Step 3: Rewrite `renderProposalPdf.ts`**

```ts
import type { PageFormat } from "@proposal/shared";
import { launchBrowser, type BrowserLauncher } from "./launcher";

/**
 * Render a print URL to a PDF with headless Chromium. Waits for the page's
 * readiness flag AND genuinely awaits font loading (page.evaluate resolves the
 * fonts.ready Promise — evaluateHandle would only hand back the unresolved
 * Promise), then sizes the sheet from the document's page format. The launcher
 * is injectable so the orchestration is testable without Chromium.
 */
export async function renderUrlToPdf(
  url: string,
  fmt: PageFormat,
  launch: BrowserLauncher = launchBrowser,
): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForSelector('[data-print-ready="true"]', { timeout: 30_000 });
    // Genuinely block on font load (charts/SVG are painted by the print page before
    // it sets data-print-ready; fonts can still be resolving).
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      width: `${fmt.widthMm}mm`,
      height: `${fmt.heightMm}mm`,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Update the export route to pass the format**

In `apps/web/app/api/proposals/[id]/export/route.ts`:
- Add to the `@proposal/shared` import: `getPageFormat`.
- Replace the render call:
```ts
  const fmt = getPageFormat(stored.document.pageFormat);
  const pdf = await renderUrlToPdf(`${origin}/print/${id}?t=${encodeURIComponent(token)}`, fmt);
```

- [ ] **Step 5: Update the slice-09 call-site assertion**

In `apps/web/src/__tests__/slice-09-export.test.ts`, the mock’s call assertion now receives a second arg. Change line ~49 to:
```ts
    expect(renderUrlToPdf).toHaveBeenCalledWith(expect.stringContaining(`/print/${created.id}`), expect.objectContaining({ widthMm: expect.any(Number) }));
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-pdf-readiness.test.ts apps/web/src/__tests__/slice-09-export.test.ts apps/web/src/__tests__/slice-13-export-authored-template.test.ts`
Expected: PASS. Then `npm run typecheck` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/pdf/renderProposalPdf.ts apps/web/app/api/proposals/[id]/export/route.ts apps/web/src/__tests__/slice-09-export.test.ts apps/web/src/__tests__/slice-25-pdf-readiness.test.ts
git commit -m "fix(pdf): await document.fonts.ready and size PDF from page format (C-1, L-1)"
```

---

### Task 2: `estimateMaxOutputTokens(typeSchema)` shared helper (supports C-2)

**Files:**
- Create: `packages/shared/src/generation/maxTokens.ts`
- Modify: `packages/shared/src/index.ts` (export it)
- Test: `packages/shared/src/__tests__/slice-25-max-tokens.test.ts`

**Interfaces:**
- Produces: `estimateMaxOutputTokens(typeSchema: SectionTypeSchema): number` — sums the AI-composable fields' character budgets (`maxChars`, else `maxWords*6`, else a 600-char default), converts chars→tokens (≈ /3.5), adds 256 JSON-overhead, clamps to `[1024, 8192]`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-25-max-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { estimateMaxOutputTokens } from "../generation/maxTokens";
import type { SectionTypeSchema } from "../types/section";

const t = (fields: SectionTypeSchema["fields"]): SectionTypeSchema => ({
  type: "x", label: "X", category: "text", fields, variants: [], schemaVersion: 1,
});

describe("estimateMaxOutputTokens", () => {
  it("clamps tiny schemas up to the 1024 floor", () => {
    expect(estimateMaxOutputTokens(t([{ key: "title", type: "text", maxChars: 80 }]))).toBe(1024);
  });

  it("scales with the summed character budget of AI fields", () => {
    const big = estimateMaxOutputTokens(t([
      { key: "a", type: "paragraph", maxWords: 400 }, // ~2400 chars
      { key: "b", type: "paragraph", maxWords: 400 },
    ]));
    expect(big).toBeGreaterThan(1024);
    expect(big).toBeLessThanOrEqual(8192);
  });

  it("ignores non-AI (data/image) fields", () => {
    const withData = estimateMaxOutputTokens(t([
      { key: "p", type: "paragraph", maxWords: 100 },
      { key: "grid", type: "dataset", maxRows: 999 },
      { key: "logo", type: "image" },
    ]));
    const textOnly = estimateMaxOutputTokens(t([{ key: "p", type: "paragraph", maxWords: 100 }]));
    expect(withData).toBe(textOnly);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-25-max-tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/generation/maxTokens.ts`:

```ts
import type { SectionTypeSchema } from "../types/section";
import { fieldKind } from "./generationSchema";

const CHARS_PER_TOKEN = 3.5;
const JSON_OVERHEAD_TOKENS = 256;
const FLOOR = 1024;
const CEILING = 8192;
const DEFAULT_FIELD_CHARS = 600;

/**
 * Estimate a safe `max_tokens` for generating one section's data, derived from
 * the section's own field limits so multi-paragraph types don't truncate.
 * Only AI-composable fields contribute (data/image fields aren't generated).
 */
export function estimateMaxOutputTokens(typeSchema: SectionTypeSchema): number {
  let chars = 0;
  for (const field of typeSchema.fields) {
    if (fieldKind(field) !== "ai") continue;
    chars += field.maxChars ?? (field.maxWords !== undefined ? field.maxWords * 6 : DEFAULT_FIELD_CHARS);
  }
  const tokens = Math.ceil(chars / CHARS_PER_TOKEN) + JSON_OVERHEAD_TOKENS;
  return Math.min(CEILING, Math.max(FLOOR, tokens));
}
```

- [ ] **Step 4: Export it**

In `packages/shared/src/index.ts`, alongside the other generation exports, add:
```ts
export { estimateMaxOutputTokens } from "./generation/maxTokens";
```

- [ ] **Step 5: Test + typecheck**

Run: `npx vitest run packages/shared/src/__tests__/slice-25-max-tokens.test.ts` → PASS. `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/generation/maxTokens.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-25-max-tokens.test.ts
git commit -m "feat(ai): estimateMaxOutputTokens derives max_tokens from section limits (C-2)"
```

---

### Task 3: `interpretAnthropicResponse` — pure stop_reason handling (Critical C-2)

**Files:**
- Create: `apps/web/src/server/anthropicResponse.ts`
- Test: `apps/web/src/__tests__/slice-25-anthropic-interpret.test.ts`

**Interfaces:**
- Produces: `interpretAnthropicResponse(res: AnthropicLike): string` — returns joined text for a normal stop; throws a **friendly, user-safe** `Error` for `refusal`, `max_tokens`, or empty content. `AnthropicLike = { stop_reason?: string | null; content: { type: string; text?: string }[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-anthropic-interpret.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { interpretAnthropicResponse } from "../server/anthropicResponse";

const txt = (s: string) => ({ type: "text", text: s });

describe("interpretAnthropicResponse", () => {
  it("returns joined text for a normal end_turn", () => {
    expect(interpretAnthropicResponse({ stop_reason: "end_turn", content: [txt("{\"a\":1}")] })).toBe('{"a":1}');
  });
  it("throws a length-limit message on max_tokens", () => {
    expect(() => interpretAnthropicResponse({ stop_reason: "max_tokens", content: [txt("{trunc")] }))
      .toThrowError(/length limit/i);
  });
  it("throws a refusal message on refusal", () => {
    expect(() => interpretAnthropicResponse({ stop_reason: "refusal", content: [] }))
      .toThrowError(/declined/i);
  });
  it("throws on empty text content", () => {
    expect(() => interpretAnthropicResponse({ stop_reason: "end_turn", content: [] }))
      .toThrowError(/empty/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-anthropic-interpret.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/server/anthropicResponse.ts`:

```ts
export interface AnthropicLike {
  stop_reason?: string | null;
  content: { type: string; text?: string }[];
}

/**
 * Turn a Messages response into JSON text, or throw a user-safe error.
 * Surfaces the two silent-failure modes the old code missed: truncation
 * (max_tokens) and refusal. Messages here are safe to show a user.
 */
export function interpretAnthropicResponse(res: AnthropicLike): string {
  if (res.stop_reason === "refusal") {
    throw new Error("The model declined to generate this content. Try rephrasing the brief.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("The response hit the length limit. Shorten the brief or reduce the section's fields, then retry.");
  }
  const text = res.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  if (text.trim() === "") {
    throw new Error("The model returned an empty response. Please retry.");
  }
  return text;
}
```

- [ ] **Step 4: Test + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-anthropic-interpret.test.ts` → PASS. `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/anthropicResponse.ts apps/web/src/__tests__/slice-25-anthropic-interpret.test.ts
git commit -m "feat(ai): interpretAnthropicResponse surfaces refusal/max_tokens/empty (C-2)"
```

---

### Task 4: Wire the robust AI wrapper (Critical C-2; High H-2; Medium M-1, M-4)

**Files:**
- Modify: `apps/web/src/server/anthropic.ts`
- Create: `apps/web/src/server/observability.ts`
- Modify: `apps/web/src/server/generateSection.ts` (extend `CreateMessageFn`, pass `maxOutputTokens`)
- Modify: `apps/web/src/server/generateField.ts` (pass `maxOutputTokens`)
- Modify: `apps/web/app/api/refine/section/route.ts` (use `getActiveModel`, drop client `model` — M-4)
- Test: `apps/web/src/__tests__/slice-25-generate-robust.test.ts`

**Interfaces:**
- `CreateMessageFn` args gain `maxOutputTokens: number`.
- `generateSection`/`generateField` compute it via `estimateMaxOutputTokens(typeSchema)` and pass it.
- `anthropicCreateMessage`: client built with `maxRetries: 3` (SDK exponential backoff on 429/5xx — closes H-2 retry); `max_tokens` from `maxOutputTokens`; result via `interpretAnthropicResponse`; logs `{model, input_tokens, output_tokens, stop_reason, latencyMs}` via `logAiCall`; catches **unexpected** (non-interpreted) errors, logs them server-side, and rethrows a generic "AI service is temporarily unavailable" (closes H-2 leak).

- [ ] **Step 1: Write the failing test** (drives the signature + error flow through `generateSection`)

Create `apps/web/src/__tests__/slice-25-generate-robust.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";
import { generateSection, type CreateMessageFn } from "../server/generateSection";

const cover: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", maxChars: 80 }], variants: [], schemaVersion: 1,
};

describe("generateSection robustness", () => {
  it("passes a maxOutputTokens derived from the schema to the create fn", async () => {
    resetSectionTypesForTests(); setActiveSectionTypes([cover]);
    const create = vi.fn(async () => '{"title":"Hi"}') as unknown as CreateMessageFn;
    await generateSection({ type: "cover", brief: "b" }, create);
    const arg = (create as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0] as { maxOutputTokens?: number };
    expect(typeof arg.maxOutputTokens).toBe("number");
    expect(arg.maxOutputTokens).toBeGreaterThanOrEqual(1024);
    resetSectionTypesForTests();
  });

  it("surfaces a friendly error when the create fn throws (e.g. length limit)", async () => {
    resetSectionTypesForTests(); setActiveSectionTypes([cover]);
    const create = (async () => { throw new Error("The response hit the length limit. Shorten the brief or reduce the section's fields, then retry."); }) as unknown as CreateMessageFn;
    const res = await generateSection({ type: "cover", brief: "b" }, create);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/length limit/i);
    resetSectionTypesForTests();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-generate-robust.test.ts`
Expected: FAIL — `maxOutputTokens` is not yet on the create-fn args.

- [ ] **Step 3: Extend `CreateMessageFn` and pass `maxOutputTokens` in `generateSection`**

In `apps/web/src/server/generateSection.ts`:
- Add `estimateMaxOutputTokens` to the `@proposal/shared` import.
- Add `maxOutputTokens: number;` to the `CreateMessageFn` args type.
- In the `createMessage({ ... })` call, add `maxOutputTokens: estimateMaxOutputTokens(typeSchema),`.

- [ ] **Step 4: Pass `maxOutputTokens` in `generateField.ts`**

In `apps/web/src/server/generateField.ts`, where it calls the create fn, add `maxOutputTokens: estimateMaxOutputTokens(typeSchema),` (import `estimateMaxOutputTokens` from `@proposal/shared`; the field path can reuse the section type's estimate — a single field is always within it).

- [ ] **Step 5: Create the observability seed**

Create `apps/web/src/server/observability.ts`:

```ts
/** Minimal structured logging seed (M-1). One line per AI call; JSON for log processors. */
export function logAiCall(event: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  stopReason?: string | null;
  latencyMs: number;
  ok: boolean;
}): void {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ kind: "ai_call", ...event }));
}
```

- [ ] **Step 6: Rewrite `anthropic.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { CreateMessageFn } from "./generateSection";
import { interpretAnthropicResponse } from "./anthropicResponse";
import { logAiCall } from "./observability";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY from the server environment — never the browser (§3, §10.1).
  // maxRetries gives exponential backoff on 429/5xx (H-2).
  if (!client) client = new Anthropic({ maxRetries: 3 });
  return client;
}

export const anthropicCreateMessage: CreateMessageFn = async ({ model, system, user, schema, maxOutputTokens }) => {
  const startedAt = Date.now();
  try {
    const response = await getClient().messages.create({
      model,
      max_tokens: maxOutputTokens,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    const text = interpretAnthropicResponse(response);
    logAiCall({
      model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      stopReason: response.stop_reason,
      latencyMs: Date.now() - startedAt,
      ok: true,
    });
    return text;
  } catch (e) {
    logAiCall({ model, latencyMs: Date.now() - startedAt, ok: false });
    // interpret* errors are already user-safe; rethrow them verbatim. Anything
    // else (network/SDK) is logged above and replaced with a generic message (H-2).
    if (e instanceof Error && /declined|length limit|empty response/i.test(e.message)) throw e;
    throw new Error("The AI service is temporarily unavailable. Please try again.");
  }
};
```

- [ ] **Step 7: Close the refine model bypass (M-4)**

In `apps/web/app/api/refine/section/route.ts`:
- Add import: `import { getActiveModel } from "../../../../src/server/aiModel";`
- Remove `model` from the destructured body and from the `generateSection` call; instead:
```ts
  const model = await getActiveModel();
  const result = await generateSection(
    { type, brief, model, ...(sectionId !== undefined ? { sectionId } : {}) },
    anthropicCreateMessage,
  );
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-generate-robust.test.ts apps/web/src/__tests__/slice-06-generation.test.ts` and any existing generate/refine route tests (e.g. `npx vitest run apps/web/src/__tests__ -t generate`). All PASS. `npm run typecheck` → 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/server/anthropic.ts apps/web/src/server/anthropicResponse.ts apps/web/src/server/observability.ts apps/web/src/server/generateSection.ts apps/web/src/server/generateField.ts apps/web/app/api/refine/section/route.ts apps/web/src/__tests__/slice-25-generate-robust.test.ts
git commit -m "feat(ai): robust create wrapper — retries, stop_reason, usage log, sanitized errors; refine uses admin model (C-2,H-2,M-1,M-4)"
```

---

### Task 5: AI input-size guards (High H-3)

**Files:**
- Create: `packages/shared/src/generation/inputLimits.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/app/api/generate/section/route.ts`, `apps/web/app/api/generate/field/route.ts`, `apps/web/app/api/generate/proposal/route.ts`, `apps/web/app/api/refine/section/route.ts`
- Test: `apps/web/src/__tests__/slice-25-input-limits.test.ts`

**Interfaces:**
- Produces: constants `MAX_BRIEF_CHARS = 6000`, `MAX_INSTRUCTION_CHARS = 2000`, `MAX_DATA_CHARS = 20000`; and `checkGenerationInput({brief?, instruction?, data?}): string | null` returning an error string or `null`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-input-limits.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as genSection } from "../../app/api/generate/section/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/generate/section", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

describe("generation input limits", () => {
  it("400s an over-long brief before calling the model", async () => {
    const res = await genSection(req({ type: "cover", brief: "x".repeat(6001) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-input-limits.test.ts`
Expected: FAIL — currently a 6001-char brief is accepted (would reach the model or 422 later, not 400).

- [ ] **Step 3: Implement the shared guard**

Create `packages/shared/src/generation/inputLimits.ts`:

```ts
export const MAX_BRIEF_CHARS = 6000;
export const MAX_INSTRUCTION_CHARS = 2000;
export const MAX_DATA_CHARS = 20000;

/** Returns an error message if any generation input exceeds its cap, else null. */
export function checkGenerationInput(input: {
  brief?: string;
  instruction?: string;
  data?: unknown;
}): string | null {
  if (input.brief !== undefined && input.brief.length > MAX_BRIEF_CHARS) {
    return `Brief is too long (max ${MAX_BRIEF_CHARS} characters).`;
  }
  if (input.instruction !== undefined && input.instruction.length > MAX_INSTRUCTION_CHARS) {
    return `Instruction is too long (max ${MAX_INSTRUCTION_CHARS} characters).`;
  }
  if (input.data !== undefined && JSON.stringify(input.data).length > MAX_DATA_CHARS) {
    return `Section data is too large (max ${MAX_DATA_CHARS} characters).`;
  }
  return null;
}
```

Export from `packages/shared/src/index.ts`:
```ts
export { checkGenerationInput, MAX_BRIEF_CHARS, MAX_INSTRUCTION_CHARS, MAX_DATA_CHARS } from "./generation/inputLimits";
```

- [ ] **Step 4: Apply at each route** (after the existing body-shape `400`, before any model call)

In `generate/section/route.ts`, `generate/field/route.ts`, `generate/proposal/route.ts`, and `refine/section/route.ts`, add `checkGenerationInput` to the `@proposal/shared` import and, immediately after the body is destructured, insert:
```ts
  const limitError = checkGenerationInput({ brief, instruction, data });
  if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });
```
(Use only the variables each route actually has — e.g. the field route passes `{ instruction }` plus its `brief`/`currentValue` equivalent; the proposal route passes `{ brief }`; refine passes `{ instruction, data }`. Pass `undefined` for absent ones — the guard skips them.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-input-limits.test.ts` plus the existing generate/refine route tests. PASS. `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/generation/inputLimits.ts packages/shared/src/index.ts apps/web/app/api/generate apps/web/app/api/refine apps/web/src/__tests__/slice-25-input-limits.test.ts
git commit -m "feat(ai): enforce brief/instruction/data size limits at the route layer (H-3)"
```

---

### Task 6: Upload & CSV import size guards (High H-4)

**Files:**
- Modify: `apps/web/app/api/assets/route.ts`, `apps/web/app/api/data/import/route.ts`
- Test: `apps/web/src/__tests__/slice-25-upload-limits.test.ts`

**Interfaces:**
- `assets`: reject `file.size > MAX_IMAGE_BYTES (10 MB)` with 413. `data/import`: reject `file.size > MAX_CSV_BYTES (5 MB)` with 413. Constants local to each route.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-upload-limits.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as importCsv } from "../../app/api/data/import/route";

beforeEach(() => setOwnerResolverForTests(async () => "owner_local"));
afterEach(() => setOwnerResolverForTests(null));

function bigCsvForm(bytes: number): Request {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], "big.csv", { type: "text/csv" }));
  return new Request("http://localhost/api/data/import", { method: "POST", body: fd });
}

describe("upload/import size limits", () => {
  it("413s a CSV over the cap before parsing", async () => {
    const res = await importCsv(bigCsvForm(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-upload-limits.test.ts`
Expected: FAIL — the route reads the file regardless of size.

- [ ] **Step 3: Add the guards**

In `data/import/route.ts`, after the `instanceof File` check:
```ts
  const MAX_CSV_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV is too large (max 5 MB)." }, { status: 413 });
  }
```
In `assets/route.ts`, after the `image/` type check:
```ts
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 10 MB)." }, { status: 413 });
  }
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-upload-limits.test.ts` plus existing asset/import tests. PASS. `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/assets/route.ts apps/web/app/api/data/import/route.ts apps/web/src/__tests__/slice-25-upload-limits.test.ts
git commit -m "feat(api): reject oversized image/CSV uploads with 413 (H-4)"
```

---

### Task 7: Fail fast on a missing render secret in production (Medium M-10)

**Files:**
- Modify: `apps/web/src/server/auth/renderToken.ts`
- Test: `apps/web/src/__tests__/slice-25-render-secret.test.ts`

**Interfaces:**
- The render-token secret resolution throws in production when `AUTH_SECRET` is unset, instead of silently using the dev fallback.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-25-render-secret.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("render token secret", () => {
  it("throws in production when AUTH_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    const mod = await import("../server/auth/renderToken");
    expect(() => mod.mintRenderToken("p1")).toThrowError(/AUTH_SECRET/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-25-render-secret.test.ts`
Expected: FAIL — current code falls back to `"dev-only-render-secret"`.

- [ ] **Step 3: Implement**

In `apps/web/src/server/auth/renderToken.ts`, replace the secret resolution with a function that guards production. Current pattern is roughly `const SECRET = process.env.AUTH_SECRET ?? "dev-only-render-secret";`. Replace with:

```ts
function renderSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length > 0) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production (render token signing).");
  }
  return "dev-only-render-secret";
}
```
Call `renderSecret()` where the constant was used (in `mintRenderToken` and `verifyRenderToken`), so the guard runs per call rather than at module load (keeps the dev/test path lazy).

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run apps/web/src/__tests__/slice-25-render-secret.test.ts` plus the existing render-token test. PASS. `npm run typecheck` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/auth/renderToken.ts apps/web/src/__tests__/slice-25-render-secret.test.ts
git commit -m "fix(auth): fail fast when AUTH_SECRET is missing in production (M-10)"
```

---

### Task 8: CI workflow + production-config typecheck + pin next-auth (High H-1)

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: root `package.json` (typecheck script; pin `next-auth`)
- Modify: `apps/web/package.json` (pin `next-auth`)

**Interfaces:**
- CI runs `typecheck`, `test`, `build` on push + PR to `main`. The `typecheck` script additionally checks the production `apps/web/tsconfig.json` (currently only the test tsconfig is checked — M4 in the audit).

- [ ] **Step 1: Add the production tsconfig to the typecheck script**

In root `package.json`, change the `typecheck` script to also check the app's production config:
```json
"typecheck": "tsc --noEmit -p packages/shared/tsconfig.json && tsc --noEmit -p apps/web/tsconfig.json && tsc --noEmit -p apps/web/tsconfig.test.json"
```
Run `npm run typecheck`. If the production config surfaces NEW errors (it covers `app/` runtime files), fix them within this task; if there are many and they are pre-existing/unrelated, record them and narrow this step to keep the task shippable (note any deferral in the commit body).

- [ ] **Step 2: Pin `next-auth`** (M3 in the audit — remove the `^` so the beta can't drift)

In both root and `apps/web` `package.json`, change `"next-auth": "^5.0.0-beta.31"` to `"next-auth": "5.0.0-beta.31"`. Run `npm install` to update the lockfile.

- [ ] **Step 3: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build -w @proposal/web
        env:
          # Build-time placeholders; real values come from Vercel project settings.
          AUTH_SECRET: ci-placeholder-secret-not-used-at-runtime
```

- [ ] **Step 4: Validate locally**

Run `npm run typecheck && npm test && npm run build -w @proposal/web` from the repo root to confirm the exact CI command sequence is green locally. (If the build needs an env var the workflow doesn't provide, add it to the workflow `env:` with a non-secret placeholder.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml package.json apps/web/package.json package-lock.json
git commit -m "ci: add typecheck+test+build workflow; check prod tsconfig; pin next-auth (H-1)"
```

---

### Task 9: Minimal README + runbook (Low — closes the "Commands: TBD" gap)

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (replace the `TBD` command placeholders)

- [ ] **Step 1: Write `README.md`**

Create a root `README.md` covering: one-paragraph product summary; prerequisites (Node 20, a Neon `DATABASE_URL`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`, a local Chrome via `PUPPETEER_EXECUTABLE_PATH` for PDF); install (`npm install`); dev (`npm run dev`); test (`npm test`); typecheck (`npm run typecheck`); build (`npm run build -w @proposal/web`); DB migrate (`npm run db:generate -w @proposal/web` then `db:migrate`); create a user (`npm run user:create -w @proposal/web`); and a pointer to `docs/specs/` and `AUDIT_REVIEW.md`.

- [ ] **Step 2: Update `CLAUDE.md` commands**

Replace the `## Commands` `TBD` values with the real commands from Step 1.

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add README + runbook; fill in real commands"
```

---

## Self-Review

**1. Spec/audit coverage:** Closes verified Criticals C-1 (Task 1) and C-2 (Tasks 2–4); Highs H-1 (Task 8), H-2 (Task 4), H-3 (Task 5), H-4 (Task 6); Mediums M-1 (Task 4 seed), M-4 (Task 4), M-10 (Task 7); audit-doc M3/M4 tooling (Task 8); the README gap (Task 9). Deferred to their own later plans (noted, not built ahead): H-5 session revocation, H-6 indexes, H-7 async hashing, H-8 selector perf, M-2 rate limiting, M-3 parallel generation, M-5 registry TTL, M-6 snapshot/updatedAt, M-7 undo, M-8 dialogs, M-9 RSC print, M-11 repo dedup, M-12 user patch — plus the ESLint/Prettier/husky/coverage tail of audit Phase 1, and Phases 2–5.

**2. Placeholder scan:** Every code step contains real code. Task 8 Step 1 and Task 9 are the only judgement-bearing steps (prod-tsconfig may surface pre-existing errors; README prose) — both carry explicit instructions for scoping.

**3. Type consistency:** `CreateMessageFn` gains `maxOutputTokens: number` (Task 4) consumed by `anthropicCreateMessage` and supplied by `generateSection`/`generateField` via `estimateMaxOutputTokens` (Task 2). `interpretAnthropicResponse` (Task 3) is consumed only by `anthropicCreateMessage` (Task 4). `checkGenerationInput` (Task 5) and the upload constants (Task 6) are self-contained. `renderUrlToPdf`’s new `(url, fmt, launch?)` signature (Task 1) is updated at its only call site (export route) and its only mock assertion (slice-09). Friendly-error strings in Task 3 match the regex the Task-4 wrapper uses to distinguish user-safe errors from SDK errors.

**Sequencing note:** Tasks are independent except 2→4 (estimate feeds the wrapper) and 3→4 (interpret feeds the wrapper). Task order as written satisfies these.

## Execution Handoff

This plan implements audit **Phase 0 + the protective Phase-1 items**. Two execution options:
1. **Subagent-Driven (recommended)** — fresh implementer + reviewer subagent per task, on a branch `feat/audit-phase0-hardening`.
2. **Inline Execution** — here with checkpoints.

Which approach?
