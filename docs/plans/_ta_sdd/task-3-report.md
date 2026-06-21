# Task 3 Report — Postgres parity + schema + migration 0004

## What changed

### `apps/web/src/server/db/schema.ts`
Replaced the old `templates` table (single `template jsonb NOT NULL`) with the new row model:
- `template jsonb` — now **nullable** (null = built-in deprecation overlay)
- `deprecated boolean NOT NULL DEFAULT false` — added
- `updated_at timestamptz NOT NULL DEFAULT now()` — added

### `apps/web/drizzle/0004_loud_frightful_four.sql` (generated)
```sql
ALTER TABLE "templates" ALTER COLUMN "template" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "deprecated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
```
Confirmed: no destructive `DROP TABLE`, no data-loss statements. Purely additive/nullable changes.

### `apps/web/src/server/repo/postgres.ts`
Replaced old `listTemplates()` + `upsertTemplate(template: Template)` with the four row-based methods matching the `Repository` interface:
- `listTemplateRows()` — maps Drizzle rows to `TemplateRow[]`
- `upsertTemplate({ id, template, deprecated })` — insert-or-update, returns `TemplateRow`
- `setTemplateDeprecated(id, deprecated)` — upsert deprecation overlay if row absent, else update
- `listInUseTemplateIds()` — raw SQL distinct `templateId` from proposals JSONB

## Migration filename
`0004_loud_frightful_four.sql`

## Typecheck result
`npm run typecheck` exits with code 2 — **expected residual**: exactly 2 errors, both in `apps/web/app/api/templates/route.ts`:
- `Property 'listTemplates' does not exist on type 'Repository'. Did you mean 'listTemplateRows'?`
- `Argument of type 'Template' is not assignable to parameter of type '{ id: string; template: Template | null; deprecated: boolean; }'.`

The repo layer (`postgres.ts`, `schema.ts`) is clean. These route errors are Task 5's scope — do NOT touch the route now.

## Regression test result
`npx vitest run apps/web/src/__tests__/slice-13-templates-repo.test.ts`
**PASS — 3/3 tests** in 7ms.

## Files changed
- `apps/web/src/server/db/schema.ts` — templates table updated
- `apps/web/src/server/repo/postgres.ts` — four row-based methods replacing old two
- `apps/web/drizzle/0004_loud_frightful_four.sql` — generated migration
- `apps/web/drizzle/meta/0004_snapshot.json` — generated snapshot (auto)
- `apps/web/drizzle/meta/_journal.json` — updated journal (auto)

## Concerns
None. Migration is additive/nullable. Typecheck residual is exactly as spec'd. Tests pass.
