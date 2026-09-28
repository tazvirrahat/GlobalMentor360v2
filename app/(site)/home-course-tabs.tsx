"use client";

import { CourseCard, type CourseCardData } from "@/components/course/course-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Badge = "Most popular" | "Top rated" | "New" | null;

export type CourseGroup = { key: string; label: string; courses: { course: CourseCardData; badge: Badge }[] };

/** Udemy-style "browse by subject" tabs over a grid of course cards. Radix tabs: arrow keys move between subjects. */
export function HomeCourseTabs({ groups }: { groups: CourseGroup[] }) {
  return (
    <Tabs defaultValue={groups[0]?.key} className="gap-6">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" aria-label="Subjects" className="h-auto gap-1 border-b border-rule p-0">
          {groups.map((group) => (
            <TabsTrigger key={group.key} value={group.key} className="h-11 flex-none px-3 text-base">
              {group.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {groups.map((group) => (
        <TabsContent key={group.key} value={group.key}>
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {group.courses.map(({ course, badge }) => (
              <li key={course.id}>
                <CourseCard course={course} badge={badge} />
              </li>
            ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}
