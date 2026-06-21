import type { ErrorObject } from "ajv";
import { ajv } from "./ajv";
import { themeSchema } from "../schema/theme.schema";
import type { ValidationError, ValidationResult } from "./result";

const validate = ajv.compile(themeSchema);

function ajvErrorPath(err: ErrorObject): string {
  let path = err.instancePath;
  if (err.keyword === "required") {
    path += "/" + (err.params as { missingProperty: string }).missingProperty;
  } else if (err.keyword === "additionalProperties") {
    path += "/" + (err.params as { additionalProperty: string }).additionalProperty;
  }
  return path;
}

/** Validate a value against the ThemeTokens schema. */
export function validateTheme(value: unknown): ValidationResult {
  if (validate(value)) return { valid: true, errors: [] };
  const errors: ValidationError[] = (validate.errors ?? []).map((err) => ({
    path: ajvErrorPath(err),
    message: err.message ?? "invalid",
    source: "schema",
  }));
  return { valid: false, errors };
}
