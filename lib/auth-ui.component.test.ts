import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("auth forms do not GET credentials into the URL", () => {
  it.each([
    "app/sign-in/sign-in-form.tsx",
    "app/sign-up/sign-up-form.tsx",
    "app/forgot-password/forgot-password-form.tsx",
    "app/reset-password/reset-form.tsx",
  ])("%s posts instead of the HTML GET default", (rel) => {
    const source = read(rel);
    expect(source).toMatch(/<form[^>]*method="post"/);
    expect(source).not.toMatch(/<form onSubmit=/);
  });
});

describe("email delivery copy vs SES sandbox", () => {
  it("does not promise inbox delivery without the sandbox caveat", () => {
    const note = read("components/auth/email-delivery-note.tsx");
    expect(note).toMatch(/SES sandbox cannot mail arbitrary addresses/);
    expect(note).toMatch(/contact the academy/);
    expect(note).toMatch(/check spam/);
  });

  it("is mounted on sign-up, unverified sign-in, and forgot-password", () => {
    expect(read("app/sign-up/sign-up-form.tsx")).toContain("EmailDeliveryNote");
    expect(read("app/sign-in/sign-in-form.tsx")).toContain("EmailDeliveryNote");
    expect(read("app/forgot-password/forgot-password-form.tsx")).toContain("EmailDeliveryNote");
  });
});
