"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplate, type Template } from "@proposal/shared";
import { fetchTemplates } from "../../client/templates";
import { createProposal } from "../../client/persistence";
import type { Folder } from "../../client/folders";
import { useProposalStore } from "../../state/proposalStore";

export function NewProposalDialog({
  folders,
  onClose,
}: {
  folders: Folder[];
  onClose: () => void;
}) {
  const notify = useProposalStore((s) => s.notify);
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const t = (await fetchTemplates()).filter((x) => !x.deprecated);
        setTemplates(t);
        setTemplateId(t[0]?.id ?? "");
      } catch {
        notify("error", "Couldn't load templates.");
      }
    })();
  }, [notify]);

  const create = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setBusy(true);
    try {
      const document = applyTemplate(template);
      if (title.trim()) document.title = title.trim();
      const { id } = await createProposal(document, folderId === "" ? null : folderId);
      router.push(`/p/${id}`);
    } catch {
      notify("error", "Couldn't create the proposal.");
      setBusy(false);
    }
  };

  return (
    <div className="modal" role="dialog" aria-label="New proposal">
      <div className="modal__card">
        <h2>New proposal</h2>
        <label className="field">
          <span className="field__label">Title</span>
          <input
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled proposal"
          />
        </label>
        <label className="field">
          <span className="field__label">Template</span>
          <select
            aria-label="Template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Folder</span>
          <select
            aria-label="Folder"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || templateId === ""}
            onClick={() => void create()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
