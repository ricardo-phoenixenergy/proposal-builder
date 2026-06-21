import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyThemeJson } from "../editor/applyThemeJson";
import { ThemeForm } from "../ui/ThemeForm";
import { ThemeCodeEditor, type EditorLike } from "../ui/ThemeCodeEditor";
import { useProposalStore } from "../state/proposalStore";
import { defaultTheme } from "../theme/defaultTheme";

afterEach(cleanup);
beforeEach(() => {
  useProposalStore.setState({ theme: defaultTheme });
});

describe("applyThemeJson — pure parse → validate pipeline", () => {
  it("returns the theme for valid JSON that matches the schema", () => {
    const result = applyThemeJson(JSON.stringify(defaultTheme));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.theme.id).toBe(defaultTheme.id);
  });

  it("reports a parse error for malformed JSON", () => {
    const result = applyThemeJson("{ not json ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports schema errors for structurally invalid themes", () => {
    const bad = { ...defaultTheme, colors: { ...defaultTheme.colors } } as Record<string, unknown>;
    delete (bad["colors"] as Record<string, unknown>)["primary"];
    const result = applyThemeJson(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.path.includes("colors"))).toBe(true);
  });
});

describe("ThemeForm — token controls update the theme live", () => {
  it("editing the primary colour updates the store theme", () => {
    render(<ThemeForm />);
    const input = screen.getByLabelText("color-primary");
    act(() => {
      fireEvent.change(input, { target: { value: "#abcdef" } });
    });
    expect(useProposalStore.getState().theme.colors.primary).toBe("#abcdef");
  });

  it("editing radius updates the store theme", () => {
    render(<ThemeForm />);
    act(() => {
      fireEvent.change(screen.getByLabelText("radius"), { target: { value: "20" } });
    });
    expect(useProposalStore.getState().theme.radius).toBe(20);
  });
});

const FakeEditor: EditorLike = ({ defaultValue, onChange }) => (
  <textarea
    aria-label="code"
    defaultValue={defaultValue}
    onChange={(e) => onChange?.(e.target.value)}
  />
);

describe("ThemeCodeEditor — debounced live recompile (§8)", () => {
  it("applies valid theme JSON to the store after the debounce", () => {
    vi.useFakeTimers();
    try {
      render(<ThemeCodeEditor EditorComponent={FakeEditor} debounceMs={300} />);
      const next = { ...defaultTheme, colors: { ...defaultTheme.colors, primary: "#123456" } };
      fireEvent.change(screen.getByLabelText("code"), { target: { value: JSON.stringify(next) } });
      // not applied before debounce elapses
      expect(useProposalStore.getState().theme.colors.primary).toBe(defaultTheme.colors.primary);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(useProposalStore.getState().theme.colors.primary).toBe("#123456");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows errors and leaves the theme unchanged for invalid JSON", () => {
    vi.useFakeTimers();
    try {
      render(<ThemeCodeEditor EditorComponent={FakeEditor} debounceMs={300} />);
      fireEvent.change(screen.getByLabelText("code"), { target: { value: "{ broken" } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(useProposalStore.getState().theme).toEqual(defaultTheme);
      expect(screen.getByTestId("theme-errors")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
