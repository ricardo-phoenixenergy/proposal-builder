import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { setActiveSectionTypes } from "@proposal/shared";
import type { SectionTypeSchema } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

const coverType: SectionTypeSchema = {
  type: "cover_test",
  label: "Cover (test)",
  category: "text",
  fields: [{ key: "cover_image", type: "image", label: "Cover image" }],
  variants: [],
  schemaVersion: 1,
};

beforeEach(() => {
  setActiveSectionTypes([coverType]);
  useProposalStore.setState({
    document: {
      id: "p1", title: "T", client: { name: "C" }, themeId: "theme_default", templateId: "open",
      sections: [{ id: "s1", type: "cover_test", data: { cover_image: "" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  setActiveSectionTypes([]); // restore built-ins only
  vi.restoreAllMocks();
});

describe("Inspector image field", () => {
  it("renders an upload control (not a text input) for an image field", () => {
    render(<Inspector />);
    expect(screen.getByLabelText("upload-cover_image")).toBeTruthy();
    expect(screen.queryByLabelText("field-cover_image")).toBeNull();
  });
});
