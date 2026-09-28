import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { getSite } from "@/lib/site";

/**
 * The one place the app sends email. Auth (verification, password reset) calls
 * this; later features (receipts, announcements) should too.
 *
 * Transport: AWS SES when configured, because the AWS account already exists
 * for video. When SES is not configured the email is printed to the server
 * console instead — the flows stay fully testable without an inbox — but that
 * fallback is refused in production, see sendEmail.
 *
 * Callers pass plain text, never markup: everything interpolated into the HTML
 * body is escaped here. The bodies in lib/auth.ts contain `user.name`, which is
 * whatever a stranger typed into the registration form.
 */

type EmailInput = {
  to: string;
  subject: string;
  /** Short plain-text body. */
  text: string;
  /** Optional call-to-action link, rendered as a button in the HTML version. */
  actionUrl?: string;
  actionLabel?: string;
};

let client: SESv2Client | null = null;

const SES_ENV_VARS = [
  "EMAIL_FROM",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

function missingSesEnv(): string[] {
  return SES_ENV_VARS.filter((name) => !process.env[name]);
}

function sesConfigured(): boolean {
  return missingSesEnv().length === 0;
}

/**
 * What a production deploy should be told at startup, or null when email can
 * work. requireEmailVerification (lib/auth.ts) means a deploy without a mail
 * transport lets people register into accounts that can never sign in — the
 * first sign of that must be a line in the boot log, not a support ticket.
 * instrumentation.ts logs this once per server start.
 *
 * A configured EMAIL_FROM can still be inside the SES sandbox (verified
 * recipients only) — that state is invisible from env vars, so the reminder
 * rides along here rather than pretending we can detect it.
 */
export function emailReadinessWarning(): string | null {
  if (process.env.NODE_ENV !== "production") return null;

  if (!sesConfigured()) {
    return (
      `Email transport is NOT configured (missing ${missingSesEnv().join(", ")}). ` +
      "Sign-up requires email verification and sendEmail refuses the console fallback in " +
      "production, so new accounts will be able to register but never verify or sign in. " +
      "Configure SES (out of sandbox) or another transport before taking real sign-ups."
    );
  }

  return null;
}

function getClient(): SESv2Client {
  client ??= new SESv2Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    },
  });
  return client;
}

/**
 * Escapes for HTML text and for double-quoted attribute values alike, so one
 * function covers every interpolation site below and no caller has to pick.
 *
 * `&` must go first, otherwise it re-escapes the ampersands this adds. Quotes
 * are included because an unescaped `"` inside href="…" closes the attribute
 * and lets the rest of the value become new attributes.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * An href is executable surface, not text: `javascript:` and `data:` URLs run
 * where a mail client or webmail preview follows them, and escaping alone does
 * nothing about that. Only http(s) survives, and it survives in the parser's
 * normalised form — the raw string can carry tabs and newlines that a browser
 * strips before dispatch, so `java\nscript:` would otherwise pass a naive prefix
 * check and still execute.
 *
 * Throws rather than dropping the link: every caller's email exists to deliver
 * that link, and a CTA-less verification mail is the silent failure this module
 * refuses to ship (see sendEmail).
 */
function requireHttpUrl(candidate: string): string {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Email actionUrl is not an absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Email actionUrl must be http(s), got "${parsed.protocol}".`);
  }

  return parsed.href;
}

function renderHtml(input: EmailInput, actionUrl: string | null): string {
  const site = getSite();
  const button = actionUrl
    ? `<p style="margin:28px 0">
         <a href="${escapeHtml(actionUrl)}"
            style="background:#1d2242;color:#ffffff;text-decoration:none;
                   padding:12px 28px;border-radius:6px;font-weight:600;display:inline-block">
           ${escapeHtml(input.actionLabel ?? "Open")}
         </a>
       </p>
       <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:<br>
         <span style="word-break:break-all">${escapeHtml(actionUrl)}</span>
       </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px">
      <p style="font-weight:700;font-size:18px;color:#1d2242">${escapeHtml(site.name)}</p>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">
        <p style="color:#111827;font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(input.text)}</p>
        ${button}
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">
        You received this because of activity on your ${escapeHtml(site.name)} account.
      </p>
    </div>
  </body>
</html>`;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  // Validated before the transport branches, so a bad link fails the same way in
  // dev as in production rather than only surfacing once SES is wired up.
  const actionUrl = input.actionUrl ? requireHttpUrl(input.actionUrl) : null;

  if (!sesConfigured()) {
    if (process.env.NODE_ENV === "production") {
      // lib/auth.ts sets requireEmailVerification, so no session is issued until
      // the address is confirmed. Swallowing the mail here would let people
      // register into an account they can never sign in to, with nothing in the
      // logs distinguishing it from a working deploy. Refuse instead.
      throw new Error(
        `Email transport is not configured (missing ${missingSesEnv().join(", ")}). ` +
          "The console fallback is development-only — sign-in depends on verification mail.",
      );
    }

    // Dev fallback: the flow must be walkable without an email provider.
    console.log(
      [
        "",
        "================ EMAIL (dev fallback — SES not configured) ================",
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        input.text,
        actionUrl ? `Link:    ${actionUrl}` : "",
        "===========================================================================",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const textBody = actionUrl ? `${input.text}\n\n${actionUrl}` : input.text;

  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: textBody, Charset: "UTF-8" },
            Html: { Data: renderHtml(input, actionUrl), Charset: "UTF-8" },
          },
        },
      },
    }),
  );
}
