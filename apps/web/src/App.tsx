"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProposalStore } from "./state/proposalStore";
import { DocumentRenderer } from "./render/DocumentRenderer";
import { Outline } from "./ui/Outline";
import { Inspector } from "./ui/Inspector";
import { ExportGate } from "./ui/ExportGate";
import { SaveControl } from "./ui/SaveControl";
import { Autosave } from "./ui/Autosave";
import { Toast } from "./ui/Toast";
import { SignOutButton } from "./ui/SignOutButton";

/**
 * The three-pane editor shell (§11): outline · live preview · inspector. The
 * chrome uses a fixed palette (globals.css, --ui-*); only the document inside the
 * sheet re-themes. Fully client-side and store-driven — no backend.
 *
 * When `id` is provided the shell loads that proposal on mount and shows a
 * loading state until `proposalId` matches. A ← Dashboard link is always shown
 * when `id` is set so the user can return to the dashboard.
 */
export function App({ id, isAdmin }: { id?: string; isAdmin?: boolean } = {}) {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const proposalId = useProposalStore((s) => s.proposalId);
  const loadProposal = useProposalStore((s) => s.load);
  const loadSectionTypes = useProposalStore((s) => s.loadSectionTypes);
  const loadTemplates = useProposalStore((s) => s.loadTemplates);
  const loadLayouts = useProposalStore((s) => s.loadLayouts);
  const router = useRouter();

  useEffect(() => {
    void loadSectionTypes();
    void loadTemplates();
    void loadLayouts();
  }, [loadSectionTypes, loadTemplates, loadLayouts]);

  useEffect(() => {
    if (id && id !== proposalId) {
      void loadProposal(id).catch(() => router.replace("/"));
    }
  }, [id, proposalId, loadProposal, router]);

  const loading = Boolean(id) && proposalId !== id;
  if (loading) {
    return <div className="app app--loading">Loading proposal…</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <a className="btn btn--ghost" href="/">← Dashboard</a>
          <span className="topbar__title">{document.title}</span>
          <span className="topbar__sub">{document.client.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <SaveControl />
          <ExportGate />
          {isAdmin ? <a className="btn btn--ghost" href="/admin">Admin</a> : null}
          <SignOutButton />
        </div>
      </header>
      <Autosave />
      <Toast />

      <div className="workspace">
        <Outline />
        <main aria-label="Preview" className="canvas">
          <div className="sheet">
            <DocumentRenderer document={document} theme={theme} />
          </div>
        </main>
        <Inspector />
      </div>
    </div>
  );
}
