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
      themeId: "theme_phoenix_default",
      templateId: "open",
      sections: [],
      brief: "",
    },
    theme: defaultTheme,
    selectedId: null,
    templates: useProposalStore.getState().templates,
  });
});
afterEach(() => cleanup());

describe("Inspector document page settings", () => {
  it("changes page format and mode on the document", () => {
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText("Page format"), {
      target: { value: "widescreen_16_9" },
    });
    expect(useProposalStore.getState().document.pageFormat).toBe("widescreen_16_9");
    fireEvent.change(screen.getByLabelText("Page mode"), { target: { value: "slides" } });
    expect(useProposalStore.getState().document.pageMode).toBe("slides");
  });
});
