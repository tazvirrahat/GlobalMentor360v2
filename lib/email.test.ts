import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailReadinessWarning, sendEmail } from "./email";

// A single backslash and a raw newline, built at runtime so no layer of shell or
// editor escaping can quietly turn a hostile case into a benign one.
const NL = String.fromCharCode(10);

const { sentCommands } = vi.hoisted(() => ({ sentCommands: [] as unknown[] }));

// Intercepts the transport so the rendered message can be inspected without a
// network call or real credentials.
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    async send(command: { input: unknown }) {
      sentCommands.push(command.input);
      return {};
    }
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));

type CapturedEmail = {
  Content?: {
    Simple?: {
      Body?: { Html?: { Data?: string }; Text?: { Data?: string } };
    };
  };
};

function lastEmail(): { html: string; text: string } {
  const input = sentCommands.at(-1) as CapturedEmail | undefined;
  const body = input?.Content?.Simple?.Body;
  if (typeof body?.Html?.Data !== "string" || typeof body?.Text?.Data !== "string") {
    throw new Error("No email reached the transport.");
  }
  return { html: body.Html.Data, text: body.Text.Data };
}

function configureSes() {
  vi.stubEnv("EMAIL_FROM", "no-reply@globalmentor360.test");
  vi.stubEnv("AWS_REGION", "eu-west-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
}

function unconfigureSes() {
  vi.stubEnv("EMAIL_FROM", undefined);
  vi.stubEnv("AWS_REGION", undefined);
  vi.stubEnv("AWS_ACCESS_KEY_ID", undefined);
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sentCommands.length = 0;
});

describe("sendEmail HTML rendering", () => {
  beforeEach(configureSes);

  it("escapes markup in the text body", async () => {
    // lib/auth.ts interpolates user.name into this string, and user.name is
    // whatever was typed into the registration form.
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: `Hi <img src=x onerror="alert(1)">,${NL}${NL}Confirm this address.`,
    });

    const { html } = lastEmail();
    // The words survive as inert text; the tag and the quoted handler do not.
    expect(html).not.toContain("<img");
    expect(html).not.toContain(`onerror="alert(1)"`);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes a body that tries to close the surrounding paragraph", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: `Hi </p><script>fetch("//evil.example")</script><p>`,
    });

    const { html } = lastEmail();
    expect(html).not.toContain("<script");
    expect(html).not.toContain("</p><");
  });

  it("keeps newlines intact so white-space:pre-line still breaks paragraphs", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: `Line one${NL}${NL}Line two`,
    });

    expect(lastEmail().html).toContain(`Line one${NL}${NL}Line two`);
  });

  it("escapes the action label", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: "Confirm this address.",
      actionUrl: "https://app.example.com/verify",
      actionLabel: `<span onclick="alert(1)">Verify</span>`,
    });

    const { html } = lastEmail();
    expect(html).not.toContain("<span onclick");
    expect(html).toContain("&lt;span onclick=&quot;alert(1)&quot;&gt;");
  });

  it("escapes ampersands so a query string cannot truncate the href", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: "Confirm this address.",
      actionUrl: "https://app.example.com/verify?token=abc&callback=/dashboard",
    });

    expect(lastEmail().html).toContain(
      `href="https://app.example.com/verify?token=abc&amp;callback=/dashboard"`,
    );
  });

  it("neutralises a URL carrying markup in its path", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: "Confirm this address.",
      actionUrl: `https://app.example.com/verify"><script>alert(1)</script>`,
    });

    const { html } = lastEmail();
    expect(html).not.toContain("<script");
    // The quote never reaches the attribute: URL parsing percent-encodes it.
    expect(html).toContain(`href="https://app.example.com/verify%22%3E%3Cscript%3E`);
  });

  it("puts the validated URL in the plain-text body too", async () => {
    await sendEmail({
      to: "learner@example.com",
      subject: "Verify your email",
      text: "Confirm this address.",
      actionUrl: "https://app.example.com/verify?token=abc",
    });

    expect(lastEmail().text).toContain("https://app.example.com/verify?token=abc");
  });
});

describe("sendEmail actionUrl validation", () => {
  beforeEach(configureSes);

  it.each([
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    // Browsers strip tabs and newlines before dispatching an href, so a prefix
    // check on the raw string would pass this and it would still execute.
    ["javascript scheme split by a newline", `java${NL}script:alert(1)`],
    ["file scheme", "file:///etc/passwd"],
    ["relative path", "/verify?token=abc"],
    ["protocol-relative", "//evil.example/verify"],
    ["not a URL at all", "verify me"],
  ])("refuses %s", async (_label, actionUrl) => {
    await expect(
      sendEmail({
        to: "learner@example.com",
        subject: "Verify your email",
        text: "Confirm this address.",
        actionUrl,
      }),
    ).rejects.toThrow(/actionUrl/);

    expect(sentCommands).toHaveLength(0);
  });

  it.each([["https://app.example.com/verify"], ["http://localhost:3000/verify?token=abc"]])(
    "accepts %s",
    async (actionUrl) => {
      await sendEmail({
        to: "learner@example.com",
        subject: "Verify your email",
        text: "Confirm this address.",
        actionUrl,
      });

      expect(sentCommands).toHaveLength(1);
    },
  );
});

describe("sendEmail transport fallback", () => {
  beforeEach(unconfigureSes);

  it.each([["development"], ["test"]] as const)(
    "logs to the console and resolves in %s",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      await expect(
        sendEmail({
          to: "learner@example.com",
          subject: "Verify your email",
          text: "Confirm this address.",
          actionUrl: "https://app.example.com/verify?token=abc",
        }),
      ).resolves.toBeUndefined();

      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0]?.[0]).toContain("https://app.example.com/verify?token=abc");
      expect(sentCommands).toHaveLength(0);
    },
  );

  it("throws in production rather than swallowing the mail", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      sendEmail({
        to: "learner@example.com",
        subject: "Verify your email",
        text: "Confirm this address.",
      }),
      // requireEmailVerification means a dropped verification email is an
      // account nobody can ever sign in to.
    ).rejects.toThrow(/not configured/);

    expect(log).not.toHaveBeenCalled();
    expect(sentCommands).toHaveLength(0);
  });

  it("names every missing variable so the deploy is fixable from the log", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AWS_REGION", "eu-west-1");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key-id");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");

    await expect(
      sendEmail({ to: "learner@example.com", subject: "Verify", text: "Confirm." }),
    ).rejects.toThrow(/missing EMAIL_FROM\b/);
  });

  it("sends normally in production once SES is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    configureSes();

    await sendEmail({ to: "learner@example.com", subject: "Verify", text: "Confirm." });

    expect(sentCommands).toHaveLength(1);
  });
});

describe("emailReadinessWarning", () => {
  it("warns at production startup when SES is unconfigured — the sign-up dead end", () => {
    unconfigureSes();
    vi.stubEnv("NODE_ENV", "production");

    const warning = emailReadinessWarning();
    expect(warning).toMatch(/never verify or sign in/);
    expect(warning).toMatch(/EMAIL_FROM/);
  });

  it("stays quiet in development, where the console fallback is fine", () => {
    unconfigureSes();
    vi.stubEnv("NODE_ENV", "development");
    expect(emailReadinessWarning()).toBeNull();
  });

  it("stays quiet in production once SES env is present", () => {
    configureSes();
    vi.stubEnv("NODE_ENV", "production");
    expect(emailReadinessWarning()).toBeNull();
  });
});
