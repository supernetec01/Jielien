import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";
import { createApp } from "../server.mjs";

// This test starts its own ephemeral server/database; ports 3000 and 3001 are untouched.
const playwrightModule = process.env.PLAYWRIGHT_MODULE || "playwright-core";
const { chromium } = await import(
  playwrightModule.startsWith("/")
    ? pathToFileURL(playwrightModule).href
    : playwrightModule
);
const temp = await mkdtemp(join(tmpdir(), "jielien-browser-"));
const catalog = JSON.parse(
  await readFile(new URL("../public/catalog.json", import.meta.url), "utf8"),
);
const app = await createApp({ dataDir: temp });
app.listen(0, "127.0.0.1");
await once(app, "listening");
const base = `http://127.0.0.1:${app.address().port}`;
let browser;
const errors = [],
  brokenAssets = [];
let checks = 0;
function passed(message) {
  checks++;
  console.log(`PASS ${checks}: ${message}`);
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === base &&
      !url.pathname.startsWith("/api/") &&
      response.status() >= 400
    )
      brokenAssets.push(`${response.status()} ${url.pathname}`);
  });
  const ready = async () =>
    page.waitForFunction(() => {
      const main = document.querySelector("#main");
      return (
        main &&
        !main.hasAttribute("aria-busy") &&
        !main.querySelector(".loading")
      );
    });
  const go = async (path) => {
    await page.goto(base + path);
    await ready();
  };
  const count = async (expected) => {
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll("#main .product-card").length === expected,
      expected,
    );
  };
  const cartCount = () => page.locator("#cart-count").textContent();
  const price = (value) => value.toLocaleString("vi-VN") + "đ";

  await go("/");
  assert.ok(await page.locator(".hero").isVisible());
  await page.locator('[data-hero="1"]').click();
  assert.ok(
    (await page.locator(".hero h1").textContent()).includes("Bé thoải mái"),
  );
  await page.locator("#category-menu").click();
  assert.equal(
    await page.locator("#category-menu").getAttribute("aria-expanded"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#category-dropdown").isVisible(), false);
  passed("homepage, banner switching and keyboard-close category menu");

  await page.locator("#search").fill("sua dinh duong");
  assert.ok(await page.locator("#suggestions").isVisible());
  await page.locator("#search").press("Enter");
  await page.waitForURL("**/san-pham?q=*");
  await ready();
  const searchMatches = catalog.filter((p) =>
    p.name.startsWith("Sữa dinh dưỡng"),
  );
  await count(searchMatches.length);
  assert.ok(
    await page
      .locator(".product-card")
      .first()
      .innerText()
      .then((text) => text.includes("Sữa dinh dưỡng")),
  );
  passed("Vietnamese search without accents returns matching products");

  await go("/san-pham");
  await count(12);
  await page
    .locator('[data-select-filter="category"]')
    .selectOption("Sữa cho bé");
  await ready();
  await count(catalog.filter((p) => p.category === "Sữa cho bé").length);
  await page
    .locator('[data-select-filter="brand"]')
    .selectOption("Little Grow");
  await ready();
  assert.ok(new URL(page.url()).searchParams.get("brand") === "Little Grow");
  await page.locator("#sort").selectOption("price-asc");
  await ready();
  const prices = await page
    .locator(".product-card .product-price")
    .allTextContents();
  const amounts = prices.map((p) => Number(p.replace(/\D/g, "")));
  assert.deepEqual(
    amounts,
    [...amounts].sort((a, b) => a - b),
  );
  await go("/san-pham");
  await page.locator('input[name="min"]').fill("100000");
  await page.locator('input[name="max"]').fill("200000");
  await page.locator("#price-filter button").click();
  await ready();
  const filteredPrices = await page
    .locator(".product-card .product-price")
    .allTextContents();
  assert.ok(filteredPrices.length > 0);
  assert.ok(
    filteredPrices.every((p) => {
      const value = Number(p.replace(/\D/g, ""));
      return value >= 100000 && value <= 200000;
    }),
  );
  passed("category/brand/price filters and ascending price sorting");

  await go("/san-pham");
  await page.locator(".pagination a").nth(1).click();
  await ready();
  await count(12);
  const page2Names = await page.locator(".product-card h3").allTextContents();
  assert.ok(page2Names.includes(catalog[12].name));
  await page.locator(".product-photo").first().click();
  await ready();
  assert.ok(new URL(page.url()).pathname.startsWith("/san-pham/"));
  await page.goBack();
  await ready();
  assert.equal(new URL(page.url()).searchParams.get("page"), "2");
  await count(12);
  passed("pagination and browser Back restore the listing route");

  const selected = catalog.find((p) => p.id === 1);
  await go("/san-pham/" + selected.slug);
  await page.reload();
  await ready();
  assert.equal(
    await page.locator(".detail-info h1").textContent(),
    selected.name,
  );
  await page.locator('[data-tab="specs"]').click();
  assert.equal(
    await page.locator('[data-tab="specs"]').getAttribute("aria-selected"),
    "true",
  );
  assert.ok(await page.locator(".spec-table").isVisible());
  await page.locator('[data-tab="notes"]').click();
  assert.ok(
    (await page.locator("#detail-tab-content").textContent()).includes(
      "Mẹ đọc kỹ",
    ),
  );
  await page.locator("#detail-quantity").fill("");
  assert.equal(
    await page
      .locator("#detail-quantity")
      .evaluate((input) => input.checkValidity()),
    false,
  );
  await page.locator('[data-detail-add="1"]').click();
  assert.equal(
    await cartCount(),
    "0",
    "blank product quantity must not alter cart",
  );
  await page.locator("#detail-quantity").fill("1");
  await page.locator('[data-detail-add="1"]').click();
  assert.equal(await cartCount(), "1");
  await go("/gio-hang");
  assert.equal(
    await page.locator("#grand-total").textContent(),
    price(selected.price + 25000),
  );
  await page.locator('[data-quantity="1"]').click();
  await ready();
  assert.equal(
    await page.locator("#grand-total").textContent(),
    price(selected.price * 2),
  );
  passed(
    "product direct reload, information tabs, cart quantity and server totals",
  );

  await page.locator("#coupon").fill("NOTREAL");
  await page.locator("#coupon-form button").click();
  await page.waitForFunction(
    () => document.querySelector("#coupon-error")?.textContent.length > 0,
  );
  assert.equal(
    await page.locator("#grand-total").textContent(),
    price(selected.price * 2),
  );
  await page.locator("#coupon").fill("MEBE50");
  await page.locator("#coupon-form button").click();
  await page.waitForFunction(
    () => document.querySelector("#grand-total")?.textContent === "800.000đ",
  );
  assert.ok(await page.locator("#remove-coupon").isVisible());
  passed(
    "invalid coupon preserves total and valid MEBE50 deducts exactly 50,000đ",
  );

  await page.locator('.summary a[href="/thanh-toan"]').click();
  await ready();
  const maliciousName = "<img src=x onerror=window.__xss=1>";
  await page.locator("#name").fill(maliciousName);
  await page.locator("#phone").fill("123");
  await page.locator("#email").fill("test@example.com");
  await page.locator("#province").fill("TP Hồ Chí Minh");
  await page.locator("#district").fill("Quận 1");
  await page.locator("#address").fill("123 Đường Kiểm Thử, Phường Mẫu");
  await page.locator("#note").fill("<script>window.__xss=2</script>");
  await page.locator('input[name="agreement"]').check();
  assert.equal(
    await page.locator("#phone").evaluate((input) => input.checkValidity()),
    false,
  );
  await page.locator("#place-order").click();
  assert.equal(new URL(page.url()).pathname, "/thanh-toan");
  assert.equal(await cartCount(), "2");
  await page.locator("#phone").fill("0912345678");
  assert.equal(
    await page
      .locator("#checkout-form")
      .evaluate((form) => form.checkValidity()),
    true,
  );
  await page.route("**/api/orders", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "test_unavailable",
        message: "Máy chủ thử nghiệm tạm dừng.",
      }),
    }),
  );
  await page.locator("#place-order").click();
  await page.waitForFunction(() =>
    document.querySelector("#checkout-error")?.textContent.includes("tạm dừng"),
  );
  assert.equal(await cartCount(), "2");
  assert.equal(await page.locator("#name").inputValue(), maliciousName);
  assert.equal(await page.locator("#place-order").isEnabled(), true);
  assert.equal(
    await page.locator("#name").evaluate((input) => input.readOnly),
    true,
  );
  assert.equal(await page.locator("#coupon").isDisabled(), true);
  await page.unroute("**/api/orders");
  passed(
    "invalid phone blocks submission; API failure keeps cart, immutable form and retry available",
  );

  // Commit the order at the real backend, then drop its HTTP response. A retry
  // must recover the same order and reserve stock only once.
  let committedOrder;
  let releaseResponse;
  const responseGate = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let backendCommitted;
  const committed = new Promise((resolve) => {
    backendCommitted = resolve;
  });
  await page.route("**/api/orders", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    committedOrder = (await response.json()).order;
    backendCommitted();
    await responseGate;
    await route.abort("failed");
  });
  await page.locator("#place-order").click();
  await committed;
  await page.locator(".header-main .logo").click();
  assert.equal(
    new URL(page.url()).pathname,
    "/thanh-toan",
    "navigation during order request must stay on checkout",
  );
  assert.equal(await cartCount(), "2");
  releaseResponse();
  await page.waitForFunction(() =>
    document
      .querySelector("#checkout-error")
      ?.textContent.includes("Chưa xác nhận"),
  );
  assert.equal(
    await page.locator("#name").evaluate((input) => input.readOnly),
    true,
  );
  assert.equal(await page.locator("#name").inputValue(), maliciousName);
  const afterCommit = await fetch(base + "/api/products").then((response) =>
    response.json(),
  );
  assert.equal(
    afterCommit.products.find((p) => p.id === selected.id).stock,
    selected.stock - 2,
  );
  await page.unroute("**/api/orders");
  await page.locator("#place-order").click();
  await page.waitForURL("**/don-hang/*");
  await ready();
  const orderId = decodeURIComponent(
    new URL(page.url()).pathname.split("/").at(-1),
  );
  assert.equal(
    orderId,
    committedOrder.id,
    "retry after a lost response must recover the committed order",
  );
  const afterRetry = await fetch(base + "/api/products").then((response) =>
    response.json(),
  );
  assert.equal(
    afterRetry.products.find((p) => p.id === selected.id).stock,
    selected.stock - 2,
    "retry must not decrement stock twice",
  );
  passed(
    "lost response after commit recovers same order, immutable retry and stock reserved once",
  );
  assert.ok(orderId.startsWith("JL"));
  assert.equal(await cartCount(), "0");
  assert.ok(
    (await page.locator(".order-details").innerText()).includes(maliciousName),
  );
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator(".order-details img").count(), 0);
  const localState = await page.evaluate(() => JSON.stringify(localStorage));
  assert.ok(
    !localState.includes("0912345678") &&
      !localState.includes("test@example.com") &&
      !localState.includes("Kiểm Thử"),
  );
  await page.reload();
  await ready();
  assert.ok(
    (await page.locator(".order-number").textContent()).includes(orderId),
  );
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  passed(
    "successful COD order, escaped customer/note, empty cart and confirmation reload",
  );

  await go("/tra-cuu-don-hang");
  await page.locator("#order-id").fill(orderId);
  await page.locator("#lookup-phone").fill("0987654321");
  await page.locator("#lookup-form button").click();
  await page.waitForFunction(
    () => document.querySelector("#lookup-error")?.textContent.length > 0,
  );
  assert.equal(await page.locator("#lookup-result .order-card").count(), 0);
  await page.locator("#lookup-phone").fill("0912345678");
  await page.locator("#lookup-form button").click();
  await page.locator("#lookup-result .order-card").waitFor();
  assert.ok(
    (await page.locator("#lookup-result .order-number").innerText()).includes(
      orderId,
    ),
  );
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  passed(
    "lookup rejects wrong phone and returns the stored order with correct phone",
  );

  await go("/san-pham");
  await page.locator('[data-wish="1"]').click();
  await go("/yeu-thich");
  await count(1);
  await page.reload();
  await ready();
  await count(1);
  await page.locator('[data-wish="1"]').click();
  await ready();
  await count(0);
  passed("wishlist add, persistence and remove");

  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/san-pham",
      "/san-pham/" + selected.slug,
      "/gio-hang",
      "/tra-cuu-don-hang",
      "/chinh-sach/giao-hang",
    ]) {
      await go(route);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${route} overflows at ${width}px`,
      );
      if (route === "/san-pham") {
        await count(12);
        const visible = await page
          .locator(".catalog-content .product-card")
          .evaluateAll(
            (cards) =>
              cards.filter((card) => getComputedStyle(card).display !== "none")
                .length,
          );
        assert.equal(visible, 12, `listing hides products at ${width}px`);
      }
    }
  }
  passed(
    "mobile/tablet home, listing, detail, cart, lookup and policy have no overflow or hidden listing products",
  );

  await page.evaluate(
    (ids) => localStorage.setItem("jielien-favorites", JSON.stringify(ids)),
    catalog.slice(0, 8).map((p) => p.id),
  );
  await go("/yeu-thich");
  await count(8);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const visible = await page
      .locator("#main .product-card")
      .evaluateAll(
        (cards) =>
          cards.filter((card) => getComputedStyle(card).display !== "none")
            .length,
      );
    assert.equal(visible, 8, `wishlist hides saved products at ${width}px`);
  }
  passed("all eight saved products remain visible on mobile and tablet");

  assert.deepEqual(errors, [], "browser JavaScript errors");
  assert.deepEqual(brokenAssets, [], "local assets failed to load");
  passed("no JavaScript exceptions or broken local assets");
  console.log(`Browser E2E complete: ${checks} checks passed.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => app.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
