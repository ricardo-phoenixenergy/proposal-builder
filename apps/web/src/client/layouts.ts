import type { SectionLayout } from "@proposal/shared";

export async function fetchLayouts(): Promise<SectionLayout[]> {
  const res = await fetch("/api/section-layouts");
  if (!res.ok) throw new Error(`Failed to load layouts (${res.status})`);
  const body = (await res.json()) as { layouts: SectionLayout[] };
  return body.layouts;
}

export async function createLayout(layout: SectionLayout): Promise<void> {
  const res = await fetch("/api/section-layouts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Create failed");
  }
}

export async function updateLayout(
  type: string,
  variant: string,
  pageFormat: string,
  layout: SectionLayout,
): Promise<void> {
  const res = await fetch(`/api/section-layouts/${type}/${variant}/${pageFormat}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(layout),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Update failed");
  }
}

export async function deleteLayout(
  type: string,
  variant: string,
  pageFormat: string,
): Promise<void> {
  const res = await fetch(`/api/section-layouts/${type}/${variant}/${pageFormat}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Delete failed");
}
