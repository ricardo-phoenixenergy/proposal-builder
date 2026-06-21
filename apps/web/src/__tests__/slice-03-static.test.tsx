import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { setSectionVariant } from "../state/mutations";
import { useProposalStore } from "../state/proposalStore";
import { DocumentRenderer } from "../render/DocumentRenderer";
import { App } from "../App";
import { defaultTheme } from "../theme/defaultTheme";
import { midnightTheme } from "../theme/themes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

// App now calls loadSectionTypes and loadTemplates on mount. Stub fetch so tests
// remain hermetic — jsdom has no real fetch.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const body = String(url).includes("/api/templates") ? { templates: [] } : { sectionTypes: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  }));
  useProposalStore.setState({
    document: sampleProposal,
    theme: defaultTheme,
    selectedId: "sec_summary",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("setSectionVariant — pure mutation", () => {
  it("changes only the target section's variant, leaving data and siblings untouched", () => {
    const next = setSectionVariant(sampleProposal, "sec_summary", "banner");
    const summary = next.sections.find((s) => s.id === "sec_summary")!;
    expect(summary.variant).toBe("banner");
    expect(summary.data).toEqual(sampleProposal.sections.find((s) => s.id === "sec_summary")!.data);
    // other sections unchanged (same reference)
    expect(next.sections[0]).toBe(sampleProposal.sections[0]);
    // original document not mutated
    expect(sampleProposal.sections.find((s) => s.id === "sec_summary")!.variant).toBeUndefined();
  });
});

describe("proposalStore — single source of truth", () => {
  it("initializes from the sample document and default theme", () => {
    const s = useProposalStore.getState();
    expect(s.document.id).toBe(sampleProposal.id);
    expect(s.theme.id).toBe(defaultTheme.id);
  });

  it("setVariant, setTheme and selectSection update state", () => {
    const { setVariant, setTheme, selectSection } = useProposalStore.getState();
    act(() => setVariant("sec_summary", "banner"));
    act(() => setTheme(midnightTheme));
    act(() => selectSection("sec_compare"));
    const s = useProposalStore.getState();
    expect(s.document.sections.find((x) => x.id === "sec_summary")!.variant).toBe("banner");
    expect(s.theme.id).toBe("theme_midnight");
    expect(s.selectedId).toBe("sec_compare");
  });
});

describe("DocumentRenderer — renders every section inside a theme scope", () => {
  it("renders all sample sections and applies theme variables", () => {
    const { container } = render(
      <DocumentRenderer document={sampleProposal} theme={defaultTheme} />,
    );
    const themed = container.querySelector("[data-theme]") as HTMLElement;
    expect(themed.style.getPropertyValue("--c-primary")).toBe(defaultTheme.colors.primary);
    expect(container.querySelectorAll("[data-section-type]")).toHaveLength(
      sampleProposal.sections.length,
    );
  });
});

describe("App — static preview, theming and variant swapping end-to-end (§13.3)", () => {
  it("lists sections in the outline", () => {
    render(<App />);
    const outline = screen.getByRole("navigation", { name: /outline/i });
    expect(within(outline).getByText(/executive_summary/i)).toBeInTheDocument();
    expect(within(outline).getByText(/commercial_comparison/i)).toBeInTheDocument();
  });

  it("flags a section with no designed component as unstyled in the outline", () => {
    useProposalStore.setState((s) => ({
      document: {
        ...s.document,
        sections: [...s.document.sections, { id: "x", type: "unknown_block", data: {} }],
      },
    }));
    render(<App />);
    const outline = screen.getByRole("navigation", { name: /outline/i });
    expect(within(outline).getAllByText(/unstyled/i).length).toBeGreaterThan(0);
  });

  it("re-themes the live preview with no content change", () => {
    const { container } = render(<App />);
    const preview = within(container.querySelector('[aria-label="Preview"]') as HTMLElement);
    const themed = () => container.querySelector("[data-theme]") as HTMLElement;
    expect(themed().style.getPropertyValue("--c-primary")).toBe(defaultTheme.colors.primary);
    act(() => useProposalStore.getState().setTheme(midnightTheme));
    expect(themed().style.getPropertyValue("--c-primary")).toBe(midnightTheme.colors.primary);
    // content survived the re-theme (scope to the preview — the copy also appears in the inspector editor now)
    expect(preview.getByText(/Two commercial routes are offered/i)).toBeInTheDocument();
  });

  it("swaps the executive summary variant via the store without touching data", () => {
    const { container } = render(<App />);
    const preview = within(container.querySelector('[aria-label="Preview"]') as HTMLElement);
    // default 'standard' variant renders the plain component
    expect(document.querySelector('[data-component="executive-summary"]')).toBeInTheDocument();
    expect(document.querySelector('[data-component="executive-summary-banner"]')).toBeNull();

    act(() => useProposalStore.getState().setVariant("sec_summary", "banner"));

    expect(document.querySelector('[data-component="executive-summary-banner"]')).toBeInTheDocument();
    // same copy, different layout
    expect(preview.getByText(/A 480 kWp rooftop array/i)).toBeInTheDocument();
  });
});
