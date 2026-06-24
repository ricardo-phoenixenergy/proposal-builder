import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { builtInSectionTypes } from "@proposal/shared";
import { AdminDashboard } from "../ui/admin/AdminDashboard";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ users: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminDashboard nav", () => {
  it("switches from Section types to the Users panel", async () => {
    render(
      <AdminDashboard
        sectionTypes={builtInSectionTypes}
        inUse={[]}
        currentUserId="me"
        templates={[]}
        inUseTemplates={[]}
        aiModel="claude-opus-4-8"
      />,
    );
    // Section types panel is the default
    expect(screen.getByText("Executive summary")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^users$/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^users$/i })).toBeInTheDocument(),
    );
  });
});
