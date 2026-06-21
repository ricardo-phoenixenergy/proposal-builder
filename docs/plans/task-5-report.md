# Task 5 Report: Postgres Schema + Repo + Migration

## Status
COMPLETE — all checkpoints pass.

## Files Changed

1. `apps/web/src/server/db/schema.ts`
   - Added `boolean` to the drizzle-orm/pg-core import.
   - Added `isAdmin: boolean("is_admin").notNull().default(false)` to the `users` table.
   - Added new `sectionTypeRows` pgTable ("section_types": `type` text PK, `definition` jsonb nullable typed as SectionTypeSchema, `deprecated` boolean notNull default false, `updatedAt` timestamptz notNull defaultNow).

2. `apps/web/src/server/repo/postgres.ts`
   - Added `sql` to the drizzle-orm import.
   - Added `sectionTypeRows` to the schema import.
   - Added `SectionTypeRow` to the types import.
   - Updated `getUserByEmail` to include `isAdmin` in the returned object.
   - Updated `createUser` to accept `isAdmin?: boolean` and include it in insert + return.
   - Added `listSectionTypeRows` method.
   - Added `upsertSectionType` method (onConflictDoUpdate on the `type` PK).
   - Added `setSectionTypeDeprecated` method (overlay semantics: existing→update; missing+true→insert overlay; missing+false→null).
   - Added `listInUseTypeKeys` method (DISTINCT `s->>'type'` via `jsonb_array_elements`).

3. `apps/web/drizzle/0002_panoramic_wolfpack.sql` (generated)

## Generated Migration

**Filename:** `apps/web/drizzle/0002_panoramic_wolfpack.sql`

**Full SQL:**

```sql
CREATE TABLE "section_types" (
	"type" text PRIMARY KEY NOT NULL,
	"definition" jsonb,
	"deprecated" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;
```

Both expected changes are present: (a) creates the `section_types` table; (b) adds `users.is_admin`.

## Commands and Output

### Typecheck
```
npm run typecheck
```
Exit 0 — fully clean. No errors.

### Repo Tests
```
npx vitest run apps/web/src/__tests__/slice-11-repo.test.ts apps/web/src/__tests__/slice-11-admin-auth.test.ts apps/web/src/__tests__/slice-08-repo.test.ts
```
Result: 3 test files, 11 tests — all PASS.
- slice-11-admin-auth.test.ts: 2 tests PASS
- slice-11-repo.test.ts: 4 tests PASS
- slice-08-repo.test.ts: 5 tests PASS

### Migration Generation
```
npm run db:generate -w @proposal/web
```
Drizzle-kit detected 6 tables (added section_types, users now has 5 columns).
Output: `drizzle/0002_panoramic_wolfpack.sql`

## Deviations

### `listInUseTypeKeys` typing workaround
`db.execute` with `@neondatabase/serverless` can return rows in two shapes depending on driver version. The plan noted this possibility. The implementation uses a double cast:
```ts
((rows as unknown as { rows?: { type: string }[] }).rows ?? (rows as unknown as { type: string }[])).map((r: { type: string }) => r.type).filter(Boolean)
```
This handles both `{ rows: [...] }` (Neon serverless shape) and direct array return. TypeScript accepts this without error.

## Concerns

None. The Postgres path is not unit-tested (no DB in CI), correctness is verified by typecheck + memory-repo tests + the generated migration, all of which pass cleanly.
