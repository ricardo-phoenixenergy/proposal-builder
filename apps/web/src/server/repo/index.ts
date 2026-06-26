import type { Repository } from "./types";
import { createMemoryRepo } from "./memory";
import { createPostgresRepo } from "./postgres";

let repo: Repository | null = null;

/**
 * The active repository. Postgres when DATABASE_URL is set (Vercel), otherwise
 * in-memory (tests + zero-config local dev).
 *
 * `createPostgresRepo` is a normal static import, NOT a synchronous
 * `require("./postgres")`. In the production webpack build, postgres.ts compiles
 * to an *async* module (it transitively imports @proposal/shared, whose index pulls
 * ESM-only libs). A synchronous require returns that module's exports before they
 * resolve, so `createPostgresRepo` was `undefined` → "c(...).c is not a function"
 * (a CallbackRouteError on every login + failures on any repo read). The static
 * import makes webpack await the async module before getRepo() ever runs.
 * The Neon driver still connects lazily inside getDb(), so importing it here is cheap.
 */
export function getRepo(): Repository {
  if (repo) return repo;
  repo = process.env.DATABASE_URL ? createPostgresRepo() : createMemoryRepo();
  return repo;
}

/** Test seam: swap in a fresh repo (e.g. a clean in-memory instance). */
export function setRepoForTests(next: Repository | null): void {
  repo = next;
}

export const DEFAULT_OWNER = "owner_local"; // single-owner until auth (slice 10).
