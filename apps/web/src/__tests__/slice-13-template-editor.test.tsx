import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SectionTypeSchema } from "@proposal/shared";
import { TemplateEditor } from "../ui/admin/TemplateEditor";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sectionTypes: SectionTypeSchema[] = [
  { type: "text", label: "Text", category: "text", variants: [], schemaVersion: 1, fields: [{ key: "heading", type: "text" }] },
];

describe("TemplateEditor", () => {
  it("creates a template: fills name + a slot, then POSTs", async () => {
    useProposalStore.setState({ sectionTypes });
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ template: {} }), { status: 201, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", f);
    const onDone = vi.fn();

    render(<TemplateEditor mode="create" onDone={onDone} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    fireEvent.click(screen.getByRole("button", { name: /add slot/i }));
    // the new slot defaults its type to the first section type ("text") and lock to "open"

    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/templates", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("disables Save while the draft is invalid (no slots)", () => {
    useProposalStore.setState({ sectionTypes });
    render(<TemplateEditor mode="create" onDone={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Template id"), { target: { value: "tmpl_new" } });
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New One" } });
    expect(screen.getByRole("button", { name: /^save/i })).toBeDisabled(); // zero slots → invalid
  });
});
