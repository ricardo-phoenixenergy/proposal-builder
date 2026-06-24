import { describe, expect, it } from "vitest";
import { PAGE } from "../render/page";
import { validateSection } from "../validation/validateSection";

describe("paged model", () => {
  it("exports A4 portrait geometry", () => {
    expect(PAGE).toEqual({ size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 });
  });

  it("accepts a section with pageBreakBefore", () => {
    const result = validateSection({
      id: "s",
      type: "executive_summary",
      data: { heading: "H", body: "B" },
      pageBreakBefore: true,
    });
    expect(result.valid).toBe(true);
  });
});
