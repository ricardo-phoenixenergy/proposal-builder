"use client";

import { useEffect, useState } from "react";
import { createShare, listShares, revokeShare, shareUrl, type ShareLink } from "../client/shares";
import { useProposalStore } from "../state/proposalStore";

/** Manage client share links for one proposal (2b): create, copy, revoke. */
export function ShareDialog({
  proposalId,
  title,
  onClose,
}: {
  proposalId: string;
  title: string;
  onClose: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [allowExport, setAllowExport] = useState(true);

  const load = async () => {
    try {
      setLinks(await listShares(proposalId));
    } catch {
      notify("error", "Couldn't load share links.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const link = await createShare(proposalId, { allowExport });
      setLinks((prev) => [link, ...prev]);
      try {
        await navigator.clipboard.writeText(shareUrl(link.token));
        notify("success", "Link created and copied.");
      } catch {
        notify("success", "Link created.");
      }
    } catch {
      notify("error", "Couldn't create link.");
    } finally {
      setCreating(false);
    }
  };

  const onCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      notify("success", "Link copied.");
    } catch {
      notify("error", "Couldn't copy.");
    }
  };

  const onRevoke = async (token: string) => {
    try {
      await revokeShare(proposalId, token);
      setLinks((prev) =>
        prev.map((l) => (l.token === token ? { ...l, revokedAt: new Date().toISOString() } : l)),
      );
      notify("success", "Link revoked.");
    } catch {
      notify("error", "Couldn't revoke link.");
    }
  };

  const active = links.filter((l) => l.revokedAt === null);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Share ${title}`}>
      <div className="modal__card">
        <h2>Share “{title}”</h2>
        <p>Anyone with a link can view this proposal — no account needed.</p>

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
          <input
            type="checkbox"
            checked={allowExport}
            onChange={(e) => setAllowExport(e.target.checked)}
          />
          Allow PDF download
        </label>
        <button
          type="button"
          className="btn btn--primary"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          {creating ? "Creating…" : "Create link"}
        </button>

        <ul className="share-links" style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {loading ? (
            <li>Loading…</li>
          ) : active.length === 0 ? (
            <li style={{ color: "#6b7280" }}>No active links.</li>
          ) : (
            active.map((l) => (
              <li
                key={l.token}
                data-share-token={l.token}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderTop: "1px solid #eee",
                }}
              >
                <code
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                  }}
                >
                  {shareUrl(l.token)}
                </code>
                <span className="tag" style={{ fontSize: 11 }}>
                  {l.allowExport ? "PDF ok" : "view only"}
                </span>
                <button type="button" className="btn" onClick={() => void onCopy(l.token)}>
                  Copy
                </button>
                <button
                  type="button"
                  className="btn pcard__danger"
                  onClick={() => void onRevoke(l.token)}
                >
                  Revoke
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
