import { useEffect } from "react";
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
 */
export function App() {
  const document = useProposalStore((s) => s.document);
  const theme = useProposalStore((s) => s.theme);
  const loadSectionTypes = useProposalStore((s) => s.loadSectionTypes);
  const loadTemplates = useProposalStore((s) => s.loadTemplates);
  useEffect(() => {
    void loadSectionTypes();
    void loadTemplates();
  }, [loadSectionTypes, loadTemplates]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__title">{document.title}</span>
          <span className="topbar__sub">{document.client.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <SaveControl />
          <ExportGate />
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
