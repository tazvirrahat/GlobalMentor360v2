import type { Route } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { siteUrl } from "@/lib/site";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Your profile | Studio" };
export const dynamic = "force-dynamic";

/** The instructor's public page, edited here and shown at /instructors/<slug>. */
export default async function StudioProfilePage() {
  const user = await requireRole("INSTRUCTOR", "ADMIN");
  const profile = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, slug: true, headline: true, bio: true, websiteUrl: true, profilePublic: true },
  });
  const publishedCount = await db.course.count({ where: { instructorId: user.id, status: "PUBLISHED" } });
  const path = profile.slug ? (`/instructors/${profile.slug}` as Route) : null;
  const live = Boolean(path && profile.profilePublic && publishedCount > 0);

  return (
    <main className="flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Your profile"
        description="Learners see this on your instructor page and on each of your courses."
        actions={
          live && path ? (
            <Link
              href={path}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
            >
              View your page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />

      <Panel
        title={profile.name}
        description={
          live && path
            ? `Your page is at ${siteUrl(path)}.`
            : publishedCount === 0
              ? "Your page appears once you publish a course."
              : !profile.profilePublic
                ? "Your page is hidden. Tick the box below to show it."
                : "Save your profile to create your page."
        }
      >
        <ProfileForm profile={profile} />
        <p className="text-sm text-graphite">
          Your name comes from your{" "}
          <Link
            href="/account#profile"
            className="rounded-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring"
          >
            account settings
          </Link>
          .
        </p>
      </Panel>
    </main>
  );
}
