import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MotionProvider } from "@/components/site/motion-provider";
import { getSite } from "@/lib/site";
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

const site = getSite();

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  applicationName: site.name,
  title: {
    default: `${site.name} | ${site.title}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} | ${site.title}`,
    description: site.description,
  },
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
