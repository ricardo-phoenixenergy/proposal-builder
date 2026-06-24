import type { PageFormat } from "@proposal/shared";
import { launchBrowser, type BrowserLauncher } from "./launcher";

/**
 * Render a print URL to a PDF with headless Chromium. Waits for the page's
 * readiness flag AND genuinely awaits font loading (page.evaluate resolves the
 * fonts.ready Promise — evaluateHandle would only hand back the unresolved
 * Promise), then sizes the sheet from the document's page format. The launcher
 * is injectable so the orchestration is testable without Chromium.
 */
export async function renderUrlToPdf(
  url: string,
  fmt: PageFormat,
  launch: BrowserLauncher = launchBrowser,
): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForSelector('[data-print-ready="true"]', { timeout: 30_000 });
    // Genuinely block on font load (charts/SVG are painted by the print page before
    // it sets data-print-ready; fonts can still be resolving).
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      width: `${fmt.widthMm}mm`,
      height: `${fmt.heightMm}mm`,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
