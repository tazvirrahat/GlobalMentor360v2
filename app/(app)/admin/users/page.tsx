import type { Route } from "next";
import { ListFooter } from "@/components/app/list-footer";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { EmptyState } from "@/components/site/empty-state";
import { FlashAlert } from "@/components/site/flash-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_PAGE_SIZE, listAdminUsers } from "@/lib/admin";
import { formatDateMedium } from "@/lib/format";
import { showingRange } from "@/lib/pagination";
import { requireRole } from "@/lib/session";
import { updateUserRoleAction } from "../actions";

export const metadata = { title: "Users | Admin" };

const ROLE_LABEL: Record<string, string> = { LEARNER: "Learner", INSTRUCTOR: "Instructor", ADMIN: "Admin" };
const GRANTABLE = ["INSTRUCTOR", "ADMIN"] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const query = q?.trim() || undefined;
  const { items: users, total, page, pageCount } = await listAdminUsers(query, rawPage);
  const range = showingRange(page, ADMIN_PAGE_SIZE, total);

  return (
    <main className="flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Users" description="Everyone with an account. Give or take away instructor and admin access." />
      {error ? <FlashAlert title="Could not update role">{error}</FlashAlert> : null}

      <SearchBox
        action={"/admin/users" as Route}
        label="Search users"
        placeholder="Search name or email"
        value={query}
      />

      {users.length === 0 ? (
        query ? (
          <EmptyState title="No users match" message={`Nobody matches “${query}”. Try another search.`} />
        ) : (
          <EmptyState title="No users yet" message="Accounts appear here when people sign up." />
        )
      ) : (
        <>
          <Table className="md:min-w-[48rem]">
            <TableCaption>Users</TableCaption>
            <colgroup>
              <col />
              <col className="hidden w-32 md:table-column" />
              <col className="hidden w-44 md:table-column" />
              <col className="w-44 md:w-80" />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="hidden md:table-cell">Roles</TableHead>
                <TableHead>
                  <span className="sr-only">Change roles</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const roles = new Set(user.roles.map((row) => row.role));
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-ink">{user.name}</span>
                        <span className="text-sm break-all text-graphite">{user.email}</span>
                        <span className="mt-1 flex flex-wrap gap-1 md:hidden">
                          {[...roles].map((role) => (
                            <Badge key={role} variant="secondary">
                              {ROLE_LABEL[role] ?? role}
                            </Badge>
                          ))}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-graphite md:table-cell">
                      <time dateTime={user.createdAt.toISOString()}>{formatDateMedium(user.createdAt)}</time>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex flex-wrap gap-1">
                        {[...roles].map((role) => (
                          <Badge key={role} variant="secondary">
                            {ROLE_LABEL[role] ?? role}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap justify-end gap-2">
                        {GRANTABLE.map((role) => {
                          const has = roles.has(role);
                          const label = ROLE_LABEL[role]!.toLowerCase();
                          return (
                            <form key={role} action={updateUserRoleAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input type="hidden" name="role" value={role} />
                              <input type="hidden" name="enabled" value={has ? "false" : "true"} />
                              <Button type="submit" size="sm" variant="secondary">
                                {has ? `Remove ${label}` : `Make ${label}`}
                                <span className="sr-only">: {user.email}</span>
                              </Button>
                            </form>
                          );
                        })}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListFooter
            range={range}
            total={total}
            pathname="/admin/users"
            params={{ q: query }}
            page={page}
            pageCount={pageCount}
          />
        </>
      )}
    </main>
  );
}
