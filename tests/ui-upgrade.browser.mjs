import { openAdminView } from "./support/admin-navigation.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createStore } from "../db/store.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase(),
  out = "docs/screenshots/upgrade";
let app,
  browser,
  checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
const measurements = [];
try {
  await mkdir(out, { recursive: true });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const auth = createAuth(db.pool);
  await auth.ensureAdmin({
    email: "upgrade@example.test",
    phone: "0987654321",
    name: "Quản trị mẫu",
    password: "Upgrade-Fixture-Only-2026",
  });
  const store = await createStore({ pool: db.pool });
  const order = await store.createOrder({
    customer: {
      name: "Khách kiểm thử",
      phone: "0912345678",
      province: "TP Hồ Chí Minh",
      district: "Phường mẫu",
      address: "123 Đường Kiểm Thử",
    },
    items: [{ id: 1, quantity: 1 }],
    payment: "cod",
    idempotencyKey: "upgrade-fixture-order-0001",
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
  });
  const context = await browser.newContext({
      viewport: { width: 375, height: 900 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#main")?.dataset.hydrated === "true" &&
        !document.querySelector("#main").hasAttribute("aria-busy") &&
        !document.querySelector("#main .loading"),
    );
  await page.goto(base + "/san-pham/sua-little-grow-so-3-800g");
  await page.locator("[data-variant]").first().waitFor();
  const other = await page
    .locator('[data-variant][aria-checked="false"]')
    .first()
    .getAttribute("data-variant");
  await page.locator(`[data-variant="${other}"]`).click();
  await page.waitForFunction(
    (id) =>
      document.querySelector("[data-variant][aria-checked=true]")?.dataset
        .variant === id,
    other,
  );
  assert.equal(
    await page.locator("[data-buy]").getAttribute("data-buy"),
    other,
  );
  const slug = new URL(page.url()).pathname;
  await page.reload();
  await page.locator(`[data-variant="${other}"][aria-checked=true]`).waitFor();
  assert.equal(new URL(page.url()).pathname, slug);
  await page.locator("[data-detail-add]").click();
  await page.locator("#mini-cart[open]").waitFor();
  await page.locator(".mini-item").waitFor();
  assert.ok(await page.locator(".mini-item").count());
  await page.screenshot({ path: `${out}/mini-cart-375.png` });
  await page.locator('[data-mini-change="1"]').click();
  await page.waitForFunction(
    () => document.querySelector("#cart-count").textContent === "2",
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#mini-content").getAttribute("aria-busy") !==
      "true",
  );
  assert.equal(await page.locator(".mini-quantity span").textContent(), "2");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#mini-cart[open]").count(), 0);
  pass(
    "variant changes URL/cart identity, survives reload, mini-cart updates quantities and closes with Escape",
  );
  await page.goto(base + "/san-pham");
  await ready();
  await page.locator("#filter-toggle").click();
  await page.locator("#catalog-filter-dialog[open]").waitFor();
  const brand = page.locator(
    '#catalog-filter-dialog [data-select-filter="brand"]',
  );
  const selected = await brand.locator("option").nth(1).getAttribute("value");
  await brand.selectOption(selected);
  assert.equal(new URL(page.url()).search, "");
  await page.locator("[data-apply-filter]").click();
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("brand"), selected);
  await page.goto(base + slug);
  await page.locator("[data-buy]").waitFor();
  pass("mobile filter drawer applies selections only after confirmation");
  await page.locator("[data-buy]").click();
  await page.locator("#checkout-form").waitFor();
  assert.equal(await page.locator("#mini-cart[open]").count(), 0);
  await page.locator("#phone").fill("123");
  await page.locator("#place-order").click();
  assert.equal(new URL(page.url()).pathname, "/thanh-toan");
  assert.equal(await page.locator("#phone").inputValue(), "123");
  pass("buy-now bypasses drawer; checkout validation preserves input");
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [
      ["/", "home"],
      ["/san-pham", "catalog"],
      [slug, "product"],
      ["/gio-hang", "cart"],
      ["/thanh-toan", "checkout"],
      ["/tin-tuc", "news"],
    ]) {
      await page.goto(base + path);
      if (name === "news") await page.locator("#main h1").waitFor();
      else {
        await ready();
        if (name === "home") await page.locator(".hero").waitFor();
      }
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        `${name} overflow ${width}`,
      );
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
      if (name === "product" && width === 375) {
        await page.locator("#detail-tab-content").scrollIntoViewIfNeeded();
        await page.locator("#sticky-purchase:not([hidden])").waitFor();
        await page.screenshot({ path: `${out}/product-sticky-375.png` });
        const control = await page
          .locator(".quantity-control button")
          .first()
          .boundingBox();
        assert.ok(control.width >= 44 && control.height >= 44);
      }
    }
  }
  pass(
    "six storefront screens fit all five target widths; sticky purchase and 44px quantity controls verified",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/tai-khoan?redirect=/quan-tri");
  await page.locator("#identifier").fill("upgrade@example.test");
  await page.locator("#password").fill("Upgrade-Fixture-Only-2026");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  await page.locator("#dashboard-insights .report-chart").waitFor();
  const report = await page.evaluate(async () =>
    (await fetch("/api/admin/reports/summary")).json(),
  );
  assert.equal(Number(report.report.orders), 1);
  assert.equal(Number(report.report.gmv), order.total);
  assert.equal(Number(report.report.collected), 0);
  assert.equal(Number(report.report.topSkus[0].quantity), 1);
  assert.equal(
    report.report.series.reduce((sum, row) => sum + Number(row.gmv), 0),
    order.total,
  );
  pass(
    "dashboard chart and top SKU use actual fixture orders, separate from collected money",
  );
  await openAdminView(page, "settings-editor");
  await page.locator("#company-form").waitFor();
  await page
    .locator('[name="companyName"]')
    .fill("Jielien · cửa hàng kiểm thử");
  await page.locator('[name="hotline"]').fill("0900000000");
  await page.locator('[name="zalo"]').fill("https://zalo.me/0900000000");
  await page.locator('[name="working_hours"]').fill("Giờ thử nghiệm");
  await page
    .locator('[name="policy_returns"]')
    .fill("Nội dung chính sách fixture, không phải chính sách vận hành.");
  await page.locator("#company-form button").click();
  await page.waitForFunction(
    () => !document.querySelector("#company-form button")?.disabled,
  );
  await page.reload();
  await openAdminView(page, "settings-editor");
  await page.locator("#company-form").waitFor();
  assert.equal(
    await page.locator('[name="hotline"]').inputValue(),
    "0900000000",
  );
  const validation = await page.evaluate(async () => {
    const me = await (await fetch("/api/auth/me")).json();
    return (
      await fetch("/api/admin/settings/site", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.csrfToken,
        },
        body: JSON.stringify({
          key: "messenger_url",
          value: "https://evil.example.test/",
        }),
      })
    ).status;
  });
  assert.equal(validation, 400);
  pass(
    "company contacts/policies persist through Admin; unsupported contact destinations rejected",
  );
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of [
      "dashboard",
      "orders",
      "inventory",
      "coupons-editor",
      "settings-editor",
      "reports-editor",
    ]) {
      if (
        width <= 900 &&
        (await page.locator("#admin-menu-toggle").isVisible())
      )
        await page.locator("#admin-menu-toggle").click();
      await openAdminView(page, view);
      await page.waitForFunction(
        () =>
          document
            .querySelector("#admin-content")
            ?.getAttribute("aria-busy") !== "true",
      );
      if (view === "dashboard")
        await page.locator("#dashboard-insights .report-chart").waitFor();
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        `${view} overflow ${width}`,
      );
      await page.screenshot({
        path: `${out}/admin-${view}-${width}.png`,
        fullPage: true,
      });
    }
  }
  pass(
    "six Admin screens fit all five target widths with actual order fixtures",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAdminView(page, "coupons-editor");
  await page.locator('[data-editor-action^="coupon-edit:"]').first().click();
  assert.ok(await page.locator('#coupon-form [name="id"]').inputValue());
  assert.equal(
    await page.locator('#coupon-form [name="id"]').isVisible(),
    false,
  );
  assert.ok(
    (await page.locator("#coupon-editor-title").textContent()).startsWith(
      "Sửa mã",
    ),
  );
  const storefront = await context.newPage();
  await storefront.goto(base + "/");
  await storefront.locator(".hero").waitFor();
  await storefront.locator(".contact-fab summary").click();
  assert.equal(
    await storefront.locator('.contact-fab a[href="tel:0900000000"]').count(),
    1,
  );
  await storefront.goto(base + "/chinh-sach/doi-tra");
  await storefront
    .getByText("Nội dung chính sách fixture, không phải chính sách vận hành.")
    .waitFor();
  pass(
    "coupon selection hides internal ID; configured contacts and policy content appear on storefront",
  );
  await db.pool.query("INSERT INTO categories(name,slug) VALUES($1,$2)", [
    "<img src=x onerror=window.__categoryXss=1>",
    "unsafe-name-fixture",
  ]);
  await storefront.goto(base + "/");
  await storefront.waitForFunction(()=>document.querySelector("#main")?.dataset.hydrated === "true");
  assert.equal(
    await storefront.evaluate(() => window.__categoryXss),
    undefined,
  );
  assert.ok(
    (await storefront.locator("#category-dropdown").textContent()).includes(
      "<img src=x",
    ),
  );
  pass("dynamic category names are escaped in menu and home tiles");
  assert.deepEqual(errors, []);
  pass("no uncaught JavaScript errors");
  await writeFile(
    `${out}/README.md`,
    "# Upgrade screenshots\n\nAll screenshots use isolated PostgreSQL fixture data. Hotline 0900000000, policy text, customer, order, catalog and account in screenshots are TEST FIXTURES, not operational data.\nWidths: 320, 375, 768, 1440, 1920. Chromium headless; reduced motion enabled. No production database or service ports used.\n",
  );
  console.log(`Upgrade browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
