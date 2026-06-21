import type { Repository } from "./types";
import { createMemoryRepo } from "./memory";

let repo: Repository | null = null;

/**
 * The active repository. Postgres when DATABASE_URL is set (Vercel), otherwise
 * in-memory (tests + zero-config local dev). The Postgres adapter is imported
 * lazily so the Neon driver never loads when it isn't needed.
 */
export function getRepo(): Repository {
  if (repo) return repo;
  if (process.env.DATABASE_URL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    repo = (require("./postgres") as typeof import("./postgres")).createPostgresRepo();
  } else {
    repo = createMemoryRepo();
  }
  return repo;
}

/** Test seam: swap in a fresh repo (e.g. a clean in-memory instance). */
export function setRepoForTests(next: Repository | null): void {
  repo = next;
}

export const DEFAULT_OWNER = "owner_local"; // single-owner until auth (slice 10).
