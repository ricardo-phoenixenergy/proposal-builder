import { describe, expect, it } from "vitest";
import { sanitizeLayoutHtml } from "../template/sanitizeLayoutHtml";

describe("sanitizeLayoutHtml", () => {
  it("keeps structural + text markup and class/style", () => {
    const html = '<section class="c"><h1 style="position:absolute">Hi</h1><p>x</p></section>';
    expect(sanitizeLayoutHtml(html)).toContain("<h1");
    expect(sanitizeLayoutHtml(html)).toContain("position:absolute");
  });
  it("keeps https and data:image img src, drops other schemes", () => {
    expect(sanitizeLayoutHtml('<img src="https://x/y.png">')).toContain("https://x/y.png");
    expect(sanitizeLayoutHtml('<img src="data:image/png;base64,AAA">')).toContain("data:image");
    expect(sanitizeLayoutHtml('<img src="javascript:alert(1)">')).not.toContain("javascript:");
  });
  it("strips <script>, <iframe>, on* handlers and javascript: hrefs", () => {
    expect(sanitizeLayoutHtml("<script>alert(1)</script><p>ok</p>")).not.toContain("script");
    expect(sanitizeLayoutHtml('<iframe src="x"></iframe>')).not.toContain("iframe");
    expect(sanitizeLayoutHtml('<div onclick="x()">a</div>')).not.toContain("onclick");
    expect(sanitizeLayoutHtml('<a href="javascript:x()">a</a>')).not.toContain("javascript:");
  });
  it("strips <style> and <link> from the template body", () => {
    expect(sanitizeLayoutHtml('<style>body{}</style><link rel="x">')).toBe("");
  });
});
