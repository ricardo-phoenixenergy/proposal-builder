import type { ProposalDocument } from "../types/document";

/**
 * A hand-authored sample proposal that conforms to the schema. This is the
 * slice-1 validation point (§13.1) and is reused by slice 3's static renderer.
 */
export const sampleProposal: ProposalDocument = {
  id: "prop_sample_001",
  title: "Rooftop Solar Proposal — Acme Manufacturing",
  client: { name: "Acme Manufacturing", contact: "Dana Okafor" },
  themeId: "theme_phoenix_default",
  templateId: "tmpl_open",
  sections: [
    {
      id: "sec_cover",
      type: "text",
      data: {
        heading: "Solar & Storage Proposal",
        body: "Prepared for Acme Manufacturing by Phoenix Energy. This document outlines a rooftop solar and battery storage solution sized to Acme's Stoke-on-Trent facility.",
      },
    },
    {
      id: "sec_summary",
      type: "executive_summary",
      data: {
        heading: "Executive summary",
        body: "A 480 kWp rooftop array paired with 250 kWh of storage cuts grid import by an estimated 62% and shields Acme from peak-rate exposure. Two commercial routes are offered so the investment can be structured to suit cash-flow priorities.",
      },
    },
    {
      id: "sec_compare",
      type: "commercial_comparison",
      data: {
        matrix: {
          metrics: ["Upfront cost", "Unit rate", "Term", "Payback"],
          options: [
            {
              name: "Capex",
              values: {
                "Upfront cost": "£280k",
                "Unit rate": "—",
                Term: "—",
                Payback: "6.2 yrs",
              },
            },
            {
              name: "PPA",
              values: {
                "Upfront cost": "£0",
                "Unit rate": "8.4p/kWh",
                Term: "15 yrs",
                Payback: "—",
              },
            },
            {
              name: "Lease",
              values: {
                "Upfront cost": "£0",
                "Unit rate": "—",
                Term: "7 yrs",
                Payback: "—",
              },
            },
          ],
        },
      },
    },
  ],
};
