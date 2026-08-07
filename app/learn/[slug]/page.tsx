import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { canAccessPlayerItem, getPlayerCourse } from "@/lib/progress";
import { requireUser } from "@/lib/session";

type Params = { params: Promise<{ slug: string }> };

export default async function LearnIndexPage({ params }: Params) {
  const { slug } = await params;
  const user = await requireUser(`/learn/${slug}`);
  const course = await getPlayerCourse(slug, user.id);
  if (!course) notFound();

  if (!course.enrolled) {
    redirect(`/courses/${slug}` as Route);
  }

  // First incomplete unlocked item, otherwise the first item, otherwise the landing.
  const flat = course.sections.flatMap((section) => section.items);
  const target =
    flat.find((item) => !item.locked && !item.completed) ??
    flat.find((item) => !item.locked) ??
    flat[0];

  if (!target) {
    redirect(`/courses/${slug}` as Route);
  }

  // Double-check access (preview / enrollment) before landing on it.
  if (!(await canAccessPlayerItem(user.id, course, target.id))) {
    redirect(`/courses/${slug}` as Route);
  }

  redirect(`/learn/${slug}/${target.id}` as Route);
}
