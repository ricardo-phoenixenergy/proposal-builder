import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { builtInTemplates, type Template } from "@proposal/shared";
import { TemplateList } from "../ui/admin/TemplateList";

afterEach(cleanup);

const authored: Template = { id: "tmpl_sales", name: "Sales", themeId: "theme_phoenix_default", locked: false, slots: [{ kind: "fixed", type: "text", lock: "open" }] };

describe("TemplateList", () => {
  it("badges built-in vs authored and disables Edit for built-ins and in-use", () => {
    render(<TemplateList templates={[...builtInTemplates, authored]} inUse={["tmpl_sales"]} onChange={vi.fn()} />);

    const builtinRow = screen.getByText(builtInTemplates[0]!.name).closest("[data-template]") as HTMLElement;
    expect(within(builtinRow).getByText(/built-in/i)).toBeInTheDocument();
    expect(within(builtinRow).getByRole("button", { name: /^edit/i })).toBeDisabled();

    const authoredRow = screen.getByText("Sales").closest("[data-template]") as HTMLElement;
    expect(within(authoredRow).getByText(/in use/i)).toBeInTheDocument();
    expect(within(authoredRow).getByRole("button", { name: /^edit/i })).toBeDisabled(); // in use → frozen
  });
});
