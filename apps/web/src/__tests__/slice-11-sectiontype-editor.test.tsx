import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type SectionTypeSchema } from "@proposal/shared";
import { SectionTypeEditor } from "../ui/admin/SectionTypeEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const caseStudy: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  schemaVersion: 1,
  variants: [],
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
};

describe("SectionTypeEditor", () => {
  it("disables Save until the definition is valid, then POSTs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();

    render(<SectionTypeEditor onDone={onDone} onCancel={vi.fn()} />);

    // empty key/label/fields → Save disabled
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type key/i), { target: { value: "case_study" } });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Case study" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field key/i), { target: { value: "body" } });
    fireEvent.change(screen.getByLabelText(/field label/i), { target: { value: "Body" } });

    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-types", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("create mode: a dataset field yields a data-category definition", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SectionTypeEditor onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/type key/i), { target: { value: "metrics_table" } });
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Metrics table" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText(/field key/i), { target: { value: "dataset" } });
    fireEvent.change(screen.getByLabelText(/field label/i), { target: { value: "Dataset" } });
    fireEvent.change(screen.getByLabelText(/field type/i), { target: { value: "dataset" } });

    const save = screen.getByRole("button", { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/section-types", expect.objectContaining({ method: "POST" })));
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(call[1].body as string) as { category: string; fields: { type: string }[] };
    expect(sent.category).toBe("data");
    expect(sent.fields[0]!.type).toBe("dataset");
  });

  it("edit mode: type-key is disabled, PUT /api/section-types/:type on save, onDone called", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDone = vi.fn();

    render(<SectionTypeEditor initial={caseStudy} mode="edit" onDone={onDone} onCancel={vi.fn()} />);

    // type-key input must be disabled in edit mode
    expect(screen.getByLabelText(/type key/i)).toBeDisabled();

    // change the label to confirm the updated def is sent
    fireEvent.change(screen.getByLabelText(/^label/i), { target: { value: "Case study updated" } });

    const save = screen.getByRole("button", { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/section-types/case_study",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
