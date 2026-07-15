import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Growth at Curious",
  description: "Portfolio company growth metrics for Curious",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
