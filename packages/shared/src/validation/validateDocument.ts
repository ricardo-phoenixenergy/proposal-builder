import type { ErrorObject } from "ajv";
import type { ProposalDocument } from "../types/document";
import { ajv } from "./ajv";
import { documentEnvelopeSchema } from "../schema/document.schema";
import { validateSection } from "./validateSection";
import type { ValidationError, ValidationResult } from "./result";

const validateEnvelope = ajv.compile(documentEnvelopeSchema);

function ajvErrorPath(err: ErrorObject): string {
  let path = err.instancePath;
  if (err.keyword === "required") {
    path += "/" + (err.params as { missingProperty: string }).missingProperty;
  } else if (err.keyword === "additionalProperties") {
    path += "/" + (err.params as { additionalProperty: string }).additionalProperty;
  }
  return path;
}

/**
 * Validate a whole document: the envelope (ids, client, refs, sections array)
 * then each section in turn, with error paths rooted at "/sections/{i}". This is
 * the export gate's single entry point (§9).
 */
export function validateDocument(doc: ProposalDocument): ValidationResult {
  const errors: ValidationError[] = [];

  if (!validateEnvelope(doc)) {
    for (const err of validateEnvelope.errors ?? []) {
      errors.push({ path: ajvErrorPath(err), message: err.message ?? "invalid", source: "schema" });
    }
  }

  const sections = Array.isArray(doc?.sections) ? doc.sections : [];
  sections.forEach((section, i) => {
    errors.push(...validateSection(section, `/sections/${i}`).errors);
  });

  return { valid: errors.length === 0, errors };
}
