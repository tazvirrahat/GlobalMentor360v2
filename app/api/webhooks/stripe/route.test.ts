import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirm } = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock("@/lib/payments", () => ({
  stripeRail: { confirm },
}));

const { POST } = await import("./route");

function request() {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=test" },
  });
}

describe("POST /api/webhooks/stripe ACK matrix", () => {
  beforeEach(() => {
    confirm.mockReset();
  });

  it("returns 401 when the signature does not verify", async () => {
    confirm.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("ACKs 200 when fulfill granted (or the charge was already COMPLETED)", async () => {
    confirm.mockResolvedValueOnce({ paid: true, providerRef: "cs_paid" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, paid: true });
  });

  it("ACKs 200 when fulfill skipped a terminal REFUNDED row", async () => {
    confirm.mockResolvedValueOnce({ paid: false, providerRef: "cs_refunded" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, paid: false });
  });

  it("returns non-2xx when fulfill skipped a missing or mismatched row so Stripe retries", async () => {
    confirm.mockResolvedValueOnce({ paid: false, providerRef: "cs_mismatch", retry: true });
    const response = await POST(request());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(600);
    expect(response.status).not.toBe(401);
  });
});
