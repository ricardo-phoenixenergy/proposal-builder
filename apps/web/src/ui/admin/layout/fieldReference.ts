import type { FieldType, SectionTypeSchema } from "@proposal/shared";

export function fieldReference(
  type: SectionTypeSchema,
): { token: string; label: string; kind: FieldType }[] {
  return type.fields.map((f) => {
    const token =
      f.type === "list"
        ? `{{#each ${f.key}}}{{this}}{{/each}}`
        : f.type === "dataset" || f.type === "matrix"
          ? `{{#each ${f.key}.rows}}{{/each}}`
          : `{{${f.key}}}`;
    return { token, label: f.label ?? f.key, kind: f.type };
  });
}
