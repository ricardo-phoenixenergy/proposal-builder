// apps/web/src/__tests__/slice-40-paged-visuals.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { defaultTheme } from "../theme/defaultTheme";
import { sampleProposal } from "@proposal/shared";

afterEach(cleanup);

describe("paged visuals", () => {
  it("marks slide pages with a boundary class in slides mode", () => {
    const doc = { ...sampleProposal, pageMode: "slides" as const };
    const { container } = render(<DocumentRenderer document={doc} theme={defaultTheme} />);
    expect(container.querySelector(".paged-slide")).not.toBeNull();
    expect(
      getComputedStyle(container.querySelector(".paged-document")!).getPropertyValue("--page-w"),
    ).not.toBe("");
  });
});
