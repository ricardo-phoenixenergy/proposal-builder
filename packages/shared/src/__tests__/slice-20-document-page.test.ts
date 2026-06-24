import { describe, expect, it } from "vitest";
import { validateDocument } from "../validation/validateDocument";
import { sampleProposal } from "../samples/sample-proposal";

describe("document page settings", () => {
  it("accepts pageFormat + pageMode", () => {
    expect(
      validateDocument({ ...sampleProposal, pageFormat: "widescreen_16_9", pageMode: "slides" })
        .valid,
    ).toBe(true);
  });

  it("still accepts a document without them", () => {
    expect(validateDocument(sampleProposal).valid).toBe(true);
  });

  it("rejects an invalid pageMode", () => {
    const result = validateDocument({ ...sampleProposal, pageMode: "deck" as unknown as "report" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.startsWith("/pageMode"))).toBe(true);
  });
});
