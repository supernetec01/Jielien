import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { bankSettingsFixture, exampleBank, key } from "./support/bank-settings.mjs";
import { createStore } from "../db/store.mjs";
import { createOrderExpiry } from "../lib/order-expiry.mjs";

const names = ["ORDER_EXPIRY_ENABLED", "BANK_TRANSFER_TTL_HOURS", "STAFF_NOTIFY_ENABLED"];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
Object.assign(process.env, { ORDER_EXPIRY_ENABLED: "true", BANK_TRANSFER_TTL_HOURS: "24", STAFF_NOTIFY_ENABLED: "false" });
let f, browser, checks = 0;
const pass = text => console.log(`PASS ${++checks}: ${text}`);
try {
  f = await bankSettingsFixture({ fallback: { ...exampleBank, enabled: true, bankBin: "970436" } });
  const store = await createStore({ pool: f.database.pool });
  async function place(payment = "bank_transfer") {
    const result = await f.request("/api/orders", { method: "POST", body: { ...f.order(), payment }, session: null });
    assert.equal(result.status, 201); return result.body.order;
  }
  const order = await place(), older = await place(), cod = await place("cod"), paid = await place();
  await f.database.pool.query("UPDATE orders SET created_at=created_at-interval '2 hours' WHERE order_number=$1", [older.id]);
  await store.recordBankTransfer(paid.id, f.admin.id, { receivedAmount: paid.total });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: f.base });
  await context.addInitScript(({ id, token }) => sessionStorage.setItem("jielien-order-" + id, token), { id: order.id, token: order.token });
  const customer = await context.newPage(); customer.on("pageerror", e => errors.push(e.message));
  await customer.goto(f.base + "/don-hang/" + order.id);
  await customer.locator("#transfer-qr").waitFor();
  assert.ok((await customer.locator(".transfer-panel").innerText()).includes("Ghi ĐÚNG nội dung"));
  assert.ok((await customer.locator("[data-payment-countdown]").innerText()).includes("Còn"));
  for (const [label, value] of [["Sao chép số tài khoản", order.transfer.accountNumber], ["Sao chép số tiền", String(order.total)], ["Sao chép nội dung chuyển khoản", order.transfer.reference]]) {
    await customer.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await customer.evaluate(() => navigator.clipboard.readText()), value);
  }
  await customer.locator("[data-transfer-notice]").click();
  await customer.waitForFunction(() => document.querySelector("[data-transfer-notice]")?.textContent.includes("Đã báo nhân viên"));
  assert.equal(await customer.locator("[data-transfer-notice]").isDisabled(), true);
  assert.equal((await store.getOrderByNumber(order.id)).paymentStatus, "pending");
  await customer.locator("[data-refresh-payment]").click();
  await customer.waitForFunction(() => document.querySelector("[data-transfer-notice]")?.disabled);
  pass("customer copies exact bank fields, sees deadline and sends a throttled notice without marking paid");

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
  await adminContext.addCookies([{ name: "jielien_session", value: f.adminSession.token, url: f.base, httpOnly: true, sameSite: "Lax" }]);
  const admin = await adminContext.newPage(); admin.on("pageerror", e => errors.push(e.message));
  await admin.goto(f.base + "/quan-tri?order=" + order.id);
  await admin.locator("#bank-transfer-form").waitFor();
  assert.equal(await admin.locator('#bank-transfer-form [name="receivedAmount"]').inputValue(), "");
  await admin.locator('#admin-dialog [data-close-dialog]').click();
  await admin.locator("#order-bank-filter").selectOption("pending");
  await admin.waitForFunction(expected => document.querySelector('#order-bank-filter')?.value === 'pending' && document.querySelector('#order-table-body [data-admin-order]')?.dataset.adminOrder === expected, older.id);
  const ids = await admin.locator("#order-table-body [data-admin-order]").evaluateAll(nodes => nodes.map(node => node.dataset.adminOrder));
  assert.deepEqual(ids, [older.id, order.id]); assert.ok(!ids.includes(cod.id)); assert.ok(!ids.includes(paid.id));
  assert.ok((await admin.locator("#order-table-body").innerText()).includes("Khách báo đã chuyển khoản"));
  pass("Admin deep link opens the order; pending reconciliation filter is oldest first and excludes paid/COD");

  const directory = "docs/screenshots/manual-bank";
  await mkdir(directory, { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await admin.setViewportSize({ width, height: 1100 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `orders overflow ${width}`);
    for (const copy of await admin.locator("[data-bank-copy]:visible").all()) {
      const box = await copy.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `copy button clipped at ${width}`);
    }
    await admin.screenshot({ path: `${directory}/reconciliation-${width}.png`, fullPage: true });
    await customer.setViewportSize({ width, height: 1100 });
    assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `transfer overflow ${width}`);
    await customer.screenshot({ path: `${directory}/customer-transfer-${width}.png`, fullPage: true });
  }
  await admin.setViewportSize({ width: 1440, height: 1100 });
  await admin.locator(`[data-admin-order="${order.id}"]`).click();
  const form = admin.locator("#bank-transfer-form");
  await form.locator('[name="receivedAmount"]').fill(String(order.total - 1000));
  await form.locator('[name="bankTransactionRef"]').fill(key());
  assert.equal(await admin.locator("#bank-amount-warning").isVisible(), true);
  assert.equal(await form.locator('[name="mismatchConfirmed"]').isChecked(), false);
  await form.locator("button").click();
  assert.equal((await store.getOrderByNumber(order.id)).paymentStatus, "pending");
  for (const width of [320, 375, 768, 1440, 1920]) {
    await admin.setViewportSize({ width, height: 1100 });
    assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `receipt overflow ${width}`);
    await form.scrollIntoViewIfNeeded();
    await admin.screenshot({ path: `${directory}/receipt-mismatch-${width}.png`, fullPage: true });
    await form.screenshot({ path: `${directory}/receipt-form-${width}.png` });
  }
  await form.locator('[name="mismatchConfirmed"]').check();
  await form.locator("button").click();
  await admin.waitForFunction(() => !document.querySelector("#admin-dialog").open);
  assert.equal((await store.getOrderByNumber(order.id)).paymentStatus, "paid");
  await customer.locator("[data-refresh-payment]").click();
  await customer.waitForFunction(() => !document.querySelector("#transfer-qr"));
  assert.ok((await customer.locator(".transfer-paid").innerText()).includes("Đã nhận tiền"));
  pass("mismatch cannot submit without acknowledgement; accepted receipt removes customer QR after refresh");

  // Expiry is enforced even while the job has not run; the job then releases the reservation.
  await f.database.pool.query("UPDATE orders SET bank_payment_due_at=now()-interval '1 minute' WHERE order_number=$1", [older.id]);
  await createOrderExpiry(f.database.pool, store).run();
  await admin.setViewportSize({ width: 1440, height: 1100 });
  await admin.goto(f.base + "/quan-tri?order=" + older.id);
  await admin.locator("#admin-dialog[open]").waitFor();
  assert.equal(await admin.locator("#bank-transfer-form").count(), 0);
  assert.ok((await admin.locator("#admin-dialog").innerText()).includes("hoàn tiền hoặc tạo lại đơn"));
  await customer.goto(f.base + "/san-pham");
  await customer.waitForFunction(() => document.querySelector('#main')?.dataset.hydrated === 'true');
  assert.equal(await customer.locator("[data-payment-countdown], [data-transfer-notice]").count(), 0);
  assert.deepEqual(errors, []);
  pass("expired/cancelled order hides confirmation and explains refund/reorder; leaving confirmation removes timer UI");
  console.log(`Manual bank workflow browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close(); await f?.close();
  for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
