import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { requireRole } from "@/lib/session";
import { listTaxonomy, type TaxonomyCategory, type TaxonomyTag } from "@/lib/taxonomy";
import { AddCategoryForm, AddTagForm, TaxonomyRow } from "./taxonomy-forms";

export const metadata = { title: "Taxonomy | Admin" };
export const dynamic = "force-dynamic";

function courses(n: number) {
  return `${n} ${n === 1 ? "course" : "courses"}`;
}

/** A subject's line counts the courses in its subcategories too, which is what the catalog shows. */
function subjectMeta(subject: TaxonomyCategory) {
  const total = subject.courseCount + subject.children.reduce((sum, child) => sum + child.courseCount, 0);
  const n = subject.children.length;
  return n > 0 ? `${courses(total)} in ${n} ${n === 1 ? "subcategory" : "subcategories"}` : courses(total);
}

function TagList({ kind, tags }: { kind: "topic" | "skill"; tags: TaxonomyTag[] }) {
  if (tags.length === 0) return <p className="text-sm text-graphite">None yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-rule border-y border-rule">
      {tags.map((tag) => (
        <li key={tag.id}>
          <TaxonomyRow
            kind={kind}
            id={tag.id}
            name={tag.name}
            meta={courses(tag.courseCount)}
            deleteQuestion={tag.courseCount > 0 ? `Delete it? It comes off ${courses(tag.courseCount)}.` : "Delete it?"}
          />
        </li>
      ))}
    </ul>
  );
}

/** Admin › Taxonomy: the subjects and subcategories learners browse, and the topics and skills on course pages. */
export default async function AdminTaxonomyPage() {
  await requireRole("ADMIN");
  const { categories, topics, skills } = await listTaxonomy();

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Taxonomy"
        description="Categories organise the catalog. Topics and skills show on course pages; set them per course from Admin › Courses."
      />

      <Panel
        title="Categories"
        description="Subjects and their subcategories, in the order the home page and catalog show them. A category with courses in it can't be deleted."
      >
        {categories.length === 0 ? (
          <p className="text-sm text-graphite">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule border-y border-rule">
            {categories.map((subject, index) => (
              <li key={subject.id}>
                <TaxonomyRow
                  kind="category"
                  id={subject.id}
                  name={subject.name}
                  meta={subjectMeta(subject)}
                  deleteQuestion="Delete it?"
                  move={{ up: index > 0, down: index < categories.length - 1 }}
                />
                {subject.children.length > 0 ? (
                  <ul aria-label={`Subcategories of ${subject.name}`} className="flex flex-col divide-y divide-rule border-t border-rule">
                    {subject.children.map((child, childIndex) => (
                      <li key={child.id}>
                        <TaxonomyRow
                          kind="category"
                          id={child.id}
                          name={child.name}
                          meta={courses(child.courseCount)}
                          deleteQuestion="Delete it?"
                          move={{ up: childIndex > 0, down: childIndex < subject.children.length - 1 }}
                          nested
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <AddCategoryForm subjects={categories.map((subject) => ({ id: subject.id, name: subject.name }))} />
      </Panel>

      <Panel title="Topics" description="What a course covers. Course pages link each one to a catalog search.">
        <TagList kind="topic" tags={topics} />
        <AddTagForm kind="topic" />
      </Panel>

      <Panel title="Skills" description={"What learners can do after the course, listed under “Skills you'll gain”."}>
        <TagList kind="skill" tags={skills} />
        <AddTagForm kind="skill" />
      </Panel>
    </main>
  );
}
