import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const coverType: SectionTypeSchema = {
  type: "cover", label: "Cover", category: "text",
  fields: [
    { key: "title", type: "text", label: "Title" },
    { key: "cover_image", type: "image", label: "Cover image" },
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

describe("LayoutEditor background group", () => {
  it("binds a background image field + overlay on the root stack and saves it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Cover" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "cover" } });

    // add a block so the root stack has content; bind it so the layout validates
    // (Save stays gated by validateLayout), then select the ROOT to edit its background
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });
    fireEvent.click(screen.getByLabelText("select-root"));

    fireEvent.change(screen.getByLabelText("bg-image-field"), { target: { value: "cover_image" } });
    fireEvent.change(screen.getByLabelText("bg-overlay-color"), { target: { value: "primary" } });
    fireEvent.change(screen.getByLabelText("bg-overlay-opacity"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("bg-minheight"), { target: { value: "page" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { background?: { image?: { field?: string }; overlay?: { color: string; opacity: number }; minHeight?: string } };
    };
    expect(body.root.background).toMatchObject({
      image: { field: "cover_image" },
      overlay: { color: "primary", opacity: 50 },
      minHeight: "page",
    });
  });

  it("selecting '— none —' for the image clears the binding (no stale image key)", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="cover" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Cover" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "cover" } });
    fireEvent.click(screen.getByRole("button", { name: /add heading/i }));
    fireEvent.change(screen.getByLabelText("bind-0"), { target: { value: "title" } });
    fireEvent.click(screen.getByLabelText("select-root"));

    // bind then unbind the image; keep an overlay so a background still exists
    fireEvent.change(screen.getByLabelText("bg-image-field"), { target: { value: "cover_image" } });
    fireEvent.change(screen.getByLabelText("bg-overlay-color"), { target: { value: "primary" } });
    fireEvent.change(screen.getByLabelText("bg-image-field"), { target: { value: "" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { background?: { image?: unknown; overlay?: { color: string } } };
    };
    expect(body.root.background?.overlay).toMatchObject({ color: "primary" });
    expect(body.root.background && "image" in body.root.background).toBe(false);
  });
});
