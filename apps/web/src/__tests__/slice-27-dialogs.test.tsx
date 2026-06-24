import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PromptDialog } from "../ui/PromptDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("self-closes on confirm: fires onConfirm then onClose", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        title="Delete?"
        message="This cannot be undone."
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm|delete|ok/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce(); // self-closes so callers only wire onClose to clear state
  });

  it("dismisses via Cancel without confirming", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog title="Delete?" message="msg" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("PromptDialog", () => {
  it("returns the edited value on confirm and disables confirm when empty", () => {
    const onConfirm = vi.fn();
    render(
      <PromptDialog
        title="Rename"
        label="Title"
        defaultValue="Old"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Title") as HTMLInputElement;
    expect(input.value).toBe("Old");
    fireEvent.change(input, { target: { value: "  New  " } });
    fireEvent.click(screen.getByRole("button", { name: /confirm|rename|ok|save/i }));
    expect(onConfirm).toHaveBeenCalledWith("New");

    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /confirm|rename|ok|save/i })).toBeDisabled();
  });
});
