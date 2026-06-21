import { describe, expect, it } from "vitest";
import { validateDocument } from "../validation/validateDocument";
import { sampleProposal } from "../samples/sample-proposal";
import type { ProposalDocument, ThemeTokens } from "../types/index";

/**
 * Inline valid ThemeTokens — mirrors apps/web/src/theme/defaultTheme.ts.
 * We do NOT import across packages because packages/shared's tsconfig has
 * rootDir:"./src", so a ../../../../apps/web/... path would escape rootDir
 * and fail. Behaviour under test is identical.
 */
const validTheme: ThemeTokens = {
  id: "theme_phoenix_default",
  name: "Phoenix Default",
  colors: {
    primary: "#0b5d3b",
    accent: "#f5a623",
    text: "#1a1a1a",
    muted: "#8a8a8a",
    surface: "#ffffff",
    line: "#e2e2e2",
  },
  fonts: {
    heading: "'Inter', sans-serif",
    body: "'Inter', sans-serif",
  },
  radius: 8,
  spacing: 1,
};

describe("document.theme (forked theme)", () => {
  it("accepts a document with a valid embedded theme", () => {
    const doc: ProposalDocument = { ...sampleProposal, theme: { ...validTheme, id: "custom", name: "Custom" } };
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
