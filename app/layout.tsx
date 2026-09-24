import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MotionProvider } from "@/components/site/motion-provider";
import "./globals.css";

// One family for everything; weights come from the variable axis (400–900).
const schibsted = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  display: "swap",
});

// Only for strings people read or type exactly: serials, transaction IDs, codes.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "GlobalMentor360",
    template: "%s — GlobalMentor360",
  },
  description:
    "Structured online courses. Each section ends with a quiz, and every certificate has a serial anyone can verify.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`min-w-0 overflow-x-clip ${schibsted.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-screen min-w-0 flex-col overflow-x-clip font-sans">
        <MotionProvider>
          <SiteHeader />
          <div id="main" className="min-w-0 flex-1">
            {children}
          </div>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
