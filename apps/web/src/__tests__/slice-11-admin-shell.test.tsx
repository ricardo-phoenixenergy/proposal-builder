import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { builtInSectionTypes } from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

afterEach(cleanup);

describe("AdminDashboard shell", () => {
  it("renders nav and the section-types area", () => {
    render(
      <AdminDashboard
        sectionTypes={builtInSectionTypes}
        inUse={[]}
        currentUserId="admin"
        templates={[]}
        inUseTemplates={[]}
        aiModel="claude-opus-4-8"
      />,
    );
    expect(screen.getByRole("heading", { name: /builder/i })).toBeInTheDocument();
    expect(screen.getAllByText(/section types/i).length).toBeGreaterThan(0);
    // built-ins are listed
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
  });
});
