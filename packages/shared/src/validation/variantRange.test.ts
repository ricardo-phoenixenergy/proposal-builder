import { describe, expect, it } from "vitest";
import { variantRangeWarnings } from "./variantRange";
import type { Section } from "../types/section";

const banner = (body: string, heading = "Summary"): Section => ({
  id: "s1",
  type: "executive_summary",
  variant: "banner",
  data: { heading, body },
});

describe("variantRangeWarnings — soft, variant-aware content ranges (§13.10)", () => {
  it("warns when the body overflows the banner layout's recommended range", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const warnings = variantRangeWarnings(banner(long));
    expect(warnings.some((w) => w.fieldKey === "body")).toBe(true);
    expect(warnings[0]?.variant).toBe("banner");
  });

  it("does not warn when banner content sits within range", () => {
    expect(variantRangeWarnings(banner("Short and punchy summary."))).toEqual([]);
  });

  it("warns on an over-long banner heading", () => {
    const warnings = variantRangeWarnings(
      banner("ok", "An extremely long heading that will never fit a banner band"),
    );
    expect(warnings.some((w) => w.fieldKey === "heading")).toBe(true);
  });

  it("emits nothing for a variant with no recommended range (standard)", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    expect(
      variantRangeWarnings({
        id: "s2",
        type: "executive_summary",
        variant: "standard",
        data: { heading: "H", body: long },
      }),
    ).toEqual([]);
  });

  it("emits nothing for an unknown section type", () => {
    expect(variantRangeWarnings({ id: "s3", type: "nope", data: {} })).toEqual([]);
  });
});
