import type { Section } from "./section";

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
}
