/**
 * A single validation failure with a JSON-pointer-style path to the offending
 * field, so the editor and export gate can point the user at it (§9).
 */
export interface ValidationError {
  /** e.g. "/sections/1/data/heading". */
  path: string;
  message: string;
  /** Which enforcement source produced it. */
  source: "schema" | "app";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
