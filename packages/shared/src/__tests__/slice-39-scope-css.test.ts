// packages/shared/src/__tests__/slice-39-scope-css.test.ts
import { describe, expect, it } from "vitest";
import { scopeCss } from "../template/scopeCss";

const S = '[data-layout="cover:hero"]';

describe("scopeCss", () => {
  it("prefixes a simple selector", () => {
    expect(scopeCss(".title{color:red}", S)).toBe(`${S} .title{color:red}`);
  });
  it("prefixes each selector in a comma list", () => {
    expect(scopeCss("h1,h2{margin:0}", S)).toBe(`${S} h1,${S} h2{margin:0}`);
  });
  it("scopes rules inside @media", () => {
    const out = scopeCss("@media print{.x{color:#000}}", S);
    expect(out).toContain("@media print{");
    expect(out).toContain(`${S} .x{color:#000}`);
  });
  it("strips @import and javascript/expression payloads", () => {
    expect(scopeCss('@import url("http://evil");', S)).not.toContain("@import");
    expect(scopeCss(".x{width:expression(alert(1))}", S)).not.toContain("expression(");
    expect(scopeCss(".x{background:url(javascript:x)}", S)).not.toContain("javascript:");
  });

  // Extra edge-case tests
  it("preserves pseudo-class on scoped selector", () => {
    expect(scopeCss(".x:hover{opacity:0.8}", S)).toBe(`${S} .x:hover{opacity:0.8}`);
  });
  it("preserves descendant selectors", () => {
    expect(scopeCss(".a .b{font-size:1rem}", S)).toBe(`${S} .a .b{font-size:1rem}`);
  });
  it("scopes multiple rules inside @media", () => {
    const out = scopeCss("@media(max-width:600px){.a{display:none}.b{color:blue}}", S);
    expect(out).toContain(`${S} .a{display:none}`);
    expect(out).toContain(`${S} .b{color:blue}`);
  });
  it("passes @keyframes through unscoped", () => {
    const input = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
    const out = scopeCss(input, S);
    expect(out).toContain("@keyframes spin{");
    expect(out).not.toContain(`${S} from`);
    expect(out).not.toContain(`${S} to`);
  });
  it("passes @font-face through unscoped", () => {
    const input = "@font-face{font-family:Foo;src:url(foo.woff2)}";
    const out = scopeCss(input, S);
    expect(out).toContain("@font-face{");
    // Must not double-scope
    expect(out).not.toContain(`${S} @font-face`);
  });
  it("strips behavior: from property values", () => {
    const out = scopeCss(".x{behavior:url(evil.htc);color:red}", S);
    expect(out).not.toContain("behavior:");
  });
  it("handles CSS comments without breaking parsing", () => {
    // Comments in the selector prelude should not crash the parser
    // (comment-stripping is a known limitation — this just checks no throw)
    expect(() => scopeCss("/* comment */.x{color:red}", S)).not.toThrow();
  });
  it("strips vbscript urls", () => {
    const out = scopeCss(".x{background:url(vbscript:evil)}", S);
    expect(out).not.toContain("vbscript:");
  });
  it("@supports scopes inner rules", () => {
    const out = scopeCss("@supports(display:grid){.grid{display:grid}}", S);
    expect(out).toContain("@supports");
    expect(out).toContain(`${S} .grid{display:grid}`);
  });

  // Adversarial tests — security bypass scenarios
  it("removes @import even when written with CSS escapes", () => {
    expect(scopeCss('@\\69mport url("https://evil/x.css");.a{color:red}', S)).not.toMatch(
      /import/i,
    );
    expect(scopeCss('@\\69mport url("https://evil/x.css");.a{color:red}', S)).toContain(`${S} .a`);
  });
  it("scopes :is()/:has() as a unit without splitting internal commas", () => {
    expect(scopeCss(":is(h1, h2){margin:0}", S)).toBe(`${S} :is(h1, h2){margin:0}`);
  });
  it("keeps https and data:image raster url(), strips others", () => {
    expect(scopeCss(".a{background:url(https://x/y.png)}", S)).toContain("https://x/y.png");
    expect(scopeCss(".a{background:url(data:image/png;base64,AAA)}", S)).toContain(
      "data:image/png",
    );
    expect(scopeCss(".a{background:url(http://x/y.png)}", S)).not.toContain("http://x");
    expect(scopeCss('.a{background:url("data:text/html,<x>")}', S)).not.toContain("text/html");
  });
  it("leaves @keyframes step selectors unscoped but scopes @media inner rules", () => {
    expect(scopeCss("@keyframes k{0%{opacity:0}100%{opacity:1}}", S)).toContain("0%{");
    expect(scopeCss("@media print{.x{color:#000}}", S)).toContain(`${S} .x`);
  });
});
