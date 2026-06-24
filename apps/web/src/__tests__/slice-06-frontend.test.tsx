import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProposalDocument, Section } from "@proposal/shared";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function docWith(sections: Section[]): ProposalDocument {
  return { id: "p", title: "t", client: { name: "c" }, themeId: "x", templateId: "y", sections };
}

beforeEach(() => {
  useProposalStore.setState({
    document: {
      ...docWith([
        { id: "cover", type: "text", data: { heading: "Old", body: "Old body" } },
        { id: "sum", type: "executive_summary", data: { heading: "Keep", body: "Keep body" } },
      ]),
      brief: "Solar for Acme",
    },
    selectedId: "cover",
  });
});

// NOTE: the per-user model picker was removed in Task 18.7 (model is now admin-only,
// server-side). This test is removed; the "has no per-user model picker" assertion
// lives in slice-18-inspector.test.tsx.

describe("Inspector — Rewrite section merges only the selected section", () => {
  it("applies generated data to the selected section, leaving siblings untouched", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { heading: "New", body: "New body" },
          validation: { valid: true, errors: [] },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    render(<Inspector />);
    fireEvent.click(screen.getByRole("button", { name: /rewrite section with ai/i }));

    await waitFor(() => {
      const sections = useProposalStore.getState().document.sections;
      expect(sections.find((s) => s.id === "cover")!.data).toMatchObject({
        heading: "New",
        body: "New body",
      });
    });
    // sibling untouched
    const sum = useProposalStore.getState().document.sections.find((s) => s.id === "sum")!;
    expect(sum.data).toEqual({ heading: "Keep", body: "Keep body" });

    // posted to the generate section proxy
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/generate/section",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
