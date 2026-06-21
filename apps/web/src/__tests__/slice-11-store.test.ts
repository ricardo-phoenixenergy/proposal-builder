import { describe, expect, it } from "vitest";
import { sampleProposal } from "@proposal/shared";
import { appendSection } from "../state/mutations";

describe("appendSection", () => {
  it("appends a section of the given type with a fresh id and empty data", () => {
    const before = sampleProposal.sections.length;
    const next = appendSection(sampleProposal, "text");
    expect(next.sections).toHaveLength(before + 1);
    const added = next.sections[next.sections.length - 1]!;
    expect(added.type).toBe("text");
    expect(added.id).toBeTruthy();
    expect(typeof added.data).toBe("object");
    // original document not mutated
    expect(sampleProposal.sections).toHaveLength(before);
  });
});
