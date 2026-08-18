import { beforeEach, describe, expect, it, vi } from "vitest";

const SERIAL = /^GM360-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;

const { findUnique, create, progressFindUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  progressFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    certificate: { findUnique, create },
    courseProgress: { findUnique: progressFindUnique },
  },
}));

const { issueCertificate, issueCertificateIfComplete, getCertificateBySerial } =
  await import("./certificates");

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  progressFindUnique.mockReset();
});

describe("issueCertificate", () => {
  it("returns the existing certificate instead of minting a second one", async () => {
    const existing = { id: "cert-1", userId: "u1", courseId: "c1", serial: "GM360-AAAA-BBBB-CCCC-DDDD" };
    findUnique.mockResolvedValueOnce(existing);

    expect(await issueCertificate("u1", "c1")).toBe(existing);
    expect(create).not.toHaveBeenCalled();
  });

  it("mints a GM360-XXXX-XXXX-XXXX-XXXX serial", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockImplementation(async ({ data }: { data: { serial: string } }) => ({
      id: "cert-new",
      ...data,
    }));

    const issued = await issueCertificate("u1", "c1");
    expect(issued.serial).toMatch(SERIAL);
  });

  it("returns the winner when a concurrent create hits the (userId, courseId) unique constraint", async () => {
    const raced = { id: "cert-raced", serial: "GM360-1111-2222-3333-4444" };
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);
    create.mockRejectedValueOnce(new Error("Unique constraint failed"));

    expect(await issueCertificate("u1", "c1")).toBe(raced);
  });
});

describe("issueCertificateIfComplete", () => {
  it("does not issue below 100%", async () => {
    progressFindUnique.mockResolvedValueOnce({ percent: 99.9, completedAt: new Date() });
    expect(await issueCertificateIfComplete("u1", "c1")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not issue at 100% when completedAt is still null", async () => {
    progressFindUnique.mockResolvedValueOnce({ percent: 100, completedAt: null });
    expect(await issueCertificateIfComplete("u1", "c1")).toBeNull();
  });

  it("issues once progress is 100% with a completion date", async () => {
    progressFindUnique.mockResolvedValueOnce({ percent: 100, completedAt: new Date() });
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({
      id: "cert-1",
      serial: "GM360-AAAA-BBBB-CCCC-DDDD",
    });

    const issued = await issueCertificateIfComplete("u1", "c1");
    expect(issued?.serial).toMatch(SERIAL);
  });
});

describe("getCertificateBySerial", () => {
  it("looks up by the public serial", async () => {
    findUnique.mockResolvedValueOnce({
      serial: "GM360-AAAA-BBBB-CCCC-DDDD",
      issuedAt: new Date(),
      user: { name: "Sam" },
      course: { title: "TypeScript Foundations", slug: "ts" },
    });

    const found = await getCertificateBySerial("GM360-AAAA-BBBB-CCCC-DDDD");
    expect(findUnique).toHaveBeenCalledWith({
      where: { serial: "GM360-AAAA-BBBB-CCCC-DDDD" },
      select: expect.any(Object),
    });
    expect(found?.user.name).toBe("Sam");
  });
});
