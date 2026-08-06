import { getUserRoles, requireUser } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const roles = await getUserRoles(user.id);

  return (
    <main>
      <h1>Dashboard</h1>

      <dl>
        <dt>Name</dt>
        <dd>{user.name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Roles</dt>
        <dd>{roles.length > 0 ? roles.join(", ") : "none"}</dd>
      </dl>

      <p>
        Placeholder. This becomes &ldquo;My Learning&rdquo; — in-progress, completed, wishlist and
        archived courses (catalog section E).
      </p>

      <SignOutButton />
    </main>
  );
}
