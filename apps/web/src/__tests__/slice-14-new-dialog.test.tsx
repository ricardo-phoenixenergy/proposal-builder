import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewProposalDialog } from "../ui/dashboard/NewProposalDialog";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/templates"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              templates: [
                {
                  id: "tmpl_open",
                  name: "Open",
                  themeId: "theme_phoenix_default",
                  locked: false,
                  slots: [{ kind: "fixed", type: "text", lock: "open" }],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      if (u === "/api/proposals" && init?.method === "POST")
        return Promise.resolve(
          new Response(JSON.stringify({ proposal: { id: "prop_new", document: {} } }), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
        );
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NewProposalDialog", () => {
  it("creates from a template and routes to the new editor", async () => {
    render(<NewProposalDialog folders={[]} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/template/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Acme Q3" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/p/prop_new"));
  });
});
