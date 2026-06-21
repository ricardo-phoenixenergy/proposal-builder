import { launchBrowser, type BrowserLauncher } from "./launcher";

/**
 * Render a print URL to a PDF with headless Chromium. Waits for the page's
 * readiness flag and font loading before capturing, so charts/fonts are present.
 * The launcher is injectable so the orchestration can be tested without Chromium.
 */
export async function renderUrlToPdf(
  url: string,
  launch: BrowserLauncher = launchBrowser,
): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.waitForSelector('[data-print-ready="true"]', { timeout: 30_000 });
    await page.evaluateHandle("document.fonts.ready");
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
