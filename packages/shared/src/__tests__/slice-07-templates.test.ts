import { describe, expect, it } from "vitest";
import type { ProposalDocument } from "../types/document";
import { openTemplate, prelimTemplate } from "../templates/sampleTemplates";
import { applyTemplate } from "../templates/applyTemplate";
import { isStructureLocked, isThemePinned, isFieldLocked } from "../template/lockState";
import { validateForExport } from "../validation/validateForExport";
import { sampleProposal } from "../samples/sample-proposal";

describe("applyTemplate — scaffold a document from a template", () => {
  const doc = applyTemplate(prelimTemplate);

  it("creates one section per slot, with slot/default types and pinned theme", () => {
    expect(doc.sections).toHaveLength(prelimTemplate.slots.length);
    expect(doc.sections.map((s) => s.type)).toEqual([
      "text",
      "executive_summary",
      "pricing_capex", // choice default
      "text",
    ]);
    expect(doc.themeId).toBe(prelimTemplate.themeId);
    expect(doc.templateId).toBe(prelimTemplate.id);
  });

  it("seeds the fixed (locked) footer with canonical data and locks its fields", () => {
    const footer = doc.sections[3]!;
    expect(footer.data["heading"]).toBe("Terms & Conditions");
    expect(footer.locked?.["heading"]).toBe(true);
    expect(footer.locked?.["body"]).toBe(true);
  });

  it("leaves editable-copy fields blank to be filled", () => {
    expect(doc.sections[0]!.data["heading"]).toBe("");
    expect(doc.sections[0]!.locked?.["heading"]).toBeFalsy();
  });
});

describe("lockState", () => {
  it("reports structure + theme locked for the locked template, open otherwise", () => {
    expect(isStructureLocked(prelimTemplate)).toBe(true);
    expect(isThemePinned(prelimTemplate)).toBe(true);
    expect(isStructureLocked(openTemplate)).toBe(false);
  });

  it("marks fixed-slot fields locked and editable-copy fields unlocked", () => {
    const doc = applyTemplate(prelimTemplate);
    expect(isFieldLocked(prelimTemplate, 3, doc.sections[3]!, "body")).toBe(true);
    expect(isFieldLocked(prelimTemplate, 0, doc.sections[0]!, "heading")).toBe(false);
  });
});

describe("validateForExport — the hard gate (§9, §7)", () => {
  /** A fully-filled, conforming prelim document. */
  function filledPrelim(): ProposalDocument {
    const doc = applyTemplate(prelimTemplate);
    doc.sections[0]!.data = { heading: "Cover", body: "Intro." };
    doc.sections[1]!.data = { heading: "Summary", body: "Overview." };
    doc.sections[2]!.data = { upfrontCost: "£280k", payback: "6.2 yrs" };
    return doc;
  }

  it("blocks a freshly-scaffolded locked doc (editable-required fields empty)", () => {
    const result = validateForExport(applyTemplate(prelimTemplate), prelimTemplate);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === "/sections/0/data/heading")).toBe(true);
  });

  it("passes once required fields are filled and locked content is intact", () => {
    expect(validateForExport(filledPrelim(), prelimTemplate)).toEqual({ valid: true, errors: [] });
  });

  it("blocks when a locked field was changed", () => {
    const doc = filledPrelim();
    doc.sections[3]!.data = { ...doc.sections[3]!.data, body: "tampered" };
    const result = validateForExport(doc, prelimTemplate);
    expect(result.errors.some((e) => e.path === "/sections/3/data/body")).toBe(true);
  });

  it("blocks when a choice slot holds a disallowed type", () => {
    const doc = filledPrelim();
    doc.sections[2]!.type = "data_table";
    const result = validateForExport(doc, prelimTemplate);
    expect(result.errors.some((e) => e.path === "/sections/2/type")).toBe(true);
  });

  it("blocks when the locked structure is altered (section removed)", () => {
    const doc = filledPrelim();
    doc.sections = doc.sections.slice(0, 3);
    const result = validateForExport(doc, prelimTemplate);
    expect(result.errors.some((e) => e.path === "/sections")).toBe(true);
  });

  it("an open template only runs schema validation (sample passes)", () => {
    expect(validateForExport(sampleProposal, openTemplate)).toEqual({ valid: true, errors: [] });
  });
});
