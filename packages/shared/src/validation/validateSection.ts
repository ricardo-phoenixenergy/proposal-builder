import type { ErrorObject } from "ajv";
import type { Section, SectionTypeSchema } from "../types/section";
import { ajv } from "./ajv";
import { buildSectionSchema } from "../schema/section.schema";
import { activeSectionTypes, getSectionType, sectionTypeRevision } from "../registry/sectionTypes";
import type { ValidationError, ValidationResult } from "./result";

// Recompile the section validator only when the active registry changes.
let compiled: ReturnType<typeof ajv.compile> | null = null;
let compiledRevision = -1;
function sectionValidator() {
  if (!compiled || compiledRevision !== sectionTypeRevision()) {
    compiled = ajv.compile(buildSectionSchema(activeSectionTypes()));
    compiledRevision = sectionTypeRevision();
  }
  return compiled;
}

/** Build the field-pointer path for an Ajv error. */
function ajvErrorPath(basePath: string, err: ErrorObject): string {
  let path = basePath + err.instancePath;
  if (err.keyword === "required") {
    path += "/" + (err.params as { missingProperty: string }).missingProperty;
  } else if (err.keyword === "additionalProperties") {
    path += "/" + (err.params as { additionalProperty: string }).additionalProperty;
  }
  return path;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * App-layer checks that JSON Schema can't express (§14.2 note):
 * word counts and the matrix values-keys-match-metrics invariant.
 */
function appLayerErrors(
  section: Section,
  typeSchema: SectionTypeSchema,
  basePath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const data = section.data;

  for (const field of typeSchema.fields) {
    const value = data[field.key];

    if (field.maxWords !== undefined && typeof value === "string") {
      const words = countWords(value);
      if (words > field.maxWords) {
        errors.push({
          path: `${basePath}/data/${field.key}`,
          message: `must be at most ${field.maxWords} words (got ${words})`,
          source: "app",
        });
      }
    }

    if (field.type === "matrix" && isMatrix(value)) {
      const metricSet = new Set(value.metrics);
      value.options.forEach((option, i) => {
        const keys = Object.keys(option.values);
        const mismatched =
          keys.length !== value.metrics.length ||
          keys.some((k) => !metricSet.has(k));
        if (mismatched) {
          errors.push({
            path: `${basePath}/data/${field.key}/options/${i}/values`,
            message: `option "${option.name}" values keys must match metrics exactly`,
            source: "app",
          });
        }
      });
    }
  }

  return errors;
}

interface MatrixLike {
  metrics: string[];
  options: { name: string; values: Record<string, string> }[];
}

function isMatrix(value: unknown): value is MatrixLike {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v["metrics"]) &&
    v["metrics"].every((m) => typeof m === "string") &&
    Array.isArray(v["options"]) &&
    v["options"].every(
      (o) => typeof o === "object" && o !== null && typeof (o as { values?: unknown }).values === "object",
    )
  );
}

/**
 * Validate one section against its type's derived JSON Schema (structure,
 * char/array bounds) plus the app-layer rules. `basePath` roots error paths
 * within a document (e.g. "/sections/2").
 */
export function validateSection(section: Section, basePath = ""): ValidationResult {
  const errors: ValidationError[] = [];

  const validateAgainstSchema = sectionValidator();
  if (!validateAgainstSchema(section)) {
    for (const err of validateAgainstSchema.errors ?? []) {
      errors.push({
        path: ajvErrorPath(basePath, err),
        message: err.message ?? "invalid",
        source: "schema",
      });
    }
  }

  const typeSchema = getSectionType(section.type);
  if (typeSchema) {
    errors.push(...appLayerErrors(section, typeSchema, basePath));
  }

  return { valid: errors.length === 0, errors };
}
