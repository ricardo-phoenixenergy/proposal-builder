import type { Template } from "../types/template";

/** Free-form template — no locks; the gate runs schema validation only. */
export const openTemplate: Template = {
  id: "tmpl_open",
  name: "Open (free-form)",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [
    { kind: "fixed", type: "text", lock: "open" },
    { kind: "fixed", type: "executive_summary", lock: "open" },
    { kind: "fixed", type: "commercial_comparison", lock: "open" },
  ],
};

/**
 * A reusable, locked "Prelim Proposal" (§7): structure + theme pinned, a cover
 * and summary the user fills (editable-copy), a sanctioned PPA-vs-Capex choice
 * slot (§7.3), and an immutable legal footer (fixed content, §7.2).
 */
export const prelimTemplate: Template = {
  id: "tmpl_prelim",
  name: "Prelim Proposal (locked)",
  themeId: "theme_phoenix_default",
  locked: true,
  slots: [
    { kind: "fixed", type: "text", lock: "editable-copy" },
    { kind: "fixed", type: "executive_summary", lock: "editable-copy" },
    { kind: "choice", allowed: ["pricing_capex", "pricing_ppa"], default: "pricing_capex", lock: "choice" },
    {
      kind: "fixed",
      type: "text",
      lock: "fixed",
      data: {
        heading: "Terms & Conditions",
        body: "This preliminary proposal is indicative and non-binding. Figures are estimates pending a site survey.",
      },
    },
  ],
};
