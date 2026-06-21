import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { PrintDocument } from "../print/PrintDocument";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);

describe("PrintDocument — the PDF render surface", () => {
  it("renders every section and signals readiness once painted", async () => {
    const { container } = render(<PrintDocument document={sampleProposal} theme={defaultTheme} />);

    // all sample sections render
    expect(container.querySelectorAll("[data-section-type]")).toHaveLength(sampleProposal.sections.length);
    const preview = within(container.querySelector("[data-print-root]") as HTMLElement);
    expect(preview.getByText(/Two commercial routes are offered/i)).toBeInTheDocument();

    // readiness flag flips after the render frames (what Chromium waits on)
    await waitFor(() =>
      expect(container.querySelector('[data-print-ready="true"]')).toBeInTheDocument(),
    );
  });
});
