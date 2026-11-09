import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
const out = "docs/screenshots/admin-catalog-layout";
let app, browser;
try {
  await mkdir(out, { recursive: true });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  await createAuth(db.pool).ensureAdmin({
    email: "catalog@example.test",
    phone: "0987654321",
    name: "Admin kiểm thử",
    password: "Catalog-Fixture-2026!",
  });
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
  await page.locator("#identifier").fill("catalog@example.test");
  await page.locator("#password").fill("Catalog-Fixture-2026!");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/quan-tri");
  async function navigate(section) {
    const menu = page.locator("#admin-menu-toggle");
    if (await menu.isVisible()) await menu.click();
    await page.locator(`[data-section="${section}"]`).click();
  }
  await navigate("taxonomy-editor");
  await page.locator('[data-editor-action="taxonomy-tab:attributes"]').click();
  const edit = page.locator("[data-tax-edit]").first();
  await edit.click();
  const form = page.locator('[data-tax-kind="attributes"]');
  const oldName = await form.locator('[name="name"]').inputValue();
  const oldCount = await form.locator(".value-chips span").count();
  await form.locator("[data-new-value]").fill("Lựa chọn kiểm thử");
  await form.locator('[data-editor-action="attribute-value-add"]').click();
  await form.locator("[data-new-value]").last().fill("Bỏ lựa chọn này");
  await form
    .locator('[data-editor-action="attribute-value-remove"]')
    .last()
    .click();
  await form.locator("button.primary").click();
  await page
    .locator('[data-editor-action="taxonomy-tab:attributes"]')
    .waitFor();
  await page
    .getByRole("button", { name: "Sửa " + oldName, exact: true })
    .click();
  assert.equal(await form.locator(".value-chips span").count(), oldCount + 1);
  assert.equal(
    await form
      .locator(".value-chips")
      .getByText("Lựa chọn kiểm thử", { exact: true })
      .count(),
    1,
  );
  await page.locator('[data-editor-action="taxonomy-cancel"]').click();
  await page.locator("[data-tax-search]").fill("không có kết quả nào");
  assert.ok(await page.locator(".taxonomy-search-empty").isVisible());
  await page.locator("[data-tax-search]").fill("");
  await navigate("catalog-editor");
  await page.locator("[data-product-id]").first().click();
  const savedLine = page.locator(".sku-line").first();
  await savedLine.locator("summary").click();
  const savedSelector = savedLine.locator("[data-sku-attribute]").first();
  const chosenValue = await savedSelector
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await savedSelector.selectOption(chosenValue);
  const savedResponse = page.waitForResponse(
    (r) => r.url().includes("/variants") && r.request().method() === "POST",
  );
  await page.locator("#sku-form button.primary").click();
  assert.equal((await savedResponse).status(), 200);
  await page.waitForFunction(
    (value) =>
      document
        .querySelector('.sku-line [name="attributes"]')
        ?.value.split(",")
        .includes(value),
    chosenValue,
  );
  await page.reload();
  await page.locator("#admin-content h1").waitFor();
  await navigate("catalog-editor");
  await page.locator("[data-product-id]").first().click();
  assert.ok(
    (await page.locator('.sku-line [name="attributes"]').first().inputValue())
      .split(",")
      .includes(chosenValue),
    "named selection persists after reload",
  );
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await navigate("taxonomy-editor");
    await page
      .locator('[data-editor-action="taxonomy-tab:attributes"]')
      .click();
    await page.locator("[data-tax-edit]").first().click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `taxonomy overflow ${width}`,
    );
    if (width <= 600) {
      assert.equal(
        await page
          .locator(".taxonomy-layout .table-wrap")
          .evaluate((el) => getComputedStyle(el).maxHeight),
        "none",
        "mobile cards do not clip values",
      );
    }
    await page.locator("[name=name]").first().blur();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${out}/attributes-${width}.png`,
      fullPage: true,
    });
    await navigate("catalog-editor");
    await page.locator("[data-product-id]").first().click();
    const matrix = page.locator("#sku-matrix");
    await matrix.locator("..").locator("summary").click();
    await matrix.locator("input[type=checkbox]").first().check();
    const initialCount = await page.locator(".sku-line").count();
    await page.locator('[data-editor-action="generate-matrix"]').click();
    const generatedCount = await page.locator(".sku-line").count();
    await page.locator('[data-editor-action="generate-matrix"]').click();
    assert.equal(
      await page.locator(".sku-line").count(),
      generatedCount,
      "no duplicate combinations",
    );
    assert.ok(generatedCount >= initialCount);
    const line = page.locator(".sku-line").last();
    await line.locator("summary").click();
    const selector = line.locator("[data-sku-attribute]").first();
    const value = await selector.locator("option").nth(1).getAttribute("value");
    await selector.selectOption(value);
    assert.ok(
      (await line.locator('[name="attributes"]').inputValue())
        .split(",")
        .includes(value),
    );
    await matrix.locator("..").locator("summary").click();
    await line.locator("summary").click();
    await page.locator("#product-variants").scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `product overflow ${width}`,
    );
    await page.screenshot({ path: `${out}/sku-${width}.png` });
    console.log(
      `PASS: attribute editor, readable SKU controls and no overflow at ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/README.md`,
    "# Catalog UI verification\n\nAll screenshots use an isolated fixture schema, never customer data. Widths: 320, 375, 768, 1440, 1920. Attribute add/remove-before-save, preservation of saved values, cancel, search, duplicate-safe SKU generation and name-based attribute selection verified.\n",
  );
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
