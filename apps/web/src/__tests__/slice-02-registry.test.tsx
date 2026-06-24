import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Section } from "@proposal/shared";
import { createRegistry, registerVariant, resolveSection } from "../registry/componentRegistry";
import { SectionRenderer } from "../render/SectionRenderer";
import { ExecutiveSummary } from "../components/sections/ExecutiveSummary";
import { GenericSection } from "../components/fallback/GenericSection";
import { ThemeProvider, themeToCssVars } from "../theme/ThemeProvider";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);

// An intentionally-unregistered type, to exercise the generic fallback.
const textSection: Section = {
  id: "s_text",
  type: "unstyled_block",
  data: { heading: "Cover", body: "Intro paragraph for the proposal." },
};

const summarySection: Section = {
  id: "s_sum",
  type: "executive_summary",
  data: { heading: "Executive summary", body: "Concise overview." },
};

const compareSection: Section = {
  id: "s_cmp",
  type: "commercial_comparison",
  data: {
    matrix: {
      metrics: ["Upfront cost", "Unit rate"],
      options: [
        { name: "Capex", values: { "Upfront cost": "£280k", "Unit rate": "—" } },
        { name: "PPA", values: { "Upfront cost": "£0", "Unit rate": "8.4p/kWh" } },
      ],
    },
  },
};

describe("resolveSection — registry resolution + fallback (§4.4, §5.4)", () => {
  it("falls back to GenericSection (unstyled) when no component is registered for the type", () => {
    const resolved = resolveSection(textSection); // 'text' has no registered variant
    expect(resolved.unstyled).toBe(true);
    expect(resolved.Component).toBe(GenericSection);
  });

  it("resolves a registered variant to its designed component (not unstyled)", () => {
    const resolved = resolveSection(summarySection);
    expect(resolved.unstyled).toBe(false);
    expect(resolved.Component).toBe(ExecutiveSummary);
    expect(resolved.variant).toBe("standard");
  });

  it("warns (does not throw) when a variant's schemaVersion drifts from the type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = createRegistry();
    registerVariant(registry, "executive_summary", "standard", {
      component: ExecutiveSummary,
      schemaVersion: 99, // drift vs type's schemaVersion 1
    });
    const resolved = resolveSection(summarySection, registry);
    expect(resolved.Component).toBe(ExecutiveSummary); // still renders
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("GenericSection — renders a dataset field as a plain table (§5.4)", () => {
  const datasetSection: Section = {
    id: "s_data",
    type: "raw_data_block", // intentionally-unregistered type → generic fallback
    data: {
      table: {
        columns: [
          { key: "item", label: "Item", type: "text" },
          { key: "price", label: "Price", type: "number" },
        ],
        rows: [
          { item: "Panel", price: 120 },
          { item: "Inverter", price: 300 },
        ],
      },
    },
  };

  it("renders column labels as headers and row values as cells", () => {
    const { container } = render(<SectionRenderer section={datasetSection} theme={defaultTheme} />);
    const table = container.querySelector('[data-field="table"] table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText("Item")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Panel")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Inverter")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });
});

describe("SectionRenderer — renders + flags unstyled", () => {
  it("flags a fallback-rendered section with data-unstyled and still shows its content", () => {
    const { container } = render(<SectionRenderer section={textSection} theme={defaultTheme} />);
    const wrapper = container.querySelector('[data-section-type="unstyled_block"]');
    expect(wrapper).toHaveAttribute("data-unstyled", "true");
    expect(screen.getByText("Intro paragraph for the proposal.")).toBeInTheDocument();
  });

  it("renders a designed variant without the unstyled flag", () => {
    const { container } = render(<SectionRenderer section={summarySection} theme={defaultTheme} />);
    const wrapper = container.querySelector('[data-section-type="executive_summary"]');
    expect(wrapper).not.toHaveAttribute("data-unstyled");
    expect(wrapper).toHaveAttribute("data-variant", "standard");
    expect(screen.getByText("Concise overview.")).toBeInTheDocument();
  });
});

describe("ComparisonMatrix — dynamic options × metrics (§6.6)", () => {
  it("renders every option as a column and every metric as a row, muting N/A cells", () => {
    render(<SectionRenderer section={compareSection} theme={defaultTheme} />);
    expect(screen.getByText("Capex")).toBeInTheDocument();
    expect(screen.getByText("PPA")).toBeInTheDocument();
    expect(screen.getByText("Upfront cost")).toBeInTheDocument();
    expect(screen.getByText("Unit rate")).toBeInTheDocument();
    expect(screen.getByText("8.4p/kWh")).toBeInTheDocument();
    // The Capex/Unit-rate cell is not-applicable and muted.
    const na = screen.getByText("—");
    expect(na).toHaveAttribute("data-na", "true");
  });
});

describe("ThemeProvider — token → CSS variable contract (§4.3)", () => {
  it("maps tokens to CSS custom properties", () => {
    const vars = themeToCssVars(defaultTheme) as Record<string, string>;
    expect(vars["--c-primary"]).toBe(defaultTheme.colors.primary);
    expect(vars["--f-heading"]).toBe(defaultTheme.fonts.heading);
    expect(vars["--radius"]).toBe("8px");
  });

  it("re-theming changes the variable values that components point at", () => {
    const rethemed = { ...defaultTheme, colors: { ...defaultTheme.colors, primary: "#ff0000" } };
    const before = (themeToCssVars(defaultTheme) as Record<string, string>)["--c-primary"];
    const after = (themeToCssVars(rethemed) as Record<string, string>)["--c-primary"];
    expect(before).not.toBe(after);
    expect(after).toBe("#ff0000");
  });

  it("applies the variables to a wrapper element", () => {
    const { container } = render(
      <ThemeProvider theme={defaultTheme}>
        <span>child</span>
      </ThemeProvider>,
    );
    const wrapper = container.querySelector("[data-theme]") as HTMLElement;
    expect(wrapper.style.getPropertyValue("--c-primary")).toBe(defaultTheme.colors.primary);
  });
});
