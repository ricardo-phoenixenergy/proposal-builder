import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      sections: [],
    },
    theme: defaultTheme,
    selectedId: null,
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector theme group", () => {
  it("preset active: shows Fork to edit and hides the token editor", () => {
    render(<Inspector />);
    expect(screen.getByRole("button", { name: /fork to edit/i })).toBeTruthy();
    expect(screen.queryByLabelText("color-primary")).toBeNull();
  });

  it("forked: shows the token editor and Revert to preset", () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole("button", { name: /fork to edit/i }));
    expect(screen.getByLabelText("color-primary")).toBeTruthy();
    expect(screen.getByRole("button", { name: /revert to preset/i })).toBeTruthy();
  });
});
