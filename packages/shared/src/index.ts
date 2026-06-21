// Types (§14.1)
export * from "./types/index";

// Section-type registry (single source of truth)
export {
  builtInSectionTypes,
  getSectionType,
  listSectionTypes,
  activeSectionTypes,
  setActiveSectionTypes,
  sectionTypeRevision,
  resetSectionTypesForTests,
} from "./registry/sectionTypes";

// Derived JSON Schemas
export { buildSectionSchema, sectionSchema } from "./schema/section.schema";
export { documentEnvelopeSchema } from "./schema/document.schema";
export { themeSchema } from "./schema/theme.schema";

// Validation
export type { ValidationError, ValidationResult } from "./validation/result";
export { validateSection } from "./validation/validateSection";
export { validateDocument } from "./validation/validateDocument";
export { validateTheme } from "./validation/validateTheme";
export { validateForExport } from "./validation/validateForExport";
export { variantRangeWarnings, type VariantWarning } from "./validation/variantRange";
export { validateSectionTypeDefinition } from "./validation/validateSectionTypeDefinition";
export { validateTemplateDefinition } from "./validation/validateTemplateDefinition";

// Templates + lock state (§7)
export { openTemplate, prelimTemplate } from "./templates/sampleTemplates";
export { templates, templates as builtInTemplates, getTemplate } from "./templates/registry";
export { applyTemplate } from "./templates/applyTemplate";
export { emptyDataForType } from "./template/emptyData";
export { isStructureLocked, isThemePinned, slotAt, isFieldLocked } from "./template/lockState";

// Data helpers (paste/import/mapping/matrix ops)
export { normalizeTsv, tableToDataset } from "./data/normalizeTsv";
export {
  defaultMapping,
  toChartSeries,
  type ChartData,
  type ChartSeries,
  type ColumnMapping,
} from "./data/columnMapping";
export { addOption, removeOption, addMetric, removeMetric } from "./data/matrixOps";

// Generation (model allowlist + structured-output schema)
export {
  SELECTABLE_MODELS,
  DEFAULT_MODEL,
  isSelectableModel,
  type GenerationModelId,
} from "./generation/models";
export {
  buildGenerationDataSchema,
  buildTextFieldsGenerationSchema,
  buildFieldGenerationSchema,
  fieldKind,
  type FieldKind,
} from "./generation/generationSchema";

// Sample content
export { sampleProposal } from "./samples/sample-proposal";
