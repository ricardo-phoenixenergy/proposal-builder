import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LayoutRenderer } from "../render/LayoutRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import { setActiveSectionTypes, resetSectionTypesForTests } from "@proposal/shared";
import type { Block, SectionLayout, SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "subtitle", type: "paragraph", label: "Subtitle" },
    { key: "bullets", type: "list", label: "Bullets" },
    { key: "metrics", type: "dataset", label: "Metrics" },
  ],
  variants: [],
  schemaVersion: 1,
};

const data = {
  title: "Solar for Acme",
  subtitle: "A turnkey path.",
  bullets: ["One", "Two"],
  metrics: { columns: [{ key: "y", label: "Year", type: "text" }], rows: [{ y: "2026" }] },
};

const layout = (root: Block): SectionLayout => ({
  type: "cover",
  variant: "cover",
  pageFormat: "widescreen_16_9",
  name: "Cover",
  root,
  version: 1,
});

afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
});

describe("LayoutRenderer", () => {
  it("renders leaf blocks bound to data, with token styles", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "stack",
          gap: "md",
          children: [
            { kind: "heading", field: "title", style: { color: "primary", align: "center" } },
            { kind: "paragraph", field: "subtitle" },
            { kind: "list", field: "bullets" },
            { kind: "text", text: "Static caption" },
            { kind: "divider" },
          ],
        })}
        data={data}
        theme={defaultTheme}
      />,
    );
    const heading = container.querySelector('[data-block="heading"]') as HTMLElement;
    expect(heading.textContent).toBe("Solar for Acme");
    expect(heading.style.color).toBe("var(--c-primary)");
    expect(heading.style.textAlign).toBe("center");
    expect(container.querySelector('[data-block="paragraph"]')!.textContent).toBe(
      "A turnkey path.",
    );
    expect(container.querySelectorAll('[data-block="list"] li').length).toBe(2);
    expect(container.querySelector('[data-block="text"]')!.textContent).toBe("Static caption");
    expect(container.querySelector('[data-block="divider"]')).toBeTruthy();
  });

  it("renders a table block by reusing DataTable on the bound field", () => {
    setActiveSectionTypes([coverType]);
    const { container } = render(
      <LayoutRenderer
        layout={layout({ kind: "stack", children: [{ kind: "table", field: "metrics" }] })}
        data={data}
        theme={defaultTheme}
      />,
    );
    expect(container.querySelector('[data-block="table"] table')).toBeTruthy();
  });

  it("nests columns with per-column width", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({
          kind: "columns",
          widths: [2, 1],
          columns: [
            [{ kind: "heading", field: "title" }],
            [{ kind: "paragraph", field: "subtitle" }],
          ],
        })}
        data={data}
        theme={defaultTheme}
      />,
    );
    const cols = container.querySelectorAll('[data-block="columns"] > [data-column]');
    expect(cols.length).toBe(2);
    // `flex: 2` (number) expands to the shorthand "2 1 0%" → true proportional columns;
    // the grow factor is the meaningful part, read via the flexGrow longhand.
    expect((cols[0] as HTMLElement).style.flexGrow).toBe("2");
  });

  it("skips an unknown block kind without throwing", () => {
    const { container } = render(
      <LayoutRenderer
        layout={layout({ kind: "stack", children: [{ kind: "marquee" } as never] })}
        data={data}
        theme={defaultTheme}
      />,
    );
    expect(container.querySelector('[data-block="stack"]')).toBeTruthy();
    expect(container.querySelector('[data-block="marquee"]')).toBeNull();
  });
});
