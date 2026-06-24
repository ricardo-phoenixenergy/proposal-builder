import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Autosave } from "../ui/Autosave";
import { useProposalStore } from "../state/proposalStore";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  useProposalStore.setState({ document: sampleProposal, proposalId: null, saveStatus: "idle" });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("persistNew — save to backend, adopt server id", () => {
  it("POSTs the document and stores the returned id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ proposal: { id: "prop_remote", document: sampleProposal } }, 201),
      );

    await act(async () => {
      await useProposalStore.getState().persistNew();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/proposals",
      expect.objectContaining({ method: "POST" }),
    );
    expect(useProposalStore.getState().proposalId).toBe("prop_remote");
    expect(useProposalStore.getState().saveStatus).toBe("saved");
  });
});

describe("Autosave — debounced PUT after edits", () => {
  it("autosaves the current document once persisted", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 200));
    useProposalStore.setState({ proposalId: "prop_remote" });

    render(<Autosave debounceMs={300} />);

    // An edit to the document triggers the subscription.
    act(() => {
      useProposalStore.getState().setSectionData("sec_summary", { heading: "H", body: "edited" });
    });
    expect(fetchSpy).not.toHaveBeenCalled(); // debounced

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/proposals/prop_remote",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("does not autosave when the proposal isn't persisted yet", () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 200));
    render(<Autosave debounceMs={300} />);
    act(() => {
      useProposalStore.getState().setSectionData("sec_summary", { heading: "H", body: "edited" });
      vi.advanceTimersByTime(300);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
