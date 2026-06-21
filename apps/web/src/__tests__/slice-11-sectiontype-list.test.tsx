import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { SectionTypeList } from "../ui/admin/SectionTypeList";

afterEach(cleanup);

const authored: SectionTypeSchema = {
  type: "case_study", label: "Case study", category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [], schemaVersion: 1,
};

describe("SectionTypeList", () => {
  it("badges built-in vs authored and disables Edit for built-ins and in-use", () => {
    render(<SectionTypeList types={[...builtInSectionTypes, authored]} inUse={["case_study"]} onChange={vi.fn()} />);

    const builtinRow = screen.getByText("Executive summary").closest("[data-type]") as HTMLElement;
    expect(within(builtinRow).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(builtinRow).getByRole("button", { name: /edit/i })).toBeDisabled();

    const authoredRow = screen.getByText("Case study").closest("[data-type]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in-use → frozen
    expect(within(authoredRow).getByText(/unstyled/i)).toBeInTheDocument(); // no registered component
  });
});
