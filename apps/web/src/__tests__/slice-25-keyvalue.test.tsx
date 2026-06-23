import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LayoutEditor } from "../ui/admin/LayoutEditor";
import { setActiveSectionTypes, resetSectionTypesForTests, type SectionTypeSchema } from "@proposal/shared";

const specType: SectionTypeSchema = {
  type: "spec", label: "Spec", category: "text",
  fields: [
    { key: "term", type: "text", label: "Term" },
    { key: "rate", type: "text", label: "Rate" },
  ],
  variants: [], schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([specType]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("LayoutEditor keyValue", () => {
  it("adds a keyValue block, binds two fields, and saves", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LayoutEditor type="spec" pageFormat="a4_portrait" mode="create" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Spec" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "spec" } });

    fireEvent.click(screen.getByRole("button", { name: /add keyValue/i }));
    fireEvent.click(screen.getByLabelText("kv-add-0")); // add a field row
    fireEvent.change(screen.getByLabelText("kv-field-0-0"), { target: { value: "term" } });
    fireEvent.click(screen.getByLabelText("kv-add-0"));
    fireEvent.change(screen.getByLabelText("kv-field-0-1"), { target: { value: "rate" } });

    const save = screen.getByRole("button", { name: /^save/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      root: { children: { kind: string; fields?: string[] }[] };
    };
    expect(body.root.children[0]).toMatchObject({ kind: "keyValue", fields: ["term", "rate"] });
  });
});
