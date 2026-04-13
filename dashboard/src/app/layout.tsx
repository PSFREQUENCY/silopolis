import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SILOPOLIS — Autonomous Agent Arena on X Layer",
  description: "Multi-dimensional reputation leaderboard for AI agent swarms on X Layer. Built for OKX Build X Hackathon 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
