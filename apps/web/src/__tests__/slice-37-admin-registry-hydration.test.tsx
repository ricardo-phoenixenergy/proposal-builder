import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  getSectionType,
  resetSectionTypesForTests,
  builtInSectionTypes,
  type SectionTypeSchema,
} from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

// An AUTHORED (non-built-in) cover type with an image field — the user's scenario.
const coverType: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover page",
  category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "hero", type: "image", label: "Hero image" },
  ],
  variants: [],
  schemaVersion: 1,
};

const props = {
  sectionTypes: [...builtInSectionTypes, coverType],
  inUse: [] as string[],
  currentUserId: "u1",
  templates: [],
  inUseTemplates: [] as string[],
  aiModel: "claude-sonnet-4-6" as const,
};

beforeEach(() => {
  // Start from built-ins ONLY — production never manually seeds the authored type;
  // the AdminDashboard itself must hydrate the registry.
  resetSectionTypesForTests();
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("AdminDashboard hydrates the shared section-type registry", () => {
  it("makes authored types (with their fields) resolvable via getSectionType", () => {
    expect(getSectionType("cover_page")).toBeUndefined(); // precondition: not built-in
    render(<AdminDashboard {...props} />);
    const resolved = getSectionType("cover_page");
    expect(resolved).toBeDefined();
    expect(resolved?.fields.map((f) => f.key)).toContain("hero");
    expect(resolved?.fields.find((f) => f.key === "hero")?.type).toBe("image");
  });

  it("exposes the authored image field in the layout editor's background bind dropdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ layouts: [] }), { status: 200 }),
      ) as unknown as typeof fetch,
    );
    render(<AdminDashboard {...props} />);

    // Section types panel → open Layouts for the authored cover type (scope to its row;
    // every type row has its own "Layouts" button).
    const row = document.querySelector('[data-type="cover_page"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Layouts" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /new layout/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /new layout/i }));

    // New layout root is a stack; selecting it reveals the Background "Bind image field" select.
    fireEvent.click(screen.getByRole("button", { name: /select-root/i }));
    const bind = (await screen.findByLabelText("bg-image-field")) as HTMLSelectElement;
    const options = Array.from(bind.options).map((o) => o.textContent);
    expect(options).toContain("Hero image");
  });
});
