"use client";

import { useEffect, useState } from "react";
import type { UserSummary } from "../../server/repo/types";
import { createUser, fetchUsers, setUserPassword, updateUser } from "../../client/users";
import { useProposalStore } from "../../state/proposalStore";

export function UsersView({ currentUserId }: { currentUserId: string }) {
  const notify = useProposalStore((s) => s.notify);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setUsers(await fetchUsers());
      } catch {
        notify("error", "Couldn't load users.");
        setUsers([]);
      }
    })();
  }, [notify]);

  const activeAdmins = (users ?? []).filter((u) => u.isAdmin && !u.disabled).length;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createUser({ email, password, isAdmin: makeAdmin });
      setUsers((prev) => [created, ...(prev ?? [])]);
      setEmail("");
      setPassword("");
      setMakeAdmin(false);
      notify("success", "Account created.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Create failed");
    }
  };

  const patch = async (id: string, change: { disabled?: boolean; isAdmin?: boolean }) => {
    try {
      const updated = await updateUser(id, change);
      setUsers((prev) => (prev ?? []).map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    }
  };

  const onSetPassword = async (id: string) => {
    const pw = window.prompt("New password (minimum 8 characters)");
    if (pw === null) return;
    try {
      await setUserPassword(id, pw);
      notify("success", "Password updated.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Update failed");
    }
  };

  if (users === null) {
    return (
      <div className="stlist">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="stlist">
      <div className="stlist__head">
        <h2>Users</h2>
      </div>

      <form className="userform" onSubmit={onCreate}>
        <input
          aria-label="Email"
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          aria-label="Password"
          type="password"
          placeholder="Password (min 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label className="userform__admin">
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
          />{" "}
          Admin
        </label>
        <button type="submit" className="btn btn--primary">
          Create account
        </button>
      </form>

      <ul className="stlist__rows">
        {users.map((u) => {
          const isSelf = u.id === currentUserId;
          const soleActiveAdmin = u.isAdmin && !u.disabled && activeAdmins <= 1;
          const lockReason = isSelf
            ? "You can't disable or demote your own account"
            : "There must be at least one active admin";
          const lockDisable = !u.disabled && (isSelf || soleActiveAdmin);
          const lockDemote = u.isAdmin && (isSelf || soleActiveAdmin);
          return (
            <li key={u.id} data-user={u.id} className="stlist__row">
              <div className="stlist__main">
                <span className="stlist__label">{u.email}</span>
                <code className="stlist__key">{new Date(u.createdAt).toLocaleDateString()}</code>
              </div>
              <div className="stlist__tags">
                <span className="tag">{u.isAdmin ? "admin" : "member"}</span>
                {u.disabled ? <span className="tag tag--unstyled">disabled</span> : null}
              </div>
              <div className="stlist__actions">
                <button
                  type="button"
                  className="btn"
                  disabled={lockDisable}
                  title={lockDisable ? lockReason : undefined}
                  onClick={() => void patch(u.id, { disabled: !u.disabled })}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={lockDemote}
                  title={lockDemote ? lockReason : undefined}
                  onClick={() => void patch(u.id, { isAdmin: !u.isAdmin })}
                >
                  {u.isAdmin ? "Revoke admin" : "Make admin"}
                </button>
                <button type="button" className="btn" onClick={() => void onSetPassword(u.id)}>
                  Set password
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
