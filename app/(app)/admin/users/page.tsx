import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { formatDate } from "@/lib/format";
import { ADMIN_PAGE_SIZE, listAdminUsers } from "@/lib/admin";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { updateUserRoleAction } from "../actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Users | Admin" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const { items: users, total, page, pageCount } = await listAdminUsers(q?.trim(), rawPage);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  const pager = (
    <>
      {users.length > 0 ? (
        <p className="text-sm tabular-nums text-muted-foreground">
          Showing {range.from}–{range.to} of {total}
        </p>
      ) : null}
      <PageNav pathname="/admin/users" params={{ q }} page={page} pageCount={pageCount} />
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Users</h1>
      {error ? <FlashAlert title="Could not update role">{error}</FlashAlert> : null}
      <form
        className="mt-4 flex min-w-0 max-w-md flex-col gap-2 sm:flex-row"
        action="/admin/users"
        role="search"
      >
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or email"
          aria-label="Search users"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {users.length === 0 ? (
        q?.trim() ? (
          <EmptyState
            className="mt-8"
            title="No users match"
            message={`No users match “${q.trim()}”. Try a different search.`}
          >
            <Button asChild>
              <Link href="/admin/users" className="cursor-pointer">
                Clear search
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            className="mt-8"
            title="No users yet"
            message="Accounts will appear here when people sign up."
          />
        )
      ) : (
        <div className="mt-4 min-w-0 space-y-2">
          {pager}
          <div className="w-0 min-w-full overflow-x-auto rounded-lg border bg-card shadow-sm">
            <ul>
              {users.map((user) => {
                const roles = new Set(user.roles.map((row) => row.role));
                return (
                  <li
                    key={user.id}
                    className="flex min-w-[36rem] flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate" title={`${user.name} · ${user.email}`}>
                        <span className="font-medium">{user.name}</span>
                        <span className="text-muted-foreground"> · {user.email}</span>
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Joined {formatDate(user.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {[...roles].map((role) => (
                        <Badge key={role} variant="secondary">
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(["INSTRUCTOR", "ADMIN"] as const).map((role) => {
                        const has = roles.has(role);
                        return (
                          <form key={role} action={updateUserRoleAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="role" value={role} />
                            <input type="hidden" name="enabled" value={has ? "false" : "true"} />
                            <Button type="submit" size="sm" variant="outline">
                              {has ? `Remove ${role.toLowerCase()}` : `Make ${role.toLowerCase()}`}
                            </Button>
                          </form>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {pager}
        </div>
      )}
    </main>
  );
}
