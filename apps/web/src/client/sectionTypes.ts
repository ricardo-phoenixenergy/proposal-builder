import type { SectionTypeSchema } from "@proposal/shared";

export async function fetchSectionTypes(): Promise<SectionTypeSchema[]> {
  const res = await fetch("/api/section-types");
  if (!res.ok) throw new Error(`Failed to load section types (${res.status})`);
  const body = (await res.json()) as { sectionTypes: SectionTypeSchema[] };
  return body.sectionTypes;
}

export async function createSectionType(def: SectionTypeSchema): Promise<void> {
  const res = await fetch("/api/section-types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Create failed");
  }
}

export async function updateSectionType(type: string, def: SectionTypeSchema): Promise<void> {
  const res = await fetch(`/api/section-types/${type}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Update failed");
  }
}

export async function setSectionTypeDeprecated(type: string, deprecated: boolean): Promise<void> {
  const res = await fetch(`/api/section-types/${type}/deprecate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deprecated }),
  });
  if (!res.ok) throw new Error("Update failed");
}
