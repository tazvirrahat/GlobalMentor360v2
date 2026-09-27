import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ConfirmSubmit } from "@/components/site/confirm-submit";
import { SignOutButton } from "@/components/site/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateMedium, formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { describeUserAgent } from "@/lib/user-agent";
import { getSite } from "@/lib/site";
import { allTimeZones, COMMON_TIME_ZONES, isTimeZone, timeZoneLabel } from "@/lib/time-zones";
import { ChangeEmailForm, ChangeNameForm, ChangePasswordForm, PreferencesForm, RevokeOthersForm } from "./account-forms";
import { revokeSessionAction } from "./actions";
import { getViewerTimeZone } from "@/lib/viewer-time";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const SESSION_FETCH_CAP = 50;
const SESSION_PREVIEW = 5;

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "email", label: "Email" },
  { id: "password", label: "Password" },
  { id: "devices", label: "Devices" },
  { id: "preferences", label: "Preferences" },
] as const;

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: (typeof SECTIONS)[number]["id"];
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-rule bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-xl font-semibold">
          {title}
        </h2>
        {lede ? <p className="text-sm text-graphite">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

type DeviceRowData = { id: string; token: string; ipAddress: string | null; userAgent: string | null; updatedAt: Date };

function DeviceRow({ row, current, timeZone }: { row: DeviceRowData; current: boolean; timeZone: string }) {
  const device = describeUserAgent(row.userAgent);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
          {current ? "This device" : device}
          {current ? <Badge variant="outline">Current</Badge> : null}
        </p>
        <p className="flex flex-wrap gap-x-3 text-sm text-graphite">
          {current && device !== "Unknown device" ? <span>{device}</span> : null}
          <span className="break-all">{row.ipAddress ?? "IP address unknown"}</span>
          <span>
            Last active <time dateTime={row.updatedAt.toISOString()}>{formatDateTime(row.updatedAt, timeZone)}</time>
          </span>
        </p>
      </div>
      {current ? (
        <SignOutButton variant="ghost" />
      ) : (
        <form action={revokeSessionAction}>
          <input type="hidden" name="token" value={row.token} />
          <ConfirmSubmit label="Sign out" question="Sign out this device?" confirmLabel="Sign out device" />
        </form>
      )}
    </li>
  );
}

/**
 * Account (spec §6): profile, email, password and signed-in devices, each
 * saving on its own with an inline confirmation. Links to My learning and
 * Orders live in the account menu, not here.
 */
export default async function AccountPage() {
  const user = await requireUser("/account");
  const timeZone = await getViewerTimeZone();
  const session = await auth.api.getSession({ headers: await headers() });
  const currentToken = session?.session.token;

  const sessionWhere = { userId: user.id, expiresAt: { gt: new Date() } };
  const [sessions, sessionTotal, profile] = await Promise.all([
    db.session.findMany({
      where: sessionWhere,
      orderBy: { updatedAt: "desc" },
      take: SESSION_FETCH_CAP,
      select: { id: true, token: true, ipAddress: true, userAgent: true, updatedAt: true },
    }),
    db.session.count({ where: sessionWhere }),
    db.user.findUnique({
      where: { id: user.id },
      select: {
        createdAt: true,
        timezone: true,
        notifyAnnouncements: true,
        emailAnnouncements: true,
        notifyQaReplies: true,
        notifyReviewReplies: true,
      },
    }),
  ]);

  const currentRow = sessions.find((row) => row.token === currentToken);
  const ordered = currentRow ? [currentRow, ...sessions.filter((row) => row.id !== currentRow.id)] : sessions;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Account</h1>
        <p className="text-lg text-graphite">
          {user.email}
          {profile ? (
            <>
              {", member since "}
              <time dateTime={profile.createdAt.toISOString()}>{formatDateMedium(profile.createdAt, timeZone)}</time>
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Account sections" className="md:sticky md:top-24 md:self-start">
          <ul className="flex flex-wrap gap-1 md:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-graphite hover:bg-wash hover:text-ink focus-ring"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Section id="profile" title="Profile">
            <ChangeNameForm currentName={user.name} />
          </Section>

          <Section id="email" title="Email" lede="We send a link to confirm the change before it takes effect.">
            <ChangeEmailForm currentEmail={user.email} />
          </Section>

          <Section id="password" title="Password" lede="Changing it signs you out on your other devices.">
            <ChangePasswordForm />
          </Section>

          <Section
            id="devices"
            title="Devices"
            lede={
              sessionTotal === 1
                ? "You are signed in on this device only."
                : `You are signed in on ${sessionTotal} devices.`
            }
          >
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {ordered.slice(0, SESSION_PREVIEW).map((row) => (
                <DeviceRow key={row.id} row={row} current={row.token === currentToken} timeZone={timeZone} />
              ))}
            </ul>
            {ordered.length > SESSION_PREVIEW ? (
              <details className="group">
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-sm text-sm font-medium text-ink underline decoration-control underline-offset-4 hover:decoration-ink focus-ring [&::-webkit-details-marker]:hidden">
                  Show all {ordered.length} devices
                </summary>
                <ul className="mt-2 flex flex-col divide-y divide-rule border-y border-rule">
                  {ordered.slice(SESSION_PREVIEW).map((row) => (
                    <DeviceRow key={row.id} row={row} current={false} timeZone={timeZone} />
                  ))}
                </ul>
              </details>
            ) : null}
            {sessionTotal > sessions.length ? (
              <p className="text-sm text-graphite">
                Showing the {sessions.length} most recently active of {sessionTotal} devices.
              </p>
            ) : null}
            {sessionTotal > 1 ? <RevokeOthersForm /> : null}
          </Section>

          {profile ? (
            <Section id="preferences" title="Preferences">
              <PreferencesForm
                preferences={{
                  timezone: profile.timezone && isTimeZone(profile.timezone) ? profile.timezone : null,
                  notifyAnnouncements: profile.notifyAnnouncements,
                  emailAnnouncements: profile.emailAnnouncements,
                  notifyQaReplies: profile.notifyQaReplies,
                  notifyReviewReplies: profile.notifyReviewReplies,
                }}
                siteZoneLabel={timeZoneLabel(getSite().timeZone)}
                common={COMMON_TIME_ZONES.map((zone) => ({ value: zone, label: timeZoneLabel(zone) }))}
                all={allTimeZones().map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))}
              />
            </Section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
