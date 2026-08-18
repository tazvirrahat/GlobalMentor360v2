import { chromium } from "@playwright/test";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(25000);
const notes = [];

try {
  await page.goto(BASE + "/sign-in?next=" + encodeURIComponent("/courses/sql-for-analysts"), {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill("learner@example.com");
  await page.getByLabel("Password").fill("dev-password-12345");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 25000 });
  notes.push("signed in " + page.url());

  const landing = await page.locator("main").innerText();
  notes.push("landing BDT 3990=" + /3,?990/.test(landing));
  notes.push("landing $39=" + /\$39/.test(landing));

  const add = page.getByRole("button", { name: /add to cart/i });
  if (await add.count()) {
    await add.click();
    await page.waitForURL(/\/cart/, { timeout: 25000 });
  } else {
    await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
  }

  const cart = await page.locator("main").innerText();
  notes.push("cart empty=" + /your cart is empty/i.test(cart));
  notes.push("cart ourNumber=" + /to our bKash number/i.test(cart));
  notes.push("cart shared=" + /shared by the academy/i.test(cart));
  notes.push("cart invented=" + /to our bKash number[\s\S]{0,80}?01\d{9}/i.test(cart));
  notes.push("cart amount=" + /Amount to send/i.test(cart));
  const cartSend = cart.match(/Send .{0,220}/);
  notes.push("cart snippet=" + (cartSend ? cartSend[0] : cart.slice(0, 240)));

  await page.goto(BASE + "/courses/sql-for-analysts/checkout", { waitUntil: "domcontentloaded" });
  const checkout = await page.locator("main").innerText();
  notes.push("checkout ourNumber=" + /to our bKash number/i.test(checkout));
  notes.push("checkout shared=" + /shared by the academy/i.test(checkout));
  notes.push("checkout invented=" + /to our bKash number[\s\S]{0,80}?01\d{9}/i.test(checkout));
  notes.push("checkout pending=" + /awaiting verification/i.test(checkout));
  notes.push("checkout stripe=" + /continue to stripe/i.test(checkout));
  const coSend = checkout.match(/Send .{0,220}|Awaiting verification.{0,180}/i);
  notes.push("checkout snippet=" + (coSend ? coSend[0] : checkout.slice(0, 240)));

  console.log(notes.join("\n"));
} finally {
  await browser.close();
}
