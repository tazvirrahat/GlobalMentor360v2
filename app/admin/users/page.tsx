import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FlashAlert } from "@/components/site/flash-alert";
import { listAdminUsers } from "@/lib/admin";
import { requireRole } from "@/lib/session";
import { updateUserRoleAction } from "../actions";
import { PageNav } from "@/components/site/page-nav";

export const metadata = { title: "Users — Admin" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; page?: string }>;
}) {
  await requireRole("ADMIN");
  const { q, error, page: rawPage } = await searchParams;
  const { items: users, page, pageCount } = await listAdminUsers(q?.trim(), rawPage);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Users</h1>
      {error ? <FlashAlert title="Could not update role">{error}</FlashAlert> : null}
      <form className="mt-4 flex min-w-0 max-w-md flex-col gap-2 sm:flex-row" action="/admin/users" role="search">
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

      <ul className="mt-8 flex flex-col gap-4">
        {users.length === 0 ? (
          <p className="text-muted-foreground">No users match that search.</p>
        ) : (
          users.map((user) => {
          const roles = new Set(user.roles.map((row) => row.role));
          return (
            <li key={user.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{user.name}</p>
                  <p className="break-all text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...roles].map((role) => (
                    <Badge key={role} variant="secondary">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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
        })
        )}
      </ul>
      <PageNav pathname="/admin/users" params={{ q }} page={page} pageCount={pageCount} />
    </main>
  );
}
