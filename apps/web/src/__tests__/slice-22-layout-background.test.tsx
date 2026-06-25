import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { Block, SectionLayout } from "@proposal/shared";

const layout = (root: Block): SectionLayout => ({
  type: "cover",
  variant: "cover",
  pageFormat: "widescreen_16_9",
  name: "Cover",
  root,
  version: 1,
});

afterEach(() => cleanup());

describe("LayoutRenderer backgrounds", () => {
  it("renders a fixed-asset background with an overlay tint", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack",
          background: {
            image: { assetUrl: "https://blob/cover.jpg" },
            overlay: { color: "primary", opacity: 50 },
            position: "cover",
          },
          children: [{ kind: "text", text: "Hi" }],
        })}
        data={{}}
        theme={defaultTheme}
        pageFormat="widescreen_16_9"
      />,
    );
    const wrap = container.querySelector('[data-bg="true"]') as HTMLElement;
    expect(wrap.style.backgroundImage).toContain("https://blob/cover.jpg");
    expect(wrap.style.backgroundSize).toBe("cover");
    const overlay = container.querySelector('[data-bg-overlay="true"]') as HTMLElement;
    expect(overlay.style.background).toBe("var(--c-primary)");
    expect(overlay.style.opacity).toBe("0.5");
  });

  it("binds a background image to a per-proposal image field", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack",
          background: { image: { field: "cover_image" } },
          children: [],
        })}
        data={{ cover_image: "https://blob/p1.png" }}
        theme={defaultTheme}
      />,
    );
    expect(
      (container.querySelector('[data-bg="true"]') as HTMLElement).style.backgroundImage,
    ).toContain("https://blob/p1.png");
  });

  it('minHeight "page" resolves to the format content height in mm', () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({ kind: "stack", background: { minHeight: "page" }, children: [] })}
        data={{}}
        theme={defaultTheme}
        pageFormat="a4_portrait"
      />,
    );
    // a4_portrait: 297 - 2*18 = 261mm
    expect((container.querySelector('[data-bg="true"]') as HTMLElement).style.minHeight).toBe(
      "261mm",
    );
  });

  it("degrades gracefully with no image (no background-image, no throw)", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack",
          background: { overlay: { color: "text", opacity: 20 } },
          children: [],
        })}
        data={{}}
        theme={defaultTheme}
      />,
    );
    const wrap = container.querySelector('[data-bg="true"]') as HTMLElement;
    expect(wrap.style.backgroundImage).toBe("");
  });
});
