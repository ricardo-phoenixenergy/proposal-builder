// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { getPageFormat } from "@proposal/shared";
import { renderUrlToPdf } from "../server/pdf/renderProposalPdf";
import type { BrowserLauncher } from "../server/pdf/launcher";

function fakeLauncher() {
  const calls = { evaluated: [] as unknown[], pdfOpts: undefined as unknown };
  const page = {
    goto: vi.fn(async () => undefined),
    waitForSelector: vi.fn(async () => undefined),
    // genuine await path: render code must call page.evaluate (not evaluateHandle) for fonts.ready
    evaluate: vi.fn(async (fn: unknown) => {
      calls.evaluated.push(fn);
      return undefined;
    }),
    pdf: vi.fn(async (opts: unknown) => {
      calls.pdfOpts = opts;
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    }),
  };
  const browser = { newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
  const launch = (async () => browser) as unknown as BrowserLauncher;
  return { launch, calls, page, browser };
}

describe("renderUrlToPdf — readiness & format", () => {
  it("awaits document.fonts.ready via page.evaluate and sizes the PDF from the format", async () => {
    const { launch, calls, page, browser } = fakeLauncher();
    const fmt = getPageFormat("widescreen_16_9"); // 338.67 x 190.5 mm

    const out = await renderUrlToPdf("http://x/print/p1?t=tok", fmt, launch);

    expect(out).toBeInstanceOf(Uint8Array);
    expect(page.waitForSelector).toHaveBeenCalledWith(
      '[data-print-ready="true"]',
      expect.anything(),
    );
    expect(calls.evaluated.length).toBeGreaterThanOrEqual(1); // fonts.ready awaited through evaluate
    expect(calls.pdfOpts).toMatchObject({
      width: "338.67mm",
      height: "190.5mm",
      printBackground: true,
    });
    expect(browser.close).toHaveBeenCalled();
  });
});
