import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../App";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

// App now calls loadSectionTypes and loadTemplates on mount. Stub fetch so tests
// remain hermetic — jsdom has no real fetch.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = String(url).includes("/api/templates")
        ? { templates: [] }
        : { sectionTypes: [] };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
  // Start each test on the locked Prelim template.
  useProposalStore.getState().applyTemplate("tmpl_prelim");
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("applyTemplate (store) — loading the locked template", () => {
  it("scaffolds 4 sections and pins the theme", () => {
    const s = useProposalStore.getState();
    expect(s.document.sections).toHaveLength(4);
    expect(s.document.templateId).toBe("tmpl_prelim");
  });
});

describe("Inspector — choice slot toggle (§7.3)", () => {
  it("switches the section type between the allowed pricing types", () => {
    useProposalStore.getState().selectSection("slot_2"); // the choice slot
    render(<Inspector />);
    expect(useProposalStore.getState().document.sections[2]!.type).toBe("pricing_capex");
    act(() => {
      fireEvent.change(screen.getByLabelText("Choice type"), { target: { value: "pricing_ppa" } });
    });
    expect(useProposalStore.getState().document.sections[2]!.type).toBe("pricing_ppa");
  });
});

describe("Inspector — locked fields & pinned theme", () => {
  it("renders the fixed footer's fields read-only", () => {
    useProposalStore.getState().selectSection("slot_3"); // fixed legal footer
    render(<Inspector />);
    expect(screen.getByLabelText("field-heading")).toBeDisabled();
    expect(screen.getByLabelText("field-body")).toBeDisabled();
  });

  it("disables the theme preset control when the theme is pinned", () => {
    render(<Inspector />);
    // Theme preset sits inside a disabled <fieldset>; toBeDisabled() honors that.
    expect(screen.getByLabelText("Theme preset")).toBeDisabled();
  });
});

describe("ExportGate — the hard gate (§9)", () => {
  it("blocks a freshly-loaded locked doc, then passes once required fields are filled", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    expect(screen.getByRole("dialog", { name: /export check/i })).toHaveTextContent(/blocked/i);

    // Fill every editable required field on the three editable sections.
    act(() => {
      const { setSectionData } = useProposalStore.getState();
      setSectionData("slot_0", { heading: "Cover", body: "Intro." });
      setSectionData("slot_1", { heading: "Summary", body: "Overview." });
      setSectionData("slot_2", { upfrontCost: "£280k", payback: "6.2 yrs" });
    });

    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    expect(screen.getByRole("dialog", { name: /export check/i })).toHaveTextContent(
      /ready to export/i,
    );
  });
});
