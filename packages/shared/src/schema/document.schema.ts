const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/**
 * Schema for the document ENVELOPE only (id/title/client/refs/sections array).
 * Section contents are validated per-section by validateSection, so this leaves
 * `sections` items unconstrained here and only checks the array exists.
 */
export const documentEnvelopeSchema = {
  $schema: DRAFT,
  $id: "https://proposal.studio/schemas/document.json",
  type: "object",
  required: ["id", "title", "client", "themeId", "templateId", "sections"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    client: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        contact: { type: "string" },
      },
    },
    themeId: { type: "string" },
    templateId: { type: "string" },
    sections: { type: "array" },
    theme: { type: "object" },
    brief: { type: "string" },
    pageFormat: { type: "string" },
    pageMode: { enum: ["report", "slides"] },
  },
} as const;
