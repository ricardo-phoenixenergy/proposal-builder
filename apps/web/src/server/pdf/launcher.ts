import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Chromium "pack" for serverless. @sparticuz/chromium-min ships no binary; it
 * fetches this tar at runtime so the function stays under Vercel's ~50 MB limit.
 * Must match the installed chromium-min version. Override via env to self-host it.
 */
const PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

export type BrowserLauncher = () => Promise<Browser>;

/**
 * Launch Chromium for PDF rendering. On Vercel/serverless: puppeteer-core +
 * chromium-min (remote pack). Locally: a system Chrome via PUPPETEER_EXECUTABLE_PATH
 * (chromium-min's binary is Linux-serverless only).
 */
export const launchBrowser: BrowserLauncher = async () => {
  const serverless = Boolean(process.env.VERCEL) || Boolean(process.env.AWS_REGION);

  if (serverless) {
    return puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(PACK_URL),
      headless: true,
    });
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? process.env.CHROME_PATH;
  if (!executablePath) {
    throw new Error(
      "PDF render needs Chrome in dev: set PUPPETEER_EXECUTABLE_PATH to a local Chrome/Chromium binary.",
    );
  }
  return puppeteer.launch({ executablePath, headless: true });
};
