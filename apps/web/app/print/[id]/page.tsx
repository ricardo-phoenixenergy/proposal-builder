import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "./print.css";
import { getRepo } from "../../../src/server/repo";
import { verifyRenderToken } from "../../../src/server/auth/renderToken";
import { defaultTheme } from "../../../src/theme/defaultTheme";
import { themes } from "../../../src/theme/themes";
import { PrintDocument } from "../../../src/print/PrintDocument";

/**
 * The PDF render target (§10.3). Headless Chromium loads this route; it renders
 * the proposal with the same components as the editor, print-styled. Node runtime
 * + self-hosted fonts so the render never hangs on a CDN.
 */
export const runtime = "nodejs";

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  // /print is public to the session gate, so it authorises itself with the signed
  // render token the export route minted (headless Chromium carries no cookie).
  if (!verifyRenderToken(id, t)) return <div data-print-denied={id}>Not authorised.</div>;

  const stored = await getRepo().getProposal(id);
  if (!stored) return <div data-print-missing={id}>Proposal not found.</div>;

  const theme = themes.find((t) => t.id === stored.document.themeId) ?? defaultTheme;
  return <PrintDocument document={stored.document} theme={theme} />;
}
