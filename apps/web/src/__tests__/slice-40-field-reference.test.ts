import { describe, expect, it } from "vitest";
import { fieldReference } from "../ui/admin/layout/fieldReference";
import type { SectionTypeSchema } from "@proposal/shared";

const type: SectionTypeSchema = {
  type: "c",
  label: "C",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "bullets", type: "list", label: "Bullets" },
  ],
  variants: [],
  schemaVersion: 1,
};

describe("fieldReference", () => {
  it("maps scalar fields to {{key}} and list fields to an each hint", () => {
    const ref = fieldReference(type);
    expect(ref.find((r) => r.label === "Title")?.token).toBe("{{title}}");
    expect(ref.find((r) => r.label === "Bullets")?.token).toBe(
      "{{#each bullets}}{{this}}{{/each}}",
    );
  });
});
