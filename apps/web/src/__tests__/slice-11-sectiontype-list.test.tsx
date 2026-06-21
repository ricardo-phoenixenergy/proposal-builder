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
  it("badges built-in vs authored; text built-ins are editable (override), data + in-use are frozen", () => {
    render(<SectionTypeList types={[...builtInSectionTypes, authored]} inUse={["case_study"]} onChange={vi.fn()} />);

    // A text built-in not in use is now editable (saves an override).
    const textBuiltin = screen.getByText("Executive summary").closest("[data-type]") as HTMLElement;
    expect(within(textBuiltin).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(textBuiltin).getByRole("button", { name: /^edit/i })).toBeEnabled();

    // A data built-in cannot be edited with the text-only editor.
    const dataBuiltin = screen.getByText("Commercial comparison").closest("[data-type]") as HTMLElement;
    expect(within(dataBuiltin).getByRole("button", { name: /^edit/i })).toBeDisabled();

    const authoredRow = screen.getByText("Case study").closest("[data-type]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in-use → frozen
    expect(within(authoredRow).getByText(/unstyled/i)).toBeInTheDocument(); // no registered component
  });
});
