import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Noto_Sans_Bengali, Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MotionProvider } from "@/components/site/motion-provider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["500", "600", "700"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-noto-bengali",
  display: "swap",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "GlobalMentor360 — Learn without limits",
    template: "%s — GlobalMentor360",
  },
  description:
    "A single-organization online academy. Structured courses, quiz-gated lessons, verifiable certificates.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`min-w-0 overflow-x-clip ${fraunces.variable} ${sourceSans.variable} ${notoBengali.variable}`}
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
