import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "body", type: "paragraph", label: "Body" },
  ],
  variants: [], schemaVersion: 1,
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

describe("LayoutEditor", () => {
  it("composes a heading bound to a field and POSTs the layout on save", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();

    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={onDone} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Classic" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "classic" } });

    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });

    expect(screen.getByText(/Sample Title/i)).toBeTruthy();

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-layouts", expect.objectContaining({ method: "POST" })));
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as {
      type: string; variant: string; pageFormat: string; name: string; root: { kind: string; children: { kind: string; field?: string }[] };
    };
    expect(body).toMatchObject({ type: "cover", variant: "classic", pageFormat: "a4_portrait", name: "Classic" });
    expect(body.root.children[0]).toMatchObject({ kind: "heading", field: "title" });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables Save while the layout is invalid (no variant)", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "X" } });
    expect(screen.getByRole("button", { name: /^save/i })).toBeDisabled();
  });

  it("removes a block", () => {
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /add paragraph/i }));
    expect(screen.getByLabelText("bind-0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "remove-0" }));
    expect(screen.queryByLabelText("bind-0")).toBeNull();
  });
});
