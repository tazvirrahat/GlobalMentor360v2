import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * The one place the app sends email. Auth (verification, password reset) calls
 * this; later features (receipts, announcements) should too.
 *
 * Transport: AWS SES when configured, because the AWS account already exists
 * for video. When SES is not configured (local dev), the email is printed to
 * the server console instead — the flows stay fully testable without an inbox.
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

function sesConfigured(): boolean {
  return Boolean(
    process.env.EMAIL_FROM &&
      process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  );
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

function renderHtml(input: EmailInput): string {
  const button = input.actionUrl
    ? `<p style="margin:28px 0">
         <a href="${input.actionUrl}"
            style="background:#880020;color:#ffffff;text-decoration:none;
                   padding:12px 28px;border-radius:12px;font-weight:600;display:inline-block">
           ${input.actionLabel ?? "Open"}
         </a>
       </p>
       <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:<br>
         <span style="word-break:break-all">${input.actionUrl}</span>
       </p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:32px 20px">
      <p style="font-weight:800;font-size:18px;color:#111827">
        GlobalMentor<span style="color:#880020">360</span>
      </p>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px">
        <p style="color:#111827;font-size:15px;line-height:1.6;white-space:pre-line">${input.text}</p>
        ${button}
      </div>
      <p style="color:#9ca3af;font-size:12px;margin-top:16px">
        You received this because of activity on your GlobalMentor360 account.
      </p>
    </div>
  </body>
</html>`;
}

export async function sendEmail(input: EmailInput): Promise<void> {
  if (!sesConfigured()) {
    // Dev fallback: the flow must be walkable without an email provider.
    console.log(
      [
        "",
        "================ EMAIL (dev fallback — SES not configured) ================",
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        input.text,
        input.actionUrl ? `Link:    ${input.actionUrl}` : "",
        "===========================================================================",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return;
  }

  const textBody = input.actionUrl ? `${input.text}\n\n${input.actionUrl}` : input.text;

  await getClient().send(
    new SendEmailCommand({
      FromEmailAddress: process.env.EMAIL_FROM,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: textBody, Charset: "UTF-8" },
            Html: { Data: renderHtml(input), Charset: "UTF-8" },
          },
        },
      },
    }),
  );
}
