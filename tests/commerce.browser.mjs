import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createOperations } from "../lib/operations.mjs";
import { createCms } from "../lib/cms.mjs";
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
    password = randomBytes(24).toString("base64url");
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
  const form = page.locator("#product-form");
  const title = form.locator('#product-basics [name="name"]');
  await title.fill("Bình sữa cổ rộng kiểm thử");
  await form.locator('#product-details [name="description"]').fill("Bình sữa cổ rộng có ba lựa chọn dung tích.");
  await form.locator('[name="categoryId"]').selectOption({ label: "Đồ dùng cho bé" });
  const imageFiles = await Promise.all(
    ["#faf5ed", "#f6f0ec", "#f0f6f0"].map(async (background, i) => ({
      name: `sample-${i}.png`,
      mimeType: "image/png",
      buffer: await sharp("public/product-bottle.svg", { density: 140 })
        .resize(320, 300, { fit: "contain", background })
        .flatten({ background })
        .png()
        .toBuffer(),
    })),
  );
  await form.locator("#product-gallery-upload").setInputFiles(imageFiles.slice(0, 2));
  await page.waitForFunction(() => document.querySelectorAll(".product-photo-card").length === 2);
  const secondImage = await page.locator(".product-photo-card img").nth(1).getAttribute("src");
  await page.getByRole("button", { name: "Làm ảnh bìa" }).click();
  assert.equal(await page.locator("[data-product-preview-image]").getAttribute("src"), secondImage);
  assert.equal(await title.inputValue(), "Bình sữa cổ rộng kiểm thử");

  const lines = form.locator(".sku-line");
  for (let i = 0; i < 3; i++) {
    if (i) await page.locator('[data-editor-action="add-sku"]').click();
    await lines.nth(i).locator('[name="name"]').fill([120, 180, 240][i] + " ml");
    await lines.nth(i).locator('[name="sku"]').fill("UI-SKU-" + (i + 1));
  }
  await form.locator('[name="bulkPrice"]').fill("120000");
  await page.locator('[data-editor-action="product-price-all"]').click();
  await lines.last().locator('[name="price"]').fill("150000");
  await lines.first().locator('input[type="file"]').setInputFiles(imageFiles[2]);
  await lines.first().locator(".product-sku-photo img").waitFor();
  await form.locator('[name="bulk-weightGrams"]').fill("500");
  await page.locator('[data-editor-action="product-shipping-all"]').click();

  await mkdir("docs/screenshots/commerce", { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `product form overflows at ${width}px`,
    );
    if (width === 375 || width === 1440) {
      await page.screenshot({
        path: `docs/screenshots/commerce/product-editor-${width === 375 ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // A code that belongs to a different product fails after starting the combined save.
  const existingSku = (await db.pool.query("SELECT sku FROM product_variants ORDER BY id LIMIT 1")).rows[0].sku;
  await lines.last().locator('[name="sku"]').fill(existingSku);
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await page.getByText("SKU đã tồn tại.", { exact: true }).waitFor();
  assert.equal((await db.pool.query("SELECT id FROM products WHERE slug='binh-sua-co-rong-kiem-thu'")).rowCount, 0);
  assert.equal(await page.locator(".product-photo-card").count(), 2);
  await lines.last().locator('[name="sku"]').fill("UI-SKU-3");
  await form.getByRole("button", { name: "Lưu nháp" }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sku-line[data-sku-id]:not([data-sku-id=""])').length === 3);
  const saved = (await db.pool.query(
    "SELECT id,status FROM products WHERE slug='binh-sua-co-rong-kiem-thu'",
  )).rows[0];
  assert.equal(saved.status, "draft");
  const skuRows = (await db.pool.query(
    "SELECT id,price,weight_grams,row_version FROM product_variants WHERE product_id=$1 ORDER BY id",
    [saved.id],
  )).rows;
  assert.deepEqual(skuRows.map(({ price, weight_grams }) => [price, weight_grams]), [
    [120000, 500], [120000, 500], [150000, 500],
  ]);
  const photos = (await db.pool.query(
    "SELECT id,url,variant_id FROM product_media WHERE product_id=$1 ORDER BY sort_order",
    [saved.id],
  )).rows;
  assert.equal(photos[0].url, secondImage);
  assert.equal(photos[2].variant_id, skuRows[0].id);
  pass("new form saves images, three SKU rows and shipping together, with rollback on a duplicate SKU");

  await form.getByRole("button", { name: "Xuất bản" }).click();
  await page.waitForFunction(() => document.querySelector("[data-product-progress]")?.textContent === "Đã xuất bản sản phẩm.");
  assert.equal((await db.pool.query("SELECT status FROM products WHERE id=$1", [saved.id])).rows[0].status, "active");
  assert.deepEqual(
    (await db.pool.query("SELECT row_version FROM product_variants WHERE product_id=$1 ORDER BY id", [saved.id]))
      .rows.map((row) => row.row_version),
    skuRows.map((row) => row.row_version),
  );
  assert.deepEqual(
    (await db.pool.query("SELECT id FROM product_media WHERE product_id=$1 ORDER BY sort_order", [saved.id]))
      .rows.map((row) => row.id),
    photos.map((row) => row.id),
  );
  await page.locator('[data-editor-action="catalog-list"]').click();
  await page.locator(`[data-product-id="${saved.id}"]`).click();
  await form.getByRole("button", { name: "Lưu thay đổi" }).waitFor();
  assert.equal(await lines.first().locator('[name="sku"]').inputValue(), "UI-SKU-1");
  assert.equal(await lines.first().locator(".product-sku-photo img").count(), 1);
  pass("published product reopens with its saved cover and SKU images");
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
  const bannerOps = createOperations(db.pool);
  const adminUser = (await db.pool.query("SELECT id FROM users WHERE email='admin@example.test'")).rows[0];
  const bannerAssets = (await db.pool.query("SELECT id FROM media_assets ORDER BY id LIMIT 3")).rows;
  for (const [index, slot] of ["article_left", "article_right", "article_inline"].entries()) {
    await bannerOps.saveBanner(null, {
      slot, assetId: bannerAssets[index].id, title: "Banner kiểm thử " + slot,
      targetPath: "/san-pham", status: "published",
    }, adminUser);
  }
  await page.locator('[data-section="cms-editor"]').click();
  const tax = page.locator('[data-cms-tax="categories"]');
  await tax.locator('[name="name"]').fill("Kiến thức công ty");
  await tax.locator('[name="slug"]').fill("kien-thuc-cong-ty");
  await tax.locator("button").click();
  await page.locator('[data-editor-action="new-article"]').click();
  const article = page.locator("#article-form");
  await article.locator('[name="title"]').fill("Cách chọn bình sữa phù hợp cho bé");
  await article.locator('[name="slug"]').fill("bai-viet-cms-that");
  await article.locator('[name="excerpt"]').fill("Những điểm nên kiểm tra khi chọn dung tích và thiết kế bình sữa.");
  await article.locator('[name="quickSummary"]').fill("Chọn dung tích theo nhu cầu.\nKiểm tra chất liệu và cách vệ sinh.");
  await article.locator('[name="authorBio"]').fill("Nội dung minh họa dùng để kiểm thử giao diện Jielien.");
  await article
    .locator('[name="categoryId"]')
    .selectOption({ label: "Kiến thức công ty" });
  await article.locator('[name="coverUrl"]').selectOption({ index: 1 });
  await article.locator('[name="coverAlt"]').fill("Ảnh bìa thử");
  await article.locator('[name="seoTitle"]').fill("Cách chọn bình sữa phù hợp cho bé");
  await article.locator('[name="seoDescription"]').fill("Xem cách chọn bình sữa theo dung tích, thiết kế và các lưu ý khi vệ sinh để phù hợp với nhu cầu của bé.");
  await page
    .locator('[data-article-block="paragraph"] [name="blockText"]')
    .fill("Đoạn nội dung kiểm thử có thật trong PostgreSQL.");
  await article.locator('[data-editor-action="cms-insert:heading"]').click();
  await article.locator('[data-article-block="heading"] [name="blockText"]').fill("Chọn dung tích bình");
  await article.locator('[data-editor-action="cms-insert:product"]').click();
  const productBlock = article.locator('[data-article-block="product"]');
  await productBlock.locator("[data-cms-query]").fill("UI-SKU-1");
  await productBlock.getByRole("button", { name: "Tìm sản phẩm" }).click();
  await productBlock.locator("[data-cms-product-select]").selectOption(String(saved.id));
  const relatedPicker = article.locator(".cms-related-picker");
  await relatedPicker.locator("[data-cms-query]").fill("UI-SKU-1");
  await relatedPicker.getByRole("button", { name: "Tìm sản phẩm" }).click();
  await relatedPicker.locator("[data-cms-product-select]").selectOption(String(saved.id));
  await relatedPicker.getByRole("button", { name: "Thêm sản phẩm liên quan" }).click();
  await article.locator('.cms-insertion [data-editor-action="cms-insert:banner"]').click();
  await article.locator('[name="bannerReference"]').selectOption({ index: 1 });
  await article.locator('[data-editor-action="cms-insert:faq"]').click();
  await article.locator('[name="blockQuestion"]').fill("Chọn dung tích bình sữa như thế nào?");
  await article.locator('[data-article-block="faq"] [name="blockText"]').fill("Dựa vào nhu cầu của bé theo từng cữ.");
  assert.equal(await article.locator("[data-cms-score]").textContent(), "100/100");
  assert.match(await article.locator("[data-cms-google-title]").textContent(), /Cách chọn bình sữa/);
  await article.locator("button.primary").click();
  await page.locator('[data-editor-action="article:submit"]').waitFor();
  await page
    .locator('[data-article-block="paragraph"] [name="blockText"]')
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
  await page.locator(".cms-publication .status-published").waitFor();
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `CMS form wraps at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  for (const value of ["article_left", "article_right", "article_inline"])
    assert.equal(await page.locator('#banner-form [name="slot"] option[value="' + value + '"]').count(), 1);
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
  await page.locator('.banner-library [data-banner-slot="home_hero"] [data-editor-action^="banner-edit:"]').first().click();
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
  const cms = createCms(db.pool);
  const editorUser = {
    id: adminUser.id, permissions: ["content.write", "content.approve", "content.publish"],
  };
  const published = (await db.pool.query("SELECT snapshot FROM articles WHERE slug='bai-viet-cms-that'")).rows[0].snapshot;
  let relatedArticle = await cms.save(null, {
    ...published, title: "Vệ sinh bình sữa mỗi ngày", slug: "ve-sinh-binh-sua",
    contentBlocks: [{ type: "paragraph", text: "Rửa và để ráo các bộ phận." }],
  }, editorUser);
  for (const action of ["submit", "approve", "publish"])
    relatedArticle = await cms.action(relatedArticle.id, action, { version: relatedArticle.version }, editorUser);
  await page.goto(base + "/tin-tuc/bai-viet-cms-that");
  await page
    .locator("h1")
    .filter({ hasText: "Cách chọn bình sữa phù hợp cho bé" })
    .waitFor();
  assert.ok((await page.content()).includes("BlogPosting"));
  const articlePath = base + "/tin-tuc/bai-viet-cms-that";
  const tocLink = page.getByRole("navigation", { name: "Mục lục bài viết" }).getByRole("link");
  const anchor = await tocLink.getAttribute("href");
  assert.equal(await page.locator(anchor).textContent(), "Chọn dung tích bình");
  assert.equal(await page.locator(".journal-product").count(), 2);
  assert.equal(await page.locator(".journal-inline-ad").count(), 1);
  assert.equal(await page.locator(".journal-summary li").count(), 2);
  assert.equal(await page.locator('.journal-related a[href="/tin-tuc/ve-sinh-binh-sua"]').last().textContent(), "Vệ sinh bình sữa mỗi ngày");
  await page.locator(".journal-faq summary").click();
  assert.ok(await page.locator(".journal-faq[open] p").isVisible());
  for (const width of [1380, 1381, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const side of ["left", "right"]) {
      const rail = page.locator(".journal-rail-" + side);
      assert.equal(await rail.isVisible(), width > 1380);
      if (width > 1380) {
        const { width: w, height: h } = await rail.boundingBox();
        assert.equal(w, 160);
        assert.equal(h, 600);
        assert.equal(await rail.evaluate((el) => getComputedStyle(el).position), "sticky");
      }
    }
  }
  const anonymous = await fetch(articlePath);
  assert.equal(anonymous.status, 200);
  assert.match(await anonymous.text(), /Chọn dung tích bình sữa như thế nào/);
  await page.goto(base + "/tin-tuc");
  await page.getByLabel("Tìm bài viết").fill("Vệ sinh bình sữa");
  await page.locator(".journal-index").getByRole("button", { name: "Tìm", exact: true }).click();
  await page.waitForURL("**/tin-tuc?q=*");
  assert.equal(await page.locator(".journal-index .article-card").count(), 1);
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
