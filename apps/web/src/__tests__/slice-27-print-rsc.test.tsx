import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProposalDocument } from "@proposal/shared";
import { sampleProposal } from "@proposal/shared";
import { PrintDocument } from "../print/PrintDocument";
import { documentNeedsClientPaint } from "../print/clientPaint";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);

const dataset = {
  columns: [
    { key: "year", label: "Year" },
    { key: "savings", label: "Savings" },
  ],
  rows: [
    { year: "2024", savings: 10 },
    { year: "2025", savings: 20 },
  ],
};

/** A proposal whose only data section renders a Recharts chart (client-paint only). */
const chartProposal: ProposalDocument = {
  ...sampleProposal,
  id: "prop_chart",
  sections: [
    sampleProposal.sections[0]!,
    { id: "sec_chart", type: "data_table", variant: "bar", data: { dataset } },
  ],
};

describe("documentNeedsClientPaint (M-9 classifier)", () => {
  it("is false for a text/matrix-only document (server-paintable)", () => {
    expect(documentNeedsClientPaint(sampleProposal)).toBe(false);
  });

  it("is true when a section uses a chart variant (Recharts paints client-side)", () => {
    expect(documentNeedsClientPaint(chartProposal)).toBe(true);
  });

  it("is false for a data_table with no chart variant (defaults to the server-side table)", () => {
    const tableDoc: ProposalDocument = {
      ...sampleProposal,
      sections: [{ id: "t", type: "data_table", data: { dataset } }],
    };
    expect(documentNeedsClientPaint(tableDoc)).toBe(false);
  });
});

describe("PrintDocument readiness (M-9)", () => {
  it("marks readiness server-side for a text-only document (no hydration round-trip)", () => {
    const html = renderToStaticMarkup(
      <PrintDocument document={sampleProposal} theme={defaultTheme} />,
    );
    expect(html).toContain('data-print-ready="true"');
    expect(html).toContain("data-print-root");
  });

  it("does NOT signal readiness server-side for a chart document (would race the paint)", () => {
    const html = renderToStaticMarkup(
      <PrintDocument document={chartProposal} theme={defaultTheme} />,
    );
    expect(html).not.toContain('data-print-ready="true"');
    expect(html).toContain("data-print-root");
  });

  it("signals readiness after paint for a chart document (client beacon)", async () => {
    const { container } = render(<PrintDocument document={chartProposal} theme={defaultTheme} />);
    // The chart island renders…
    expect(container.querySelector('[data-component^="chart-"]')).toBeInTheDocument();
    // …and the beacon flips the flag Chromium waits on once frames have painted.
    await waitFor(() =>
      expect(container.querySelector('[data-print-ready="true"]')).toBeInTheDocument(),
    );
  });
});
