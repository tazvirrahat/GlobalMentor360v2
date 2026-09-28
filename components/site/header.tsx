import { cartItemCount } from "@/lib/cart";
import { accountLinks } from "@/lib/nav";
import { unreadNotificationCount } from "@/lib/notifications";
import { getCurrentUser, getUserRoles } from "@/lib/session";
import { getSite } from "@/lib/site";
import { SiteHeaderBar } from "./site-header-bar";

/**
 * Session-aware site top bar. A server component on purpose: which links a
 * visitor gets depends on roles, and roles are never decided client-side. The
 * bar itself (active states, the account menu, the phone sheet) is a client
 * component that receives plain props.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const roles = user ? await getUserRoles(user.id) : [];
  const [cartCount, unreadCount] = user
    ? await Promise.all([cartItemCount(user.id), unreadNotificationCount(user.id)])
    : [0, 0];

  return (
    <SiteHeaderBar
      siteName={getSite().name}
      user={user ? { name: user.name, email: user.email } : null}
      accountLinks={accountLinks({ signedIn: Boolean(user), roles })}
      cartCount={cartCount}
      unreadCount={unreadCount}
    />
  );
}
