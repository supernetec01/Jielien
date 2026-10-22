import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createTestDatabase, closeServer } from "./support/database.mjs";
import { createApp } from "../server.mjs";
import { createAuth } from "../lib/auth.mjs";

// These receiving details exist only in disposable PostgreSQL test schemas.
const bank = {
  enabled: true,
  bankBin: "970436",
  bankName: "Ngân hàng kiểm thử",
  accountNumber: "0000000000",
  accountName: "TEST ACCOUNT",
};
const password = "Test-Bank-Checkout-Password-2026";
const databases = [];
const servers = [];
const errors = [];
const externalRequests = [];
let browser;
let checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
const money = (amount) => Number(amount).toLocaleString("vi-VN") + "đ";

async function fixture(bankConfig) {
  const database = await createTestDatabase();
  databases.push(database);
  const server = await createApp({
    pool: database.pool,
    legacyPath: null,
    bankConfig,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    database,
    base: `http://127.0.0.1:${server.address().port}`,
  };
}

async function contextFor(base, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  // A QR image must load without sending receiving details to a third party.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      ["data:", "blob:", "about:"].includes(url.protocol) ||
      url.origin === base
    )
      return route.continue();
    externalRequests.push({ method: route.request().method(), host: url.host });
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  return { context, page };
}

async function request(page, path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const headers = {};
      if (options.body !== undefined)
        headers["Content-Type"] = "application/json";
      if (options.csrfToken) headers["X-CSRF-Token"] = options.csrfToken;
      const response = await fetch(path, {
        method: options.method || "GET",
        headers,
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, options },
  );
}

async function register(page, base, identity) {
  await page.goto(base + "/tai-khoan");
  await page.locator('[data-auth-mode="register"]').click();
  await page.locator("#fullName").fill(identity.name);
  await page.locator("#phone").fill(identity.phone);
  await page.locator("#email").fill(identity.email);
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator('[data-view="orders"]').waitFor();
}

async function checkout(page, base) {
  await page.goto(base + "/san-pham/sua-little-grow-so-3-800g");
  await page.locator('[data-detail-add="1"]').click();
  await page.waitForFunction(
    () => document.querySelector("#cart-count")?.textContent === "1",
  );
  await page.goto(base + "/thanh-toan");
  await page.locator('input[name="payment"][value="cod"]').waitFor();
  await page.locator("#name").fill("Người mua kiểm thử");
  await page.locator("#phone").fill("0912345678");
  await page.locator("#email").fill("bank-buyer@example.test");
  await page.locator("#province").fill("TP Hồ Chí Minh");
  await page.locator("#district").fill("Phường Bến Nghé");
  await page.locator("#address").fill("123 Đường Kiểm Thử");
  await page.locator('input[name="agreement"]').check();
}

try {
  const enabled = await fixture(bank);
  await createAuth(enabled.database.pool).ensureAdmin({
    email: "bank-admin@example.test",
    phone: "0987654321",
    name: "Quản trị kiểm thử",
    password,
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const { page } = await contextFor(enabled.base);
  await register(page, enabled.base, {
    name: "Người mua kiểm thử",
    phone: "0912345678",
    email: "bank-buyer@example.test",
  });
  await checkout(page, enabled.base);
  const method = page.locator('input[name="payment"][value="bank_transfer"]');
  assert.equal(await method.isEnabled(), true);
  await method.check();
  await page.waitForFunction(() =>
    /chuyển khoản|VietQR/i.test(
      document.querySelector("#place-order")?.textContent || "",
    ),
  );
  const quote = await request(page, "/api/quote", {
    method: "POST",
    body: { items: [{ id: 1, quantity: 1 }] },
  });
  assert.equal(quote.status, 200);
  let outgoingPayment;
  await page.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON();
    outgoingPayment = payload.payment;
    return route.continue({
      postData: JSON.stringify({ ...payload, total: 1, amount: 1, paid: true }),
    });
  });
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/orders" &&
      response.request().method() === "POST",
  );
  await page.locator("#place-order").click();
  const created = await createdResponse;
  assert.equal(created.status(), 201);
  const { order } = await created.json();
  await page.waitForURL("**/don-hang/*");
  assert.equal(outgoingPayment, "bank_transfer");
  assert.equal(order.payment, "bank_transfer");
  assert.equal(order.paymentStatus, "pending");
  assert.equal(order.total, quote.body.total);
  assert.equal(order.transfer.amount, quote.body.total);
  assert.equal(order.transfer.reference, order.id);
  assert.equal(order.transfer.accountNumber, bank.accountNumber);
  assert.equal(order.transfer.accountName, bank.accountName);
  const qr = page.locator("#transfer-qr");
  await qr.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector("#transfer-qr");
    return image?.complete && image.naturalWidth > 0;
  });
  const qrSource = await qr.getAttribute("src");
  assert.ok(qrSource.startsWith("data:image/svg+xml;base64,"));
  assert.match(
    Buffer.from(qrSource.split(",")[1], "base64").toString(),
    /<svg/,
  );
  const pendingText = await page.locator("body").innerText();
  assert.ok(pendingText.includes(bank.accountNumber));
  assert.ok(pendingText.includes(bank.accountName));
  assert.ok(pendingText.includes(money(order.total)));
  assert.match(pendingText, /đối soát|xác nhận thủ công|nhân viên.*xác nhận/i);
  assert.ok((await page.locator("[data-copy-transfer]").count()) >= 2);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "bank instructions and QR fit the 390px viewport",
  );
  pass(
    "bank checkout renders a local VietQR for the server amount and receiving snapshot",
  );

  const refresh = page.locator(`[data-refresh-payment="${order.id}"]`);
  const refreshedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/orders/${order.id}`,
  );
  await refresh.click();
  const refreshed = await (await refreshedResponse).json();
  assert.equal(refreshed.order.paymentStatus, "pending");
  await page.locator("#transfer-qr").waitFor({ state: "visible" });
  const session = await request(page, "/api/auth/me");
  const forbidden = await request(
    page,
    `/api/admin/orders/${order.id}/bank-transfer`,
    {
      method: "POST",
      csrfToken: session.body.csrfToken,
      body: { paid: true, amount: 1 },
    },
  );
  assert.equal(forbidden.status, 403);
  const persisted = await request(page, `/api/orders/${order.id}`);
  assert.equal(persisted.body.order.paymentStatus, "pending");
  assert.equal(persisted.body.order.transfer.amount, order.total);
  pass(
    "customer refresh and a forged paid request cannot confirm bank receipt",
  );

  const { page: anonymous } = await contextFor(enabled.base);
  await anonymous.goto(enabled.base + "/tai-khoan");
  assert.equal(
    (await request(anonymous, `/api/orders/${order.id}?token=wrong-token`))
      .status,
    404,
  );
  assert.equal(
    (
      await request(anonymous, `/api/admin/orders/${order.id}/bank-transfer`, {
        method: "POST",
        body: {},
      })
    ).status,
    401,
  );
  await register(anonymous, enabled.base, {
    name: "Người mua khác",
    phone: "0923456789",
    email: "other-bank-buyer@example.test",
  });
  assert.equal(
    (await request(anonymous, `/api/orders/${order.id}`)).status,
    404,
  );
  pass(
    "missing permission and another customer's session or an invalid token deny order access",
  );

  const { page: admin } = await contextFor(enabled.base, 1440);
  await admin.goto(enabled.base + "/tai-khoan?redirect=/quan-tri");
  await admin.locator("#identifier").fill("bank-admin@example.test");
  await admin.locator("#password").fill(password);
  await admin.locator("#auth-submit").click();
  await admin.waitForURL("**/quan-tri");
  await admin.locator('[data-section="orders"]').click();
  await admin.locator(`[data-admin-order="${order.id}"]`).click();
  await admin.locator("#bank-transfer-form button").waitFor();
  await admin.locator("#bank-transfer-form button").click();
  await admin.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  const adminSession = await request(admin, "/api/auth/me");
  const repeat = await request(
    admin,
    `/api/admin/orders/${order.id}/bank-transfer`,
    {
      method: "POST",
      csrfToken: adminSession.body.csrfToken,
      body: { amount: 1 },
    },
  );
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.order.paymentStatus, "paid");
  const recorded = await enabled.database.pool.query(
    `SELECT p.status, p.amount,
       (SELECT count(*)::integer FROM payment_events e WHERE e.payment_id=p.id
         AND e.event_type='bank_transfer.confirmed') AS events,
       (SELECT count(*)::integer FROM audit_logs a WHERE a.entity_id=o.order_number
         AND a.action='payment.bank_transfer_confirmed') AS audits
     FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.order_number=$1`,
    [order.id],
  );
  assert.deepEqual(recorded.rows, [
    { status: "paid", amount: order.total, events: 1, audits: 1 },
  ]);
  pass(
    "admin confirmation records server amount exactly once, including repeat requests",
  );

  const paidResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/orders/${order.id}`,
  );
  await page.locator(`[data-refresh-payment="${order.id}"]`).click();
  assert.equal((await (await paidResponse).json()).order.paymentStatus, "paid");
  await page.waitForFunction(() => !document.querySelector("#transfer-qr"));
  assert.match(
    await page.locator("body").innerText(),
    /đã (?:nhận|ghi nhận).*?(?:tiền|chuyển khoản)|đã thanh toán/i,
  );
  await page.goto(enabled.base + "/tai-khoan");
  await page.locator('[data-view="orders"]').click();
  await page.locator(`[data-order="${order.id}"]`).click();
  await page.waitForFunction(() => {
    const text =
      document.querySelector("#order-dialog-content")?.textContent || "";
    return (
      /chuyển khoản/i.test(text) &&
      /đã (?:nhận|ghi nhận)|đã thanh toán/i.test(text)
    );
  });
  const accountText = await page.locator("#order-dialog-content").innerText();
  assert.ok(accountText.includes(money(order.total)));
  assert.equal(
    await page.locator("#order-dialog-content #transfer-qr").count(),
    0,
  );
  pass(
    "customer refresh removes the paid QR and account history shows bank settlement correctly",
  );

  const { page: retrying } = await contextFor(enabled.base);
  await checkout(retrying, enabled.base);
  const retryBank = retrying.locator(
    'input[name="payment"][value="bank_transfer"]',
  );
  assert.equal(await retryBank.isEnabled(), true);
  await retryBank.check();
  const cartBefore = await retrying.evaluate(() =>
    localStorage.getItem("jielien-cart-v2"),
  );
  const counts = async () =>
    (
      await enabled.database.pool.query(
        `SELECT (SELECT count(*)::integer FROM orders) AS orders,
          (SELECT count(*)::integer FROM inventory_reservations) AS reservations`,
      )
    ).rows[0];
  const beforeRejected = await counts();
  const attempts = [];
  const unavailableMessage = "Chuyển khoản tạm ngừng. Vui lòng chọn COD.";
  await retrying.route("**/api/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "payment_unavailable",
          message: unavailableMessage,
        }),
      });
    return route.continue();
  });
  await retrying.locator("#place-order").click();
  await retrying.waitForFunction(
    (message) =>
      document.querySelector("#checkout-error")?.textContent === message,
    unavailableMessage,
  );
  assert.equal(new URL(retrying.url()).pathname, "/thanh-toan");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].payment, "bank_transfer");
  assert.deepEqual(await counts(), beforeRejected);
  assert.equal(await retrying.locator("#cart-count").textContent(), "1");
  assert.equal(
    await retrying.evaluate(() => localStorage.getItem("jielien-cart-v2")),
    cartBefore,
  );
  for (const selector of [
    "#name",
    "#phone",
    "#email",
    "#province",
    "#district",
    "#address",
    "#note",
  ])
    assert.equal(await retrying.locator(selector).isEditable(), true, selector);
  assert.equal(
    await retrying.locator("#name").inputValue(),
    "Người mua kiểm thử",
  );
  assert.equal(
    await retrying.locator("#address").inputValue(),
    "123 Đường Kiểm Thử",
  );
  assert.equal(await retryBank.isEnabled(), true);
  const retryCod = retrying.locator('input[name="payment"][value="cod"]');
  assert.equal(await retryCod.isEnabled(), true);
  await retrying.locator("#name").fill("Người mua chọn COD");
  await retryCod.check();
  assert.match(await retrying.locator("#place-order").textContent(), /COD/);
  const codResponse = retrying.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/orders" &&
      response.request().method() === "POST",
  );
  await retrying.locator("#place-order").click();
  const accepted = await codResponse;
  assert.equal(accepted.status(), 201);
  const { order: codOrder } = await accepted.json();
  await retrying.waitForURL("**/don-hang/*");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].payment, "cod");
  assert.notEqual(attempts[1].idempotencyKey, attempts[0].idempotencyKey);
  assert.equal(codOrder.payment, "cod");
  assert.equal(codOrder.transfer, undefined);
  assert.equal(codOrder.customer.name, "Người mua chọn COD");
  assert.equal(await retrying.locator("#cart-count").textContent(), "0");
  assert.deepEqual(await counts(), {
    orders: beforeRejected.orders + 1,
    reservations: beforeRejected.reservations + 1,
  });
  pass(
    "a definitive bank-unavailable response preserves an editable checkout and permits one COD order",
  );

  const disabled = await fixture({ enabled: false });
  const { page: unconfigured } = await contextFor(disabled.base);
  await checkout(unconfigured, disabled.base);
  const unavailable = unconfigured.locator(
    'input[name="payment"][value="bank_transfer"]',
  );
  assert.equal(await unavailable.isDisabled(), true);
  assert.equal(
    await unconfigured
      .locator('input[name="payment"][value="cod"]')
      .isChecked(),
    true,
  );
  const methods = await request(unconfigured, "/api/payment-methods");
  assert.equal(
    methods.body.methods.find((method) => method.id === "bank_transfer")
      .enabled,
    false,
  );
  assert.equal(await unconfigured.locator("#transfer-qr").count(), 0);
  const unconfiguredText = await unconfigured.locator("body").innerText();
  assert.equal(unconfiguredText.includes(bank.accountNumber), false);
  assert.equal(unconfiguredText.includes(bank.accountName), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  pass(
    "unconfigured bank checkout is disabled without fabricated details or external QR requests",
  );
  console.log(`Bank checkout browser complete: ${checks} checks passed.`);
} finally {
  if (browser) await browser.close();
  for (const server of servers.reverse()) await closeServer(server);
  for (const database of databases.reverse()) await database.cleanup();
}
