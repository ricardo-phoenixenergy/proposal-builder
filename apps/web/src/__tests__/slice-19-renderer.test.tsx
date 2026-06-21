import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

afterEach(() => cleanup());

const doc: ProposalDocument = {
  id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
  sections: [
    { id: "a", type: "text", data: { heading: "A", body: "Body A" } },
    { id: "b", type: "text", data: { heading: "B", body: "Body B" }, pageBreakBefore: true },
  ],
};

describe("DocumentRenderer paged", () => {
  it("marks page breaks and renders an A4 sheet", () => {
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    expect(container.querySelector(".paged-document")).toBeTruthy();
    const broken = container.querySelectorAll('[data-page-break-before="true"]');
    expect(broken.length).toBe(1);
  });
});
