import { describe, expect, it } from "vitest";
import { compileBlockStyle, spaceToken } from "../render/layoutStyle";
import { TOKEN_COLORS, SIZE_SCALES, LEAF_KINDS, CONTAINER_KINDS } from "../types/layout";

describe("layout token vocabularies", () => {
  it("exposes the v1 vocabularies", () => {
    expect(TOKEN_COLORS).toContain("primary");
    expect(SIZE_SCALES).toEqual(["xs", "sm", "md", "lg", "xl"]);
    expect(LEAF_KINDS).toContain("heading");
    expect(CONTAINER_KINDS).toEqual(["stack", "columns"]);
  });
});

describe("compileBlockStyle", () => {
  it("returns an empty object for no style", () => {
    expect(compileBlockStyle()).toEqual({});
  });

  it("maps every token prop to a theme CSS variable or scale value", () => {
    expect(compileBlockStyle({ color: "primary" })).toMatchObject({ color: "var(--c-primary)" });
    expect(compileBlockStyle({ background: "surface" })).toMatchObject({
      background: "var(--c-surface)",
    });
    expect(compileBlockStyle({ font: "heading" })).toMatchObject({
      fontFamily: "var(--f-heading)",
    });
    expect(compileBlockStyle({ size: "lg" })).toMatchObject({ fontSize: "1.35rem" });
    expect(compileBlockStyle({ weight: "bold" })).toMatchObject({ fontWeight: "700" });
    expect(compileBlockStyle({ align: "center" })).toMatchObject({ textAlign: "center" });
    expect(compileBlockStyle({ padding: "md" })).toMatchObject({
      padding: "calc(16px * var(--space))",
    });
  });

  it("spaceToken maps the scale to a theme-aware calc length", () => {
    expect(spaceToken("none")).toBe("calc(0px * var(--space))");
    expect(spaceToken("xl")).toBe("calc(40px * var(--space))");
  });
});
