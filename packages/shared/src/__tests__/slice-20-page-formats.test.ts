import { describe, expect, it } from "vitest";
import { PAGE, PAGE_FORMATS, DEFAULT_PAGE_FORMAT, getPageFormat, pageCss } from "../render/page";

describe("page formats", () => {
  it("keeps the legacy PAGE (A4 portrait) intact", () => {
    expect(PAGE).toEqual({ size: "A4", widthMm: 210, heightMm: 297, marginMm: 18 });
  });

  it("lists the five v1 formats with the right dimensions", () => {
    expect(PAGE_FORMATS.map((f) => f.id)).toEqual([
      "a4_portrait", "a4_landscape", "letter_portrait", "widescreen_16_9", "standard_4_3",
    ]);
    expect(getPageFormat("widescreen_16_9")).toMatchObject({ widthMm: 338.67, heightMm: 190.5, marginMm: 0 });
    expect(getPageFormat("a4_landscape")).toMatchObject({ widthMm: 297, heightMm: 210 });
  });

  it("getPageFormat falls back to A4 portrait for unknown/undefined", () => {
    expect(getPageFormat(undefined).id).toBe("a4_portrait");
    expect(getPageFormat("nope").id).toBe("a4_portrait");
    expect(DEFAULT_PAGE_FORMAT).toBe("a4_portrait");
  });

  it("pageCss emits an @page size + margin rule", () => {
    expect(pageCss(getPageFormat("a4_landscape"))).toBe("@page { size: 297mm 210mm; margin: 18mm; }");
    expect(pageCss(getPageFormat("widescreen_16_9"))).toBe("@page { size: 338.67mm 190.5mm; margin: 0mm; }");
  });
});
