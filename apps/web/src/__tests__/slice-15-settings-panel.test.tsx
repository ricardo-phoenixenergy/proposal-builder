import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPanel } from "../ui/admin/SettingsPanel";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SettingsPanel", () => {
  it("renders the current model and saves a new one", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ aiModel: "claude-sonnet-4-6" }) });
    render(<SettingsPanel initialModel="claude-opus-4-8" />);

    const select = screen.getByLabelText("AI model") as HTMLSelectElement;
    expect(select.value).toBe("claude-opus-4-8");

    fireEvent.change(select, { target: { value: "claude-sonnet-4-6" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/settings",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });
});
