import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { sampleProposal } from "@proposal/shared";
import { Inspector } from "../ui/Inspector";
import { useProposalStore } from "../state/proposalStore";

afterEach(cleanup);
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../ui/Inspector.tsx"), "utf8");

describe("Inspector shell (H-8)", () => {
  it("no longer subscribes to the whole document or sections array", () => {
    expect(src).not.toMatch(/useProposalStore\(\s*\(s\)\s*=>\s*s\.document\s*\)/);
    expect(src).not.toMatch(/=>\s*s\.document\.sections\s*\)/);
  });

  it("renders the brief pane and the empty-selection placeholder", () => {
    useProposalStore.setState({ document: sampleProposal, selectedId: null });
    render(<Inspector />);
    expect(screen.getByLabelText("brief")).toBeInTheDocument();
    expect(screen.getByText("Select a section to edit it.")).toBeInTheDocument();
  });
});
