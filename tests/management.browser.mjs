import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createTestDatabase, closeServer } from "./support/database.mjs";
import { createApp } from "../server.mjs";
import { createAuth } from "../lib/auth.mjs";
const database = await createTestDatabase();
let app, browser;
let checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
try {
  app = await createApp({ pool: database.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const password = "Test-Management-Password-2026";
  await createAuth(database.pool).ensureAdmin({
    email: "admin@example.test",
    phone: "0987654321",
    name: "Quản trị thử",
    password,
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await customerContext.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(base + "/tai-khoan");
  await page.locator('[data-auth-mode="register"]').click();
  await page.locator("#fullName").fill("Mẹ kiểm thử");
  await page.locator("#phone").fill("0912345678");
  await page.locator("#email").fill("buyer@example.test");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator('[data-view="addresses"]').waitFor();
  const cookies = await customerContext.cookies();
  assert.equal(
    cookies.find((c) => c.name === "jielien_session").httpOnly,
    true,
  );
  pass("customer registration via responsive form creates HttpOnly session");
  await page.locator('[data-view="addresses"]').click();
  await page.locator("#recipientName").fill("Mẹ kiểm thử");
  await page.locator("#addressProvince").fill("TP Hồ Chí Minh");
  await page.locator("#addressDistrict").fill("Phường Bến Nghé");
  await page.locator("#addressDetail").fill("123 Đường Kiểm Thử");
  await page.locator('input[name="isDefault"]').check();
  await page.locator("#address-form button").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".address-list")
      ?.textContent.includes("123 Đường Kiểm Thử"),
  );
  pass("saved default address accepts Vietnamese location labels");
  await page.goto(base + "/san-pham/sua-little-grow-so-3-800g");
  await page.locator('[data-detail-add="1"]').click();
  await page.waitForFunction(
    () => document.querySelector("#cart-count")?.textContent === "1",
  );
  await page.waitForTimeout(200);
  const remote = await page.evaluate(async () =>
    (await fetch("/api/cart")).json(),
  );
  assert.deepEqual(remote.items, [{ id: 1, quantity: 1 }]);
  await page.reload();
  await page.locator('[data-detail-add="1"]').waitFor();
  assert.equal(await page.locator("#cart-count").textContent(), "1");
  pass("account cart synchronizes to PostgreSQL and reloads without doubling");
  await page.goto(base + "/thanh-toan");
  await page.locator("#saved-address").waitFor();
  assert.equal(
    await page.locator("#address").inputValue(),
    "123 Đường Kiểm Thử",
  );
  assert.equal(await page.locator("#province").inputValue(), "TP Hồ Chí Minh");
  await page.locator('input[name="agreement"]').check();
  await page.locator("#place-order").click();
  await page.waitForURL("**/don-hang/*");
  const orderNumber = new URL(page.url()).pathname.split("/").at(-1);
  assert.equal(await page.locator("#cart-count").textContent(), "0");
  pass("authenticated checkout uses saved address and attaches order to user");
  await page.goto(base + "/tai-khoan");
  await page.locator('[data-view="orders"]').click();
  await page.locator("[data-order]").first().waitFor();
  assert.ok(
    (await page.locator("#account-content").textContent()).includes(
      orderNumber,
    ),
  );
  await page.locator("[data-order]").first().click();
  await page.locator("#order-dialog").waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector("#order-dialog-content")
      ?.textContent.includes("123 Đường Kiểm Thử"),
  );
  assert.ok(
    (await page.locator("#order-dialog-content").textContent()).includes(
      "123 Đường Kiểm Thử",
    ),
  );
  await page.locator("[data-close-dialog]").click();
  await page.goto(base + "/quan-tri");
  await page.locator(".access-panel").waitFor();
  assert.equal(await page.locator('[data-section="orders"]').count(), 0);
  pass("own order history works and customer is denied management UI");
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const admin = await adminContext.newPage();
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(base + "/tai-khoan?redirect=/quan-tri");
  await admin.locator("#identifier").fill("admin@example.test");
  await admin.locator("#password").fill(password);
  await admin.locator("#auth-submit").click();
  await admin.waitForURL("**/quan-tri");
  await admin.locator('[data-section="products"]').click();
  await admin.locator('[data-edit-variant="1"]').click();
  await admin.locator("#variant-price").fill("430000");
  await admin.locator("#variant-original-price").fill("499000");
  await admin.locator("#variant-form button").click();
  await admin.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  assert.ok(
    (await admin.locator("#product-table-body").textContent()).includes(
      "430.000đ",
    ),
  );
  pass("admin edits SKU price through permission/CSRF-protected UI");
  await admin.locator('[data-section="orders"]').click();
  await admin.locator(`[data-admin-order="${orderNumber}"]`).click();
  assert.ok(
    (await admin.locator("#admin-dialog").textContent()).includes("425.000đ"),
  );
  for (const status of ["confirmed", "processing", "shipped", "delivered"]) {
    await admin.locator("#new-status").selectOption(status);
    await admin.locator("#status-reason").fill("Xử lý đơn thử nghiệm");
    await admin.locator("#order-status-form button").click();
    await admin.waitForFunction(
      () => !document.querySelector("#admin-dialog").open,
    );
    await admin.locator(`[data-admin-order="${orderNumber}"]`).click();
  }
  await admin.locator("#payment-form button").click();
  await admin.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  await admin.locator(`[data-admin-order="${orderNumber}"]`).click();
  assert.ok(
    (await admin.locator("#admin-dialog").textContent()).includes(
      "Đã ghi nhận thu tiền",
    ),
  );
  await admin.locator("[data-close-dialog]").click();
  pass(
    "order state transitions, immutable old price and explicit COD collection work through UI",
  );
  await admin.locator('[data-section="inventory"]').click();
  await admin.locator('[data-adjust-variant="1"]').first().click();
  await admin.locator("#quantityChange").fill("2");
  await admin.locator("#adjustReason").fill("Nhập bổ sung kiểm thử");
  await admin.locator("#inventory-form button").click();
  await admin.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  await admin.locator('[data-section="audit"]').click();
  await admin.locator("[data-audit]").first().waitFor();
  pass("inventory adjustment and audit history are usable");
  for (const p of [page, admin]) {
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "management mobile width " + p.url(),
    );
  }
  await page.goto(base + "/tai-khoan");
  await page.locator("#logout").click();
  await page.locator("#identifier").waitFor();
  assert.equal(
    (await customerContext.cookies()).some((c) => c.name === "jielien_session"),
    false,
  );
  assert.deepEqual(errors, []);
  pass(
    "logout revokes cookie, management mobile layouts fit and no JavaScript errors",
  );
  console.log(`Management browser complete: ${checks} checks passed.`);
} finally {
  if (browser) await browser.close();
  await closeServer(app);
  await database.cleanup();
}
