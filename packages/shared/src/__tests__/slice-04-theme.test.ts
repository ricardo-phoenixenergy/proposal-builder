import { describe, expect, it } from "vitest";
import type { ThemeTokens } from "../types/theme";
import { themeSchema } from "../schema/theme.schema";
import { validateTheme } from "../validation/validateTheme";

const goodTheme: ThemeTokens = {
  id: "t1",
  name: "Test",
  colors: {
    primary: "#000000",
    accent: "#111111",
    text: "#222222",
    muted: "#333333",
    surface: "#ffffff",
    line: "#eeeeee",
  },
  fonts: { heading: "Inter", body: "Inter" },
  radius: 8,
  spacing: 1,
};

describe("themeSchema + validateTheme", () => {
  it("is a draft-2020-12 schema", () => {
    expect((themeSchema as { $schema: string }).$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
  });

  it("accepts a well-formed theme", () => {
    expect(validateTheme(goodTheme)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a missing colour with a field-pointer path (schema source)", () => {
    const bad = { ...goodTheme, colors: { ...goodTheme.colors } } as Record<string, unknown>;
    delete (bad["colors"] as Record<string, unknown>)["primary"];
    const result = validateTheme(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.source === "schema" && e.path.includes("colors"))).toBe(true);
  });

  it("rejects a non-numeric radius", () => {
    const result = validateTheme({ ...goodTheme, radius: "big" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("radius"))).toBe(true);
  });

  it("rejects unknown top-level properties", () => {
    const result = validateTheme({ ...goodTheme, evil: true });
    expect(result.valid).toBe(false);
  });
});
