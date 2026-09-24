/**
 * Which links each visitor gets in the site chrome. Pure, so the rules are
 * tested without rendering; roles are always decided on the server and passed
 * in.
 */
export type NavLink = { href: string; label: string };
export type Viewer = { signedIn: boolean; roles: readonly string[] };

/** The top bar's main navigation, for everyone. */
export const PRIMARY_NAV: NavLink[] = [
  { href: "/courses", label: "Courses" },
  { href: "/certificates", label: "Verify a certificate" },
];

export const HELP_LINK: NavLink = { href: "/help", label: "Help" };

function isStaff(roles: readonly string[]) {
  return roles.includes("INSTRUCTOR") || roles.includes("ADMIN");
}

/** The account menu (and the phone menu's account section). Help sits in the same place on every page (WCAG 3.2.6). */
export function accountLinks(viewer: Viewer): NavLink[] {
  if (!viewer.signedIn) return [HELP_LINK];
  return [
    { href: "/account", label: "Account" },
    { href: "/orders", label: "Orders" },
    ...(isStaff(viewer.roles) ? [{ href: "/studio", label: "Studio" }] : []),
    ...(viewer.roles.includes("ADMIN") ? [{ href: "/admin/payments", label: "Admin" }] : []),
    HELP_LINK,
  ];
}

/** Slim footer: never offers sign-in to someone already signed in. */
export function footerLinks(viewer: Viewer): NavLink[] {
  return [
    ...PRIMARY_NAV,
    ...(viewer.signedIn
      ? [
          { href: "/dashboard", label: "My learning" },
          { href: "/orders", label: "Orders" },
        ]
      : [
          { href: "/sign-in", label: "Sign in" },
          { href: "/sign-up", label: "Create account" },
        ]),
    HELP_LINK,
  ];
}

/** Up to two letters for the avatar: first and last word of the name, else the email. */
export function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (email.trim()[0] ?? "?").toUpperCase();
  const first = words[0]![0]!;
  const last = words.length > 1 ? words[words.length - 1]![0]! : "";
  return `${first}${last}`.toUpperCase();
}

/** A nav item is current on its own page and its sub-pages. */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
