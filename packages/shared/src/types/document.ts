import type { Section } from "./section";
import type { ThemeTokens } from "./theme";

/**
 * The proposal document (§14.1) — the CONTENT layer. Holds an ordered list of
 * section instances plus references to the theme and template by id.
 */
export interface ProposalDocument {
  id: string;
  title: string;
  client: {
    name: string;
    contact?: string;
  };
  themeId: string;
  templateId: string;
  sections: Section[];
  /** Optional per-proposal forked/custom theme; overrides `themeId` when present (§4). */
  theme?: ThemeTokens;
  /** Global generation context shown to the AI on every call (§10). */
  brief?: string;
  /** Page format id (§J); absent → A4 portrait. */
  pageFormat?: string;
  /** Render mode (§J): flowing "report" (default) or one-section-per-page "slides". */
  pageMode?: "report" | "slides";
}
