import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { canAccessPlayerItem, getPlayerCourse } from "@/lib/progress";
import { requireUser } from "@/lib/session";
import { pickResumeItem } from "@/lib/continue-learning";

type Params = { params: Promise<{ slug: string }> };

export default async function LearnIndexPage({ params }: Params) {
  const { slug } = await params;
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

  redirect(`/learn/${slug}/${targetId}` as Route);
}
