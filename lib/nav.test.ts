import { describe, expect, it } from "vitest";
import { accountLinks, footerLinks, initials, isActivePath, PRIMARY_NAV } from "./nav";

const labels = (links: { label: string }[]) => links.map((l) => l.label);

describe("site navigation", () => {
  it("offers courses and certificate checks to everyone", () => {
    expect(labels(PRIMARY_NAV)).toEqual(["Courses", "Verify a certificate"]);
  });

  it("puts studio and admin in the account menu by role only", () => {
    expect(labels(accountLinks({ signedIn: true, roles: ["LEARNER"] }))).toEqual([
      "Account",
      "Orders",
      "Help",
    ]);
    const instructor = labels(accountLinks({ signedIn: true, roles: ["LEARNER", "INSTRUCTOR"] }));
    expect(instructor).toContain("Studio");
    expect(instructor).not.toContain("Admin");
    expect(labels(accountLinks({ signedIn: true, roles: ["ADMIN"] }))).toEqual(
      expect.arrayContaining(["Studio", "Admin"]),
    );
  });

  it("never offers sign-in to someone signed in, in the footer", () => {
    const signedIn = labels(footerLinks({ signedIn: true, roles: [] }));
    expect(signedIn).not.toContain("Sign in");
    expect(signedIn).toEqual(expect.arrayContaining(["My learning", "Orders", "Help"]));
    expect(labels(footerLinks({ signedIn: false, roles: [] }))).toEqual(
      expect.arrayContaining(["Sign in", "Create account", "Help"]),
    );
  });

  it("makes initials from the name, falling back to the email", () => {
    expect(initials("Sam Learner", "learner@example.com")).toBe("SL");
    expect(initials("  nusrat  ", "n@example.com")).toBe("N");
    expect(initials("Md Tazvir Rahat", "t@example.com")).toBe("MR");
    expect(initials("", "farhana.akter@example.com")).toBe("F");
  });

  it("marks a section active for its own sub-pages only", () => {
    expect(isActivePath("/courses", "/courses/sql-for-analysts")).toBe(true);
    expect(isActivePath("/courses", "/courses")).toBe(true);
    expect(isActivePath("/courses", "/coursesx")).toBe(false);
    expect(isActivePath("/", "/courses")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});
