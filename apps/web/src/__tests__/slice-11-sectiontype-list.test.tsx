import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInSectionTypes, type SectionTypeSchema } from "@proposal/shared";
import { SectionTypeList } from "../ui/admin/SectionTypeList";

afterEach(cleanup);

const authored: SectionTypeSchema = {
  type: "case_study",
  label: "Case study",
  category: "text",
  fields: [{ key: "body", type: "paragraph", label: "Body", required: true }],
  variants: [],
  schemaVersion: 1,
};

describe("SectionTypeList", () => {
  it("badges built-in vs authored; built-ins are editable (override), only in-use is frozen", () => {
    render(
      <SectionTypeList
        types={[...builtInSectionTypes, authored]}
        inUse={["case_study"]}
        onChange={vi.fn()}
      />,
    );

    // A text built-in not in use is editable (saves an override).
    const textBuiltin = screen.getByText("Executive summary").closest("[data-type]") as HTMLElement;
    expect(within(textBuiltin).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(textBuiltin).getByRole("button", { name: /^edit/i })).toBeEnabled();

    // A data built-in is now editable too (editor supports dataset/matrix fields).
    const dataBuiltin = screen
      .getByText("Commercial comparison")
      .closest("[data-type]") as HTMLElement;
    expect(within(dataBuiltin).getByRole("button", { name: /^edit/i })).toBeEnabled();

    const authoredRow = screen.getByText("Case study").closest("[data-type]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in-use → frozen
    expect(within(authoredRow).getByText(/unstyled/i)).toBeInTheDocument(); // no registered component
  });
});
