import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { SectionTypeSchema } from "@proposal/shared";
import { TemplateEditor } from "../ui/admin/TemplateEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sectionTypes: SectionTypeSchema[] = [
  {
    type: "text",
    label: "Text",
    category: "text",
    variants: [],
    schemaVersion: 1,
    fields: [{ key: "heading", type: "text" }],
  },
];

describe("TemplateEditor", () => {
  it("creates a template: fills name + a slot, then POSTs", async () => {
    const f = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ template: {} }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", f);
    const onDone = vi.fn();

    render(
      <TemplateEditor
        mode="create"
        sectionTypes={sectionTypes}
        onDone={onDone}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    fireEvent.click(screen.getByRole("button", { name: /add slot/i }));
    // the new slot defaults its type to the first section type ("text") and lock to "open"

    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    await waitFor(() =>
      expect(f).toHaveBeenCalledWith("/api/templates", expect.objectContaining({ method: "POST" })),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables Save while the draft is invalid (no slots)", () => {
    render(
      <TemplateEditor
        mode="create"
        sectionTypes={sectionTypes}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    expect(screen.getByRole("button", { name: /^save/i })).toBeDisabled(); // zero slots → invalid
  });

  it("populates the slot-type dropdown from the sectionTypes prop and validates (regression: blank dropdown on /admin)", () => {
    // Regression for the /admin Templates editor: it must NOT depend on the
    // Zustand store (un-hydrated on the admin route). With types supplied as a
    // prop, adding a slot yields a real type and a valid draft (Save enabled).
    render(
      <TemplateEditor
        mode="create"
        sectionTypes={sectionTypes}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    fireEvent.click(screen.getByRole("button", { name: /add slot/i }));

    const slotType = screen.getByLabelText("Slot type") as HTMLSelectElement;
    const options = within(slotType).getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(["text"]); // not blank
    expect(slotType.value).toBe("text"); // new slot defaulted to a real type, not ""
    expect(screen.getByRole("button", { name: /^save/i })).toBeEnabled(); // no "known section type" error
  });
});
