import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RydeTRUE — Two sides. One fair resolution.",
  description:
    "Evidence-led dispute resolution platform for Ryde (Multi-Agent Autonomous Dispute Resolution System).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-ink antialiased">{children}</body>
    </html>
  );
}