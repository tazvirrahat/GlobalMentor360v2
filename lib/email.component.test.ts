import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";

const { sentCommands } = vi.hoisted(() => ({ sentCommands: [] as unknown[] }));

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

function configureSesExceptFrom(from: string | undefined) {
  vi.stubEnv("EMAIL_FROM", from);
  vi.stubEnv("AWS_REGION", "eu-west-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sentCommands.length = 0;
});

describe("SES path selection", () => {
  it("uses the console fallback when EMAIL_FROM is empty even if AWS keys are set", async () => {
    configureSesExceptFrom("");
    vi.stubEnv("NODE_ENV", "test");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendEmail({
      to: "learner@example.test",
      subject: "Verify",
      text: "Confirm.",
    });

    expect(sentCommands).toHaveLength(0);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain("dev fallback");
  });

  it("refuses that empty-FROM fallback in production", async () => {
    configureSesExceptFrom("");
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      sendEmail({ to: "learner@example.test", subject: "Verify", text: "Confirm." }),
    ).rejects.toThrow(/missing EMAIL_FROM\b/);

    expect(log).not.toHaveBeenCalled();
    expect(sentCommands).toHaveLength(0);
  });

  it("selects SES only when EMAIL_FROM and the AWS keys are all present", async () => {
    configureSesExceptFrom("no-reply@globalmentor360.test");
    vi.stubEnv("NODE_ENV", "production");

    await sendEmail({ to: "learner@example.test", subject: "Verify", text: "Confirm." });

    expect(sentCommands).toHaveLength(1);
  });
});
