import type { ReactNode } from "react";
import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";

/**
 * Top bar, page, slim footer. The (site) layout uses it, and so does the root
 * 404: an unmatched URL renders inside the root layout only, not a group's.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <div id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
