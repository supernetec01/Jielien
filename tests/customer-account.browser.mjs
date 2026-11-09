import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    out = "docs/screenshots/customer-flows";
  await mkdir(out, { recursive: true });
  const password = "Customer-Browser!2026",
    nextPassword = "Customer-New-Browser!2026",
    auth = createAuth(db.pool);
  await auth.ensureAdmin({
    email: "admin@example.test",
    phone: "0987654321",
    password,
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  const pageFor = async () => {
    const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      p = await c.newPage();
    p.setDefaultTimeout(10000);
    p.on("pageerror", (e) => errors.push(e.message));
    return p;
  };
  const page = await pageFor();
  await page.goto(base + "/tai-khoan?mode=register");
  await page.locator("#fullName").fill("Khách mua thử");
  await page.locator("#phone").fill("0912345671");
  await page.locator("#email").fill("buyer@example.test");
  await page.locator("#password").fill(password);
  const signupResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/register") && r.request().method() === "POST",
  );
  await page.locator("#auth-submit").click();
  const signup = await (await signupResponse).json();
  await page.locator("#profile-form").waitFor();
  assert.equal(await page.locator("#verification-form").count(), 0);
  console.log(
    "PASS 1: customer registration creates a session without OTP or a messaging provider",
  );
  await auth.saveAddress(signup.user.id, {
    recipientName: "Người nhận thử",
    phone: "0912345671",
    province: "TP Hồ Chí Minh",
    district: "Phường Mẫu",
    addressDetail: "123 Đường kiểm thử",
    isDefault: true,
  });
  const orderBody = {
    items: [{ id: 1, quantity: 1 }],
    payment: "cod",
    customer: {
      name: "Khách mua thử",
      phone: "0912345671",
      province: "TP Hồ Chí Minh",
      district: "Phường Mẫu",
      address: "123 Đường kiểm thử",
    },
    idempotencyKey: "customer-browser-order-001",
  };
  const ownedResponse = await page.request.post(base + "/api/orders", {
    headers: { "X-CSRF-Token": signup.csrfToken },
    data: orderBody,
  });
  assert.equal(ownedResponse.status(), 201);
  const owned = (await ownedResponse.json()).order;
  const admin = await pageFor();
  await admin.goto(base + "/tai-khoan?redirect=/quan-tri");
  await admin.locator("#identifier").fill("admin@example.test");
  await admin.locator("#password").fill(password);
  await admin.locator("#auth-submit").click();
  await admin.waitForURL("**/quan-tri");
  await admin.locator('[data-section="users"]').click();
  await admin.locator(`[data-customer="${signup.user.id}"]`).click();
  await admin.locator(".customer-profile").waitFor();
  assert.ok(
    (await admin.locator(".customer-profile").innerText()).includes(
      "123 Đường kiểm thử",
    ),
  );
  assert.ok(
    (await admin.locator(".customer-profile").innerText()).includes(owned.id),
  );
  for (const width of [320, 375, 768, 1440, 1920]) {
    await admin.setViewportSize({ width, height: 1000 });
    await admin.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    assert.ok(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `customer ${width}`,
    );
    if (width >= 1440) {
      const heading = await admin.locator('.customer-profile h1').boundingBox();
      const header = await admin.locator('.management-header').boundingBox();
      assert.ok(heading.y >= header.y + header.height, 'customer heading clears sticky header');
    }
    await admin.screenshot({
      path: `${out}/admin-customer-${width}.png`,
      fullPage: true,
    });
  }
  console.log(
    "PASS 2: admin sees customer profile, saved address and account orders; five viewport widths fit",
  );
  await page.goto(base + "/tai-khoan");
  await page.locator("#logout").click();
  await page.locator("#forgot-password").click();
  await page.locator("#recovery-identifier").fill("buyer@example.test");
  await page.locator("#recovery-form button").click();
  await page
    .locator("#recovery-message")
    .filter({ hasText: /email/ })
    .waitFor();
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `${out}/forgot-${width}.png`,
      fullPage: true,
    });
  }
  await app.flushRecoveryOutbox();
  const mail = [...app.testRecoveryMessages.values()].at(-1);
  assert.ok(mail);
  const link = new URL(mail.url);
  await page.goto(base + link.pathname + link.search + link.hash);
  await page.locator("#reset-password").waitFor();
  assert.equal(new URL(page.url()).hash, "");
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `${out}/reset-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator("#reset-password").fill(nextPassword);
  await page.locator("#reset-confirmation").fill(password);
  await page.locator("#recovery-form button").click();
  await page.locator("#recovery-error").filter({ hasText: /khớp/ }).waitFor();
  await page.locator("#reset-confirmation").fill(nextPassword);
  await page.locator("#recovery-form button").click();
  await page.locator("#identifier").waitFor();
  await page.locator("#identifier").fill("buyer@example.test");
  await page.locator("#password").fill(nextPassword);
  await page.locator("#auth-submit").click();
  await page.locator("#profile-form").waitFor();
  console.log(
    "PASS 3: forgot/reset uses the sandbox email link, clears token from URL, validates confirmation and accepts the new password",
  );
  const phone = await pageFor();
  const phoneResponse = await phone.request.post(base + "/api/auth/register", {
    data: {
      fullName: "Khách chỉ số điện thoại",
      phone: "0912345672",
      password,
    },
  });
  assert.equal(phoneResponse.status(), 201);
  const phoneUser = (await phoneResponse.json()).user;
  await admin.locator("#back-to-users").click();
  await admin.locator(`[data-customer="${phoneUser.id}"]`).click();
  await admin.locator("#customer-support-form").waitFor();
  await admin.locator('[name="ownershipConfirmed"]').check();
  await admin.locator("#support-current-password").fill("Wrong-Password!2026");
  await admin.locator("#customer-support-form button").click();
  await admin
    .locator("#customer-support-form .form-error")
    .filter({ hasText: /không chính xác/ })
    .waitFor();
  await admin.locator("#support-current-password").fill(password);
  await admin.locator("#customer-support-form button").click();
  await admin.locator(".customer-recovery-link").waitFor();
  const supportUrl = await admin
    .locator(".customer-recovery-link")
    .inputValue();
  await phone.goto(supportUrl);
  await phone.locator("#reset-password").fill(nextPassword);
  await phone.locator("#reset-confirmation").fill(nextPassword);
  await phone.locator("#recovery-form button").click();
  await phone.locator("#identifier").waitFor();
  await phone.locator("#identifier").fill("0912345672");
  await phone.locator("#password").fill(nextPassword);
  await phone.locator("#auth-submit").click();
  await phone.locator("#profile-form").waitFor();
  console.log(
    "PASS 4: phone-only customer can recover through an admin-issued one-time link after ownership confirmation and admin reauthentication",
  );
  const guest = await pageFor();
  await guest.goto(base + "/san-pham/sua-little-grow-so-3-800g");
  await guest.locator('[data-detail-add="1"]').click();
  await guest.waitForFunction(
    () => document.querySelector("#cart-count")?.textContent === "1",
  );
  await guest.goto(base + "/thanh-toan");
  await guest.locator("#checkout-form").waitFor();
  assert.equal(
    await guest.locator("#checkout-form").evaluate((f) => f.checkValidity()),
    false,
  );
  for (const [id, value] of Object.entries({
    name: "Khách không tài khoản",
    phone: "0912345671",
    province: "TP Hồ Chí Minh",
    district: "Phường Mẫu",
    address: "123 Đường giao hàng",
  }))
    await guest.locator("#" + id).fill(value);
  await guest.locator('[name="agreement"]').check();
  const placed = guest.waitForResponse(
    (r) => r.url().endsWith("/api/orders") && r.request().method() === "POST",
  );
  await guest.locator("#place-order").click();
  const guestOrder = (await (await placed).json()).order;
  await guest.waitForURL("**/don-hang/*");
  assert.equal(guestOrder.userId, null);
  await admin.goto(base + "/quan-tri");
  await admin.locator('[data-section="users"]').click();
  await admin.locator(`[data-customer="${signup.user.id}"]`).click();
  await admin.locator(".customer-profile").waitFor();
  assert.ok(
    !(await admin.locator(".customer-profile").innerText()).includes(
      guestOrder.id,
    ),
  );
  console.log(
    "PASS 5: guest checkout requires shipping details, succeeds without a session and does not attach by matching phone",
  );
  assert.deepEqual(errors, []);
  console.log("PASS 6: no browser JavaScript exceptions");
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
