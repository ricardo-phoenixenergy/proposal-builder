import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }], variants: [], schemaVersion: 1,
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

describe("LayoutEditor columns authoring", () => {
  it("adds a 2-column block, binds a heading inside column 1, and saves", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Two col" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "two_col" } });

    fireEvent.click(screen.getByRole("button", { name: /add columns/i }));
    // two columns render
    expect(screen.getAllByLabelText(/^add-to-column-/).length).toBe(2);

    // add a heading into column 0's stack, bind it
    fireEvent.click(screen.getByLabelText("add-to-column-0-0-0")); // adds a heading to column 0 stack
    fireEvent.change(screen.getByLabelText("bind-0-0-0-0"), { target: { value: "title" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { children: { kind: string; columns: { kind: string; children: { kind: string; field?: string }[] }[][] }[] };
    };
    const cols = body.root.children[0]!;
    expect(cols.kind).toBe("columns");
    expect(cols.columns.length).toBe(2);
    expect(cols.columns[0]![0]!.children[0]).toMatchObject({ kind: "heading", field: "title" });
  });
});
