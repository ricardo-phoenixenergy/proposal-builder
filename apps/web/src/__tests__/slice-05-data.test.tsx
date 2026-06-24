import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Dataset, ProposalDocument, Section } from "@proposal/shared";
import { setSectionData } from "../state/mutations";
import { useProposalStore } from "../state/proposalStore";
import { SectionRenderer } from "../render/SectionRenderer";
import { DataGrid } from "../ui/DataGrid";
import { MatrixEditor } from "../ui/MatrixEditor";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);

const dataset: Dataset = {
  columns: [
    { key: "item", label: "Item", type: "text" },
    { key: "price", label: "Price", type: "number" },
  ],
  rows: [
    { item: "Panel", price: 120 },
    { item: "Inverter", price: 300 },
  ],
};
const dataSection = (variant: string): Section => ({
  id: "d1",
  type: "data_table",
  variant,
  data: { dataset },
});

function docWith(sections: Section[]): ProposalDocument {
  return { id: "p", title: "t", client: { name: "c" }, themeId: "x", templateId: "y", sections };
}

describe("setSectionData — pure mutation", () => {
  it("replaces only the target section's data, immutably", () => {
    const doc = docWith([
      { id: "a", type: "text", data: { x: 1 } },
      { id: "b", type: "text", data: { y: 2 } },
    ]);
    const next = setSectionData(doc, "b", { y: 3 });
    expect(next.sections[1]!.data).toEqual({ y: 3 });
    expect(next.sections[0]).toBe(doc.sections[0]);
    expect(doc.sections[1]!.data).toEqual({ y: 2 });
  });
});

describe("data_table — one dataset, table or chart (§6.2)", () => {
  it("renders a table for the 'table' variant", () => {
    render(<SectionRenderer section={dataSection("table")} theme={defaultTheme} />);
    expect(screen.getByText("Item")).toBeInTheDocument();
    expect(screen.getByText("Panel")).toBeInTheDocument();
  });

  it("renders an SVG chart for the 'bar' variant — same data, no re-entry", () => {
    const { container } = render(
      <SectionRenderer section={dataSection("bar")} theme={defaultTheme} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("DataGrid — paste from Excel populates the dataset (§6.1)", () => {
  beforeEach(() => {
    useProposalStore.setState({
      document: docWith([{ id: "d1", type: "data_table", data: {} }]),
      selectedId: "d1",
    });
  });

  it("parses pasted TSV into section.data.dataset", () => {
    render(<DataGrid sectionId="d1" />);
    const grid = screen.getByTestId("data-grid");
    act(() => {
      fireEvent.paste(grid, {
        clipboardData: { getData: () => "Item\tPrice\nPanel\t120\nInverter\t300" },
      });
    });
    const data = useProposalStore.getState().document.sections[0]!.data as { dataset: Dataset };
    expect(data.dataset.columns).toHaveLength(2);
    expect(data.dataset.rows).toHaveLength(2);
  });
});

describe("MatrixEditor — add a column, enforce the 4-option ceiling (§6.6)", () => {
  beforeEach(() => {
    useProposalStore.setState({
      document: docWith([
        {
          id: "c1",
          type: "commercial_comparison",
          data: {
            matrix: {
              metrics: ["Upfront cost"],
              options: [
                { name: "Capex", values: { "Upfront cost": "£280k" } },
                { name: "PPA", values: { "Upfront cost": "£0" } },
              ],
            },
          },
        },
      ]),
      selectedId: "c1",
    });
  });

  it("adds an option as a new column", () => {
    render(<MatrixEditor sectionId="c1" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /add option/i }));
    });
    const data = useProposalStore.getState().document.sections[0]!.data as {
      matrix: { options: unknown[] };
    };
    expect(data.matrix.options).toHaveLength(3);
  });

  it("disables 'add option' at the 4-option ceiling", () => {
    useProposalStore.setState({
      document: docWith([
        {
          id: "c1",
          type: "commercial_comparison",
          data: {
            matrix: {
              metrics: ["m"],
              options: [1, 2, 3, 4].map((n) => ({ name: `O${n}`, values: { m: "x" } })),
            },
          },
        },
      ]),
      selectedId: "c1",
    });
    render(<MatrixEditor sectionId="c1" />);
    expect(screen.getByRole("button", { name: /add option/i })).toBeDisabled();
  });
});
