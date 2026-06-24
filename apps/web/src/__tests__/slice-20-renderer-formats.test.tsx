import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

afterEach(() => cleanup());

const base: ProposalDocument = {
  id: "p1",
  title: "T",
  client: { name: "C" },
  themeId: "theme_phoenix_default",
  templateId: "open",
  sections: [
    { id: "a", type: "text", data: { heading: "A", body: "Body A" } },
    { id: "b", type: "text", data: { heading: "B", body: "Body B" } },
  ],
};

describe("DocumentRenderer page formats", () => {
  it("report mode (default): A4 width, sections flow", () => {
    const { container } = render(<DocumentRenderer document={base} theme={defaultTheme} />);
    const doc = container.querySelector(".paged-document") as HTMLElement;
    expect(doc.getAttribute("data-page-mode")).toBe("report");
    expect(doc.style.width).toBe("210mm");
    expect(container.querySelectorAll(".paged-slide").length).toBe(0);
    expect(container.querySelectorAll(".paged-section").length).toBe(2);
  });

  it("slides mode at 16:9: one slide per section, format width + height", () => {
    const doc: ProposalDocument = { ...base, pageFormat: "widescreen_16_9", pageMode: "slides" };
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    const root = container.querySelector(".paged-document") as HTMLElement;
    expect(root.getAttribute("data-page-mode")).toBe("slides");
    expect(root.style.width).toBe("338.67mm");
    const slides = container.querySelectorAll(".paged-slide");
    expect(slides.length).toBe(2);
    expect((slides[0] as HTMLElement).style.height).toBe("190.5mm");
  });
});
