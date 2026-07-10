import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Curious Growth Dashboard",
  description: "Portfolio company growth metrics for Curious",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
