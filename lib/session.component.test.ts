import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * requireUser / requireRole / hasRole / getUserRoles / isActiveUserStatus.
 * Session lookup and the user/role tables are mocked; safeReturnPath is real.
 * redirect is observed by throwing the target path.
 */

const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; name: string } | null,
  status: "ACTIVE" as "ACTIVE" | "SUSPENDED" | "DELETED",
  roles: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (state.user ? { user: state.user } : null),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (!state.user || state.user.id !== where.id) return null;
        return { ...state.user, status: state.status };
      },
    },
    userRole: {
      findMany: async () => state.roles.map((role) => ({ role })),
      findUnique: async ({
        where,
      }: {
        where: { userId_role: { userId: string; role: string } };
      }) =>
        state.roles.includes(where.userId_role.role)
          ? { role: where.userId_role.role }
          : null,
    },
  },
}));

const { getCurrentUser, requireUser, requireRole, hasRole, getUserRoles, isActiveUserStatus } =
  await import("./session");

const learner = { id: "user-1", email: "sam@example.test", name: "Sam" };

beforeEach(() => {
  state.user = null;
  state.status = "ACTIVE";
  state.roles = [];
});

describe("isActiveUserStatus", () => {
  it("treats only ACTIVE as a usable session", () => {
    expect(isActiveUserStatus("ACTIVE")).toBe(true);
    expect(isActiveUserStatus("SUSPENDED")).toBe(false);
    expect(isActiveUserStatus("DELETED")).toBe(false);
  });
});

describe("getCurrentUser", () => {
  it("returns null when signed out", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns the session user when signed in and ACTIVE", async () => {
    state.user = learner;
    expect(await getCurrentUser()).toEqual(learner);
  });

  it("returns null for a SUSPENDED account even if Better Auth still has a session", async () => {
    state.user = learner;
    state.status = "SUSPENDED";
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null for a DELETED account", async () => {
    state.user = learner;
    state.status = "DELETED";
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    state.user = learner;
    expect(await requireUser("/dashboard")).toEqual(learner);
  });

  it("redirects to sign-in when signed out", async () => {
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  it("redirects to sign-in when the account is suspended", async () => {
    state.user = learner;
    state.status = "SUSPENDED";
    await expect(requireUser("/dashboard")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?next=%2Fdashboard",
    );
  });

  it("passes a same-origin return path as ?next=", async () => {
    await expect(requireUser("/dashboard")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in?next=%2Fdashboard",
    );
  });

  it("drops an off-origin return path rather than turning sign-in into an open redirect", async () => {
    await expect(requireUser("https://evil.example/pwn")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    await expect(requireUser("https://evil.example/pwn")).rejects.not.toThrow(/evil/);
  });
});

describe("requireRole", () => {
  it("returns the user when they hold one of the named roles", async () => {
    state.user = learner;
    state.roles = ["INSTRUCTOR"];
    expect(await requireRole("INSTRUCTOR", "ADMIN")).toEqual(learner);
  });

  it("redirects home when the signed-in user lacks the role", async () => {
    state.user = learner;
    state.roles = ["LEARNER"];
    await expect(requireRole("ADMIN")).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("does not treat ADMIN as an implicit grant of every other role", async () => {
    // Documented in requireRole: if an admin should be able to do something,
    // the call site must list ADMIN explicitly.
    state.user = learner;
    state.roles = ["ADMIN"];
    await expect(requireRole("INSTRUCTOR")).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("accepts ADMIN when the call site lists it", async () => {
    state.user = learner;
    state.roles = ["ADMIN"];
    expect(await requireRole("INSTRUCTOR", "ADMIN")).toEqual(learner);
  });

  it("redirects to sign-in before checking roles when signed out", async () => {
    await expect(requireRole("ADMIN")).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });
});

describe("hasRole / getUserRoles", () => {
  it("lists the roles held and answers membership", async () => {
    state.roles = ["LEARNER", "INSTRUCTOR"];
    expect(await getUserRoles("user-1")).toEqual(["LEARNER", "INSTRUCTOR"]);
    expect(await hasRole("user-1", "INSTRUCTOR")).toBe(true);
    expect(await hasRole("user-1", "ADMIN")).toBe(false);
  });
});
