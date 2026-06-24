import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionLayoutsView } from "../ui/admin/SectionLayoutsView";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  type SectionLayout,
  type SectionTypeSchema,
} from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover",
  label: "Cover",
  category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [],
  schemaVersion: 1,
};
const existing: SectionLayout = {
  type: "cover",
  variant: "classic",
  pageFormat: "a4_portrait",
  name: "Classic",
  root: { kind: "stack", children: [] },
  version: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([coverType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("SectionLayoutsView", () => {
  it("lists this type's layouts and deletes one", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({ layouts: [existing, { ...existing, type: "other", variant: "x" }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<SectionLayoutsView type="cover" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Classic")).toBeTruthy());
    expect(screen.queryByText("x")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "delete-classic-a4_portrait" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/section-layouts/cover/classic/a4_portrait",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("opens the editor in create mode from New", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ layouts: [] }), { status: 200 }),
      ) as unknown as typeof fetch,
    );
    render(<SectionLayoutsView type="cover" onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /new layout/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /new layout/i }));
    expect(screen.getByLabelText("Layout name")).toBeTruthy(); // the editor mounted
  });
});
