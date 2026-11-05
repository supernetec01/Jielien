import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
let app, browser;
let checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
const directory = "docs/screenshots/usability";
try {
  await mkdir(directory, { recursive: true });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const auth = createAuth(db.pool),
    password = "Usability-Test-Only!2026";
  await auth.ensureAdmin({
    name: "Quản trị Jielien",
    username: "admin",
    email: "ui@example.test",
    phone: "0987654321",
    password,
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/tai-khoan?redirect=/quan-tri");
  await page.locator("#identifier").fill("admin");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  await page.locator(".workspace-main").waitFor();
  const navigate = async (id) => {
    const toggle = page.locator("#admin-menu-toggle");
    if (await toggle.isVisible()) {
      if ((await toggle.getAttribute("aria-expanded")) !== "true")
        await toggle.click();
    }
    await page.locator("#admin-nav-search").fill("");
    await page.locator(`[data-section="${id}"]`).click();
    await page
      .locator('#admin-content[aria-busy="true"]')
      .waitFor({ state: "hidden" });
    await page.locator("#admin-content .loading").waitFor({ state: "hidden" });
  };
  await page.locator("#admin-nav-search").fill("bao cao");
  assert.equal(await page.locator(".side-nav button:visible").count(), 1);
  await page.locator("#admin-nav-search").fill("khongtontai");
  assert.equal(await page.locator("#navigation-empty").isVisible(), true);
  await page.locator("#admin-nav-search").fill("");
  pass(
    "accent-insensitive navigation search filters groups and shows empty results",
  );
  await navigate("taxonomy-editor");
  const form = page.locator('[data-tax-kind="categories"]');
  await form.locator('[name="name"]').fill("Danh mục giao diện");
  await form.locator('[name="slug"]').fill("danh-muc-giao-dien");
  await form.locator("button.primary").click();
  await page
    .getByRole("cell", { name: "Danh mục giao diện danh-muc-giao-dien" })
    .waitFor();
  await page
    .getByRole("button", { name: "Sửa Danh mục giao diện", exact: true })
    .click();
  assert.equal(await page.locator('[data-tax-kind="categories"]').count(), 1);
  assert.equal(
    await form
      .locator('[name="parentId"] option')
      .filter({ hasText: "Danh mục giao diện" })
      .count(),
    0,
  );
  await form.locator('[name="name"]').fill("Danh mục đã chỉnh sửa");
  await form.locator("button.primary").click();
  await page
    .getByRole("button", { name: "Sửa Danh mục đã chỉnh sửa", exact: true })
    .waitFor();
  const categories = await page.request.get(
    base + "/api/admin/catalog/categories",
  );
  assert.ok(
    (await categories.json()).items.some(
      (x) => x.name === "Danh mục đã chỉnh sửa",
    ),
  );
  pass(
    "taxonomy create/edit persists; editor is replaced rather than duplicated and excludes self-parent",
  );
  await page.locator('[data-editor-action="taxonomy-tab:brands"]').click();
  assert.equal(await page.locator('[data-tax-kind="brands"]').count(), 1);
  assert.equal(await page.locator('[data-tax-kind="categories"]').count(), 0);
  pass("taxonomy tabs show one focused form at a time");
  const products = (
    await (await page.request.get(base + "/api/products")).json()
  ).products;
  const order = await fetch(base + "/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ id: products[0].id, quantity: 1 }],
      customer: {
        name: "Người mua kiểm thử",
        phone: "0912345678",
        address: "123 Đường Kiểm Thử",
        province: "TP Hồ Chí Minh",
        district: "Quận 1",
      },
      payment: "cod",
      coupon: "",
      note: "Usability fixture",
      idempotencyKey: "usability-fixture-order-001",
    }),
  });
  assert.equal(order.status, 201);
  await navigate("reports-editor");
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes("/api/admin/reports/summary?") && r.status() === 200,
    ),
    page.locator('[data-editor-action="report-days:7"]').click(),
  ]);
  // Read the resulting rendered range, then compare card values to the same live API.
  await page.locator(".report-metrics").waitFor();
  const from = await page.locator('#report-filter [name="from"]').inputValue(),
    to = await page.locator('#report-filter [name="to"]').inputValue();
  const end = new Date(to + "T00:00:00");
  end.setDate(end.getDate() + 1);
  const response = await page.request.get(
    base +
      "/api/admin/reports/summary?" +
      new URLSearchParams({
        from: new Date(from + "T00:00:00").toISOString(),
        to: end.toISOString(),
      }),
  );
  const { report } = await response.json();
  assert.ok(Number(report.orders) > 0);
  assert.equal(
    await page.locator(".metric-card strong").first().textContent(),
    Number(report.orders).toLocaleString("vi-VN"),
  );
  assert.equal((new Date(to) - new Date(from)) / 86400000, 6);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-editor-action="report-export"]').click(),
  ]);
  assert.equal(await download.failure(), null);
  pass(
    "report preset persists seven-day inclusive range, live metrics match API and CSV downloads",
  );
  await page.locator('#report-filter [name="from"]').fill("2026-10-20");
  await page.locator('#report-filter [name="to"]').fill("2026-10-10");
  await page.locator("#report-filter button.primary").click();
  await page
    .locator("#editor-error")
    .filter({ hasText: "Ngày bắt đầu" })
    .waitFor();
  assert.equal(
    await page.locator('#report-filter [name="from"]').inputValue(),
    "2026-10-20",
  );
  pass("invalid date range has a readable error and preserves input");
  await navigate("cms-editor");
  await page.locator('#cms-filter [name="q"]').fill("Không tồn tại");
  await page.locator("#cms-filter button").click();
  await page.locator('#cms-filter [name="q"]').waitFor();
  await page.locator(".workspace-empty").waitFor();
  assert.equal(
    await page.locator('#cms-filter [name="q"]').inputValue(),
    "Không tồn tại",
  );
  pass("CMS empty result explains next steps and preserves filter");
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of [
      "reports-editor",
      "operations-editor",
      "cms-editor",
      "taxonomy-editor",
    ]) {
      await navigate(id);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        `${id} ${width}`,
      );
      if (id === "taxonomy-editor" && width <= 600) {
        const action = await page
          .locator("[data-tax-edit]")
          .first()
          .boundingBox();
        assert.ok(
          action.x >= 0 && action.x + action.width <= width,
          "taxonomy edit action stays visible without horizontal scroll",
        );
      }
      if (width <= 900)
        assert.equal(
          await page
            .locator("#admin-menu-toggle")
            .getAttribute("aria-expanded"),
          "false",
        );
      await page.evaluate(() => {
        document.activeElement?.blur();
        scrollTo(0, 0);
        document.querySelector("#notice").hidden = true;
      });
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: `${directory}/${id}-${width}.png`,
        fullPage: true,
      });
    }
  }
  pass(
    "four redesigned screens fit mobile/tablet/desktop; mobile navigation opens and closes after selection",
  );
  await page.goto(base + "/san-pham");
  await page.locator(".product-card").first().waitFor();
  assert.ok(
    (await page
      .locator(".product-card h3")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 14,
  );
  for (const width of [375, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.evaluate(() => {
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${directory}/storefront-${width}.png`,
      fullPage: true,
    });
  }
  pass("storefront has readable product titles and no horizontal overflow");
  assert.deepEqual(errors, []);
  pass("no browser JavaScript exceptions");
  console.log(`Usability browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
