import { openAdminView } from "./support/admin-navigation.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { bankSettingsFixture, exampleBank } from "./support/bank-settings.mjs";

// Optional private demo values stay outside source and are never logged.
const demo = process.env.BANK_SETTINGS_DEMO_FILE
  ? JSON.parse(await readFile(process.env.BANK_SETTINGS_DEMO_FILE, "utf8")) : exampleBank;
const f = await bankSettingsFixture({ fallback: demo });
let browser;
let checks = 0;
const pass = text => console.log(`PASS ${++checks}: ${text}`);
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addCookies([{ name: "jielien_session", value: f.adminSession.token, url: f.base, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let mutations = 0;
  page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith("/api/admin/settings/bank-transfer")) mutations++; });
  const form = () => page.locator("#bank-settings-form");
  async function open() {
    await page.goto(f.base + "/quan-tri");
    const nav = page.locator('[data-section="bank-settings-editor"]');
    await nav.waitFor({ state: "attached" });
    await openAdminView(page, "bank-settings-editor"); await form().waitFor();
  }
  async function save() {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith("/api/admin/settings/bank-transfer")),
      form().locator('[type="submit"]').click(),
    ]);
    return response.status();
  }
  await open();
  assert.equal(await form().locator('[name="bankBin"]').inputValue(), "");
  assert.equal(await form().locator('[name="enabled"]').isChecked(), false);
  assert.equal(await save(), 200);
  await page.waitForFunction(() => document.querySelector(".bank-settings-layout aside")?.textContent.includes("Đang dùng cấu hình đã lưu trong Admin"));
  await open();
  assert.equal(await form().locator('[name="accountName"]').inputValue(), demo.accountName);
  assert.equal(await form().locator('[name="accountNumber"]').inputValue(), demo.accountNumber);
  assert.equal((await f.request("/api/payment-methods", { session: null })).body.methods.find(m => m.id === "bank_transfer").enabled, false);
  pass("incomplete bank demo saves and survives reload while transfers stay disabled");

  const beforeCancel = mutations;
  await form().locator('[name="bankName"]').fill("Thông tin chưa lưu");
  await page.locator("[data-bank-reload]").click();
  await page.waitForFunction(expected => document.querySelector('#bank-settings-form [name="bankName"]')?.value === expected, demo.bankName);
  assert.equal(mutations, beforeCancel);
  await form().locator('[name="bankBin"]').fill("demo");
  await form().locator('[type="submit"]').click();
  assert.equal(await form().locator('[name="bankBin"]').evaluate(input => input.checkValidity()), false);
  assert.equal(mutations, beforeCancel);
  await page.locator("[data-bank-reload]").click();
  await page.waitForFunction(() => document.querySelector('#bank-settings-form [name="bankBin"]')?.value === "");
  pass("cancel restores saved fields; invalid bank codes never submit");

  await page.route("**/api/admin/settings/bank-transfer", route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Chưa lưu được. Vui lòng thử lại." }) }) : route.continue());
  await form().locator('[name="bankName"]').fill("Bản sửa cần giữ lại");
  assert.equal(await save(), 503);
  await page.waitForFunction(() => document.querySelector("#bank-settings-error")?.textContent.includes("Chưa lưu được"));
  assert.equal(await form().locator('[name="bankName"]').inputValue(), "Bản sửa cần giữ lại");
  assert.equal(await form().locator('[type="submit"]').isEnabled(), true);
  await page.unroute("**/api/admin/settings/bank-transfer");
  await open();
  const latest = (await f.request("/api/admin/settings/bank-transfer")).body;
  await f.request("/api/admin/settings/bank-transfer", { method: "PATCH", body: { ...demo, version: latest.version } });
  assert.equal(await save(), 409);
  await page.waitForFunction(() => document.querySelector("#bank-settings-error")?.textContent.includes("Tải lại"));
  await page.locator("[data-bank-reload]").click();
  await page.waitForFunction(() => document.querySelector("#bank-settings-error")?.textContent === "");
  pass("temporary failures preserve edits; stale versions require reloading");

  // Use only fictitious account details when enabling a test QR.
  for (const [name, value] of Object.entries({ ...exampleBank, bankBin: "970436" })) {
    if (name !== "enabled") await form().locator(`[name="${name}"]`).fill(value);
  }
  await form().locator('[name="enabled"]').check();
  assert.equal(await save(), 200);
  await page.waitForFunction(() => document.querySelector(".bank-settings-layout")?.textContent.includes("Đang bật thanh toán chuyển khoản"));
  assert.equal((await f.request("/api/payment-methods", { session: null })).body.methods.find(m => m.id === "bank_transfer").enabled, true);
  await form().locator('[name="enabled"]').uncheck();
  assert.equal(await save(), 200);
  await page.waitForFunction(() => !document.querySelector('#bank-settings-form [type="submit"]')?.disabled);
  assert.equal((await f.request("/api/payment-methods", { session: null })).body.methods.find(m => m.id === "bank_transfer").enabled, false);
  pass("Admin enable/disable updates payment availability without restarting the server");

  // Restore the draft for demonstration screenshots; never enable unknown bank codes.
  const current = (await f.request("/api/admin/settings/bank-transfer")).body;
  await f.request("/api/admin/settings/bank-transfer", { method: "PATCH", body: { ...demo, enabled: false, version: current.version } });
  await open();
  const directory = "docs/screenshots/bank-settings";
  await mkdir(directory, { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `bank form overflow at ${width}`);
    for (const name of ["bankName", "bankBin", "accountName", "accountNumber"]) assert.ok(await form().locator(`[name="${name}"]`).isVisible());
    await page.screenshot({ path: `${directory}/bank-settings-${width}.png`, fullPage: true });
  }
  pass("receiving-account draft fits 320/375/768/1440/1920px with all fields visible");

  const readonly = await browser.newContext();
  await readonly.addCookies([{ name: "jielien_session", value: f.readerSession.token, url: f.base, httpOnly: true, sameSite: "Lax" }]);
  const reader = await readonly.newPage();
  await reader.goto(f.base + "/quan-tri");
  await openAdminView(reader, "bank-settings-editor");
  await reader.locator("#bank-settings-form").waitFor();
  assert.equal(await reader.locator('#bank-settings-form [type="submit"]').count(), 0);
  assert.equal(await reader.locator('#bank-settings-form input:disabled').count(), 5);
  assert.deepEqual(errors, []);
  pass("read-only staff cannot edit receiving details; no browser script errors");
  console.log(`Bank settings browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close(); await f.close();
}
