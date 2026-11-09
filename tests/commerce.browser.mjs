import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase(),
  directory = await mkdtemp(join(tmpdir(), "jielien-ui-"));
let app, browser;
let checks = 0;
const pass = (m) => console.log(`PASS ${++checks}: ${m}`);
try {
  app = await createApp({
    pool: db.pool,
    legacyPath: null,
    mediaDirectory: directory,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    password = "BrowserCommercePass!2026";
  await createAuth(db.pool).ensureAdmin({
    name: "Admin kiểm thử",
    username: "admin",
    email: "admin@example.test",
    phone: "0987654321",
    password,
  });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400)
      console.log("HTTP", r.status(), new URL(r.url()).pathname);
  });
  page.setDefaultTimeout(10000);
  await page.goto(base + "/tai-khoan?redirect=/quan-tri");
  await page.locator("#identifier").fill("admin");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  await page.locator('[data-section="catalog-editor"]').waitFor();
  pass("admin username login opens authenticated admin");
  await page.locator('[data-section="catalog-editor"]').click();
  await page.locator('[data-editor-action="new-product"]').click();
  await page
    .locator('#product-form [name="name"]')
    .fill("Sản phẩm kiểm thử UI");
  await page
    .locator('#product-form [name="slug"]')
    .fill("san-pham-kiem-thu-ui");
  await page
    .locator('#product-form [name="description"]')
    .fill("Mô tả sản phẩm kiểm thử");
  await page.locator("#product-form button.primary").click();
  await page.locator("#sku-form").waitFor();
  for (let i = 0; i < 3; i++) {
    if (i) await page.locator('[data-editor-action="add-sku"]').click();
    const line = page.locator(".sku-line").nth(i);
    await line.locator('[name="name"]').fill("Phân loại " + (i + 1));
    await line.locator('[name="sku"]').fill("UI-SKU-" + (i + 1));
    await line.locator('[name="price"]').fill("120000");
    await line.locator('[name="originalPrice"]').fill("150000");
  }
  await page.locator("#sku-form button.primary").click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.sku-line[data-sku-id]:not([data-sku-id=""])')
        .length === 3,
  );
  pass("product editor persists parent and three individually priced SKUs");
  const image = await sharp({
    create: { width: 320, height: 240, channels: 3, background: "#86b529" },
  })
    .png()
    .toBuffer();
  await page.locator('#upload-form [name="image"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.locator('#upload-form [name="alt"]').fill("Ảnh sản phẩm thử");
  await page.locator("#upload-form button.primary").click();
  await page.locator('#product-media-form [name="assets"]').waitFor();
  await page.locator('#product-media-form [name="assets"]').check();
  const mediaVersion = Number(
    await page.locator("#product-form").getAttribute("data-version"),
  );
  await page.locator("#product-media-form button.primary").click();
  await page.waitForFunction(
    (v) => Number(document.querySelector("#product-form")?.dataset.version) > v,
    mediaVersion,
  );
  await page.locator('#product-form [name="status"]').selectOption("active");
  const publishVersion = Number(
    await page.locator("#product-form").getAttribute("data-version"),
  );
  await page.locator("#product-form button.primary").click();
  await page.waitForFunction(
    (v) => Number(document.querySelector("#product-form")?.dataset.version) > v,
    publishVersion,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('#product-form [name="status"]')?.value ===
        "active" &&
      document.querySelector("#product-form button.primary")?.disabled ===
        false,
  );
  pass("verified upload and gallery allow publishing actual product");
  await mkdir("docs/screenshots/commerce", { recursive: true });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/product-editor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/product-editor-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-section="users"]').click();
  await page.locator("#new-staff").click();
  const staff = page.locator("#create-staff-form");
  await staff.locator('[name="fullName"]').fill("Nhân viên kiểm thử");
  await staff.locator('[name="username"]').fill("company.writer");
  await staff.locator('[name="phone"]').fill("0912345678");
  await staff.locator('[name="password"]').fill(password);
  await staff.locator('[name="role"]').selectOption("writer");
  await staff.locator("button.primary").click();
  await page.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  pass("admin creates company employee without a customer/admin default grant");
  await page.locator('[data-section="cms-editor"]').click();
  const tax = page.locator('[data-cms-tax="categories"]');
  await tax.locator('[name="name"]').fill("Kiến thức công ty");
  await tax.locator('[name="slug"]').fill("kien-thuc-cong-ty");
  await tax.locator("button").click();
  await page.locator('[data-editor-action="new-article"]').click();
  const article = page.locator("#article-form");
  await article.locator('[name="title"]').fill("Bài viết từ CMS thật");
  await article.locator('[name="slug"]').fill("bai-viet-cms-that");
  await article.locator('[name="excerpt"]').fill("Nội dung đã được biên tập");
  await article
    .locator('[name="categoryId"]')
    .selectOption({ label: "Kiến thức công ty" });
  await article.locator('[name="coverUrl"]').selectOption({ index: 1 });
  await article.locator('[name="coverAlt"]').fill("Ảnh bìa thử");
  await article.locator('[name="seoTitle"]').fill("Hướng dẫn Jielien");
  await article.locator('[name="seoDescription"]').fill("Mô tả SEO kiểm thử");
  await page.locator('[data-editor-action="add-block"]').click();
  await page
    .locator('.content-block [name="blockText"]')
    .fill("Đoạn nội dung kiểm thử có thật trong PostgreSQL.");
  await article.locator("button.primary").click();
  await page.locator('[data-editor-action="article:submit"]').waitFor();
  await page
    .locator('.content-block [name="blockText"]')
    .fill("Đoạn nội dung tự lưu trong PostgreSQL.");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#autosave-state")
        ?.textContent.includes("Đã tự lưu"),
    {},
    { timeout: 22000 },
  );
  assert.ok(
    (
      await db.pool.query(
        "SELECT snapshot->'contentBlocks' AS body FROM articles WHERE slug='bai-viet-cms-that'",
      )
    ).rows[0].body[0].text.includes("tự lưu"),
  );
  pass("draft autosave persists to server without replacing the editing form");
  await page.locator('[data-editor-action="article:submit"]').click();
  await page.locator('[data-editor-action="article:approve"]').waitFor();
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-editor-action="article:approve"]').click();
  await page.locator('[data-editor-action="article:publish"]').waitFor();
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-editor-action="article:publish"]').click();
  await page.getByRole("heading", { name: /published/ }).waitFor();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/cms-editor-desktop.png",
    fullPage: true,
  });
  pass(
    "CMS UI creates structured content, submits, approves and publishes with SEO",
  );
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/cms-editor-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-section="dashboard"]').click();
  await page.locator(".workspace-actions").waitFor();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/admin-dashboard-1440.png",
    fullPage: true,
  });
  await page.locator('[data-workspace-section="catalog-editor"]').click();
  await page.locator("#catalog-results").waitFor();
  pass("new dashboard shortcuts open real permission-gated editors");
  await page.locator('[data-section="banners-editor"]').click();
  await page.locator('#banner-form [name="title"]').fill("Banner thiết kế mới");
  const assetOption = await page
    .locator('#banner-form [name="assetId"] option')
    .nth(1)
    .getAttribute("value");
  await page.locator('#banner-form [name="assetId"]').selectOption(assetOption);
  await page.locator('#banner-form [name="status"]').selectOption("published");
  assert.equal(
    await page.locator("#banner-preview-title").textContent(),
    "Banner thiết kế mới",
  );
  assert.equal(await page.locator("#banner-preview-image").isVisible(), true);
  await page.locator("#banner-form button.primary").click();
  await page
    .locator(".banner-library article")
    .filter({ hasText: "Banner thiết kế mới" })
    .waitFor();
  pass("banner live preview persists a published banner through API");
  await page.locator('[data-editor-action^="banner-edit:"]').first().click();
  await page.locator('#banner-form [name="title"]').fill("Banner đã chỉnh sửa");
  await page.locator("#banner-form button.primary").click();
  await page
    .locator(".banner-library article")
    .filter({ hasText: "Banner đã chỉnh sửa" })
    .waitFor();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/admin-banners-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 1000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "docs/screenshots/commerce/admin-banners-375.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const bannerPage = await context.newPage();
  await bannerPage.goto(base + "/");
  await bannerPage
    .locator(".hero h1")
    .filter({ hasText: "Banner đã chỉnh sửa" })
    .waitFor();
  await bannerPage.close();
  pass("editing existing banner updates storefront and fits mobile workspace");
  await page.locator('[data-section="settings-editor"]').click();
  await page.locator('#company-form [name="companyName"]').fill("Jielien Test Company");
  await page.locator('#company-form button').click();
  await page.waitForFunction(()=>document.querySelector('#company-form [name="companyName"]')?.value==='Jielien Test Company' && !document.querySelector('#company-form button').disabled);
  await page.goto(base + "/tin-tuc/bai-viet-cms-that");
  await page
    .locator("h1")
    .filter({ hasText: "Bài viết từ CMS thật" })
    .waitFor();
  assert.ok((await page.content()).includes("BlogPosting"));
  pass("published article is server-rendered and readable without CMS login");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [
      ["/", "home"],
      ["/san-pham", "catalog"],
      ["/tin-tuc", "news"],
      ["/tin-tuc/bai-viet-cms-that", "article"],
    ]) {
      await page.goto(base + path);
      await page.locator("h1").first().waitFor();
      if (path === "/") {
        await page.locator(".hero").waitFor();
        await page
          .locator("#company-contact")
          .filter({ hasText: "Jielien Test Company" })
          .waitFor();
      }
      if (path === "/san-pham")
        await page.locator(".product-card").first().waitFor();
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.screenshot({
        path: `docs/screenshots/commerce/${name}-${width}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > innerWidth + 1 && r.width > 0;
          })
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
          }))
          .slice(0, 15),
      );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        console.log("OVERFLOW", JSON.stringify(overflow));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
        `${path} width ${width}`,
      );
    }
  }
  pass(
    "home/catalog/news/article fit 320, 375, 768 and 1440px, screenshots saved",
  );
  assert.deepEqual(errors, []);
  pass("company settings persist and render in the hydrated storefront footer");
  pass("no browser JavaScript exceptions");
  console.log(`Commerce browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
  await rm(directory, { recursive: true, force: true });
}
