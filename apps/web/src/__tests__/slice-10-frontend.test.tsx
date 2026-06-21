import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { useProposalStore } from "../state/proposalStore";
import { Toast } from "../ui/Toast";
import { Inspector } from "../ui/Inspector";
import { AssetUpload } from "../ui/AssetUpload";

afterEach(() => {
  cleanup();
  useProposalStore.setState({ notifications: [] });
});

describe("Toast — error/status surface (§13.10)", () => {
  it("renders a notification and dismisses it on demand", async () => {
    useProposalStore.setState({ notifications: [] });
    useProposalStore.getState().notify("error", "Save failed");
    render(<Toast />);
    expect(screen.getByText("Save failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText("Save failed")).not.toBeInTheDocument());
  });
});

describe("Inspector — variant-aware content-range warning (§13.10)", () => {
  it("warns when the selected banner section overflows its recommended range", () => {
    const longBody = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    useProposalStore.setState({
      document: {
        ...sampleProposal,
        sections: [{ id: "sx", type: "executive_summary", variant: "banner", data: { heading: "Summary", body: longBody } }],
      },
      selectedId: "sx",
    });
    render(<Inspector />);
    expect(screen.getByText(/banner layout fits about/i)).toBeInTheDocument();
  });
});

describe("AssetUpload — logo upload to Blob (§13.10)", () => {
  it("uploads an image and stores its URL as the theme logo", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: "https://blob.test/logo.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    useProposalStore.setState({ notifications: [] });

    render(<AssetUpload />);
    const input = screen.getByLabelText(/logo/i);
    fireEvent.change(input, { target: { files: [new File(["x"], "logo.png", { type: "image/png" })] } });

    await waitFor(() => expect(useProposalStore.getState().theme.logoUrl).toBe("https://blob.test/logo.png"));
    expect(fetchMock).toHaveBeenCalledWith("/api/assets", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });
});
