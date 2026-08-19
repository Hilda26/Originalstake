import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/walletContext";
import { SiteHeader } from "@/components/SiteHeader";

// Body font: IBM Plex Sans - a clean, technical grotesk that reads as
// "engineered/serious" rather than the generic SaaS-sans feel, and is a
// visibly different choice from project-1's Plus Jakarta Sans.
const bodyFont = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Display font: Source Serif 4, a modern serif with real editorial/legal
// gravity - the opposite pairing from project-1's heavy uppercase grotesk
// (Archivo Black). A serif display face fits a product about adjudicating
// originality: the mood is closer to a judgment or a filing than a startup
// landing page, and a serif signals that seriousness immediately.
const displayFont = Source_Serif_4({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "OriginalStake - a staked originality-challenge market",
  description:
    "Writers post a bond and submit short creative text on-chain. Anyone can stake a counter-bond to challenge it as a near-copy; a GenLayer Intelligent Contract runs its own vector search and a single consensus round to decide who keeps the stake.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} h-full`} data-theme="dark">
      <body className="min-h-full flex flex-col antialiased bg-bg text-ink">
        <WalletProvider>
          <SiteHeader />
          <main className="flex-1 flex flex-col">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
