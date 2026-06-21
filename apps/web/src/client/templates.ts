import type { Template } from "@proposal/shared";

export async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch("/api/templates");
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  return ((await res.json()) as { templates: Template[] }).templates;
}

export async function createTemplate(def: Template): Promise<void> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Create failed");
  }
}

export async function updateTemplate(id: string, def: Template): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error ?? "Update failed");
  }
}

export async function setTemplateDeprecated(id: string, deprecated: boolean): Promise<void> {
  const res = await fetch(`/api/templates/${id}/deprecate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deprecated }),
  });
  if (!res.ok) throw new Error("Update failed");
}
