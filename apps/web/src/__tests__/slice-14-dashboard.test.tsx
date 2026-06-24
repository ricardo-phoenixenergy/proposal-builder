import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { Dashboard } from "../ui/dashboard/Dashboard";
import type { ProposalSummary } from "../client/persistence";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const props: ProposalSummary[] = [
  {
    id: "p1",
    title: "Acme Q3",
    client: "Acme Inc",
    folderId: null,
    updatedAt: "2026-06-10T00:00:00.000Z",
  },
  {
    id: "p2",
    title: "Tidal PPA",
    client: "Tidal Energy",
    folderId: null,
    updatedAt: "2026-06-18T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
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

describe("Dashboard", () => {
  it("renders proposal cards and filters by search", async () => {
    render(<Dashboard initialProposals={props} initialFolders={[]} isAdmin={false} />);
    expect(screen.getByText("Acme Q3")).toBeInTheDocument();
    expect(screen.getByText("Tidal PPA")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "tidal" } });
    expect(screen.queryByText("Acme Q3")).not.toBeInTheDocument();
    expect(screen.getByText("Tidal PPA")).toBeInTheDocument();
  });

  it("Open links to /p/[id]", () => {
    render(<Dashboard initialProposals={props} initialFolders={[]} isAdmin={false} />);
    const card = screen.getByText("Acme Q3").closest("[data-proposal]") as HTMLElement;
    expect(within(card).getByRole("link", { name: /open/i })).toHaveAttribute("href", "/p/p1");
  });

  it("shows an empty state when there are no proposals", () => {
    render(<Dashboard initialProposals={[]} initialFolders={[]} isAdmin={false} />);
    expect(screen.getByText(/no proposals yet/i)).toBeInTheDocument();
  });
});
