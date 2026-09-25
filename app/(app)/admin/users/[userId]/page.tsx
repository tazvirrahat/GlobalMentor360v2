import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { FlashAlert } from "@/components/site/flash-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, tableLinkClass } from "@/components/ui/table";
import { getAdminUser } from "@/lib/admin";
import { formatDateMedium } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { updateUserRoleAction } from "../../actions";
import { GrantCourseForm, StatusForm } from "./user-actions";

export const metadata = { title: "User | Admin" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { LEARNER: "Learner", INSTRUCTOR: "Instructor", ADMIN: "Admin" };
const SOURCE_LABEL: Record<string, string> = { PURCHASE: "Bought", FREE: "Free", GRANT: "Given by an admin" };
const GRANTABLE = ["INSTRUCTOR", "ADMIN"] as const;

type Params = { params: Promise<{ userId: string }>; searchParams: Promise<{ error?: string }> };

/** One person for an admin: roles, whether they can sign in, and their courses. */
export default async function AdminUserPage({ params, searchParams }: Params) {
  await requireRole("ADMIN");
  const { userId } = await params;
  const { error } = await searchParams;
  const user = await getAdminUser(userId);
  if (!user) notFound();
  const roles = new Set(user.roles.map((row) => row.role));
  const suspended = user.status === "SUSPENDED";

  return (
    <main className="flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        back={{ href: "/admin/users" as Route, label: "Users" }}
        title={user.name}
        description={user.email}
        meta={suspended ? <Badge variant="destructive">Suspended</Badge> : null}
      />
      {error ? <FlashAlert title="Could not update role">{error}</FlashAlert> : null}

      <Panel title="Account">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-graphite">Joined</dt>
            <dd className="text-ink">
              <time dateTime={user.createdAt.toISOString()}>{formatDateMedium(user.createdAt)}</time>
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-graphite">Email</dt>
            <dd className="text-ink">{user.emailVerified ? "Verified" : "Not verified"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-sm text-graphite">Roles</dt>
            <dd className="flex flex-wrap gap-1">
              {[...roles].map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABEL[role] ?? role}
                </Badge>
              ))}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {GRANTABLE.map((role) => {
            const has = roles.has(role);
            const label = ROLE_LABEL[role]!.toLowerCase();
            return (
              <form key={role} action={updateUserRoleAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="enabled" value={has ? "false" : "true"} />
                <input type="hidden" name="returnTo" value={`/admin/users/${user.id}`} />
                <Button type="submit" size="sm" variant="secondary">
                  {has ? `Remove ${label}` : `Make ${label}`}
                </Button>
              </form>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Access"
        description={
          suspended
            ? "Suspended: they are signed out and can't sign in. Their courses and certificates stay as they are."
            : "Suspending signs them out everywhere and stops them signing in. Their courses and certificates stay as they are."
        }
      >
        <StatusForm userId={user.id} suspended={suspended} />
      </Panel>

      <Panel title="Courses" description="Everything they are enrolled in. Giving a course opens it without payment and is recorded.">
        {user.enrollments.length === 0 ? (
          <p className="text-sm text-graphite">No courses yet.</p>
        ) : (
          <Table>
            <TableCaption>Their courses</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-44 sm:table-column" />
              <col className="w-32" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead className="hidden sm:table-cell">How</TableHead>
                <TableHead>Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.enrollments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <span className="flex min-w-0 flex-col">
                      <Link href={`/admin/courses/${row.course.id}` as Route} className={tableLinkClass}>
                        {row.course.title}
                      </Link>
                      <span className="text-sm text-graphite sm:hidden">{SOURCE_LABEL[row.source] ?? row.source}</span>
                      {row.revokedAt ? <span className="text-sm text-seal">Access removed (refunded)</span> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-graphite sm:table-cell">{SOURCE_LABEL[row.source] ?? row.source}</TableCell>
                  <TableCell className="text-graphite">
                    <time dateTime={row.enrolledAt.toISOString()}>{formatDateMedium(row.enrolledAt)}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <GrantCourseForm userId={user.id} courses={user.grantable} />
      </Panel>
    </main>
  );
}
