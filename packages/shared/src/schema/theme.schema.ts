const DRAFT = "https://json-schema.org/draft/2020-12/schema";

const colorString = { type: "string" } as const;

/**
 * JSON Schema for ThemeTokens (§14.1). Hand-authored because the theme is one
 * fixed interface, not a registry of many types — the drift risk that justified
 * deriving the section schema doesn't apply here. A test validates the app's
 * real themes against this to catch any divergence.
 */
export const themeSchema = {
  $schema: DRAFT,
  $id: "https://proposal.studio/schemas/theme.json",
  type: "object",
  required: ["id", "name", "colors", "fonts", "radius", "spacing"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    colors: {
      type: "object",
      required: ["primary", "accent", "text", "muted", "surface", "line"],
      additionalProperties: false,
      properties: {
        primary: colorString,
        accent: colorString,
        text: colorString,
        muted: colorString,
        surface: colorString,
        line: colorString,
      },
    },
    fonts: {
      type: "object",
      required: ["heading", "body"],
      additionalProperties: false,
      properties: {
        heading: { type: "string" },
        body: { type: "string" },
      },
    },
    radius: { type: "number", minimum: 0 },
    spacing: { type: "number", minimum: 0 },
    logoUrl: { type: "string" },
  },
} as const;
