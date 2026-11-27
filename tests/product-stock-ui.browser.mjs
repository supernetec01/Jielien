import { randomBytes } from "node:crypto";
import { openAdminView } from "./support/admin-navigation.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createCatalog } from "../lib/catalog.mjs";
import { createWarehouseCatalog } from "../lib/warehouse-catalog.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";

const db = await createTestDatabase();
const out = "docs/screenshots/product-stock-ui";
const password = randomBytes(24).toString("base64url");
let app, browser;
try {
  await mkdir(out, { recursive: true });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const admin = await createAuth(db.pool).ensureAdmin({
    email: "product-stock-ui@example.test",
    phone: "0987654321",
    name: "Admin tồn UI",
    password,
  });
  const warehouse = createWarehouseCatalog(db.pool);
  const kho = await warehouse.saveWarehouse(null, { name: "Kho fixture nhập lúc tạo" }, admin.id);
  const catalog = createCatalog(db.pool);
  let other = await catalog.save(null, { name: "Sản phẩm khác trong kho", slug: "san-pham-khac-trong-kho", categoryIds: [1] }, admin.id);
  other = await catalog.variants(other.id, {
    version: other.version,
    variants: [{ name: "Mặc định", sku: "TON-UI-KHAC", price: 50000 }],
  }, admin.id);
  await warehouse.stock(kho.id, other.variants[0].id, { quantity: 7, reason: "Fixture kho khác" }, admin.id, "POST");
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/tai-khoan?redirect=/quan-tri");
  await page.locator("#identifier").fill("product-stock-ui@example.test");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  async function navigate(section) {
    const menu = page.locator("#admin-menu-toggle");
    if (await menu.isVisible()) await menu.click();
    await openAdminView(page, section);
  }

  // 1. Tạo sản phẩm mới kèm tồn lúc tạo.
  await navigate("catalog-editor");
  await page.locator('[data-editor-action="new-product"]').click();
  await page.locator("#product-form").waitFor();
  await page.locator('#product-basics [name="name"]').fill("Dây ràng kiểm thử tồn");
  await page.locator('#product-basics [name="categoryId"]').selectOption({ index: 1 });
  const skuLine = page.locator(".sku-line").first();
  await skuLine.locator('[name="sku"]').fill("TON-UI-1");
  await skuLine.locator('[name="price"]').fill("120000");
  await skuLine.locator("[data-opening-stock]").fill("15");
  await page.locator('#product-stock [name="openingWarehouse"]').selectOption(String(kho.id));
  await page.locator('.product-save-buttons button[value="draft"]').click();
  await page.locator("#product-stock .product-stock-table").waitFor();
  const product = (
    await db.pool.query("SELECT id FROM products WHERE slug='day-rang-kiem-thu-ton'")
  ).rows[0];
  assert.ok(product, "sản phẩm đã tạo");
  await page.waitForFunction(() =>
    document.querySelector(".sku-line [data-stock-available]")?.textContent === "15",
  );
  assert.ok(
    (await page.locator("#product-stock .product-stock-table").textContent()).includes("Kho fixture nhập lúc tạo"),
    "mục Tồn kho hiển thị đúng kho đã chọn",
  );
  const opening = (
    await db.pool.query(
      "SELECT quantity_change,movement_type FROM inventory_movements WHERE reference_type='product_created' AND reference_id=$1",
      [String(product.id)],
    )
  ).rows;
  assert.deepEqual(opening, [{ quantity_change: 15, movement_type: "opening" }]);
  await page.screenshot({ path: `${out}/editor-after-create-1440.png`, fullPage: true });

  // 2. Sửa tồn nhanh từ dòng SKU: đặt số mới, lưu riêng không mất thay đổi form.
  await page.locator('#product-basics [name="name"]').fill("Dây ràng kiểm thử tồn (đang sửa dở)");
  await page.locator('.sku-line [data-editor-action^="product-stock-edit:"]').first().click();
  const dialog = page.locator("#quick-stock-dialog");
  await dialog.waitFor({ state: "visible" });
  assert.ok((await dialog.locator("[data-stock-current]").textContent()).includes("15"));
  await dialog.locator('[name="quantity"]').fill("20");
  await dialog.locator('[name="reason"]').fill("Kiểm kê đầu ca fixture");
  await page.screenshot({ path: `${out}/quick-stock-dialog-1440.png` });
  await dialog.locator("button.primary").click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".sku-line [data-stock-available]")?.textContent === "20",
  );
  assert.equal(
    await page.locator('#product-basics [name="name"]').inputValue(),
    "Dây ràng kiểm thử tồn (đang sửa dở)",
    "sửa tồn không xóa thay đổi chưa lưu của form sản phẩm",
  );

  // 3. Nhập thêm (receive) cộng dồn đúng.
  await page.locator('.sku-line [data-editor-action^="product-stock-edit:"]').first().click();
  await dialog.waitFor({ state: "visible" });
  await dialog.locator('[name="mode"]').selectOption("receive");
  assert.equal(await dialog.locator('[name="quantity"]').inputValue(), "");
  await dialog.locator('[name="quantity"]').fill("2");
  await dialog.locator('[name="reason"]').fill("Nhập thêm fixture");
  await dialog.locator("button.primary").click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".sku-line [data-stock-available]")?.textContent === "22",
  );

  // 4. Lý do ngắn bị chặn ngay trong dialog.
  await page.locator('#product-stock [data-editor-action^="product-stock-edit:"]').first().click();
  await dialog.waitFor({ state: "visible" });
  await dialog.locator('[name="reason"]').fill("ab");
  await dialog.locator("button.primary").click();
  assert.ok(
    (await dialog.locator("[data-stock-error]").textContent()).includes("3 ký tự"),
    "báo lỗi lý do ngắn",
  );
  await dialog.locator('[data-editor-action="product-stock-cancel"]').last().click();
  await dialog.waitFor({ state: "hidden" });
  const adjustments = (
    await db.pool.query(
      "SELECT quantity_change,reason FROM inventory_movements WHERE movement_type='adjustment' AND reference_type='warehouse_catalog' AND variant_id=(SELECT id FROM product_variants WHERE sku='TON-UI-1') ORDER BY id",
    )
  ).rows;
  assert.deepEqual(adjustments, [
    { quantity_change: 5, reason: "Kiểm kê đầu ca fixture" },
    { quantity_change: 2, reason: "Nhập thêm fixture" },
  ]);

  // 5. Màn Kho: lọc theo sản phẩm thu hẹp đúng dòng.
  await navigate("warehouse-editor");
  await page.locator(`[data-warehouse-select="${kho.id}"]`).click();
  await page.locator("[data-warehouse-row]").first().waitFor();
  const filter = page.locator("[data-warehouse-product-filter]");
  await filter.selectOption(String(product.id));
  await page.waitForFunction(() =>
    document.querySelectorAll("[data-warehouse-row]:not([hidden])").length === 1,
  );
  const visible = await page.locator("[data-warehouse-row]:not([hidden])").count();
  assert.equal(visible, 1, "lọc theo sản phẩm chỉ còn SKU của sản phẩm đó");
  assert.ok(
    (await page.locator("[data-warehouse-row]:not([hidden])").textContent()).includes("TON-UI-1"),
  );
  await page.locator("[data-warehouse-search]").fill("không-tồn-tại");
  await page.locator("[data-warehouse-filter-empty]").waitFor({ state: "visible" });
  await page.locator("[data-warehouse-search]").fill("");
  await filter.selectOption("");
  await page.screenshot({ path: `${out}/warehouse-filter-1440.png`, fullPage: true });

  // 6. Responsive: không tràn ngang ở các khổ bắt buộc.
  await navigate("catalog-editor");
  await page.locator(`[data-product-id="${product.id}"]`).click();
  await page.locator("#product-stock .product-stock-table").waitFor();
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `tràn ngang ở ${width}px`);
    await page.screenshot({ path: `${out}/editor-stock-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('.sku-line [data-editor-action^="product-stock-edit:"]').first().click();
  await dialog.waitFor({ state: "visible" });
  await page.screenshot({ path: `${out}/quick-stock-dialog-375.png` });
  await dialog.locator('[data-editor-action="product-stock-cancel"]').last().click();

  assert.deepEqual(errors, [], "không có lỗi runtime");
  console.log("PASS: nhập tồn lúc tạo, sửa tồn nhanh, lọc kho theo sản phẩm và responsive 320–1920px");
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}