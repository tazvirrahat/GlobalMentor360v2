import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/site/sign-out-button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { ChangeEmailForm, ChangePasswordForm, RevokeOthersForm } from "./account-forms";
import { revokeSessionAction } from "./actions";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const session = await auth.api.getSession({ headers: await headers() });
  const currentToken = session?.session.token;

  const SESSION_PAGE_SIZE = 50;
  const sessionWhere = { userId: user.id, expiresAt: { gt: new Date() } };
  const [sessions, sessionTotal] = await Promise.all([
    db.session.findMany({
      where: sessionWhere,
      orderBy: { updatedAt: "desc" },
      take: SESSION_PAGE_SIZE,
      select: {
        id: true,
        token: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    }),
    db.session.count({ where: sessionWhere }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Account</h1>
          <p className="mt-1 text-muted-foreground">Password, email, and signed-in devices.</p>
          <p className="mt-3 text-sm">
            <Link href={"/orders" as Route} className="text-brand hover:underline">
              View purchases
            </Link>
          </p>
        </div>
        <SignOutButton />
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm currentEmail={user.email} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {sessions.map((row) => {
              const current = row.token === currentToken;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {current ? "This device" : row.userAgent?.slice(0, 80) || "Unknown device"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.ipAddress ?? "IP unknown"} · last active{" "}
                      {formatDateTime(row.updatedAt)}
                    </p>
                  </div>
                  {current ? (
                    <span className="text-xs font-semibold text-brand">Current</span>
                  ) : (
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="token" value={row.token} />
                      <Button type="submit" variant="outline" size="sm">
                        Revoke
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          {sessionTotal > sessions.length ? (
            <p className="text-sm text-muted-foreground">
              Showing the {sessions.length} most recently active of {sessionTotal} sessions.
            </p>
          ) : null}
          <RevokeOthersForm />
        </CardContent>
      </Card>
    </main>
  );
}
