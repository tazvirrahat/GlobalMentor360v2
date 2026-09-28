import { cache } from "react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSite } from "@/lib/site";
import { isTimeZone } from "@/lib/time-zones";

/**
 * The time zone dates are shown in for whoever is looking: their own choice
 * from the account page, else the site's. Cached for the request, so every
 * date on a page asks the database once.
 */
export const getViewerTimeZone = cache(async (): Promise<string> => {
  const session = await getSession();
  if (session?.user) {
    const row = await db.user.findUnique({ where: { id: session.user.id }, select: { timezone: true } });
    if (row?.timezone && isTimeZone(row.timezone)) return row.timezone;
  }
  return getSite().timeZone;
});
