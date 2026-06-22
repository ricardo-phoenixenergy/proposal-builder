import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImageField } from "../ui/ImageField";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImageField", () => {
  it("uploads to /api/assets and reports the returned url", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: "https://blob/x.png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();

    render(<ImageField label="Cover image" fieldKey="cover_image" value="" onChange={onChange} />);
    const input = screen.getByLabelText("upload-cover_image") as HTMLInputElement;
    const file = new File(["x"], "x.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/assets", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("https://blob/x.png"));
  });

  it("shows a preview when a value is present", () => {
    render(<ImageField label="Cover image" fieldKey="cover_image" value="https://blob/x.png" onChange={vi.fn()} />);
    const img = screen.getByAltText("Cover image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://blob/x.png");
  });
});
