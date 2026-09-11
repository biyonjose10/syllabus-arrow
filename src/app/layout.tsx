import type { Metadata, Viewport } from "next";
import "./globals.css";

// System fonts, not next/font/google: the Google variant downloads font files
// at build time, and a build that needs the network fails in CI and offline.

export const metadata: Metadata = {
  title: "Syllabus→ — a term plan that knows what you can't do yet",
  description:
    "Upload your syllabus. Get the prerequisite map, a schedule that works back from your exam, and practice that tells you what you actually know.",
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
