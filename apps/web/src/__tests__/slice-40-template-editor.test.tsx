import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  setActiveSectionTypes,
  resetSectionTypesForTests,
  type SectionTypeSchema,
} from "@proposal/shared";
import { TemplateLayoutEditor } from "../ui/admin/layout/TemplateLayoutEditor";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange, ["aria-label"]: al }: any) => (
    <textarea aria-label={al} value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const type: SectionTypeSchema = {
  type: "cover_page",
  label: "Cover",
  category: "text",
  fields: [{ key: "title", type: "text", label: "Title" }],
  variants: [],
  schemaVersion: 1,
};

beforeEach(() => {
  resetSectionTypesForTests();
  setActiveSectionTypes([type]);
});
afterEach(() => {
  cleanup();
  resetSectionTypesForTests();
  vi.unstubAllGlobals();
});

describe("TemplateLayoutEditor", () => {
  it("saves a template layout via the layouts API", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    render(
      <TemplateLayoutEditor
        type="cover_page"
        pageFormat="a4_portrait"
        mode="create"
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Hero" } });
    fireEvent.change(screen.getByLabelText("Layout variant"), { target: { value: "hero" } });
    fireEvent.change(screen.getByLabelText("template-html"), {
      target: { value: "<h1>{{title}}</h1>" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.template).toContain("{{title}}");
  });

  it("renders the field reference list with the type's tokens", () => {
    render(
      <TemplateLayoutEditor
        type="cover_page"
        pageFormat="a4_portrait"
        mode="create"
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // The cover_page type has a "title" field → token {{title}} should appear
    expect(screen.getByText("{{title}}")).toBeTruthy();
  });
});
