// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useProposalStore } from "../state/proposalStore";
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
    },
    theme: defaultTheme,
  });
});

describe("theme fork", () => {
  it("forkTheme copies the active theme into document.theme with a custom id", () => {
    useProposalStore.getState().forkTheme();
    const { document, theme } = useProposalStore.getState();
    expect(document.theme).toBeDefined();
    expect(document.theme!.id).toBe("custom");
    expect(theme.id).toBe("custom");
  });

  it("editing while forked persists into document.theme", () => {
    useProposalStore.getState().forkTheme();
    const forked = useProposalStore.getState().theme;
    useProposalStore
      .getState()
      .setTheme({ ...forked, colors: { ...forked.colors, primary: "#123456" } });
    expect(useProposalStore.getState().document.theme!.colors.primary).toBe("#123456");
  });

  it("unforkTheme clears document.theme and reverts to the preset", () => {
    useProposalStore.getState().forkTheme();
    useProposalStore.getState().unforkTheme();
    expect(useProposalStore.getState().document.theme).toBeUndefined();
    expect(useProposalStore.getState().theme.id).toBe("theme_phoenix_default");
  });

  it("selectPreset switches preset and clears any fork", () => {
    useProposalStore.getState().forkTheme();
    useProposalStore.getState().selectPreset("theme_midnight");
    const { document, theme } = useProposalStore.getState();
    expect(document.theme).toBeUndefined();
    expect(document.themeId).toBe("theme_midnight");
    expect(theme.id).toBe("theme_midnight");
  });
});
