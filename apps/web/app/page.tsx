"use client";

// The editor is fully interactive (Zustand state, live preview, variant/theme
// swapping), so the page is a thin client shell around <App/>. RSC is reserved
// for the print route, which Puppeteer renders server-side (slice 9).
import { App } from "../src/App";

export default function Page() {
  return <App />;
}
