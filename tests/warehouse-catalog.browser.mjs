import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createCatalog } from "../lib/catalog.mjs";
import { createWarehouseCatalog } from "../lib/warehouse-catalog.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase(),
  out = "docs/screenshots/warehouse-catalog";
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const admin = await createAuth(db.pool).ensureAdmin({
    name: "Admin kho fixture",
    email: "warehouse-ui@example.test",
    phone: "0987654321",
    password: "Warehouse-UI-Fixture-2026!",
  });
  const catalog = createCatalog(db.pool),
    warehouse = createWarehouseCatalog(db.pool);
  let p = await catalog.save(
    null,
    {
      name: "Sản phẩm thử 3 lựa chọn",
      slug: "fixture-3-lua-chon",
      categoryIds: [1],
    },
    admin.id,
  );
  p = await catalog.variants(
    p.id,
    {
      version: p.version,
      variants: [1, 2, 3].map((i) => ({
        name: "Loại " + i,
        sku: "WAREHOUSE-UI-" + i,
        weight: "Quy cách " + i,
        price: 100000 * i,
        originalPrice: 100000 * i,
      })),
    },
    admin.id,
  );
  const images = (
    await db.pool.query(
      "SELECT DISTINCT url FROM product_media ORDER BY url LIMIT 3",
    )
  ).rows.map((x) => x.url);
  assert.equal(images.length, 3);
  for (let i = 0; i < 3; i++)
    await db.pool.query(
      "INSERT INTO product_media(product_id,variant_id,url,sort_order,alt_text) VALUES($1,$2,$3,$4,$5)",
      [p.id, p.variants[i].id, images[i], i, "Ảnh loại " + (i + 1)],
    );
  p = await catalog.save(
    p.id,
    {
      version: p.version,
      name: p.name,
      slug: p.slug,
      description: "Sản phẩm thử kiểm chứng ảnh, giá và tồn theo SKU.",
      categoryIds: [1],
      status: "active",
    },
    admin.id,
  );
  const w1 = await warehouse.saveWarehouse(
      null,
      { name: "Kho Hà Nội · fixture" },
      admin.id,
    ),
    w2 = await warehouse.saveWarehouse(
      null,
      { name: "Kho TP.HCM · fixture" },
      admin.id,
    );
  for (let i = 0; i < 3; i++) {
    await warehouse.stock(
      w1.id,
      p.variants[i].id,
      {
        quantity: 5 + i,
        price: 100000 * (i + 1),
        originalPrice: 100000 * (i + 1),
        reason: "Nhập tồn UI fixture",
      },
      admin.id,
      "POST",
    );
    await warehouse.stock(
      w2.id,
      p.variants[i].id,
      {
        quantity: 2 + i,
        price: 90000 * (i + 1),
        originalPrice: 100000 * (i + 1),
        reason: "Nhập tồn UI fixture",
      },
      admin.id,
      "POST",
    );
  }
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
  await page.locator("#identifier").fill("warehouse-ui@example.test");
  await page.locator("#password").fill("Warehouse-UI-Fixture-2026!");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  async function navigate() {
    if (await page.locator("#admin-menu-toggle").isVisible())
      await page.locator("#admin-menu-toggle").click();
    await page.locator('[data-section="warehouse-editor"]').click();
    await page.locator(".warehouse-workbench h1").waitFor();
  }
  await navigate();
  await page.locator(`[data-warehouse-select="${w1.id}"]`).click();
  await page.locator("[data-warehouse-edit]").first().waitFor();
  await page.locator(`[data-warehouse-edit="${p.variants[0].id}"]`).click();
  const form = page.locator("#warehouse-stock-form");
  await form.locator("[name=quantity]").fill("11");
  await form.locator("[name=price]").fill("120000");
  await form.locator("[name=originalPrice]").fill("150000");
  await form.locator("[name=reason]").fill("Điều chỉnh fixture qua giao diện");
  await form.locator("button.primary").click();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-warehouse-row]")
      ?.textContent.includes("120.000"),
  );
  assert.equal(
    (await warehouse.list(w2.id)).items.find(
      (x) => x.variant_id === p.variants[0].id,
    ).price,
    90000,
    "warehouse B price is independent",
  );
  await page.locator(`[data-warehouse-edit="${p.variants[0].id}"]`).click();
  await form.locator("[name=stockMode]").selectOption("receive");
  assert.equal(await form.locator("[name=quantity]").inputValue(), "");
  await form.locator("[name=quantity]").fill("2");
  await form.locator("[name=reason]").fill("Nhập thêm fixture qua giao diện");
  await form.locator("button.primary").click();
  await page.waitForFunction(
    () =>
      document.querySelector(".warehouse-stock-counts b")?.textContent === "13",
  );
  await page.locator(".warehouse-workbench summary").first().click();
  await page
    .locator("#warehouse-form [name=name]")
    .fill("Kho mới từ giao diện");
  await page.locator("#warehouse-form button.primary").click();
  await page
    .getByRole("heading", { name: "Kho mới từ giao diện", exact: true })
    .waitFor();
  await page.locator("#warehouse-stock-form").waitFor();
  await form.locator("[name=productId]").selectOption(String(p.id));
  await form.locator("[name=variantId]").selectOption(String(p.variants[0].id));
  assert.equal(
    await form.locator("[name=variantId] option").count(),
    4,
    "SKU picker is scoped to one parent",
  );
  await form.locator("[name=quantity]").fill("3");
  await form.locator("[name=price]").fill("110000");
  await form.locator("[name=originalPrice]").fill("150000");
  await form.locator("[name=reason]").fill("Nhập kho mới fixture");
  await form.locator("button.primary").click();
  await page.locator("[data-warehouse-row]").waitFor();
  page.once("dialog", (d) => d.dismiss());
  await page.locator("[data-warehouse-remove]").first().click();
  assert.equal(await page.locator("[data-warehouse-row]").count(), 1);
  const dialogs = (d) =>
    d.type() === "confirm" ? d.accept() : d.accept("Xóa khỏi kho fixture");
  page.on("dialog", dialogs);
  await page.locator(".warehouse-product-tools summary").click();
  await page.locator("[data-warehouse-product-remove]").click();
  await page.waitForFunction(
    () => !document.querySelector("[data-warehouse-row]"),
  );
  page.off("dialog", dialogs);
  assert.equal((await warehouse.list(w1.id)).items.length, 3);
  await mkdir(out, { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await navigate();
    await page.locator(`[data-warehouse-select="${w1.id}"]`).click();
    await page.locator("[data-warehouse-row]").first().waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `warehouse layout ${width}`,
    );
    await page.screenshot({
      path: `${out}/warehouse-${width}.png`,
      fullPage: true,
    });
    await page.goto(base + "/san-pham/warehouse-ui-1");
    await page.locator("#main[data-hydrated=true]").waitFor();
    for (let i = 0; i < 3; i++) {
      await page.locator(`[data-variant="${p.variants[i].id}"]`).click();
      await page.waitForURL("**/san-pham/warehouse-ui-" + (i + 1));
      await page.locator("#main[data-hydrated=true]").waitFor();
      await page.waitForFunction(
        (id) =>
          document.querySelector("#main")?.getAttribute("aria-busy") !==
            "true" &&
          document
            .querySelector(`[data-variant="${id}"]`)
            ?.getAttribute("aria-checked") === "true",
        p.variants[i].id,
      );
      assert.equal(
        await page.locator("#detail-image").getAttribute("src"),
        images[i],
      );
      assert.ok(
        (await page.locator(".detail-pricing strong").textContent()).includes(
          (90000 * (i + 1)).toLocaleString("vi-VN"),
        ),
      );
      assert.ok(
        (await page.locator(".detail-meta").textContent()).includes(
          "WAREHOUSE-UI-" + (i + 1),
        ),
      );
    }
    assert.equal(await page.locator("[data-variant]").count(), 3);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `SKU layout ${width}`,
    );
    await page.screenshot({
      path: `${out}/sku-choice-${width}.png`,
      fullPage: true,
    });
    await page.goto(base + "/quan-tri");
    await page.locator("#admin-content h1").waitFor();
    console.log(
      `PASS: per-warehouse prices/stock, three SKU images and responsive ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/README.md",
    "All products, warehouses and prices in these screenshots are isolated fixtures. Verified UI create warehouse, product-scoped SKU picker, edit stock/price, cancel/delete a warehouse product, other warehouse preservation, and three distinct SKU images/prices across 320/375/768/1440/1920px.\n",
  );
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
