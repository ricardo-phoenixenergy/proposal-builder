import type { Section } from "../types/section";
import { getSectionType } from "../registry/sectionTypes";

/** A soft, advisory warning that content overflows the selected variant's range. */
export interface VariantWarning {
  fieldKey: string;
  variant: string;
  message: string;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Live, variant-aware content-range warnings (§13.10). Distinct from the hard
 * field limits enforced at the export gate: these flag when the *selected layout*
 * is tighter than the type's hard limit (e.g. a banner exec-summary vs standard),
 * so the user sees it before export rather than being blocked at it.
 */
export function variantRangeWarnings(section: Section): VariantWarning[] {
  const typeSchema = getSectionType(section.type);
  if (!typeSchema?.variantRanges) return [];

  const variant = section.variant ?? typeSchema.defaultVariant;
  if (!variant) return [];

  const ranges = typeSchema.variantRanges[variant];
  if (!ranges) return [];

  const warnings: VariantWarning[] = [];
  for (const [fieldKey, range] of Object.entries(ranges)) {
    const value = section.data[fieldKey];
    if (typeof value !== "string") continue;

    if (range.maxChars !== undefined && value.length > range.maxChars) {
      warnings.push({
        fieldKey,
        variant,
        message: `${variant} layout fits about ${range.maxChars} characters (got ${value.length})`,
      });
    }
    if (range.maxWords !== undefined) {
      const words = countWords(value);
      if (words > range.maxWords) {
        warnings.push({
          fieldKey,
          variant,
          message: `${variant} layout fits about ${range.maxWords} words (got ${words})`,
        });
      }
    }
  }
  return warnings;
}
