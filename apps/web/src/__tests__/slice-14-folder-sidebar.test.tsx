import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { FolderSidebar } from "../ui/dashboard/FolderSidebar";
import type { Folder } from "../client/folders";

afterEach(cleanup);

const folders: Folder[] = [{ id: "f1", ownerId: "o", name: "Sales", createdAt: "t" }];

describe("FolderSidebar", () => {
  it("lists All / folder / Unfiled and fires onSelect", () => {
    const onSelect = vi.fn();
    render(
      <FolderSidebar
        folders={folders}
        counts={{ all: 3, unfiled: 1, byFolder: { f1: 2 } }}
        selected="all"
        onSelect={onSelect}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sales/i }));
    expect(onSelect).toHaveBeenCalledWith("f1");
    fireEvent.click(screen.getByRole("button", { name: /unfiled/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
