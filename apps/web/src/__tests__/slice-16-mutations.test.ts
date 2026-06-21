// @vitest-environment node
import { describe, expect, it } from "vitest";
import { insertSection, removeSection } from "../state/mutations";
import type { ProposalDocument } from "@proposal/shared";

const base: ProposalDocument = {
  id: "p1",
  title: "T",
  client: { name: "C" },
  themeId: "theme_default",
  templateId: "open",
  sections: [
    { id: "a", type: "text", data: {} },
    { id: "b", type: "text", data: {} },
  ],
};

describe("insertSection", () => {
  it("inserts at the given index with schema-default data", () => {
    const next = insertSection(base, "executive_summary", 1);
    expect(next.sections.map((s) => s.id.slice(0, 1))).toEqual(["a", "s", "b"]); // new id starts "sec_"
    const inserted = next.sections[1]!;
    expect(inserted.type).toBe("executive_summary");
    expect(inserted.data).toEqual({ heading: "", body: "" });
    expect(base.sections).toHaveLength(2); // input untouched
  });

  it("clamps an out-of-range index to the ends", () => {
    expect(insertSection(base, "text", -5).sections[0]!.type).toBe("text");
    expect(insertSection(base, "text", 99).sections[2]!.type).toBe("text");
  });
});

describe("removeSection", () => {
  it("drops the matching section and is a no-op for an unknown id", () => {
    expect(removeSection(base, "a").sections.map((s) => s.id)).toEqual(["b"]);
    expect(removeSection(base, "zzz").sections.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
