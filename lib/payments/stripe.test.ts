import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockConstructEvent, findFirst, orderUpdate, tx, grantEnrollment } = vi.hoisted(
  () => {
    const tx = {
      $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
      $executeRaw: vi.fn(async () => 1),
      payment: {
        findFirst: vi.fn(async () => null as { id: string } | null),
        findUnique: vi.fn(),
        create: vi.fn(async () => ({ id: "pay_1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      order: {
        create: vi.fn(async () => ({ id: "ord_1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    return {
      mockCreate: vi.fn(),
      mockConstructEvent: vi.fn(),
      findFirst: vi.fn(),
      orderUpdate: vi.fn(async () => ({})),
      grantEnrollment: vi.fn(async () => undefined),
      tx,
    };
  },
);

vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: mockCreate } };
    webhooks = { constructEvent: mockConstructEvent };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    course: { findFirst },
    order: { update: orderUpdate },
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  },
}));

vi.mock("@/lib/enrollment", () => ({ grantEnrollment }));

const { stripeRail } = await import("./stripe");
const { InFlightPaymentError } = await import("./in-flight");

describe("stripeRail.createSession", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    findFirst.mockReset();
    orderUpdate.mockReset();
    mockCreate.mockReset();
    tx.$queryRaw.mockClear();
    tx.$executeRaw.mockClear();
    tx.payment.findFirst.mockReset();
    tx.payment.findFirst.mockResolvedValue(null);
    tx.payment.create.mockClear();
    tx.order.create.mockClear();
    mockCreate.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test/cs_test" });
    findFirst.mockResolvedValue({
      title: "Published Course",
      prices: [{ amount: 4900 }],
    });
  });

  it("charges the active published USD price and ignores the caller amount", async () => {
    await stripeRail.createSession({
      userId: "user-1",
      courseId: "course-1",
      amount: 1,
      returnUrl: "http://localhost:3000/courses/x/checkout",
    });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "course-1", status: "PUBLISHED" },
      }),
    );
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ total: 4900, subtotal: 4900 }),
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 4900, currency: "usd" }),
          }),
        ],
      }),
    );
  });

  it("refuses a course that is not published", async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(
      stripeRail.createSession({
        userId: "user-1",
        courseId: "draft-1",
        amount: 4900,
        returnUrl: "http://localhost:3000/checkout",
      }),
    ).rejects.toThrow(/not available for card checkout/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses when there is no active USD price", async () => {
    findFirst.mockResolvedValueOnce({ title: "No USD", prices: [] });
    await expect(
      stripeRail.createSession({
        userId: "user-1",
        courseId: "course-1",
        amount: 4900,
        returnUrl: "http://localhost:3000/checkout",
      }),
    ).rejects.toThrow(/no active USD price/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("refuses when the learner already has an in-flight payment for the course", async () => {
    tx.payment.findFirst.mockResolvedValueOnce({ id: "pay_pending" });
    await expect(
      stripeRail.createSession({
        userId: "user-1",
        courseId: "course-1",
        amount: 4900,
        returnUrl: "http://localhost:3000/checkout",
      }),
    ).rejects.toBeInstanceOf(InFlightPaymentError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

const META = { orderId: "ord_1", paymentId: "pay_1", courseId: "course-1", userId: "user-1" };

function paidSessionEvent(overrides: {
  amountTotal?: number | null;
  paymentStatus?: string;
  paymentIntent?: string | null;
  metadata?: Record<string, string> | null;
} = {}) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        payment_status: overrides.paymentStatus ?? "paid",
        payment_intent: overrides.paymentIntent === undefined ? "pi_1" : overrides.paymentIntent,
        amount_total: overrides.amountTotal === undefined ? 4900 : overrides.amountTotal,
        metadata: overrides.metadata === undefined ? META : overrides.metadata,
      },
    },
  };
}

function pendingPayment(overrides: { amount?: number; status?: string } = {}) {
  return {
    amount: overrides.amount ?? 4900,
    status: overrides.status ?? "PENDING",
    order: { items: [{ courseId: "course-1" }] },
  };
}

describe("stripeRail.confirm fulfill ACK", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit");
    mockConstructEvent.mockReset();
    grantEnrollment.mockReset();
    tx.payment.findUnique.mockReset();
    tx.payment.updateMany.mockReset();
    tx.order.updateMany.mockReset();
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    mockConstructEvent.mockReturnValue(paidSessionEvent());
    tx.payment.findUnique.mockResolvedValue(pendingPayment());
  });

  it("returns paid:true without retry after a successful fulfill", async () => {
    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });
    expect(result).toEqual({ paid: true, providerRef: "cs_1" });
    expect(grantEnrollment).toHaveBeenCalledWith("user-1", "course-1", "PURCHASE", tx);
  });

  it("ACKs an already-COMPLETED duplicate as paid without granting again", async () => {
    tx.payment.findUnique
      .mockResolvedValueOnce(pendingPayment({ status: "COMPLETED" }))
      .mockResolvedValueOnce({ status: "COMPLETED" });
    tx.payment.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });

    expect(result).toEqual({ paid: true, providerRef: "cs_1" });
    expect(grantEnrollment).not.toHaveBeenCalled();
  });

  it("ACKs a REFUNDED replay without paid:true so Stripe does not retry forever", async () => {
    tx.payment.findUnique
      .mockResolvedValueOnce(pendingPayment({ status: "REFUNDED" }))
      .mockResolvedValueOnce({ status: "REFUNDED" });
    tx.payment.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });

    expect(result).toEqual({ paid: false, providerRef: "cs_1" });
    expect(grantEnrollment).not.toHaveBeenCalled();
  });

  it("does not ACK an amount mismatch — paid is false and retry is set", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mockConstructEvent.mockReturnValue(paidSessionEvent({ amountTotal: 99 }));

    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });

    log.mockRestore();
    expect(result).toEqual({ paid: false, providerRef: "cs_1", retry: true });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(grantEnrollment).not.toHaveBeenCalled();
  });

  it("does not ACK a missing payment row — paid is false and retry is set", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    tx.payment.findUnique.mockResolvedValueOnce(null);

    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });

    log.mockRestore();
    expect(result).toEqual({ paid: false, providerRef: "cs_1", retry: true });
    expect(grantEnrollment).not.toHaveBeenCalled();
  });

  it("ACKs an unpaid completed session without fulfilling", async () => {
    mockConstructEvent.mockReturnValue(paidSessionEvent({ paymentStatus: "unpaid" }));

    const result = await stripeRail.confirm({ rawBody: "{}", headers: { "stripe-signature": "sig" } });

    expect(result).toEqual({ paid: false, providerRef: "cs_1" });
    expect(tx.payment.findUnique).not.toHaveBeenCalled();
  });
});

