import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Section } from "@proposal/shared";
import { SectionRenderer } from "../render/SectionRenderer";
import { resolveSection } from "../registry/componentRegistry";
import { TextSection } from "../components/sections/TextSection";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);

const textSection: Section = {
  id: "t1",
  type: "text",
  data: { heading: "Solar & Storage Proposal", body: "Prepared for Acme Manufacturing." },
};

describe("TextSection — designed cover/text variant", () => {
  it("text now resolves to a designed component, not the fallback", () => {
    const resolved = resolveSection(textSection);
    expect(resolved.unstyled).toBe(false);
    expect(resolved.Component).toBe(TextSection);
    expect(resolved.variant).toBe("standard");
  });

  it("renders the heading as a title and the body text", () => {
    const { container } = render(<SectionRenderer section={textSection} theme={defaultTheme} />);
    expect(container.querySelector('[data-component="text-section"]')).toBeInTheDocument();
    expect(screen.getByText("Solar & Storage Proposal")).toBeInTheDocument();
    expect(screen.getByText("Prepared for Acme Manufacturing.")).toBeInTheDocument();
  });
});
