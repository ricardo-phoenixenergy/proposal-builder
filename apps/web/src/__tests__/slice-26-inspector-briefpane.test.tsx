import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BriefPane } from "../ui/inspector/BriefPane";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);

describe("BriefPane", () => {
  it("renders the brief and writes edits to the store via setBrief", () => {
    render(<BriefPane />);
    const ta = screen.getByLabelText("brief") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "New brief text" } });
    expect(useProposalStore.getState().document.brief).toBe("New brief text");
  });
});
