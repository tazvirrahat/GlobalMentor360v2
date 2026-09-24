import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Bell, BookOpen, Monitor, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/site/empty-state";
import { SignOutButton } from "@/components/site/sign-out-button";
import type { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateMedium, formatDateTime } from "@/lib/format";
import { getUserRoles, requireUser } from "@/lib/session";
import { describeUserAgent } from "@/lib/user-agent";
import { ChangeEmailForm, ChangePasswordForm, RevokeOthersForm } from "./account-forms";
import { revokeSessionAction } from "./actions";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

const SESSION_PAGE_SIZE = 5;
const SESSION_FETCH_CAP = 50;

const ROLE_LABEL: Record<Role, string> = {
  LEARNER: "Learner",
  INSTRUCTOR: "Instructor",
  ADMIN: "Admin",
  SUPPORT: "Support",
  MODERATOR: "Moderator",
};

type SessionRowData = {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  updatedAt: Date;
};

function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("").toUpperCase() || "?";
}

function NoOtherDevices() {
  return (
    <EmptyState
      headingLevel={3}
      className="py-8"
      icon={<Monitor className="size-6" aria-hidden />}
      title="No other devices"
      message="You're only signed in here. Other browsers and phones will show up if you sign in on them."
    />
  );
}

function SessionRow({
  row,
  current,
}: {
  row: SessionRowData;
  current: boolean;
}) {
  const device = describeUserAgent(row.userAgent);
  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/50">
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium" title={row.userAgent ?? undefined}>
          {current ? "This device" : device}
        </p>
        <p className="text-xs text-muted-foreground">
          {current && device !== "Unknown device" ? (
            <>
              <span>{device}</span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          <span
            className="inline-block max-w-[11rem] truncate align-bottom tabular-nums sm:max-w-[18rem]"
            title={row.ipAddress ?? undefined}
          >
            {row.ipAddress ?? "IP unknown"}
          </span>
          <span aria-hidden> · </span>
          last active{" "}
          <time className="tabular-nums" dateTime={row.updatedAt.toISOString()}>
            {formatDateTime(row.updatedAt)}
          </time>
        </p>
      </div>
      {current ? (
        <Badge variant="secondary">Current</Badge>
      ) : (
        <form action={revokeSessionAction}>
          <input type="hidden" name="token" value={row.token} />
          <Button type="submit" variant="outline" size="sm" className="cursor-pointer">
            Revoke
          </Button>
        </form>
      )}
    </li>
  );
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const session = await auth.api.getSession({ headers: await headers() });
  const currentToken = session?.session.token;

  const sessionWhere = { userId: user.id, expiresAt: { gt: new Date() } };
  const [sessions, sessionTotal, roles, profile] = await Promise.all([
    db.session.findMany({
      where: sessionWhere,
      orderBy: { updatedAt: "desc" },
      take: SESSION_FETCH_CAP,
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
    getUserRoles(user.id),
    db.user.findUnique({
      where: { id: user.id },
      select: { createdAt: true },
    }),
  ]);

  const currentRow = sessions.find((row) => row.token === currentToken);
  const ordered = currentRow
    ? [currentRow, ...sessions.filter((row) => row.id !== currentRow.id)]
    : sessions;
  const preview = ordered.slice(0, SESSION_PAGE_SIZE);
  const rest = ordered.slice(SESSION_PAGE_SIZE);
  const memberSince = profile?.createdAt;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Account</h1>
          <SignOutButton variant="ghost" />
        </div>
        <p className="text-muted-foreground">
          Manage your profile, password, and signed-in devices.
        </p>
      </header>

      <section
        aria-label="Your identity"
        className="flex flex-col gap-4 rounded-lg border bg-card p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary"
            aria-hidden
          >
            {nameInitials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-lg font-semibold tracking-tight">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABEL[role]}
                </Badge>
              ))}
              {memberSince ? (
                <span className="text-sm tabular-nums text-muted-foreground">
                  Member since{" "}
                  <time dateTime={memberSince.toISOString()}>{formatDateMedium(memberSince)}</time>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={"/dashboard" as Route} className="cursor-pointer">
              <BookOpen className="size-4" aria-hidden />
              My learning
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={"/orders" as Route} className="cursor-pointer">
              <Receipt className="size-4" aria-hidden />
              Orders
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={"/notifications" as Route} className="cursor-pointer">
              <Bell className="size-4" aria-hidden />
              Notifications
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="account-profile">
        <Card>
          <CardHeader>
            <h2 id="account-profile" className="font-heading text-xl font-semibold tracking-tight">
              Profile
            </h2>
            <p className="text-sm text-muted-foreground">Your name and how we reach you.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex max-w-md flex-col gap-1.5">
              <p className="text-sm font-medium">Name</p>
              <p>{user.name}</p>
              <p className="text-sm text-muted-foreground">Managed at sign-up.</p>
            </div>
            <div className="max-w-md border-t pt-6">
              <h3 className="mb-4 font-heading text-base font-semibold tracking-tight">Email</h3>
              <ChangeEmailForm currentEmail={user.email} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="account-password">
        <Card>
          <CardHeader>
            <h2 id="account-password" className="font-heading text-xl font-semibold tracking-tight">
              Password
            </h2>
            <p className="text-sm text-muted-foreground">
              At least 12 characters. Updating it signs you out of other devices.
            </p>
          </CardHeader>
          <CardContent className="max-w-md">
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="account-sessions">
        <Card>
          <CardHeader>
            <h2 id="account-sessions" className="font-heading text-xl font-semibold tracking-tight">
              Sessions
            </h2>
            <p className="text-sm tabular-nums text-muted-foreground">
              {sessionTotal === 1 ? "1 signed-in device." : `${sessionTotal} signed-in devices.`}
              {sessionTotal > 1
                ? " Revoke a device you no longer use, or sign out of all of them below."
                : " Other browsers and phones will show up here if you sign in on them."}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ordered.length === 0 ? (
              <NoOtherDevices />
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border">
                  <ul>
                    {preview.map((row) => (
                      <SessionRow key={row.id} row={row} current={row.token === currentToken} />
                    ))}
                  </ul>
                  {rest.length > 0 ? (
                    <details className="border-t">
                      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-ring">
                        Show all {ordered.length} sessions
                      </summary>
                      <ul className="border-t">
                        {rest.map((row) => (
                          <SessionRow key={row.id} row={row} current={row.token === currentToken} />
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
                {sessionTotal <= 1 ? <NoOtherDevices /> : null}
              </>
            )}
            {sessionTotal > sessions.length ? (
              <p className="text-sm tabular-nums text-muted-foreground">
                Showing the {sessions.length} most recently active of {sessionTotal} sessions.
              </p>
            ) : null}
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="font-heading text-sm font-semibold tracking-tight text-destructive">
                Sign out other devices
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Keeps this browser signed in. Everything else will need to sign in again.
              </p>
              <div className="mt-3">
                <RevokeOthersForm />
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
