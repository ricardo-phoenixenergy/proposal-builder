import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SectionTypeEditor } from "../ui/admin/SectionTypeEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SectionTypeEditor — image field", () => {
  it("offers image and saves an image field with no limit inputs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SectionTypeEditor onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/type key/i), { target: { value: "cover" } });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Cover" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field key/i), { target: { value: "cover_image" } });
    fireEvent.change(screen.getByLabelText(/field label/i), { target: { value: "Cover image" } });
    fireEvent.change(screen.getByLabelText(/field type/i), { target: { value: "image" } });

    // image carries no limit inputs (no "max …" number fields)
    expect(screen.queryByLabelText(/^field max/i)).toBeNull();

    const save = screen.getByRole("button", { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/section-types",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(call[1].body as string) as {
      category: string;
      fields: { type: string }[];
    };
    expect(sent.category).toBe("text");
    expect(sent.fields[0]!.type).toBe("image");
  });
});
