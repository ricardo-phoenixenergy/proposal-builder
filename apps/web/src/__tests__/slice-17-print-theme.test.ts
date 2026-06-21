// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolvePrintTheme } from "../print/resolveTheme";
import { themes } from "../theme/themes";
import { defaultTheme } from "../theme/defaultTheme";
import type { ProposalDocument } from "@proposal/shared";

const docWith = (extra: Partial<ProposalDocument>): ProposalDocument => ({
  id: "p", title: "T", client: { name: "C" }, themeId: "theme_midnight", templateId: "open", sections: [], ...extra,
});

describe("resolvePrintTheme", () => {
  it("uses document.theme when present", () => {
    const custom = { ...defaultTheme, id: "custom", name: "Custom" };
    expect(resolvePrintTheme(docWith({ theme: custom }), themes, defaultTheme).id).toBe("custom");
  });

  it("falls back to the preset by id", () => {
    expect(resolvePrintTheme(docWith({}), themes, defaultTheme).id).toBe("theme_midnight");
  });

  it("falls back to the default for an unknown preset", () => {
    expect(resolvePrintTheme(docWith({ themeId: "nope" }), themes, defaultTheme).id).toBe(defaultTheme.id);
  });
});
