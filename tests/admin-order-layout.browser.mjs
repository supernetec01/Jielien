import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createStore } from "../db/store.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase(),
  out = "docs/screenshots/admin-order-layout";
let app, browser;
try {
  await mkdir(out, { recursive: true });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  await createAuth(db.pool).ensureAdmin({
    email: "layout@example.test",
    phone: "0987654321",
    name: "Nhân viên kiểm thử",
    password: "Layout-Fixture-Only-2026",
  });
  const store = await createStore({ pool: db.pool });
  await store.createOrder({
    customer: {
      name: "Khách hàng kiểm thử thông tin dài",
      phone: "0912345678",
      province: "TP Hồ Chí Minh",
      district: "Phường kiểm thử",
      address: "123 Đường Kiểm Thử, khu vực giao hàng của cửa hàng",
    },
    items: [
      { id: 1, quantity: 2 },
      { id: 2, quantity: 1 },
    ],
    payment: "cod",
    note: "Gọi cho người nhận trước khi giao. Đây là dữ liệu fixture để kiểm tra bố cục, không phải đơn thật.",
    idempotencyKey: "admin-layout-fixture-0001",
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/tai-khoan?redirect=/quan-tri");
  await page.locator("#identifier").fill("layout@example.test");
  await page.locator("#password").fill("Layout-Fixture-Only-2026");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  await page.locator("#admin-content h1").waitFor();
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1920 ? 948 : 1000 });
    const menu = page.locator("#admin-menu-toggle");
    if (await menu.isVisible()) await menu.click();
    await page.locator('[data-section="orders"]').click();
    await page.locator("[data-admin-order]").first().waitFor();
    if (width > 900) {
      const bounds = await page.locator(".admin-sidebar").boundingBox();
      assert.ok(
        bounds.y + bounds.height <= (width === 1920 ? 948 : 1000),
        `sidebar fits viewport ${width}`,
      );
      assert.ok(
        Math.abs(bounds.x) <= 1,
        "desktop sidebar touches the left viewport edge",
      );
      const header = await page.locator(".management-header").boundingBox();
      assert.ok(
        Math.abs(bounds.y - (header.y + header.height)) <= 1,
        "sidebar starts immediately below header",
      );
      const before = await page.locator(".workspace-brand").boundingBox();
      await page
        .locator(".side-nav")
        .evaluate((el) => (el.scrollTop = el.scrollHeight));
      const after = await page.locator(".workspace-brand").boundingBox();
      assert.equal(before.y, after.y);
      const user = await page.locator(".admin-user").boundingBox();
      assert.ok(user.y + user.height <= (width === 1920 ? 948 : 1000));
      await page.screenshot({
        path: `${out}/sidebar-${width}.png`,
        fullPage: true,
      });
    }
    await page.locator("[data-admin-order]").first().click();
    await page.locator('#admin-dialog[open][data-kind="order"]').waitFor();
    assert.equal(
      await page
        .locator("#admin-dialog-content")
        .evaluate((el) => el.scrollTop),
      0,
      "opening/reopening starts at customer information",
    );
    const box = await page.locator("#admin-dialog").boundingBox();
    assert.ok(box.x >= 0 && box.width <= width);
    if (width >= 1440) assert.ok(box.width >= 1100);
    assert.ok(
      await page
        .locator(".order-customer-name")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 22),
    );
    assert.ok(
      await page
        .locator(".order-information dd")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    assert.equal(
      await page
        .locator("#admin-dialog-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      true,
      `dialog content fits ${width}`,
    );
    await page.screenshot({ path: `${out}/order-${width}.png` });
    const scrollBefore = await page.evaluate(() => scrollY);
    await page
      .locator("#admin-dialog-content")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    const close = await page
      .locator("#admin-dialog [data-close-dialog]")
      .boundingBox();
    assert.ok(
      close.y >= 0 && close.y + close.height < (width === 1920 ? 948 : 1000),
    );
    assert.equal(await page.evaluate(() => scrollY), scrollBefore);
    await page.screenshot({ path: `${out}/order-actions-${width}.png` });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#admin-dialog").evaluate((el) => el.open),
      false,
    );
    console.log(
      `PASS: sidebar, readable order/customer, single content scroll and close at ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/README.md",
    "# Admin order layout\n\nAll customer/order/contact data are isolated test fixtures; no real customer data. Widths 320/375/768/1440/1920; desktop sidebar and scrollable order workspace tested.\n",
  );
  console.log(
    "Admin order layout: 5 viewports passed; no JavaScript exceptions.",
  );
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
