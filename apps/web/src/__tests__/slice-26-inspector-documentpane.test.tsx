import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DocumentPane } from "../ui/inspector/DocumentPane";

afterEach(cleanup);

describe("DocumentPane", () => {
  it("renders the document disclosure (template + page controls)", () => {
    render(<DocumentPane />);
    // Match the EXACT existing labels from Inspector.tsx lines 133–177.
    expect(screen.getByLabelText(/template/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/page mode/i)).toBeInTheDocument();
  });
});
