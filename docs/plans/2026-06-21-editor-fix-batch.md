# Editor Fix Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five discrete editor/AI/theme/PDF improvements (admin model setting, add/delete sections, preset-theme read-only + fork, AI workspace right panel, paged document model) per `docs/specs/2026-06-21-editor-fix-batch-design.md`.

**Architecture:** Each item is its own slice with its own test cycle, built in order 5 → 1 → 2 → 4 → 3. Content-model additions (`document.brief`, `document.theme`, `section.pageBreakBefore`) are additive/optional so existing stored proposals keep validating. Generation reads the model from an admin setting server-side. The PDF stays Chromium-paginated; the editor reuses the same paged CSS.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Zustand, Ajv, Drizzle/Neon Postgres, Vitest. Monorepo: `packages/shared` (framework-agnostic types/schema/validation/generation) + `apps/web`.

## Global Constraints

- **Commands run at REPO ROOT:** single test `npx vitest run <path>`; full suite `npm test`; typecheck `npm run typecheck`; build `npm run build -w @proposal/web`; migration `npm run db:generate -w @proposal/web` (drizzle-kit does NOT auto-load `.env.local`).
- **TDD, hermetic tests:** in-memory repo via `setRepoForTests(createMemoryRepo())`; auth via `setOwnerResolverForTests` / `setSessionUserResolverForTests`; Anthropic via `vi.mock("../server/anthropic", …)`; route tests use `// @vitest-environment node`; client/UI tests run under jsdom.
- **Three-layer invariant:** the AI generates schema-conformant CONTENT only — never layout, styling, HTML, CSS, markup. Theme = CSS variables. The generic fallback always renders.
- **Extensionless imports** (`moduleResolution: "bundler"`); never add `.js`.
- **Model allowlist is the single source of truth:** `SELECTABLE_MODELS` / `DEFAULT_MODEL` / `isSelectableModel` from `@proposal/shared`; the server never passes an arbitrary client string to Anthropic.
- **New content fields are additive + optional:** `document.brief?: string`, `document.theme?: ThemeTokens`, `section.pageBreakBefore?: boolean`.
- **Page size:** A4 portrait; `PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 }`.
- **Workspace IS a git repo** (origin main). Commit per task.
- **Build-time verification:** before changing the AI surface (slices 4/5) re-verify the Anthropic Messages + Structured Outputs surface against live docs; before changing the PDF surface (slice 3) re-verify the puppeteer-core / `@sparticuz/chromium-min` + `page.pdf({ format, preferCSSPageSize })` surface. Keep the working baseline unless live docs require a change; flag any change in the task report.

---

## Slice 5 — AI model as an admin setting (build first)

### Task 15.1: Settings persistence (repo + schema + migration + helper)

**Files:**
- Modify: `apps/web/src/server/repo/types.ts`
- Modify: `apps/web/src/server/repo/memory.ts`
- Modify: `apps/web/src/server/repo/postgres.ts`
- Modify: `apps/web/src/server/db/schema.ts`
- Create: `apps/web/src/server/aiModel.ts`
- Create: `apps/web/drizzle/0006_*.sql` (generated)
- Test: `apps/web/src/__tests__/slice-15-settings-repo.test.ts`

**Interfaces:**
- Produces: `Repository.getAiModel(): Promise<GenerationModelId | null>`, `Repository.setAiModel(model: GenerationModelId): Promise<void>`, `getActiveModel(): Promise<GenerationModelId>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-15-settings-repo.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { getActiveModel } from "../server/aiModel";

beforeEach(() => setRepoForTests(createMemoryRepo()));
afterEach(() => setRepoForTests(null));

describe("AI model setting", () => {
  it("is null until set", async () => {
    expect(await getRepo().getAiModel()).toBeNull();
  });

  it("round-trips a selectable model", async () => {
    await getRepo().setAiModel("claude-sonnet-4-6");
    expect(await getRepo().getAiModel()).toBe("claude-sonnet-4-6");
  });

  it("getActiveModel falls back to the default when unset", async () => {
    expect(await getActiveModel()).toBe("claude-opus-4-8");
  });

  it("getActiveModel returns the set value", async () => {
    await getRepo().setAiModel("claude-haiku-4-5");
    expect(await getActiveModel()).toBe("claude-haiku-4-5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-repo.test.ts`
Expected: FAIL — `getAiModel` / `setAiModel` / `getActiveModel` do not exist (type + module errors).

- [ ] **Step 3: Extend the Repository interface**

In `apps/web/src/server/repo/types.ts`, change the import on line 1 to include `GenerationModelId`:

```ts
import type { GenerationModelId, ProposalDocument, Template, ThemeTokens } from "@proposal/shared";
```

Add these two methods to the `Repository` interface (place them after `countActiveAdmins()`):

```ts
  /** App-wide AI model setting (admin-configured, §10). null when unset. */
  getAiModel(): Promise<GenerationModelId | null>;
  setAiModel(model: GenerationModelId): Promise<void>;
```

- [ ] **Step 4: Implement in the memory repo**

In `apps/web/src/server/repo/memory.ts`, add to the import on line 1:

```ts
import { isSelectableModel, type GenerationModelId } from "@proposal/shared";
```

Inside `createMemoryRepo`, add a closure field next to the other `Map`s (after `const folders = …`):

```ts
  let aiModel: GenerationModelId | null = null;
```

Add the two methods inside the returned object (after `deleteFolder`):

```ts
    async getAiModel() {
      return isSelectableModel(aiModel) ? aiModel : null;
    },

    async setAiModel(model) {
      aiModel = model;
    },
```

- [ ] **Step 5: Add the Postgres table + methods**

In `apps/web/src/server/db/schema.ts`, append:

```ts
/** App-wide key/value settings (§10). Currently holds the admin-set AI model under "ai_model". */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

In `apps/web/src/server/repo/postgres.ts`, extend the shared import (line 2) and the schema import (line 4), and add an `isSelectableModel` import:

```ts
import { isSelectableModel, type GenerationModelId, type ProposalDocument, type Template, type ThemeTokens } from "@proposal/shared";
import { appSettings, proposalVersions, proposals, folders, sectionTypeRows, templates, themes, users } from "../db/schema";
```

Add a constant near the top of the file (after the `uid` helper):

```ts
const AI_MODEL_KEY = "ai_model";
```

Add the two methods inside the returned object (after `deleteFolder`):

```ts
    async getAiModel() {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, AI_MODEL_KEY));
      return row && isSelectableModel(row.value) ? (row.value as GenerationModelId) : null;
    },

    async setAiModel(model) {
      await db
        .insert(appSettings)
        .values({ key: AI_MODEL_KEY, value: model })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: model, updatedAt: new Date() } });
    },
```

- [ ] **Step 6: Add the `getActiveModel` helper**

Create `apps/web/src/server/aiModel.ts`:

```ts
import { DEFAULT_MODEL, type GenerationModelId } from "@proposal/shared";
import { getRepo } from "./repo";

/** The model every generation call uses: the admin setting, or the default when unset. */
export async function getActiveModel(): Promise<GenerationModelId> {
  return (await getRepo().getAiModel()) ?? DEFAULT_MODEL;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-repo.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Generate the migration**

Run: `npm run db:generate -w @proposal/web`
Expected: a new `apps/web/drizzle/0006_*.sql` creating `app_settings`. Inspect it — it must be additive (CREATE TABLE only).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/server/repo/types.ts apps/web/src/server/repo/memory.ts apps/web/src/server/repo/postgres.ts apps/web/src/server/db/schema.ts apps/web/src/server/aiModel.ts apps/web/drizzle apps/web/src/__tests__/slice-15-settings-repo.test.ts
git commit -m "feat(settings): persist admin AI model setting (repo + migration 0006)"
```

---

### Task 15.2: Admin settings API route

**Files:**
- Create: `apps/web/app/api/admin/settings/route.ts`
- Test: `apps/web/src/__tests__/slice-15-settings-route.test.ts`

**Interfaces:**
- Consumes: `getActiveModel()`, `getRepo().setAiModel`, `requireAdmin()`, `isSelectableModel`.
- Produces: `GET` → `200 { aiModel }`; `PUT { aiModel }` → `200 { aiModel }` / `400`; `401`/`403` from `requireAdmin`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-15-settings-route.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setSessionUserResolverForTests } from "../server/auth/sessionUser";
import { GET, PUT } from "../../app/api/admin/settings/route";

const put = (body: unknown) =>
  new Request("http://x/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: true }));
});
afterEach(() => {
  setRepoForTests(null);
  setSessionUserResolverForTests(null);
});

describe("/api/admin/settings", () => {
  it("GET returns the default when unset", async () => {
    const body = (await (await GET()).json()) as { aiModel: string };
    expect(body.aiModel).toBe("claude-opus-4-8");
  });

  it("PUT sets a selectable model and GET reflects it", async () => {
    expect((await PUT(put({ aiModel: "claude-sonnet-4-6" }))).status).toBe(200);
    const body = (await (await GET()).json()) as { aiModel: string };
    expect(body.aiModel).toBe("claude-sonnet-4-6");
  });

  it("PUT 400s a non-selectable model", async () => {
    expect((await PUT(put({ aiModel: "gpt-4o" }))).status).toBe(400);
  });

  it("403s a non-admin and 401s when unauthenticated", async () => {
    setSessionUserResolverForTests(async () => ({ id: "u1", isAdmin: false }));
    expect((await GET()).status).toBe(403);
    setSessionUserResolverForTests(async () => null);
    expect((await GET()).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/admin/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { isSelectableModel } from "@proposal/shared";
import { requireAdmin } from "../../../../src/server/auth/guard";
import { getRepo } from "../../../../src/server/repo";
import { getActiveModel } from "../../../../src/server/aiModel";

/** GET — the active AI model (admin only). */
export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  return NextResponse.json({ aiModel: await getActiveModel() });
}

/** PUT — set the AI model (admin only); must be on the allowlist. */
export async function PUT(request: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => null)) as { aiModel?: unknown } | null;
  if (!body || !isSelectableModel(body.aiModel)) {
    return NextResponse.json({ error: "Expected { aiModel } from the allowlist" }, { status: 400 });
  }
  await getRepo().setAiModel(body.aiModel);
  return NextResponse.json({ aiModel: body.aiModel });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/admin/settings/route.ts apps/web/src/__tests__/slice-15-settings-route.test.ts
git commit -m "feat(settings): admin GET/PUT /api/admin/settings for the AI model"
```

---

### Task 15.3: Generation routes use the admin model (ignore client model)

**Files:**
- Modify: `apps/web/app/api/generate/section/route.ts`
- Modify: `apps/web/app/api/generate/proposal/route.ts`
- Test: `apps/web/src/__tests__/slice-15-generate-uses-setting.test.ts`

**Interfaces:**
- Consumes: `getActiveModel()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-15-generate-uses-setting.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMessage = vi.fn(async () => JSON.stringify({ heading: "H", body: "B" }));
vi.mock("../server/anthropic", () => ({ anthropicCreateMessage: (args: unknown) => createMessage(args) }));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests, getRepo } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as generateSection } from "../../app/api/generate/section/route";

beforeEach(() => {
  createMessage.mockClear();
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const post = (body: unknown) =>
  new Request("http://x/api/generate/section", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("generation uses the admin model setting", () => {
  it("uses the default when unset, ignoring a client-sent model", async () => {
    await generateSection(post({ type: "executive_summary", brief: "x", model: "claude-haiku-4-5" }));
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
  });

  it("uses the configured model when set", async () => {
    await getRepo().setAiModel("claude-sonnet-4-6");
    await generateSection(post({ type: "executive_summary", brief: "x" }));
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-4-6" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-15-generate-uses-setting.test.ts`
Expected: FAIL — the route still uses the client `model`, so the first test sees `claude-haiku-4-5`.

- [ ] **Step 3: Update the section route**

In `apps/web/app/api/generate/section/route.ts`, add the import:

```ts
import { getActiveModel } from "../../../../src/server/aiModel";
```

Replace the destructure + call block (lines 23-33) with:

```ts
  const { type, brief, sectionId } = body as {
    type: string;
    brief: string;
    sectionId?: string;
  };

  const model = await getActiveModel();
  const result = await generateSection(
    { type, brief, model, ...(sectionId !== undefined ? { sectionId } : {}) },
    anthropicCreateMessage,
  );
```

- [ ] **Step 4: Update the proposal (SSE) route**

In `apps/web/app/api/generate/proposal/route.ts`, add the import:

```ts
import { getActiveModel } from "../../../../src/server/aiModel";
```

Change the destructure (line 28) to drop `model`:

```ts
  const { brief, types } = body as { brief: string; types: string[] };
```

Inside `start(controller)`, resolve the model once before the loop (above `for (let i …`):

```ts
      const model = await getActiveModel();
```

Change the `generateSection` call to pass it:

```ts
        const result = await generateSection(
          { type, brief, model, sectionId: `gen_${i}` },
          anthropicCreateMessage,
        );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-15-generate-uses-setting.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the existing generation route tests still pass**

Run: `npx vitest run apps/web/src/__tests__/slice-06-routes.test.ts`
Expected: PASS (the section route still 200s for `executive_summary` and 422s for `commercial_comparison`; the proposal route still streams).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/generate/section/route.ts apps/web/app/api/generate/proposal/route.ts apps/web/src/__tests__/slice-15-generate-uses-setting.test.ts
git commit -m "feat(generation): read the AI model from the admin setting, ignore client model"
```

---

### Task 15.4: Admin Settings panel UI

**Files:**
- Create: `apps/web/src/ui/admin/SettingsPanel.tsx`
- Modify: `apps/web/src/ui/admin/AdminDashboard.tsx`
- Modify: `apps/web/app/admin/page.tsx`
- Test: `apps/web/src/__tests__/slice-15-settings-panel.test.tsx`

**Interfaces:**
- Consumes: `SELECTABLE_MODELS` (shared); `PUT /api/admin/settings`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-15-settings-panel.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPanel } from "../ui/admin/SettingsPanel";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsPanel", () => {
  it("renders the current model and saves a new one", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aiModel: "claude-sonnet-4-6" }) });
    render(<SettingsPanel initialModel="claude-opus-4-8" />);

    const select = screen.getByLabelText("AI model") as HTMLSelectElement;
    expect(select.value).toBe("claude-opus-4-8");

    fireEvent.change(select, { target: { value: "claude-sonnet-4-6" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-panel.test.tsx`
Expected: FAIL — `SettingsPanel` does not exist.

- [ ] **Step 3: Implement the panel**

Create `apps/web/src/ui/admin/SettingsPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SELECTABLE_MODELS, type GenerationModelId } from "@proposal/shared";

/** Admin AI-model setting (§10). Applies to every generation call. */
export function SettingsPanel({ initialModel }: { initialModel: GenerationModelId }) {
  const [model, setModel] = useState<GenerationModelId>(initialModel);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aiModel: model }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">AI settings</h2>
      <p className="meter">The model used for every generation call across all proposals.</p>
      <label className="field">
        <span className="field__label">AI model</span>
        <select aria-label="AI model" value={model} onChange={(e) => setModel(e.target.value as GenerationModelId)}>
          {SELECTABLE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <button type="button" className="btn btn--primary" disabled={status === "saving"} onClick={save}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" ? <small className="meter">Saved.</small> : null}
        {status === "error" ? <small className="meter" style={{ color: "var(--ui-danger)" }}>Couldn&apos;t save.</small> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire it into the AdminDashboard**

In `apps/web/src/ui/admin/AdminDashboard.tsx`:

Add the import and a type/prop. Change the imports block (lines 4-7) to add the model type + panel:

```tsx
import type { GenerationModelId, SectionTypeSchema, Template } from "@proposal/shared";
import { SectionTypeList } from "./SectionTypeList";
import { UsersView } from "./UsersView";
import { TemplateList } from "./TemplateList";
import { SettingsPanel } from "./SettingsPanel";
```

Change the `Panel` type (line 9):

```tsx
type Panel = "section-types" | "users" | "templates" | "settings";
```

Add `aiModel` to the props (extend the destructure + its type):

```tsx
export function AdminDashboard({
  sectionTypes,
  inUse,
  currentUserId,
  templates,
  inUseTemplates,
  aiModel,
}: {
  sectionTypes: SectionTypeSchema[];
  inUse: string[];
  currentUserId: string;
  templates: Template[];
  inUseTemplates: string[];
  aiModel: GenerationModelId;
}) {
```

Add a nav button after the Templates button (after line 62):

```tsx
          <button
            type="button"
            className="admin__navitem"
            aria-current={panel === "settings"}
            onClick={() => setPanel("settings")}
          >
            Settings
          </button>
```

Change the panel render (lines 65-72) to add the settings branch:

```tsx
          {panel === "section-types" ? (
            <SectionTypeList types={types} inUse={inUse} onChange={setTypes} />
          ) : panel === "users" ? (
            <UsersView currentUserId={currentUserId} />
          ) : panel === "templates" ? (
            <TemplateList templates={tmpls} inUse={inUseTemplates} onChange={setTmpls} />
          ) : (
            <SettingsPanel initialModel={aiModel} />
          )}
```

- [ ] **Step 5: Pass `aiModel` from the page**

In `apps/web/app/admin/page.tsx`, add the import:

```tsx
import { getActiveModel } from "../../src/server/aiModel";
```

Add `getActiveModel()` to the `Promise.all` and pass it through:

```tsx
  const [sectionTypes, inUse, templates, inUseTemplates, aiModel] = await Promise.all([
    getMergedSectionTypes(),
    getRepo().listInUseTypeKeys(),
    getMergedTemplates(),
    getRepo().listInUseTemplateIds(),
    getActiveModel(),
  ]);
  return (
    <AdminDashboard
      sectionTypes={sectionTypes}
      inUse={inUse}
      currentUserId={session.user.id}
      templates={templates}
      inUseTemplates={inUseTemplates}
      aiModel={aiModel}
    />
  );
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-15-settings-panel.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build -w @proposal/web`
Expected: clean build (the `/admin` route and `/api/admin/settings` compile).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ui/admin/SettingsPanel.tsx apps/web/src/ui/admin/AdminDashboard.tsx apps/web/app/admin/page.tsx apps/web/src/__tests__/slice-15-settings-panel.test.tsx
git commit -m "feat(admin): AI-model Settings panel in the Builder dashboard"
```

---

## Slice 1 — Add/delete sections in the Free Editor outline

### Task 16.1: `insertSection` + `removeSection` mutations

**Files:**
- Modify: `apps/web/src/state/mutations.ts`
- Test: `apps/web/src/__tests__/slice-16-mutations.test.ts`

**Interfaces:**
- Produces: `insertSection(document, type, index): ProposalDocument`, `removeSection(document, sectionId): ProposalDocument`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-16-mutations.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { insertSection, removeSection } from "../state/mutations";
import type { ProposalDocument } from "@proposal/shared";

const base: ProposalDocument = {
  id: "p1",
  title: "T",
  client: { name: "C" },
  themeId: "theme_default",
  templateId: "open",
  sections: [
    { id: "a", type: "text", data: {} },
    { id: "b", type: "text", data: {} },
  ],
};

describe("insertSection", () => {
  it("inserts at the given index with schema-default data", () => {
    const next = insertSection(base, "executive_summary", 1);
    expect(next.sections.map((s) => s.id.slice(0, 1))).toEqual(["a", "s", "b"]); // new id starts "sec_"
    const inserted = next.sections[1]!;
    expect(inserted.type).toBe("executive_summary");
    expect(inserted.data).toEqual({ heading: "", body: "" });
    expect(base.sections).toHaveLength(2); // input untouched
  });

  it("clamps an out-of-range index to the ends", () => {
    expect(insertSection(base, "text", -5).sections[0]!.type).toBe("text");
    expect(insertSection(base, "text", 99).sections[2]!.type).toBe("text");
  });
});

describe("removeSection", () => {
  it("drops the matching section and is a no-op for an unknown id", () => {
    expect(removeSection(base, "a").sections.map((s) => s.id)).toEqual(["b"]);
    expect(removeSection(base, "zzz").sections.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-16-mutations.test.ts`
Expected: FAIL — `insertSection` / `removeSection` not exported.

- [ ] **Step 3: Implement the mutations**

In `apps/web/src/state/mutations.ts`, append:

```ts
/** Insert a new section of `type` (schema-default data) at `index` (clamped). Pure. */
export function insertSection(document: ProposalDocument, type: string, index: number): ProposalDocument {
  const schema = getSectionType(type);
  const id = `sec_${crypto.randomUUID().slice(0, 8)}`;
  const section = {
    id,
    type,
    ...(schema?.defaultVariant ? { variant: schema.defaultVariant } : {}),
    data: emptyDataForType(type),
  };
  const at = Math.max(0, Math.min(index, document.sections.length));
  return {
    ...document,
    sections: [...document.sections.slice(0, at), section, ...document.sections.slice(at)],
  };
}

/** Remove a section by id, immutably. No-op if the id is absent. */
export function removeSection(document: ProposalDocument, sectionId: string): ProposalDocument {
  return { ...document, sections: document.sections.filter((s) => s.id !== sectionId) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-16-mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/mutations.ts apps/web/src/__tests__/slice-16-mutations.test.ts
git commit -m "feat(editor): insertSection + removeSection pure mutations"
```

---

### Task 16.2: Store actions for insert/remove

**Files:**
- Modify: `apps/web/src/state/proposalStore.ts`
- Test: `apps/web/src/__tests__/slice-16-store.test.ts`

**Interfaces:**
- Consumes: `insertSection`, `removeSection` mutations.
- Produces: store actions `insertSection(type: string, index: number): void`, `removeSection(id: string): void` (clears `selectedId` when the removed section was selected; selects the new section on insert).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-16-store.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  const s = useProposalStore.getState();
  s.applyTemplate; // ensure store is created
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "a", type: "text", data: {} }, { id: "b", type: "text", data: {} }],
    },
    selectedId: "a",
  });
});

describe("store insert/remove", () => {
  it("insertSection adds at the index and selects it", () => {
    useProposalStore.getState().insertSection("executive_summary", 1);
    const { document, selectedId } = useProposalStore.getState();
    expect(document.sections[1]!.type).toBe("executive_summary");
    expect(selectedId).toBe(document.sections[1]!.id);
  });

  it("removeSection drops it and clears selection if it was selected", () => {
    useProposalStore.getState().removeSection("a");
    const { document, selectedId } = useProposalStore.getState();
    expect(document.sections.map((s) => s.id)).toEqual(["b"]);
    expect(selectedId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-16-store.test.ts`
Expected: FAIL — `insertSection` / `removeSection` not on the store.

- [ ] **Step 3: Implement the store actions**

In `apps/web/src/state/proposalStore.ts`:

Extend the mutations import (line 6):

```ts
import { setSectionVariant, setSectionData, setSectionType, appendSection, insertSection, removeSection } from "./mutations";
```

Add to the `ProposalState` interface (after `addSection`):

```ts
  /** Insert a new section of `type` at `index` and select it. */
  insertSection: (type: string, index: number) => void;
  /** Remove a section; clears the selection if it was the removed one. */
  removeSection: (id: string) => void;
```

Add the implementations (after the `addSection:` action):

```ts
  insertSection: (type, index) =>
    set((state) => {
      const document = insertSection(state.document, type, index);
      const at = Math.max(0, Math.min(index, state.document.sections.length));
      return { document, selectedId: document.sections[at]?.id ?? state.selectedId };
    }),
  removeSection: (id) =>
    set((state) => ({
      document: removeSection(state.document, id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-16-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/proposalStore.ts apps/web/src/__tests__/slice-16-store.test.ts
git commit -m "feat(editor): store insertSection/removeSection actions"
```

---

### Task 16.3: Outline insert + delete UI

**Files:**
- Modify: `apps/web/src/ui/Outline.tsx`
- Test: `apps/web/src/__tests__/slice-16-outline.test.tsx`

**Interfaces:**
- Consumes: store `insertSection`, `removeSection`, `isStructureLocked`, `listSectionTypes`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-16-outline.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Outline } from "../ui/Outline";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "a", type: "text", data: {} }, { id: "b", type: "text", data: {} }],
    },
    selectedId: "a",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Outline add/delete", () => {
  it("deletes a section after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Outline />);
    const delButtons = screen.getAllByRole("button", { name: /delete section/i });
    fireEvent.click(delButtons[0]!);
    expect(useProposalStore.getState().document.sections.map((s) => s.id)).toEqual(["b"]);
  });

  it("does not delete when confirm is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Outline />);
    fireEvent.click(screen.getAllByRole("button", { name: /delete section/i })[0]!);
    expect(useProposalStore.getState().document.sections).toHaveLength(2);
  });

  it("inserts a section at a position via the insert control", () => {
    render(<Outline />);
    // The first in-between insert control inserts at index 1 (after the first section).
    const inserts = screen.getAllByLabelText(/insert section/i) as HTMLSelectElement[];
    fireEvent.change(inserts[1]!, { target: { value: "executive_summary" } });
    const sections = useProposalStore.getState().document.sections;
    expect(sections[1]!.type).toBe("executive_summary");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-16-outline.test.tsx`
Expected: FAIL — no delete button / no positional insert control.

- [ ] **Step 3: Rewrite the Outline**

Replace `apps/web/src/ui/Outline.tsx` with:

```tsx
import { getSectionType, isStructureLocked, listSectionTypes, openTemplate } from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";

/**
 * Left pane: the section list with per-section status. On unlocked (Free Editor)
 * templates it also offers positional insert (a select at each gap) and per-row
 * delete (with confirm). Outline order = render order; reorder is out of scope.
 */
export function Outline() {
  const sections = useProposalStore((s) => s.document.sections);
  const selectedId = useProposalStore((s) => s.selectedId);
  const selectSection = useProposalStore((s) => s.selectSection);
  const templateId = useProposalStore((s) => s.document.templateId);
  const templates = useProposalStore((s) => s.templates);
  const locked = isStructureLocked(templates.find((t) => t.id === templateId) ?? openTemplate);
  const insertSection = useProposalStore((s) => s.insertSection);
  const removeSection = useProposalStore((s) => s.removeSection);

  const types = listSectionTypes();

  const InsertControl = ({ index }: { index: number }) =>
    !locked ? (
      <select
        className="outline__insert"
        aria-label={`Insert section at ${index}`}
        value=""
        onChange={(e) => {
          if (e.target.value) insertSection(e.target.value, index);
        }}
      >
        <option value="">+ Insert…</option>
        {types.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
    ) : null;

  return (
    <nav aria-label="Outline" className="pane pane--rail">
      <div className="pane__heading">
        Outline{locked ? <span className="tag tag--unstyled" style={{ marginLeft: 6 }}>locked</span> : null}
      </div>
      <div className="outline">
        <InsertControl index={0} />
        {sections.map((section, i) => {
          const { unstyled, variant } = resolveSection(section);
          const label = getSectionType(section.type)?.label ?? section.type;
          return (
            <div className="outline-row" key={section.id}>
              <button
                type="button"
                className="outline-item"
                aria-pressed={section.id === selectedId}
                onClick={() => selectSection(section.id)}
              >
                <span className="outline-item__title">{label}</span>
                <span className="outline-item__type">{section.type}</span>
                <span className="outline-item__tags">
                  {variant ? (
                    <span className="tag" data-tag="variant">
                      {variant}
                    </span>
                  ) : null}
                  {unstyled ? (
                    <span className="tag tag--unstyled" data-tag="unstyled">
                      unstyled
                    </span>
                  ) : null}
                </span>
              </button>
              {!locked ? (
                <button
                  type="button"
                  className="outline-item__delete"
                  aria-label="Delete section"
                  title="Delete section"
                  onClick={() => {
                    if (window.confirm("Delete this section? This cannot be undone.")) removeSection(section.id);
                  }}
                >
                  ✕
                </button>
              ) : null}
              <InsertControl index={i + 1} />
            </div>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-16-outline.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build -w @proposal/web`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/Outline.tsx apps/web/src/__tests__/slice-16-outline.test.tsx
git commit -m "feat(editor): positional insert + delete-with-confirm in the outline"
```

---

## Slice 2 — Preset themes read-only; fork to edit

### Task 17.1: `document.theme` type, schema, and validation

**Files:**
- Modify: `packages/shared/src/types/document.ts`
- Modify: `packages/shared/src/schema/document.schema.ts`
- Modify: `packages/shared/src/validation/validateDocument.ts`
- Test: `packages/shared/src/__tests__/slice-17-document-theme.test.ts`

**Interfaces:**
- Produces: `ProposalDocument.theme?: ThemeTokens`; `validateDocument` validates `document.theme` when present (errors rooted at `/theme…`).

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-17-document-theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDocument } from "../validation/validateDocument";
import { sampleProposal } from "../samples/sample-proposal";
import { defaultTheme } from "../../../../apps/web/src/theme/defaultTheme";
import type { ProposalDocument, ThemeTokens } from "../types/index";

describe("document.theme (forked theme)", () => {
  it("accepts a document with a valid embedded theme", () => {
    const doc: ProposalDocument = { ...sampleProposal, theme: { ...defaultTheme, id: "custom", name: "Custom" } };
    expect(validateDocument(doc).valid).toBe(true);
  });

  it("rejects a malformed embedded theme", () => {
    const bad = { ...sampleProposal, theme: { id: "custom" } as unknown as ThemeTokens };
    const result = validateDocument(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith("/theme"))).toBe(true);
  });

  it("still accepts a document without a theme", () => {
    expect(validateDocument(sampleProposal).valid).toBe(true);
  });
});
```

> Note: importing `defaultTheme` from `apps/web` keeps the test self-contained. If the relative path differs from the repo layout, build a literal `ThemeTokens` inline matching `theme.schema.ts` instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-17-document-theme.test.ts`
Expected: FAIL — `theme` is not an allowed property (envelope `additionalProperties: false`).

- [ ] **Step 3: Add the type**

In `packages/shared/src/types/document.ts`, add the import + optional field:

```ts
import type { Section } from "./section";
import type { ThemeTokens } from "./theme";
```

Add inside `ProposalDocument` (after `sections: Section[];`):

```ts
  /** Optional per-proposal forked/custom theme; overrides `themeId` when present (§4). */
  theme?: ThemeTokens;
  /** Global generation context shown to the AI on every call (§10). */
  brief?: string;
```

> `brief` is added here too so slice 4 needs no further envelope change; both are optional.

- [ ] **Step 4: Allow them in the envelope schema**

In `packages/shared/src/schema/document.schema.ts`, add to `properties` (after `sections: { type: "array" }`):

```ts
    theme: { type: "object" },
    brief: { type: "string" },
```

(They are NOT added to `required`.)

- [ ] **Step 5: Validate the embedded theme**

In `packages/shared/src/validation/validateDocument.ts`, add the import:

```ts
import { validateTheme } from "./validateTheme";
```

In `validateDocument`, after the sections loop and before `return`, add:

```ts
  if (doc?.theme !== undefined) {
    for (const e of validateTheme(doc.theme).errors) {
      errors.push({ ...e, path: `/theme${e.path}` });
    }
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-17-document-theme.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify existing document/validation tests still pass**

Run: `npx vitest run packages/shared/src/__tests__/slice-01-schema.test.ts`
Expected: PASS (the additive optional props don't break the envelope).

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types/document.ts packages/shared/src/schema/document.schema.ts packages/shared/src/validation/validateDocument.ts packages/shared/src/__tests__/slice-17-document-theme.test.ts
git commit -m "feat(theme): optional document.theme + document.brief (additive, validated)"
```

---

### Task 17.2: Store fork/unfork + theme derived from document

**Files:**
- Modify: `apps/web/src/state/proposalStore.ts`
- Test: `apps/web/src/__tests__/slice-17-store-fork.test.ts`

**Interfaces:**
- Produces: store `forkTheme()`, `unforkTheme()`, `selectPreset(presetId: string)`; `setTheme` persists into `document.theme` when forked; `load`/`applyTemplate` derive `theme` from `document.theme ?? preset`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-17-store-fork.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [],
    },
    theme: defaultTheme,
  });
});

describe("theme fork", () => {
  it("forkTheme copies the active theme into document.theme with a custom id", () => {
    useProposalStore.getState().forkTheme();
    const { document, theme } = useProposalStore.getState();
    expect(document.theme).toBeDefined();
    expect(document.theme!.id).toBe("custom");
    expect(theme.id).toBe("custom");
  });

  it("editing while forked persists into document.theme", () => {
    useProposalStore.getState().forkTheme();
    const forked = useProposalStore.getState().theme;
    useProposalStore.getState().setTheme({ ...forked, colors: { ...forked.colors, primary: "#123456" } });
    expect(useProposalStore.getState().document.theme!.colors.primary).toBe("#123456");
  });

  it("unforkTheme clears document.theme and reverts to the preset", () => {
    useProposalStore.getState().forkTheme();
    useProposalStore.getState().unforkTheme();
    expect(useProposalStore.getState().document.theme).toBeUndefined();
    expect(useProposalStore.getState().theme.id).toBe("theme_default");
  });

  it("selectPreset switches preset and clears any fork", () => {
    useProposalStore.getState().forkTheme();
    useProposalStore.getState().selectPreset("theme_midnight");
    const { document, theme } = useProposalStore.getState();
    expect(document.theme).toBeUndefined();
    expect(document.themeId).toBe("theme_midnight");
    expect(theme.id).toBe("theme_midnight");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-17-store-fork.test.ts`
Expected: FAIL — `forkTheme` / `unforkTheme` / `selectPreset` not on the store.

- [ ] **Step 3: Implement the actions**

In `apps/web/src/state/proposalStore.ts`:

Add to the `ProposalState` interface (after `setTheme`):

```ts
  /** Clone the active theme into document.theme (editable custom theme). */
  forkTheme: () => void;
  /** Drop document.theme and revert to the preset referenced by themeId. */
  unforkTheme: () => void;
  /** Pick a preset by id; clears any fork. */
  selectPreset: (presetId: string) => void;
```

Replace the existing `setTheme` action (line 82) with one that persists into the fork when active:

```ts
  setTheme: (theme) =>
    set((state) => (state.document.theme ? { theme, document: { ...state.document, theme } } : { theme })),
  forkTheme: () =>
    set((state) => {
      const forked = { ...state.theme, id: "custom", name: `Custom (from ${state.theme.name})` };
      return { theme: forked, document: { ...state.document, theme: forked } };
    }),
  unforkTheme: () =>
    set((state) => {
      const { theme: _omit, ...rest } = state.document;
      return { theme: themeById(state.document.themeId), document: rest };
    }),
  selectPreset: (presetId) =>
    set((state) => {
      const { theme: _omit, ...rest } = state.document;
      return { theme: themeById(presetId), document: { ...rest, themeId: presetId } };
    }),
```

Update `load` (line 121) to derive the theme from the document:

```ts
  load: async (id) => {
    const document = await persistence.loadProposal(id);
    set({
      document,
      theme: document.theme ?? themeById(document.themeId),
      proposalId: id,
      selectedId: document.sections[0]?.id ?? null,
      saveStatus: "saved",
    });
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-17-store-fork.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/proposalStore.ts apps/web/src/__tests__/slice-17-store-fork.test.ts
git commit -m "feat(theme): store fork/unfork/selectPreset; theme derived from document"
```

---

### Task 17.3: Print resolves the forked theme

**Files:**
- Create: `apps/web/src/print/resolveTheme.ts`
- Modify: `apps/web/app/print/[id]/page.tsx`
- Test: `apps/web/src/__tests__/slice-17-print-theme.test.ts`

**Interfaces:**
- Produces: `resolvePrintTheme(document, presets, fallback): ThemeTokens` — returns `document.theme` if present, else the preset by `themeId`, else `fallback`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-17-print-theme.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolvePrintTheme } from "../print/resolveTheme";
import { themes } from "../theme/themes";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

const docWith = (extra: Partial<ProposalDocument>): ProposalDocument => ({
  id: "p", title: "T", client: { name: "C" }, themeId: "theme_midnight", templateId: "open", sections: [], ...extra,
});

describe("resolvePrintTheme", () => {
  it("uses document.theme when present", () => {
    const custom = { ...defaultTheme, id: "custom", name: "Custom" };
    expect(resolvePrintTheme(docWith({ theme: custom }), themes, defaultTheme).id).toBe("custom");
  });

  it("falls back to the preset by id", () => {
    expect(resolvePrintTheme(docWith({}), themes, defaultTheme).id).toBe("theme_midnight");
  });

  it("falls back to the default for an unknown preset", () => {
    expect(resolvePrintTheme(docWith({ themeId: "nope" }), themes, defaultTheme).id).toBe(defaultTheme.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-17-print-theme.test.ts`
Expected: FAIL — `resolveTheme` module does not exist.

- [ ] **Step 3: Implement the resolver**

Create `apps/web/src/print/resolveTheme.ts`:

```ts
import type { ProposalDocument, ThemeTokens } from "@proposal/shared";

/** The theme the PDF renders: the forked document.theme, else the preset by id, else fallback. */
export function resolvePrintTheme(
  document: ProposalDocument,
  presets: ThemeTokens[],
  fallback: ThemeTokens,
): ThemeTokens {
  return document.theme ?? presets.find((t) => t.id === document.themeId) ?? fallback;
}
```

- [ ] **Step 4: Use it in the print page**

In `apps/web/app/print/[id]/page.tsx`, add the import:

```ts
import { resolvePrintTheme } from "../../../src/print/resolveTheme";
```

Replace line 34:

```ts
  const theme = resolvePrintTheme(stored.document, themes, defaultTheme);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-17-print-theme.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/print/resolveTheme.ts apps/web/app/print/[id]/page.tsx apps/web/src/__tests__/slice-17-print-theme.test.ts
git commit -m "feat(theme): /print renders the forked document.theme"
```

---

### Task 17.4: Inspector theme group — preset read-only + fork

> This task changes only the Theme group of the Inspector. Slice 4 (Task 18.7) later moves this group into the "Document" disclosure; keep the markup self-contained so it relocates cleanly.

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-17-inspector-theme.test.tsx`

**Interfaces:**
- Consumes: store `theme`, `forkTheme`, `unforkTheme`, `selectPreset`, `document.theme`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-17-inspector-theme.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: { id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open", sections: [] },
    theme: defaultTheme,
    selectedId: null,
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector theme group", () => {
  it("preset active: shows Fork to edit and hides the token editor", () => {
    render(<Inspector />);
    expect(screen.getByRole("button", { name: /fork to edit/i })).toBeTruthy();
    expect(screen.queryByLabelText("color-primary")).toBeNull();
  });

  it("forked: shows the token editor and Revert to preset", () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole("button", { name: /fork to edit/i }));
    expect(screen.getByLabelText("color-primary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /revert to preset/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-17-inspector-theme.test.tsx`
Expected: FAIL — no "Fork to edit" control; the token editor renders unconditionally.

- [ ] **Step 3: Update the Theme group**

In `apps/web/src/ui/Inspector.tsx`:

Add the new store selectors (after the existing `setTheme` selector, line 34):

```ts
  const forkTheme = useProposalStore((s) => s.forkTheme);
  const unforkTheme = useProposalStore((s) => s.unforkTheme);
  const selectPreset = useProposalStore((s) => s.selectPreset);
  const isForked = useProposalStore((s) => s.document.theme !== undefined);
```

Replace the entire Theme `<div className="group">` block (lines 100-140) with:

```tsx
      <div className="group">
        <div className="group__title">Theme{pinned ? " · pinned" : ""}</div>
        <fieldset disabled={pinned} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="field">
            <span className="field__label">Preset</span>
            <select aria-label="Theme preset" value={isForked ? "custom" : theme.id} onChange={(e) => selectPreset(e.target.value)}>
              {isForked ? <option value="custom">Custom (forked)</option> : null}
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {!isForked ? (
            <div className="field">
              <button type="button" className="btn btn--ghost" onClick={forkTheme}>
                Fork to edit
              </button>
              <small className="meter">Presets are read-only. Fork to customise colours, fonts, and the logo.</small>
            </div>
          ) : (
            <>
              <div className="tabs" role="tablist" aria-label="Theme editor">
                <button type="button" className="tab" role="tab" aria-selected={tab === "tokens"} onClick={() => setTab("tokens")}>
                  Tokens
                </button>
                <button type="button" className="tab" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>
                  Code
                </button>
              </div>

              {tab === "tokens" ? (
                <ThemeForm />
              ) : (
                <div className="editor-frame">
                  <CodeEditor />
                </div>
              )}

              <AssetUpload />

              <div className="field">
                <button type="button" className="btn btn--ghost" onClick={unforkTheme}>
                  Revert to preset
                </button>
              </div>
            </>
          )}
        </fieldset>
      </div>
```

> The preset `<select>` now calls `selectPreset` (which also clears a fork) instead of `setTheme`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-17-inspector-theme.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build -w @proposal/web`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-17-inspector-theme.test.tsx
git commit -m "feat(theme): preset themes read-only with Fork to edit in the Inspector"
```

---

## Slice 4 — Right panel → AI workspace

### Task 18.1: `fieldKind` + text-fields / single-field generation schemas

**Files:**
- Modify: `packages/shared/src/generation/generationSchema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/slice-18-field-schemas.test.ts`

**Interfaces:**
- Produces: `fieldKind(field): "ai" | "data" | "manual"`; `buildTextFieldsGenerationSchema(typeSchema): JSONSchema | null`; `buildFieldGenerationSchema(field): JSONSchema | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-18-field-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fieldKind, buildTextFieldsGenerationSchema, buildFieldGenerationSchema } from "../generation/generationSchema";
import { getSectionType } from "../registry/sectionTypes";

describe("fieldKind", () => {
  it("maps text-shaped fields to ai, tabular to data", () => {
    expect(fieldKind({ key: "h", type: "text" })).toBe("ai");
    expect(fieldKind({ key: "b", type: "paragraph" })).toBe("ai");
    expect(fieldKind({ key: "l", type: "list" })).toBe("ai");
    expect(fieldKind({ key: "d", type: "dataset" })).toBe("data");
    expect(fieldKind({ key: "m", type: "matrix" })).toBe("data");
  });
});

describe("buildTextFieldsGenerationSchema", () => {
  it("includes only AI-composable fields for a text type", () => {
    const schema = buildTextFieldsGenerationSchema(getSectionType("executive_summary")!) as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(["heading", "body"]);
  });

  it("is null for a tabular-only type", () => {
    expect(buildTextFieldsGenerationSchema(getSectionType("commercial_comparison")!)).toBeNull();
    expect(buildTextFieldsGenerationSchema(getSectionType("data_table")!)).toBeNull();
  });
});

describe("buildFieldGenerationSchema", () => {
  it("wraps a single AI field as { value }", () => {
    const field = getSectionType("executive_summary")!.fields[0]!;
    const schema = buildFieldGenerationSchema(field) as { properties: { value: unknown }; required: string[] };
    expect(schema.required).toEqual(["value"]);
    expect(schema.properties.value).toEqual({ type: "string" });
  });

  it("is null for a non-AI field", () => {
    const field = getSectionType("commercial_comparison")!.fields[0]!;
    expect(buildFieldGenerationSchema(field)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-18-field-schemas.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement the helpers**

In `packages/shared/src/generation/generationSchema.ts`, append:

```ts
export type FieldKind = "ai" | "data" | "manual";

/** Classify a field: text-shaped = AI-composable; tabular = manual data; anything else = plain. */
export function fieldKind(field: FieldSchema): FieldKind {
  switch (field.type) {
    case "text":
    case "paragraph":
    case "list":
      return "ai";
    case "dataset":
    case "matrix":
      return "data";
    default:
      return "manual";
  }
}

/** Generation schema over AI-composable fields ONLY (skips tabular). Null if none. */
export function buildTextFieldsGenerationSchema(typeSchema: SectionTypeSchema): JSONSchema | null {
  const properties: JSONSchema = {};
  const required: string[] = [];
  for (const field of typeSchema.fields) {
    if (fieldKind(field) !== "ai") continue;
    const fieldSchema = fieldToGenerationSchema(field);
    if (fieldSchema === null) continue;
    properties[field.key] = fieldSchema;
    if (field.required) required.push(field.key);
  }
  if (Object.keys(properties).length === 0) return null;
  return { type: "object", required, additionalProperties: false, properties };
}

/** Generation schema for one AI-composable field, as { value }. Null otherwise. */
export function buildFieldGenerationSchema(field: FieldSchema): JSONSchema | null {
  if (fieldKind(field) !== "ai") return null;
  const fieldSchema = fieldToGenerationSchema(field);
  if (fieldSchema === null) return null;
  return { type: "object", required: ["value"], additionalProperties: false, properties: { value: fieldSchema } };
}
```

- [ ] **Step 4: Export them**

In `packages/shared/src/index.ts`, change the generation export (line 55):

```ts
export {
  buildGenerationDataSchema,
  buildTextFieldsGenerationSchema,
  buildFieldGenerationSchema,
  fieldKind,
  type FieldKind,
} from "./generation/generationSchema";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-18-field-schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/generation/generationSchema.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-18-field-schemas.test.ts
git commit -m "feat(generation): fieldKind + text-fields/single-field generation schemas"
```

---

### Task 18.2: Rewrite prompts (section + field)

**Files:**
- Modify: `apps/web/src/server/prompts.ts`
- Test: `apps/web/src/__tests__/slice-18-prompts.test.ts`

**Interfaces:**
- Produces: `sectionRewritePrompt(typeSchema, brief, instruction): string`; `fieldRewritePrompt(field, brief, instruction, currentValue): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-prompts.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sectionRewritePrompt, fieldRewritePrompt } from "../server/prompts";
import { getSectionType } from "@proposal/shared";

describe("sectionRewritePrompt", () => {
  it("includes the brief, the instruction, and only text fields", () => {
    const t = getSectionType("executive_summary")!;
    const p = sectionRewritePrompt(t, "Solar for Acme", "Make it punchy");
    expect(p).toContain("Solar for Acme");
    expect(p).toContain("Make it punchy");
    expect(p).toContain("heading");
    expect(p).toContain("body");
  });
});

describe("fieldRewritePrompt", () => {
  it("includes the brief, the instruction, and the current value as context", () => {
    const field = getSectionType("executive_summary")!.fields[0]!;
    const p = fieldRewritePrompt(field, "Solar for Acme", "Shorter", "Old heading");
    expect(p).toContain("Solar for Acme");
    expect(p).toContain("Shorter");
    expect(p).toContain("Old heading");
    expect(p).toContain("value");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-prompts.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the prompts**

In `apps/web/src/server/prompts.ts`, change the import (line 1) and append the new builders:

```ts
import type { FieldSchema, SectionTypeSchema } from "@proposal/shared";
```

```ts
/** Describe a field's type and limits for a prompt line. */
function fieldLine(f: FieldSchema): string {
  const limits: string[] = [];
  if (f.maxChars !== undefined) limits.push(`max ${f.maxChars} characters`);
  if (f.maxWords !== undefined) limits.push(`max ${f.maxWords} words`);
  if (f.maxRows !== undefined) limits.push(`max ${f.maxRows} items`);
  return `- ${f.key} (${f.type})${limits.length ? `: ${limits.join(", ")}` : ""}`;
}

/** Section rewrite: redo ALL text fields from scratch using the section instruction + brief. */
export function sectionRewritePrompt(typeSchema: SectionTypeSchema, brief: string, instruction: string): string {
  const fields = typeSchema.fields
    .filter((f) => f.type === "text" || f.type === "paragraph" || f.type === "list")
    .map(fieldLine)
    .join("\n");
  return [
    `Rewrite the "${typeSchema.label}" section of a client proposal from scratch.`,
    "",
    "Brief:",
    brief,
    ...(instruction ? ["", "Instruction:", instruction] : []),
    "",
    "Fields to produce:",
    fields,
    "",
    "Stay within every limit. Return only the fields above.",
  ].join("\n");
}

/** Per-field rewrite: redo a single field using its instruction + brief; current value is context. */
export function fieldRewritePrompt(field: FieldSchema, brief: string, instruction: string, currentValue: string): string {
  return [
    `Rewrite the "${field.label ?? field.key}" field of a client proposal section.`,
    "",
    "Brief:",
    brief,
    ...(instruction ? ["", "Instruction:", instruction] : []),
    ...(currentValue ? ["", "Current value (for reference — rephrase/improve, don't merely echo):", currentValue] : []),
    "",
    `Return a JSON object { "value": … } with the new field content. ${fieldLine(field).slice(2)}.`,
  ].join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-prompts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/prompts.ts apps/web/src/__tests__/slice-18-prompts.test.ts
git commit -m "feat(generation): section + field rewrite prompts"
```

---

### Task 18.3: `generateSection` instruction + text-fields schema; `generateField`

**Files:**
- Modify: `apps/web/src/server/generateSection.ts`
- Create: `apps/web/src/server/generateField.ts`
- Test: `apps/web/src/__tests__/slice-18-generate.test.ts`

**Interfaces:**
- Consumes: `buildTextFieldsGenerationSchema`, `buildFieldGenerationSchema`, `sectionRewritePrompt`, `fieldRewritePrompt`.
- Produces: `generateSection` accepts `instruction?`; `generateField(input, createMessage): Promise<{ ok; value?; validation?; error? }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-generate.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateSection } from "../server/generateSection";
import { generateField } from "../server/generateField";

const create = (json: string) => vi.fn(async () => json);

describe("generateSection with instruction (text fields only)", () => {
  it("returns only the text fields and respects the instruction path", async () => {
    const fn = create(JSON.stringify({ heading: "New", body: "Fresh copy." }));
    const r = await generateSection({ type: "executive_summary", brief: "x", instruction: "Punchy" }, fn);
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ heading: "New", body: "Fresh copy." });
  });

  it("refuses a tabular-only section (no AI fields)", async () => {
    const r = await generateSection({ type: "commercial_comparison", brief: "x", instruction: "y" }, create("{}"));
    expect(r.ok).toBe(false);
    expect(r.error?.toLowerCase()).toMatch(/grid|import|data/);
  });
});

describe("generateField", () => {
  it("returns one field value", async () => {
    const r = await generateField(
      { type: "executive_summary", fieldKey: "heading", brief: "x", currentValue: "Old" },
      create(JSON.stringify({ value: "Shiny new heading" })),
    );
    expect(r.ok).toBe(true);
    expect(r.value).toBe("Shiny new heading");
  });

  it("flags an over-limit field via validation", async () => {
    const long = "x".repeat(100); // executive_summary.heading maxChars = 40
    const r = await generateField(
      { type: "executive_summary", fieldKey: "heading", brief: "x" },
      create(JSON.stringify({ value: long })),
    );
    expect(r.ok).toBe(true);
    expect(r.validation?.valid).toBe(false);
  });

  it("rejects a non-AI field", async () => {
    const r = await generateField({ type: "commercial_comparison", fieldKey: "matrix", brief: "x" }, create("{}"));
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-generate.test.ts`
Expected: FAIL — `instruction` unsupported; `generateField` missing.

- [ ] **Step 3: Update `generateSection`**

In `apps/web/src/server/generateSection.ts`:

Change the imports (lines 1-9) to use the text-fields schema + rewrite prompt:

```ts
import {
  DEFAULT_MODEL,
  buildTextFieldsGenerationSchema,
  getSectionType,
  isSelectableModel,
  validateSection,
  type ValidationResult,
} from "@proposal/shared";
import { sectionRewritePrompt, sectionUserPrompt, systemPrompt } from "./prompts";
```

Add `instruction?` to `GenerateSectionInput`:

```ts
export interface GenerateSectionInput {
  type: string;
  brief: string;
  instruction?: string;
  model?: string;
  sectionId?: string;
}
```

Replace the schema build + gate (lines 51-57) with:

```ts
  const dataSchema = buildTextFieldsGenerationSchema(typeSchema);
  if (dataSchema === null) {
    return {
      ok: false,
      error: "AI draft isn't available for data sections — enter values via the grid or import.",
    };
  }
```

Replace the `createMessage` call's `user` (line 66) to choose the prompt:

```ts
    text = await createMessage({
      model,
      system: systemPrompt(),
      user:
        input.instruction !== undefined
          ? sectionRewritePrompt(typeSchema, input.brief, input.instruction)
          : sectionUserPrompt(typeSchema, input.brief),
      schema: dataSchema,
    });
```

- [ ] **Step 4: Implement `generateField`**

Create `apps/web/src/server/generateField.ts`:

```ts
import {
  DEFAULT_MODEL,
  buildFieldGenerationSchema,
  getSectionType,
  isSelectableModel,
  validateSection,
  type ValidationResult,
} from "@proposal/shared";
import { fieldRewritePrompt, systemPrompt } from "./prompts";
import type { CreateMessageFn } from "./generateSection";

export interface GenerateFieldInput {
  type: string;
  fieldKey: string;
  brief: string;
  instruction?: string;
  currentValue?: string;
  model?: string;
  sectionId?: string;
}

export interface GenerateFieldResult {
  ok: boolean;
  value?: unknown;
  validation?: ValidationResult;
  error?: string;
}

/** Generate one AI-composable field's value, then validate it against the field's limits (§9). */
export async function generateField(
  input: GenerateFieldInput,
  createMessage: CreateMessageFn,
): Promise<GenerateFieldResult> {
  const typeSchema = getSectionType(input.type);
  if (!typeSchema) return { ok: false, error: `Unknown section type: ${input.type}` };
  const field = typeSchema.fields.find((f) => f.key === input.fieldKey);
  if (!field) return { ok: false, error: `Unknown field: ${input.fieldKey}` };

  const schema = buildFieldGenerationSchema(field);
  if (schema === null) return { ok: false, error: "This field isn't AI-composable — edit it directly." };

  const model = isSelectableModel(input.model) ? input.model : DEFAULT_MODEL;

  let text: string;
  try {
    text = await createMessage({
      model,
      system: systemPrompt(),
      user: fieldRewritePrompt(field, input.brief, input.instruction ?? "", input.currentValue ?? ""),
      schema,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Generation failed" };
  }

  let value: unknown;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("value" in parsed)) {
      return { ok: false, error: "Model output missing a value" };
    }
    value = (parsed as { value: unknown }).value;
  } catch {
    return { ok: false, error: "Model output was not valid JSON" };
  }

  // Validate just this field by isolating errors whose path references the field key.
  const full = validateSection({ id: input.sectionId ?? "draft", type: input.type, data: { [input.fieldKey]: value } });
  const errors = full.errors.filter((e) => e.path.includes(input.fieldKey));
  return { ok: true, value, validation: { valid: errors.length === 0, errors } };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-generate.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify existing generation unit tests still pass**

Run: `npx vitest run apps/web/src/__tests__/slice-06-generate.test.ts`
Expected: PASS (the non-instruction path still uses `sectionUserPrompt`; `commercial_comparison` still refused since it has no text fields).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/generateSection.ts apps/web/src/server/generateField.ts apps/web/src/__tests__/slice-18-generate.test.ts
git commit -m "feat(generation): section instruction + text-fields-only output; generateField"
```

---

### Task 18.4: Generation routes — section instruction + new field route

**Files:**
- Modify: `apps/web/app/api/generate/section/route.ts`
- Create: `apps/web/app/api/generate/field/route.ts`
- Test: `apps/web/src/__tests__/slice-18-routes.test.ts`

**Interfaces:**
- `POST /api/generate/section` body `{ type, brief, instruction?, sectionId? }`.
- `POST /api/generate/field` body `{ type, fieldKey, brief, instruction?, currentValue?, sectionId? }` → `{ value, validation }`; `400` non-AI field; `422` failure.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-routes.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/anthropic", () => ({
  anthropicCreateMessage: vi.fn(async (args: { schema: { properties: Record<string, unknown> } }) =>
    "value" in args.schema.properties
      ? JSON.stringify({ value: "One field" })
      : JSON.stringify({ heading: "H", body: "B" }),
  ),
}));

import { createMemoryRepo } from "../server/repo/memory";
import { setRepoForTests } from "../server/repo";
import { setOwnerResolverForTests } from "../server/auth/owner";
import { POST as section } from "../../app/api/generate/section/route";
import { POST as field } from "../../app/api/generate/field/route";

beforeEach(() => {
  setRepoForTests(createMemoryRepo());
  setOwnerResolverForTests(async () => "owner_a");
});
afterEach(() => {
  setRepoForTests(null);
  setOwnerResolverForTests(null);
});

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/generate/section (instruction)", () => {
  it("returns text-field data", async () => {
    const res = await section(post("http://x/api/generate/section", { type: "executive_summary", brief: "x", instruction: "Punchy" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { heading: string } };
    expect(body.data.heading).toBe("H");
  });
});

describe("POST /api/generate/field", () => {
  it("returns one value", async () => {
    const res = await field(post("http://x/api/generate/field", { type: "executive_summary", fieldKey: "heading", brief: "x", currentValue: "old" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: string };
    expect(body.value).toBe("One field");
  });

  it("400s a non-AI field", async () => {
    const res = await field(post("http://x/api/generate/field", { type: "commercial_comparison", fieldKey: "matrix", brief: "x" }));
    expect(res.status).toBe(400);
  });

  it("400s a malformed body", async () => {
    const res = await field(post("http://x/api/generate/field", { type: "executive_summary" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-routes.test.ts`
Expected: FAIL — section route doesn't read `instruction`; field route missing.

- [ ] **Step 3: Update the section route**

In `apps/web/app/api/generate/section/route.ts`, update the destructure + call to thread `instruction` (the model already comes from `getActiveModel` after slice 5):

```ts
  const { type, brief, instruction, sectionId } = body as {
    type: string;
    brief: string;
    instruction?: string;
    sectionId?: string;
  };

  const model = await getActiveModel();
  const result = await generateSection(
    {
      type,
      brief,
      model,
      ...(instruction !== undefined ? { instruction } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
    },
    anthropicCreateMessage,
  );
```

- [ ] **Step 4: Implement the field route**

Create `apps/web/app/api/generate/field/route.ts`:

```ts
import { NextResponse } from "next/server";
import { generateField } from "../../../../src/server/generateField";
import { anthropicCreateMessage } from "../../../../src/server/anthropic";
import { requireOwner } from "../../../../src/server/auth/guard";
import { getActiveModel } from "../../../../src/server/aiModel";

/**
 * POST /api/generate/field — rewrite one AI-composable field (§10). The model is
 * the admin setting; the client supplies the field instruction + current value.
 */
export async function POST(request: Request): Promise<Response> {
  const owner = await requireOwner();
  if (owner instanceof Response) return owner;
  const body: unknown = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { type?: unknown }).type !== "string" ||
    typeof (body as { fieldKey?: unknown }).fieldKey !== "string" ||
    typeof (body as { brief?: unknown }).brief !== "string"
  ) {
    return NextResponse.json({ error: "Expected { type, fieldKey, brief }" }, { status: 400 });
  }

  const { type, fieldKey, brief, instruction, currentValue, sectionId } = body as {
    type: string;
    fieldKey: string;
    brief: string;
    instruction?: string;
    currentValue?: string;
    sectionId?: string;
  };

  const model = await getActiveModel();
  const result = await generateField(
    {
      type,
      fieldKey,
      brief,
      model,
      ...(instruction !== undefined ? { instruction } : {}),
      ...(currentValue !== undefined ? { currentValue } : {}),
      ...(sectionId !== undefined ? { sectionId } : {}),
    },
    anthropicCreateMessage,
  );
  if (!result.ok) {
    const status = result.error?.includes("isn't AI-composable") ? 400 : 422;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ value: result.value, validation: result.validation });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/generate/section/route.ts apps/web/app/api/generate/field/route.ts apps/web/src/__tests__/slice-18-routes.test.ts
git commit -m "feat(generation): section instruction route + /api/generate/field"
```

---

### Task 18.5: Client generation calls (drop model; add instruction + field)

**Files:**
- Modify: `apps/web/src/client/generate.ts`
- Test: `apps/web/src/__tests__/slice-18-client.test.ts`

**Interfaces:**
- Produces: `requestSectionGeneration({ type, brief, instruction?, sectionId? })`; `requestFieldGeneration({ type, fieldKey, brief, instruction?, currentValue?, sectionId? }): Promise<{ ok; value?; validation?; error? }>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-client.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestSectionGeneration, requestFieldGeneration } from "../client/generate";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("client generation", () => {
  it("posts a section rewrite with instruction and no model", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { heading: "H" } }) });
    const r = await requestSectionGeneration({ type: "executive_summary", brief: "b", instruction: "i" });
    expect(r.ok).toBe(true);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(sent).toEqual({ type: "executive_summary", brief: "b", instruction: "i" });
  });

  it("posts a field rewrite and returns the value", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ value: "v" }) });
    const r = await requestFieldGeneration({ type: "executive_summary", fieldKey: "heading", brief: "b", currentValue: "c" });
    expect(r.ok).toBe(true);
    expect(r.value).toBe("v");
    expect(fetchMock).toHaveBeenCalledWith("/api/generate/field", expect.objectContaining({ method: "POST" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-client.test.ts`
Expected: FAIL — `requestFieldGeneration` missing; section call still includes `model`.

- [ ] **Step 3: Rewrite the client module**

Replace `apps/web/src/client/generate.ts` with:

```ts
import type { ValidationResult } from "@proposal/shared";

export interface SectionGenerationResult {
  ok: boolean;
  data?: Record<string, unknown>;
  validation?: ValidationResult;
  error?: string;
}

export interface FieldGenerationResult {
  ok: boolean;
  value?: unknown;
  validation?: ValidationResult;
  error?: string;
}

/** Section rewrite: redo all text fields. The model is the admin setting (server-side). */
export async function requestSectionGeneration(input: {
  type: string;
  brief: string;
  instruction?: string;
  sectionId?: string;
}): Promise<SectionGenerationResult> {
  const res = await fetch("/api/generate/section", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    validation?: ValidationResult;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: body.error ?? `Request failed (${res.status})` };
  return {
    ok: true,
    ...(body.data ? { data: body.data } : {}),
    ...(body.validation ? { validation: body.validation } : {}),
  };
}

/** Per-field rewrite: redo a single AI-composable field. */
export async function requestFieldGeneration(input: {
  type: string;
  fieldKey: string;
  brief: string;
  instruction?: string;
  currentValue?: string;
  sectionId?: string;
}): Promise<FieldGenerationResult> {
  const res = await fetch("/api/generate/field", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    value?: unknown;
    validation?: ValidationResult;
    error?: string;
  };
  if (!res.ok) return { ok: false, error: body.error ?? `Request failed (${res.status})` };
  return {
    ok: true,
    value: body.value,
    ...(body.validation ? { validation: body.validation } : {}),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/client/generate.ts apps/web/src/__tests__/slice-18-client.test.ts
git commit -m "feat(generation): client section(instruction) + field generation calls"
```

---

### Task 18.6: `brief` sourced from the document

**Files:**
- Modify: `apps/web/src/state/proposalStore.ts`
- Test: `apps/web/src/__tests__/slice-18-brief.test.ts`

**Interfaces:**
- Produces: store `setBrief(brief)` writes `document.brief`; the standalone `brief` state field is removed (read `document.brief ?? ""`).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-brief.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";

beforeEach(() => {
  useProposalStore.setState({
    document: { id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open", sections: [] },
  });
});

describe("brief lives in the document", () => {
  it("setBrief writes document.brief", () => {
    useProposalStore.getState().setBrief("Solar for Acme");
    expect(useProposalStore.getState().document.brief).toBe("Solar for Acme");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-brief.test.ts`
Expected: FAIL — `setBrief` writes the standalone `brief` field, not `document.brief`.

- [ ] **Step 3: Move `brief` into the document**

In `apps/web/src/state/proposalStore.ts`:

Remove the `brief: string;` line from the `ProposalState` interface (line 33) and remove the initial `brief: "",` (line 76).

Change `setBrief` (line 91):

```ts
  setBrief: (brief) => set((state) => ({ document: { ...state.document, brief } })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-brief.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (expect the Inspector to break — fixed in Task 18.7)**

Run: `npm run typecheck`
Expected: errors only in `Inspector.tsx` (it still reads `s.brief` / `s.model`). That is intended; Task 18.7 rewrites the Inspector. Do not fix other files.

> Note for the implementer: this task intentionally leaves a typecheck break in `Inspector.tsx` that Task 18.7 resolves. Commit anyway so the brief change is isolated.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/state/proposalStore.ts apps/web/src/__tests__/slice-18-brief.test.ts
git commit -m "feat(editor): persist the proposal brief in document.brief"
```

---

### Task 18.7: Inspector → AI workspace (Document disclosure + brief + rewrite + schema-driven fields)

**Files:**
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-18-inspector.test.tsx`

**Interfaces:**
- Consumes: store (`document`, `theme`, fork actions, `setBrief`, `setSectionData`, `setVariant`, `setSectionType`, `applyTemplate`, `templates`); `requestSectionGeneration`, `requestFieldGeneration`; `fieldKind`, `getSectionType`, `isFieldLocked`, `isStructureLocked`, `isThemePinned`, `variantRangeWarnings`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-18-inspector.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "Hi", body: "Body" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Inspector AI workspace", () => {
  it("has a Document disclosure and a Brief that persists", () => {
    render(<Inspector />);
    expect(screen.getByText(/document/i)).toBeTruthy();
    const brief = screen.getByLabelText("brief") as HTMLTextAreaElement;
    fireEvent.change(brief, { target: { value: "Solar for Acme" } });
    expect(useProposalStore.getState().document.brief).toBe("Solar for Acme");
  });

  it("shows a section rewrite instruction + button and per-field rewrite for text fields", () => {
    render(<Inspector />);
    expect(screen.getByLabelText("section-instruction")).toBeTruthy();
    expect(screen.getByRole("button", { name: /rewrite section/i })).toBeTruthy();
    // text field editor + its per-field rewrite
    expect(screen.getByLabelText("field-heading")).toBeTruthy();
    expect(screen.getByLabelText("instruction-heading")).toBeTruthy();
  });

  it("has no per-user model picker", () => {
    render(<Inspector />);
    expect(screen.queryByLabelText("Model")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx`
Expected: FAIL — current Inspector has a Model picker and no Document disclosure / per-field rewrite.

- [ ] **Step 3: Rewrite the Inspector**

Replace `apps/web/src/ui/Inspector.tsx` with:

```tsx
"use client";

import { useState } from "react";
import {
  fieldKind,
  getSectionType,
  isFieldLocked,
  isStructureLocked,
  isThemePinned,
  openTemplate,
  variantRangeWarnings,
} from "@proposal/shared";
import { resolveSection } from "../registry/componentRegistry";
import { useProposalStore } from "../state/proposalStore";
import { requestFieldGeneration, requestSectionGeneration } from "../client/generate";
import { themes } from "../theme/themes";
import { ThemeForm } from "./ThemeForm";
import { CodeEditor } from "./CodeEditor";
import { DataGrid } from "./DataGrid";
import { ColumnMapping } from "./ColumnMapping";
import { MatrixEditor } from "./MatrixEditor";
import { AssetUpload } from "./AssetUpload";

type Tab = "tokens" | "code";

/**
 * Right pane: a collapsible Document disclosure (template + theme) atop an AI
 * workspace — the proposal brief, a section-rewrite instruction, and a
 * schema-driven field area (text fields AI-composable, data fields manual).
 */
export function Inspector() {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const selectedId = useProposalStore((s) => s.selectedId);
  const sections = useProposalStore((s) => s.document.sections);
  const setVariant = useProposalStore((s) => s.setVariant);
  const setSectionData = useProposalStore((s) => s.setSectionData);
  const setSectionType = useProposalStore((s) => s.setSectionType);
  const applyTemplateAction = useProposalStore((s) => s.applyTemplate);
  const templates = useProposalStore((s) => s.templates);
  const setBrief = useProposalStore((s) => s.setBrief);
  const notify = useProposalStore((s) => s.notify);

  const forkTheme = useProposalStore((s) => s.forkTheme);
  const unforkTheme = useProposalStore((s) => s.unforkTheme);
  const selectPreset = useProposalStore((s) => s.selectPreset);
  const isForked = document.theme !== undefined;

  const [tab, setTab] = useState<Tab>("tokens");
  const [docOpen, setDocOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [fieldInstr, setFieldInstr] = useState<Record<string, string>>({});

  const brief = document.brief ?? "";
  const template = templates.find((t) => t.id === document.templateId) ?? openTemplate;
  const pinned = isThemePinned(template);
  const structureLocked = isStructureLocked(template);

  const selectedIndex = sections.findIndex((s) => s.id === selectedId);
  const selected = selectedIndex >= 0 ? sections[selectedIndex] : undefined;
  const slot = selectedIndex >= 0 ? template.slots[selectedIndex] : undefined;
  const choiceSlot = slot?.kind === "choice" ? slot : undefined;
  const typeSchema = selected ? getSectionType(selected.type) : undefined;
  const variants = typeSchema?.variants ?? [];
  const rangeWarnings = selected ? variantRangeWarnings(selected) : [];
  const isUnstyled = selected ? resolveSection(selected).unstyled : false;
  const hasAiFields = (typeSchema?.fields ?? []).some((f) => fieldKind(f) === "ai");

  const setField = (key: string, value: unknown) => {
    if (!selected) return;
    setSectionData(selected.id, { ...selected.data, [key]: value });
  };

  const rewriteSection = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await requestSectionGeneration({
      type: selected.type,
      brief,
      instruction: sectionInstruction,
      sectionId: selected.id,
    });
    setBusy(false);
    if (result.ok && result.data) {
      setSectionData(selected.id, { ...selected.data, ...result.data }); // merge: keep data/manual fields
      notify("success", "Section rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  const rewriteField = async (key: string) => {
    if (!selected) return;
    setBusy(true);
    const current = typeof selected.data[key] === "string" ? (selected.data[key] as string) : "";
    const result = await requestFieldGeneration({
      type: selected.type,
      fieldKey: key,
      brief,
      instruction: fieldInstr[key] ?? "",
      currentValue: current,
      sectionId: selected.id,
    });
    setBusy(false);
    if (result.ok) {
      setField(key, result.value);
      notify("success", "Field rewritten.");
    } else {
      notify("error", result.error ?? "Generation failed");
    }
  };

  return (
    <aside aria-label="Inspector" className="pane inspector">
      {/* Document disclosure: template + theme */}
      <div className="group">
        <button type="button" className="group__title group__toggle" aria-expanded={docOpen} onClick={() => setDocOpen((v) => !v)}>
          Document {docOpen ? "▾" : "▸"}
        </button>
        {docOpen ? (
          <>
            <div className="field">
              <span className="field__label">Template</span>
              <select aria-label="Template" value={document.templateId} onChange={(e) => applyTemplateAction(e.target.value)}>
                {templates
                  .filter((t) => !t.deprecated || t.id === document.templateId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              {structureLocked ? <small className="meter">Structure & theme are locked by this template.</small> : null}
            </div>

            <div className="group__sub">
              <div className="group__title">Theme{pinned ? " · pinned" : ""}</div>
              <fieldset disabled={pinned} style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="field">
                  <span className="field__label">Preset</span>
                  <select aria-label="Theme preset" value={isForked ? "custom" : theme.id} onChange={(e) => selectPreset(e.target.value)}>
                    {isForked ? <option value="custom">Custom (forked)</option> : null}
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isForked ? (
                  <div className="field">
                    <button type="button" className="btn btn--ghost" onClick={forkTheme}>
                      Fork to edit
                    </button>
                    <small className="meter">Presets are read-only. Fork to customise colours, fonts, and the logo.</small>
                  </div>
                ) : (
                  <>
                    <div className="tabs" role="tablist" aria-label="Theme editor">
                      <button type="button" className="tab" role="tab" aria-selected={tab === "tokens"} onClick={() => setTab("tokens")}>
                        Tokens
                      </button>
                      <button type="button" className="tab" role="tab" aria-selected={tab === "code"} onClick={() => setTab("code")}>
                        Code
                      </button>
                    </div>
                    {tab === "tokens" ? (
                      <ThemeForm />
                    ) : (
                      <div className="editor-frame">
                        <CodeEditor />
                      </div>
                    )}
                    <AssetUpload />
                    <div className="field">
                      <button type="button" className="btn btn--ghost" onClick={unforkTheme}>
                        Revert to preset
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
            </div>
          </>
        ) : null}
      </div>

      {/* Proposal brief: global generation context */}
      <div className="group">
        <div className="group__title">Proposal brief</div>
        <div className="field">
          <textarea
            aria-label="brief"
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What's this proposal about? (sent as context on every AI call)"
          />
        </div>
      </div>

      {selected && typeSchema ? (
        <div className="group">
          <div className="group__title">Section · {typeSchema.label}</div>

          {isUnstyled ? (
            <p className="notice notice--warn" data-flag="unstyled">
              No layout is registered for this section — it&apos;s rendering with the generic (unstyled) fallback.
            </p>
          ) : null}

          {rangeWarnings.length > 0 ? (
            <ul className="notice notice--warn" data-flag="range">
              {rangeWarnings.map((w) => (
                <li key={`${w.fieldKey}:${w.message}`}>{w.message}</li>
              ))}
            </ul>
          ) : null}

          {choiceSlot ? (
            <div className="field">
              <span className="field__label">Commercial model (choice slot)</span>
              <select aria-label="Choice type" value={selected.type} onChange={(e) => setSectionType(selected.id, e.target.value)}>
                {choiceSlot.allowed.map((t) => (
                  <option key={t} value={t}>
                    {getSectionType(t)?.label ?? t}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Section rewrite */}
          {hasAiFields ? (
            <div className="field">
              <span className="field__label">Rewrite section (all text fields)</span>
              <textarea
                aria-label="section-instruction"
                rows={2}
                value={sectionInstruction}
                onChange={(e) => setSectionInstruction(e.target.value)}
                placeholder="Optional instruction, e.g. 'make it more concise'"
              />
              <button type="button" className="btn btn--primary" disabled={busy} onClick={rewriteSection}>
                {busy ? "Working…" : "Rewrite section with AI"}
              </button>
            </div>
          ) : null}

          {/* Schema-driven field area */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {typeSchema.fields.map((field) => {
              const kind = fieldKind(field);
              const locked = isFieldLocked(template, selectedIndex, selected, field.key);
              const label = `${field.label ?? field.key}${field.required ? " *" : ""}${locked ? " · locked" : ""}`;

              if (kind === "data") {
                // Tabular fields use the dedicated editors (never AI).
                if (selected.type === "data_table") {
                  return (
                    <div className="field" key={field.key}>
                      <span className="field__label">{label}</span>
                      <DataGrid sectionId={selected.id} />
                      <ColumnMapping sectionId={selected.id} />
                    </div>
                  );
                }
                if (selected.type === "commercial_comparison") {
                  return (
                    <div className="field" key={field.key}>
                      <span className="field__label">{label}</span>
                      <MatrixEditor sectionId={selected.id} />
                    </div>
                  );
                }
                return null;
              }

              if (kind === "manual") {
                const value = typeof selected.data[field.key] === "string" ? (selected.data[field.key] as string) : "";
                return (
                  <label className="field" key={field.key}>
                    <span className="field__label">{label}</span>
                    <input aria-label={`field-${field.key}`} value={value} readOnly={locked} disabled={locked} onChange={(e) => setField(field.key, e.target.value)} />
                  </label>
                );
              }

              // kind === "ai": text | paragraph | list
              const raw = selected.data[field.key];
              const isList = field.type === "list";
              const textValue = isList
                ? (Array.isArray(raw) ? (raw as string[]).join("\n") : "")
                : typeof raw === "string"
                  ? (raw as string)
                  : "";
              const onChange = (v: string) => setField(field.key, isList ? v.split("\n").filter((x) => x.length > 0) : v);

              return (
                <div className="field" key={field.key}>
                  <span className="field__label">{label}</span>
                  {field.type === "text" ? (
                    <input aria-label={`field-${field.key}`} value={textValue} readOnly={locked} disabled={locked} onChange={(e) => onChange(e.target.value)} />
                  ) : (
                    <textarea
                      aria-label={`field-${field.key}`}
                      rows={isList ? 4 : 3}
                      value={textValue}
                      readOnly={locked}
                      disabled={locked}
                      placeholder={isList ? "One item per line" : undefined}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  )}
                  {!locked ? (
                    <div className="field field--row">
                      <input
                        aria-label={`instruction-${field.key}`}
                        placeholder="Field instruction (optional)"
                        value={fieldInstr[field.key] ?? ""}
                        onChange={(e) => setFieldInstr((m) => ({ ...m, [field.key]: e.target.value }))}
                      />
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => rewriteField(field.key)}>
                        Rewrite field
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {!structureLocked && variants.length > 0 ? (
            <div className="field">
              <span className="field__label">Variant</span>
              <select value={selected.variant ?? typeSchema.defaultVariant ?? ""} onChange={(e) => setVariant(selected.id, e.target.value)}>
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="group">
          <small className="meter">Select a section to edit it.</small>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-18-inspector.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Re-run the slice-17 Inspector theme test (still green)**

Run: `npx vitest run apps/web/src/__tests__/slice-17-inspector-theme.test.tsx`
Expected: PASS — the theme group still offers "Fork to edit"/token editor (now inside the Document disclosure, which is open by default).

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors (the Inspector no longer reads the removed `brief`/`model` state).
Run: `npm run build -w @proposal/web`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-18-inspector.test.tsx
git commit -m "feat(editor): AI workspace right panel (Document disclosure, brief, rewrite, schema-driven fields)"
```

---

## Slice 3 — Paged document model

### Task 19.1: Page geometry constant + `section.pageBreakBefore`

**Files:**
- Create: `packages/shared/src/render/page.ts`
- Modify: `packages/shared/src/types/section.ts`
- Modify: `packages/shared/src/schema/section.schema.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/slice-19-paged.test.ts`

**Interfaces:**
- Produces: `PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 }`; `Section.pageBreakBefore?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/slice-19-paged.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PAGE } from "../render/page";
import { validateSection } from "../validation/validateSection";

describe("paged model", () => {
  it("exports A4 portrait geometry", () => {
    expect(PAGE).toEqual({ size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 });
  });

  it("accepts a section with pageBreakBefore", () => {
    const result = validateSection({ id: "s", type: "executive_summary", data: { heading: "H", body: "B" }, pageBreakBefore: true });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/slice-19-paged.test.ts`
Expected: FAIL — `PAGE` missing; `pageBreakBefore` rejected by `additionalProperties: false`.

- [ ] **Step 3: Add the page constant**

Create `packages/shared/src/render/page.ts`:

```ts
/** Fixed page geometry for the paged document model (§10.3). A4 portrait, mm. */
export const PAGE = { size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 } as const;
```

- [ ] **Step 4: Add the type + schema property**

In `packages/shared/src/types/section.ts`, add inside `Section` (after `locked?: …`):

```ts
  /** Force this section to start on a new page in the paged model (§10.3). */
  pageBreakBefore?: boolean;
```

In `packages/shared/src/schema/section.schema.ts`, add to the top-level `properties` (after `locked: …`, line 140):

```ts
      pageBreakBefore: { type: "boolean" },
```

- [ ] **Step 5: Export the constant**

In `packages/shared/src/index.ts`, after the "Sample content" export, add:

```ts
// Paged model
export { PAGE } from "./render/page";
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/slice-19-paged.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/render/page.ts packages/shared/src/types/section.ts packages/shared/src/schema/section.schema.ts packages/shared/src/index.ts packages/shared/src/__tests__/slice-19-paged.test.ts
git commit -m "feat(paged): A4 page geometry + section.pageBreakBefore"
```

---

### Task 19.2: Paged renderer + shared paged CSS

**Files:**
- Create: `apps/web/src/render/paged.css`
- Modify: `apps/web/src/render/DocumentRenderer.tsx`
- Test: `apps/web/src/__tests__/slice-19-renderer.test.tsx`

**Interfaces:**
- Consumes: `PAGE`; `Section.pageBreakBefore`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/__tests__/slice-19-renderer.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

afterEach(() => cleanup());

const doc: ProposalDocument = {
  id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
  sections: [
    { id: "a", type: "text", data: { heading: "A", body: "Body A" } },
    { id: "b", type: "text", data: { heading: "B", body: "Body B" }, pageBreakBefore: true },
  ],
};

describe("DocumentRenderer paged", () => {
  it("marks page breaks and renders an A4 sheet", () => {
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    expect(container.querySelector(".paged-document")).toBeTruthy();
    const broken = container.querySelectorAll('[data-page-break-before="true"]');
    expect(broken.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-19-renderer.test.tsx`
Expected: FAIL — no `.paged-document` / no `data-page-break-before`.

- [ ] **Step 3: Add the paged CSS**

Create `apps/web/src/render/paged.css`:

```css
/* Paged document model (§10.3). Same rules drive on-screen sheets and the PDF;
   Chromium paginates the PDF via @page + the break rules — pixel-stable export. */
@page {
  size: A4;
  margin: 18mm;
}

.paged-document {
  width: 210mm;
  margin: 0 auto;
  box-sizing: border-box;
}

.paged-section {
  break-inside: avoid;
}

.paged-section[data-page-break-before="true"] {
  break-before: page;
}

/* On screen only: a faint A4-height guide so users see roughly where pages fall.
   Auto-split boundaries are approximate on screen; the PDF is exact. */
@media screen {
  .paged-document {
    background: var(--c-surface);
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent calc(297mm - 1px),
      color-mix(in srgb, var(--c-line) 60%, transparent) calc(297mm - 1px),
      color-mix(in srgb, var(--c-line) 60%, transparent) 297mm
    );
    box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
  }
}
```

- [ ] **Step 4: Rewrite the DocumentRenderer**

Replace `apps/web/src/render/DocumentRenderer.tsx` with:

```tsx
import type { ProposalDocument, ThemeTokens } from "@proposal/shared";
import { ThemeProvider } from "../theme/ThemeProvider";
import { SectionRenderer } from "./SectionRenderer";
import "./paged.css";

/**
 * Renders a whole proposal as an A4 sheet. Each section is break-safe; sections
 * flagged pageBreakBefore start a new page. The same paged CSS drives the PDF, so
 * the export paginates exactly via Chromium (§10.3).
 */
export function DocumentRenderer({
  document,
  theme,
}: {
  document: ProposalDocument;
  theme: ThemeTokens;
}) {
  return (
    <ThemeProvider theme={theme}>
      <article
        data-document={document.id}
        className="paged-document"
        style={{
          color: "var(--c-text)",
          fontFamily: "var(--f-body)",
          padding: "calc(56px * var(--space))",
          display: "flex",
          flexDirection: "column",
          gap: "calc(32px * var(--space))",
        }}
      >
        {document.sections.map((section) => (
          <div
            key={section.id}
            className="paged-section"
            data-page-break-before={section.pageBreakBefore ? "true" : undefined}
          >
            <SectionRenderer section={section} theme={theme} />
          </div>
        ))}
      </article>
    </ThemeProvider>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-19-renderer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/render/paged.css apps/web/src/render/DocumentRenderer.tsx apps/web/src/__tests__/slice-19-renderer.test.tsx
git commit -m "feat(paged): A4 sheet renderer + shared paged CSS (drives PDF + on-screen)"
```

---

### Task 19.3: Page-break toggle (store + Inspector)

**Files:**
- Modify: `apps/web/src/state/mutations.ts`
- Modify: `apps/web/src/state/proposalStore.ts`
- Modify: `apps/web/src/ui/Inspector.tsx`
- Test: `apps/web/src/__tests__/slice-19-pagebreak.test.ts`
- Test: `apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx`

**Interfaces:**
- Produces: `setSectionPageBreak(doc, sectionId, value): ProposalDocument`; store `setPageBreakBefore(sectionId, value)`.

- [ ] **Step 1: Write the failing store/mutation test**

Create `apps/web/src/__tests__/slice-19-pagebreak.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { setSectionPageBreak } from "../state/mutations";
import { useProposalStore } from "../state/proposalStore";

const doc = {
  id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
  sections: [{ id: "a", type: "text", data: {} }],
};

describe("setSectionPageBreak", () => {
  it("toggles the flag immutably", () => {
    const next = setSectionPageBreak(doc, "a", true);
    expect(next.sections[0]!.pageBreakBefore).toBe(true);
    expect(doc.sections[0]!).not.toHaveProperty("pageBreakBefore");
  });
});

describe("store setPageBreakBefore", () => {
  beforeEach(() => useProposalStore.setState({ document: { ...doc, sections: [{ id: "a", type: "text", data: {} }] }, selectedId: "a" }));
  it("sets the flag on the document", () => {
    useProposalStore.getState().setPageBreakBefore("a", true);
    expect(useProposalStore.getState().document.sections[0]!.pageBreakBefore).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-19-pagebreak.test.ts`
Expected: FAIL — `setSectionPageBreak` / `setPageBreakBefore` missing.

- [ ] **Step 3: Implement the mutation + store action**

In `apps/web/src/state/mutations.ts`, append:

```ts
/** Toggle a section's manual page break, immutably. */
export function setSectionPageBreak(doc: ProposalDocument, sectionId: string, value: boolean): ProposalDocument {
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.id === sectionId ? { ...s, pageBreakBefore: value } : s)),
  };
}
```

In `apps/web/src/state/proposalStore.ts`:

Extend the mutations import:

```ts
import { setSectionVariant, setSectionData, setSectionType, appendSection, insertSection, removeSection, setSectionPageBreak } from "./mutations";
```

Add to the `ProposalState` interface (after `removeSection`):

```ts
  /** Toggle a section's manual page break. */
  setPageBreakBefore: (sectionId: string, value: boolean) => void;
```

Add the action (after `removeSection:`):

```ts
  setPageBreakBefore: (sectionId, value) =>
    set((state) => ({ document: setSectionPageBreak(state.document, sectionId, value) })),
```

- [ ] **Step 4: Run the store/mutation test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-19-pagebreak.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Inspector test**

Create `apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "H", body: "B" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector page-break toggle", () => {
  it("toggles section.pageBreakBefore", () => {
    render(<Inspector />);
    const box = screen.getByLabelText(/page break before this section/i);
    fireEvent.click(box);
    expect(useProposalStore.getState().document.sections[0]!.pageBreakBefore).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx`
Expected: FAIL — no page-break checkbox.

- [ ] **Step 7: Add the toggle to the Inspector**

In `apps/web/src/ui/Inspector.tsx`, add the store selector (next to the other section selectors near the top of the component):

```ts
  const setPageBreakBefore = useProposalStore((s) => s.setPageBreakBefore);
```

Inside the `selected && typeSchema` section block, add the checkbox just before the Variant `<div>` (after the schema-driven field area):

```tsx
          {!structureLocked ? (
            <label className="field field--row">
              <span className="field__label">Page break before this section</span>
              <input
                type="checkbox"
                aria-label="Page break before this section"
                checked={selected.pageBreakBefore ?? false}
                onChange={(e) => setPageBreakBefore(selected.id, e.target.checked)}
              />
            </label>
          ) : null}
```

- [ ] **Step 8: Run the Inspector test to verify it passes**

Run: `npx vitest run apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/state/mutations.ts apps/web/src/state/proposalStore.ts apps/web/src/ui/Inspector.tsx apps/web/src/__tests__/slice-19-pagebreak.test.ts apps/web/src/__tests__/slice-19-inspector-pagebreak.test.tsx
git commit -m "feat(paged): manual page-break toggle (store + Inspector)"
```

---

### Task 19.4: Final full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all tests pass (including the existing slices).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build -w @proposal/web`
Expected: clean build; the `/`, `/p/[id]`, `/print/[id]`, `/admin`, and all `/api/*` routes compile.

- [ ] **Step 4: Commit (if any incidental fixes were needed)**

```bash
git add -A
git commit -m "test: full-suite + typecheck + build green for the editor fix batch"
```

---

## Self-Review

**1. Spec coverage**
- Slice 5 (admin model): Tasks 15.1–15.4 — persistence, route, generation wiring (section + proposal), admin UI. ✅
- Slice 1 (add/delete): Tasks 16.1–16.3 — mutations, store, outline UI (insert + delete-with-confirm; locked-template gating). ✅
- Slice 2 (preset read-only/fork): Tasks 17.1–17.4 — `document.theme` type/schema/validation, store fork/unfork/selectPreset + derivation, print resolution, Inspector read-only/fork UI. ✅
- Slice 4 (AI workspace): Tasks 18.1–18.7 — fieldKind + schemas, prompts, generateSection(instruction)+generateField, routes, client, brief-in-document, Inspector rebuild (Document disclosure, brief, section rewrite, schema-driven fields, model picker removed, CopyFields folded in). ✅
- Slice 3 (paged): Tasks 19.1–19.4 — PAGE + pageBreakBefore, paged CSS + renderer, page-break toggle, final verify. ✅
- Build-time verification flags (AI surface slices 4/5, PDF surface slice 3): carried in Global Constraints. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; the only "generated" artifact is migration `0006` (Task 15.1 Step 8), which is produced by the documented command and inspected. ✅

**3. Type consistency:**
- `getAiModel(): Promise<GenerationModelId | null>` / `setAiModel(model: GenerationModelId)` consistent across types.ts, memory, postgres, route, and `getActiveModel`.
- `requestSectionGeneration({type, brief, instruction?, sectionId?})` (no `model`) matches the section route body and Inspector caller.
- `requestFieldGeneration(...)` returns `{ ok, value?, validation?, error? }` matching the field route response and Inspector caller.
- `fieldKind` / `buildTextFieldsGenerationSchema` / `buildFieldGenerationSchema` defined in 18.1, consumed in 18.3/18.7 with matching signatures.
- `document.theme` / `document.brief` / `section.pageBreakBefore` added in 17.1/18.6/19.1 and consumed consistently (store, print, renderer, inspector).
- Known intentional transient break: Task 18.6 leaves `Inspector.tsx` failing typecheck until Task 18.7 (flagged in 18.6 Step 5). These two tasks must execute in order.

## Execution sequencing note

Tasks are ordered for in-order execution. The only hard ordering coupling beyond the slice order is **18.6 → 18.7** (brief removal then Inspector rewrite). Within Slice 2, **17.4** depends on **17.2**; within Slice 4, **18.7** depends on 18.1/18.5/18.6.
