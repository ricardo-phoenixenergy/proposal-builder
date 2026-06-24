// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolve relative to this test file: apps/web/src/__tests__ -> apps/web/drizzle
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../../drizzle");

describe("0008 index migration", () => {
  it("declares the owner/proposal indexes and is non-destructive", () => {
    const file = readdirSync(dir).find((f) => f.startsWith("0008") && f.endsWith(".sql"));
    expect(file, "0008 migration must exist").toBeTruthy();
    const sql = readFileSync(join(dir, file!), "utf8").toLowerCase();
    for (const idx of [
      "proposals_owner_id_idx",
      "folders_owner_id_idx",
      "themes_owner_id_idx",
      "proposal_versions_proposal_id_idx",
    ]) {
      expect(sql, `index ${idx} must be in the migration`).toContain(idx);
    }
    expect(sql).not.toMatch(/drop\s+table|drop\s+column/); // non-destructive
  });
});
