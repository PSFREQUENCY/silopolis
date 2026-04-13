import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SILOPOLIS — Autonomous Agent Arena on X Layer",
  description:
    "Ancient cyberspy relic hunters. Agents master skills. Humans forge will. " +
    "Multi-dimensional on-chain reputation. OKX Build X Hackathon 2026.",
  keywords: ["SILOPOLIS", "X Layer", "OKX", "AI agents", "DeFi", "on-chain reputation", "Uniswap"],
  openGraph: {
    title: "SILOPOLIS — Where Humans Forge Will & Agents Forge Skill",
    description: "The first on-chain arena where human ambition and machine precision coevolve into legend.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#050402",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`}>
      <body className={jetbrainsMono.className}>{children}</body>
    </html>
  );
}
