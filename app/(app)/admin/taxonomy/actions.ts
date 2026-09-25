"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  moveCategory,
  renameCategory,
  renameTag,
  setCourseTaxonomy,
  type TagKind,
  type TaxonomyResult,
} from "@/lib/taxonomy";

/** Taxonomy writes from Admin › Taxonomy and the admin course page. ADMIN only; lib/taxonomy audits. */

export type TaxonomyState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

type Kind = "category" | TagKind;

function kindOf(value: FormDataEntryValue | null): Kind | null {
  return value === "category" || value === "topic" || value === "skill" ? value : null;
}

function done(result: TaxonomyResult, message: string): TaxonomyState {
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/admin/taxonomy");
  // Categories feed the home page and the catalog filter; tags the course pages.
  revalidatePath("/", "layout");
  return { status: "done", message };
}

/** One row's Rename / Move up / Move down / Delete, by `intent`. */
export async function taxonomyRowAction(_prev: TaxonomyState, formData: FormData): Promise<TaxonomyState> {
  const admin = await requireRole("ADMIN");
  const kind = kindOf(formData.get("kind"));
  const id = String(formData.get("id") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (!kind || !id) return { status: "error", message: "Something went wrong. Reload the page and try again." };

  if (intent === "rename") {
    const name = String(formData.get("name") ?? "");
    const result = kind === "category" ? await renameCategory(admin.id, id, name) : await renameTag(admin.id, kind, id, name);
    return done(result, "Renamed.");
  }
  if (intent === "up" || intent === "down") {
    if (kind !== "category") return { status: "error", message: "Only categories have an order." };
    return done(await moveCategory(admin.id, id, intent), "Moved.");
  }
  if (intent === "delete") {
    const result = kind === "category" ? await deleteCategory(admin.id, id) : await deleteTag(admin.id, kind, id);
    return done(result, "Deleted.");
  }
  return { status: "error", message: "Something went wrong. Reload the page and try again." };
}

export async function addCategoryAction(_prev: TaxonomyState, formData: FormData): Promise<TaxonomyState> {
  const admin = await requireRole("ADMIN");
  const parent = String(formData.get("parentId") ?? "");
  const result = await createCategory(admin.id, {
    name: String(formData.get("name") ?? ""),
    parentId: parent && parent !== "none" ? parent : null,
  });
  return done(result, "Category added.");
}

export async function addTagAction(_prev: TaxonomyState, formData: FormData): Promise<TaxonomyState> {
  const admin = await requireRole("ADMIN");
  const kind = kindOf(formData.get("kind"));
  if (kind !== "topic" && kind !== "skill") return { status: "error", message: "Something went wrong. Reload the page and try again." };
  const result = await createTag(admin.id, kind, String(formData.get("name") ?? ""));
  return done(result, kind === "topic" ? "Topic added." : "Skill added.");
}

export async function courseTaxonomyAction(_prev: TaxonomyState, formData: FormData): Promise<TaxonomyState> {
  const admin = await requireRole("ADMIN");
  const courseId = String(formData.get("courseId") ?? "");
  const category = String(formData.get("categoryId") ?? "");
  const result = await setCourseTaxonomy(admin.id, courseId, {
    categoryId: category && category !== "none" ? category : null,
    topicIds: formData.getAll("topicId").map(String),
    skillIds: formData.getAll("skillId").map(String),
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/", "layout");
  return { status: "done", message: "Saved." };
}
