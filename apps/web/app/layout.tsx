import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Proposal Builder",
  description: "Brand-aligned client proposal generator",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
