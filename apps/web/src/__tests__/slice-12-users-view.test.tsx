import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { UsersView } from "../ui/admin/UsersView";

const me = {
  id: "me",
  email: "me@x.test",
  isAdmin: true,
  disabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const other = {
  id: "other",
  email: "other@x.test",
  isAdmin: false,
  disabled: false,
  createdAt: "2026-01-02T00:00:00.000Z",
};

function mockFetch(handlers: Record<string, (init?: RequestInit) => Response>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const h = handlers[key];
    if (!h) throw new Error(`unexpected fetch: ${key}`);
    return Promise.resolve(h(init));
  });
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() =>
  vi.stubGlobal("fetch", mockFetch({ "GET /api/users": () => json({ users: [me, other] }) })),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UsersView", () => {
  it("lists accounts with role + status and locks the self row's Disable", async () => {
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("me@x.test")).toBeInTheDocument());

    const meRow = screen.getByText("me@x.test").closest("[data-user]") as HTMLElement;
    expect(within(meRow).getByText("admin")).toBeInTheDocument();
    // me is the sole active admin AND the current user → Disable + Revoke admin disabled
    expect(within(meRow).getByRole("button", { name: /disable/i })).toBeDisabled();
    expect(within(meRow).getByRole("button", { name: /revoke admin/i })).toBeDisabled();

    const otherRow = screen.getByText("other@x.test").closest("[data-user]") as HTMLElement;
    expect(within(otherRow).getByText("member")).toBeInTheDocument();
    expect(within(otherRow).getByRole("button", { name: /^disable/i })).not.toBeDisabled();
  });

  it("creates an account and prepends it", async () => {
    const created = {
      id: "new",
      email: "new@x.test",
      isAdmin: false,
      disabled: false,
      createdAt: "2026-01-03T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "GET /api/users": () => json({ users: [me, other] }),
        "POST /api/users": () => json({ user: created }, 201),
      }),
    );
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("me@x.test")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@x.test" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(screen.getByText("new@x.test")).toBeInTheDocument());
  });

  it("toggles disable on another user via PATCH", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        "GET /api/users": () => json({ users: [me, other] }),
        "PATCH /api/users/other": () => json({ user: { ...other, disabled: true } }),
      }),
    );
    render(<UsersView currentUserId="me" />);
    await waitFor(() => expect(screen.getByText("other@x.test")).toBeInTheDocument());

    const otherRow = screen.getByText("other@x.test").closest("[data-user]") as HTMLElement;
    fireEvent.click(within(otherRow).getByRole("button", { name: /disable/i }));
    await waitFor(() => expect(within(otherRow).getByText("disabled")).toBeInTheDocument());
  });
});
