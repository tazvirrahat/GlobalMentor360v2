import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmail, notify, findUnique } = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_input?: unknown) => undefined),
  notify: vi.fn(async () => undefined),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/notifications", () => ({ notify }));
vi.mock("@/lib/db", () => ({
  db: { order: { findUnique } },
}));

const { sendPaymentReceipt } = await import("./receipts");

const order = {
  id: "ord_bkash_1",
  total: 500000,
  currency: "BDT",
  user: { id: "user-1", email: "sam@example.test", name: "Sam Learner" },
  items: [{ course: { title: "TypeScript Foundations", slug: "typescript-foundations" } }],
  payments: [{ bkashTransactionId: "TXN9EA7257A", method: "BKASH" }],
};

beforeEach(() => {
  sendEmail.mockReset();
  notify.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(order);
  sendEmail.mockResolvedValue(undefined);
  notify.mockResolvedValue(undefined);
});

describe("sendPaymentReceipt", () => {
  it("mails a receipt that names the course, amount, and bKash transaction id", async () => {
    await sendPaymentReceipt("ord_bkash_1");

    expect(sendEmail).toHaveBeenCalledOnce();
    const payload = sendEmail.mock.calls[0]?.[0] as unknown as {
      to: string;
      subject: string;
      text: string;
      actionUrl: string;
      actionLabel: string;
    };

    expect(payload.to).toBe("sam@example.test");
    expect(payload.subject).toBe("Receipt for TypeScript Foundations");
    expect(payload.text).toContain("Sam Learner");
    expect(payload.text).toContain("TypeScript Foundations");
    expect(payload.text).toMatch(/5,?000/);
    expect(payload.text).toContain("TXN9EA7257A");
    expect(payload.actionUrl).toMatch(/\/orders\/ord_bkash_1$/);
    expect(payload.actionLabel).toBe("View receipt");
  });

  it("records an in-app payment notification for the buyer, not anyone else", async () => {
    await sendPaymentReceipt("ord_bkash_1");

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith("user-1", "payment", {
      title: "Payment confirmed",
      body: "TypeScript Foundations",
      href: "/orders/ord_bkash_1",
    });
  });

  it("swallows a send failure so the caller cannot roll back enrollment", async () => {
    sendEmail.mockRejectedValueOnce(new Error("SES timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendPaymentReceipt("ord_bkash_1")).resolves.toBeUndefined();

    expect(notify).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalled();
  });

  it("is a no-op when the order is gone", async () => {
    findUnique.mockResolvedValueOnce(null);
    await sendPaymentReceipt("missing");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
