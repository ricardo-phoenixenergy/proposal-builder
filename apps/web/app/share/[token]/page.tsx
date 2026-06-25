import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "../../print/[id]/print.css";
import "./share.css";
import { getPageFormat, pageCss } from "@proposal/shared";
import { getRepo } from "../../../src/server/repo";
import { resolveSharedProposal } from "../../../src/server/share/resolveSharedProposal";
import { defaultTheme } from "../../../src/theme/defaultTheme";
import { themes } from "../../../src/theme/themes";
import { PrintDocument } from "../../../src/print/PrintDocument";
import { resolvePrintTheme } from "../../../src/print/resolveTheme";
import { refreshActiveRegistry } from "../../../src/server/registry/activeRegistry";
import { refreshActiveLayouts } from "../../../src/server/registry/activeLayouts";
import { ShareDownloadButton } from "./ShareDownloadButton";

/**
 * Public, read-only client preview of a proposal (2b). Reachable only with a valid,
 * live share token — no session. Renders the same components as the PDF, wrapped in a
 * thin viewer chrome. Node runtime + self-hosted fonts (matches /print).
 */
export const runtime = "nodejs";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveSharedProposal(token);

  if (!resolved) {
    return (
      <div className="share-unavailable">
        <h1>This link isn’t available</h1>
        <p>It may have expired, been revoked, or the proposal is no longer shared.</p>
      </div>
    );
  }

  const { link, proposal } = resolved;

  // Best-effort view stamp; never blocks the render.
  void getRepo()
    .touchShareLink(token)
    .catch(() => {});

  // The share RSC runs server-side; its shared registries start empty. Hydrate
  // authored section types + layouts so resolveSection renders them.
  await refreshActiveRegistry();
  await refreshActiveLayouts();

  const theme = resolvePrintTheme(proposal.document, themes, defaultTheme);

  return (
    <div className="share-view">
      <header className="share-view__bar">
        <span className="share-view__title">{proposal.document.title}</span>
        {link.allowExport ? (
          <ShareDownloadButton token={token} title={proposal.document.title} />
        ) : null}
      </header>
      <main className="share-view__doc">
        <style>{pageCss(getPageFormat(proposal.document.pageFormat))}</style>
        <PrintDocument document={proposal.document} theme={theme} />
      </main>
    </div>
  );
}
