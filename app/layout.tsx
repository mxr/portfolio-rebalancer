import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import packageJson from "../package.json";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Portfolio Rebalancer",
  description: "Frontend-only portfolio rebalancing calculator.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${plexMono.variable} antialiased`}
      >
        {children}
        <footer className="border-t border-white/60 bg-white/40 px-6 py-4 text-xs text-[#5b5148] sm:px-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span>Version {packageJson.version}</span>
            <span>Licensed under GNU Affero General Public License v3.0</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
