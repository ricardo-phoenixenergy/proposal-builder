import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { App } from "../App";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const u = String(url);
    if (u.includes("/api/proposals/")) return Promise.resolve(new Response(JSON.stringify({ proposal: { document: { ...sampleProposal, title: "Loaded One" } } }), { status: 200, headers: { "content-type": "application/json" } }));
    const body = u.includes("/api/templates") ? { templates: [] } : { sectionTypes: [] };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  }));
}

describe("editor /p/[id]", () => {
  it("loads the proposal by id and shows a Dashboard back link", async () => {
    stubFetch();
    useProposalStore.setState({ proposalId: null });
    render(<App id="prop_123" />);
    await waitFor(() => expect(screen.getByText("Loaded One")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});
