"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { NavLink } from "@/lib/nav";
import { AppSidebar } from "./app-sidebar";

type Props = {
  siteName: string;
  roles: readonly string[];
  user: { name: string; email: string };
  accountLinks: NavLink[];
  children: ReactNode;
};

/**
 * Studio and admin (spec §5): a 240px sidebar on desktop; below lg a slim top
 * bar whose Menu opens the same sidebar as a sheet. No marketing footer.
 */
export function AppShell({ children, ...sidebar }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh min-w-0 flex-1">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside
        aria-label="Studio and admin"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto overscroll-contain border-r border-rule bg-surface lg:block"
      >
        <AppSidebar {...sidebar} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-rule bg-surface px-2 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="lg" className="px-3">
                <Menu className="size-5" strokeWidth={1.75} aria-hidden />
                Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" title="Menu">
              <AppSidebar {...sidebar} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-sm px-1 text-base font-bold text-ink focus-ring">
            {sidebar.siteName}
          </Link>
        </header>
        <div id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col bg-paper outline-none">
          {children}
        </div>
      </div>
    </div>
  );
}
