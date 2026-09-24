import type { ReactNode } from "react";
import { SiteChrome } from "@/components/site/site-chrome";

/** Public pages and the learner's own pages: top bar and slim footer. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
