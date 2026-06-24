import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useProposalStore } from "../state/proposalStore";
import { Inspector } from "../ui/Inspector";
import { defaultTheme } from "../theme/defaultTheme";

beforeEach(() => {
  useProposalStore.setState({
    document: {
      id: "p1",
      title: "T",
      client: { name: "C" },
      themeId: "theme_default",
      templateId: "open",
      sections: [{ id: "s1", type: "executive_summary", data: { heading: "Hi", body: "Body" } }],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: "s1",
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Inspector AI workspace", () => {
  it("has a Document disclosure and a Brief that persists", () => {
    render(<Inspector />);
    expect(screen.getByText(/document/i)).toBeTruthy();
    const brief = screen.getByLabelText("brief") as HTMLTextAreaElement;
    fireEvent.change(brief, { target: { value: "Solar for Acme" } });
    expect(useProposalStore.getState().document.brief).toBe("Solar for Acme");
  });

  it("shows a section rewrite instruction + button and per-field rewrite for text fields", () => {
    render(<Inspector />);
    expect(screen.getByLabelText("section-instruction")).toBeTruthy();
    expect(screen.getByRole("button", { name: /rewrite section/i })).toBeTruthy();
    // text field editor + its per-field rewrite
    expect(screen.getByLabelText("field-heading")).toBeTruthy();
    expect(screen.getByLabelText("instruction-heading")).toBeTruthy();
  });

  it("has no per-user model picker", () => {
    render(<Inspector />);
    expect(screen.queryByLabelText("Model")).toBeNull();
  });
});
