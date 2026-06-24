import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { TrashView } from "../ui/dashboard/TrashView";
import type { ProposalSummary } from "../client/persistence";

afterEach(cleanup);

const trashed: ProposalSummary[] = [
  {
    id: "t1",
    title: "Old Deck",
    client: "Acme",
    folderId: null,
    updatedAt: "2026-06-01T00:00:00Z",
  },
];

describe("TrashView", () => {
  it("shows an empty state when the trash is empty", () => {
    render(<TrashView proposals={[]} onRestore={vi.fn()} onPurge={vi.fn()} />);
    expect(screen.getByText(/trash is empty/i)).toBeInTheDocument();
  });

  it("restores a proposal", () => {
    const onRestore = vi.fn();
    render(<TrashView proposals={trashed} onRestore={onRestore} onPurge={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("t1");
  });

  it("permanently deletes only after confirmation", () => {
    const onPurge = vi.fn();
    render(<TrashView proposals={trashed} onRestore={vi.fn()} onPurge={onPurge} />);
    const row = screen.getByText("Old Deck").closest("[data-trashed]") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /delete forever/i }));
    expect(onPurge).not.toHaveBeenCalled(); // a confirmation step gates it
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(onPurge).toHaveBeenCalledWith("t1");
  });
});
