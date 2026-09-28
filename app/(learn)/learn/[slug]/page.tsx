import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { canAccessPlayerItem, getPlayerCourse } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { pickResumeItem } from "@/lib/continue-learning";
import { PLAYER_TABS } from "@/lib/player";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> };

export default async function LearnIndexPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { tab } = await searchParams;
  // A link to the course's Q&A (from the studio inbox) keeps its tab through the redirect.
  const query = tab && (PLAYER_TABS as readonly string[]).includes(tab) ? `?tab=${tab}` : "";
  const user = await requireUser(`/learn/${slug}`);
  const course = await getPlayerCourse(slug, user.id);
  if (!course) notFound();

  if (!course.enrolled) {
    redirect(`/courses/${slug}` as Route);
  }

  // First incomplete unlocked item, otherwise the first unlocked one (the same
  // rule as the Resume button), otherwise the landing page.
  const flat = course.sections.flatMap((section) => section.items);
  const targetId = pickResumeItem(flat) ?? flat[0]?.id;

  if (!targetId) {
    redirect(`/courses/${slug}` as Route);
  }

  // Double-check access (preview / enrollment) before landing on it.
  if (!(await canAccessPlayerItem(user.id, course, targetId))) {
    redirect(`/courses/${slug}` as Route);
  }

  redirect(`/learn/${slug}/${targetId}${query}` as Route);
}
