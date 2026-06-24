import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { App } from "../App";
import { useProposalStore } from "../state/proposalStore";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editor load failure", () => {
  it("redirects to / when the proposal can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/api/proposals/"))
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
          );
        return Promise.resolve(
          new Response(JSON.stringify({ sectionTypes: [], templates: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
    useProposalStore.setState({ proposalId: null });
    render(<App id="prop_missing" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
