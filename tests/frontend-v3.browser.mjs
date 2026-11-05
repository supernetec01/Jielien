import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { frontendFixture } from "./support/frontend-v3.mjs";
const f = await frontendFixture();
let browser,
  checks = 0;
const pass = (s) => console.log(`PASS ${++checks}: ${s}`);
const directory = "docs/frontend-v3/screenshots";
try {
  await mkdir(directory, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) =>
    requests.push(new URL(r.url()).pathname + new URL(r.url()).search),
  );
  await page.addInitScript(() => {
    window.__v3cls = 0;
    window.__v3lcp = 0;
    new PerformanceObserver((list) => {
      window.__v3lcp = list.getEntries().at(-1)?.startTime || 0;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        if (!e.hadRecentInput) window.__v3cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  async function go(path) {
    await page.goto(f.base + path);
    if (!path.startsWith("/tin-tuc") && !path.startsWith("/tai-khoan"))
      await page.waitForFunction(
        () =>
          document.querySelector("#main")?.dataset.hydrated === "true" &&
          !document.querySelector("#main").hasAttribute("aria-busy"),
      );
    else
      await page
        .locator(path.startsWith("/tai-khoan") ? "#auth-form" : "main h1")
        .waitFor();
  }
  await go("/");
  assert.equal(await page.locator(".poster-stack .poster").count(), 2);
  assert.equal(await page.locator(".category-card").count(), 8);
  assert.equal(await page.locator(".product-card").count(), 8);
  assert.equal(await page.locator('a[href="/quan-tri"]').count(), 0);
  assert.ok(!requests.includes("/api/products"));
  const desktopSrc = await page
    .locator(".hero picture img")
    .evaluate((el) => el.currentSrc);
  assert.ok(desktopSrc.endsWith(f.assets[0].url));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator(".hero picture img").evaluate((el) => el.decode());
  assert.ok(
    (
      await page.locator(".hero picture img").evaluate((el) => el.currentSrc)
    ).endsWith(f.assets[1].url),
  );
  pass(
    "home matches V3 slots/categories, real mobile image selected and catalog requests are bounded",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('[data-home-category="' + f.categories[1].slug + '"]')
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".product-card").length === 2,
  );
  assert.ok(
    (await page.locator(".product-card h3").allTextContents()).every((t) =>
      t.includes("Sản phẩm 2"),
    ),
  );
  await page.locator(".category-card").first().click();
  await page.waitForURL("**/danh-muc/*");
  await page.waitForFunction(
    () => !document.querySelector("#main").hasAttribute("aria-busy"),
  );
  assert.equal(await page.locator(".product-card").count(), 2);
  pass("home tabs and category URLs fetch database-filtered SKU results");
  const sku = (
    await f.request("/api/products?min=800000&sort=price-asc&limit=1")
  ).data.items[0];
  await go("/san-pham/" + sku.slug);
  assert.equal(await page.locator(".variants a").count(), 2);
  const alternate = page.locator(".variants a").nth(1);
  await alternate.click();
  await page.waitForFunction(
    () => !document.querySelector("#main").hasAttribute("aria-busy"),
  );
  assert.ok(
    (await page.locator(".detail-info h1").textContent()).includes(
      "Quy cách 2",
    ),
  );
  await page.locator("[data-detail-add]").click();
  await go("/gio-hang");
  await page.locator(".summary").waitFor();
  assert.ok((await page.locator("#cart-count").textContent()) === "1");
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("#main")?.dataset.hydrated === "true",
  );
  assert.equal(await page.locator("#cart-count").textContent(), "1");
  pass(
    "real variant selection updates SKU and guest cart survives reload with server quote",
  );
  await f.save("/api/admin/inventory/adjust", {
    variantId: sku.id,
    warehouseId: 1,
    quantityChange: -20,
    reason: "Out of stock test",
  });
  await go("/san-pham/" + sku.slug);
  assert.equal(await page.locator("[data-buy]").isDisabled(), true);
  assert.equal(await page.locator("[data-detail-add]").isDisabled(), true);
  pass("out-of-stock SKU cannot be purchased or added through the UI");
  await go("/");
  await page.evaluate(
    await readFile("node_modules/axe-core/axe.min.js", "utf8"),
  );
  const accessibility = await page.evaluate(() =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    }),
  );
  await writeFile(
    "docs/frontend-v3/accessibility.json",
    JSON.stringify(
      {
        url: "/",
        fixture: true,
        violations: accessibility.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      },
      null,
      2,
    ) + "\n",
  );
  assert.equal(
    accessibility.violations.length,
    0,
    JSON.stringify(
      accessibility.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  pass("automated WCAG A/AA checks on the hydrated storefront pass");
  const performance = await page.evaluate(() => ({
    cls: window.__v3cls,
    lcpMs: Math.round(window.__v3lcp),
    navigationMs: Math.round(
      performance.getEntriesByType("navigation")[0].duration,
    ),
    images: [...document.images].length,
    brokenImages: [...document.images].filter(
      (i) => i.complete && !i.naturalWidth && i.getAttribute("src"),
    ).length,
  }));
  await writeFile(
    "docs/frontend-v3/performance.json",
    JSON.stringify(
      {
        environment:
          "Linux cloud Chromium, local HTTP, fixture database; not field Core Web Vitals",
        ...performance,
      },
      null,
      2,
    ) + "\n",
  );
  assert.equal(performance.brokenImages, 0);
  const widths = [320, 375, 390, 430, 768, 1024, 1366, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [
      ["/", "home"],
      ["/san-pham", "catalog"],
      ...([320, 375, 768, 1440].includes(width)
        ? [
            ["/san-pham/" + sku.slug, "detail"],
            ["/gio-hang", "cart"],
            ["/tin-tuc", "journal"],
            ["/tin-tuc/cam-hung-1", "article"],
            ["/tai-khoan", "account"],
          ]
        : []),
    ]) {
      await go(path);
      await page.evaluate(() => {
        document.activeElement?.blur();
        scrollTo(0, 0);
      });
      await page.mouse.move(0, 0);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        items: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && r.right > innerWidth + 1;
          })
          .slice(0, 6)
          .map((el) => ({ tag: el.tagName, class: el.className })),
      }));
      assert.ok(
        overflow.scroll <= width + 1,
        `${name} ${width} ${JSON.stringify(overflow)}`,
      );
      await page.screenshot({
        path: `${directory}/${name}-${width}.png`,
        fullPage: true,
      });
    }
  }
  pass(
    "V3 home/catalog across nine viewports; detail/cart/account/SSR journal on mobile/tablet/desktop have no overflow",
  );
  await context.addCookies([
    {
      url: f.base,
      name: "jielien_session",
      value: f.session.token,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.base + "/quan-tri");
  await page.locator('[data-section="banners-editor"]').click();
  await page.locator("#banner-form").waitFor();
  await page
    .locator('[data-editor-action="banner-edit:' + f.banners[1].id + '"]')
    .click();
  const form = page.locator("#banner-form");
  assert.equal(
    await form.locator('[name="slot"]').inputValue(),
    "home_side_top",
  );
  assert.equal(
    await form.locator('[name="assetMobileId"]').inputValue(),
    String(f.assets[1].id),
  );
  await form.locator('[name="title"]').fill("Poster được sửa từ Studio");
  await form.locator('[name="sortOrder"]').fill("-2");
  await page.locator('[data-editor-action="banner-preview:mobile"]').click();
  assert.equal(await page.locator("#banner-preview-frame.mobile").count(), 1);
  assert.ok(
    (await page.locator("#banner-preview-image").getAttribute("src")).endsWith(
      f.assets[1].url,
    ),
  );
  await form.locator("button.primary").click();
  await page
    .locator(".banner-library article")
    .filter({ hasText: "Poster được sửa từ Studio" })
    .waitFor();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `${directory}/studio-${width}.png`,
      fullPage: true,
    });
  }
  await go("/");
  assert.ok(
    (await page.locator(".poster").first().textContent()).includes(
      "Poster được sửa từ Studio",
    ),
  );
  assert.equal(await page.locator('a[href="/quan-tri"]').count(), 0);
  pass(
    "Studio edits slot/mobile/sort and persists to public poster; staff never gets public Admin links",
  );
  await page.goto(f.base + "/quan-tri");
  await page.locator('[data-section="users"]').click();
  await page.locator("#new-staff").click();
  const staffForm = page.locator("#create-staff-form");
  await staffForm.locator('[name="fullName"]').fill("Banner staff UI");
  await staffForm.locator('[name="username"]').fill("v3.banner");
  await staffForm.locator('[name="phone"]').fill("0912345671");
  await staffForm.locator('[name="password"]').fill(f.password);
  await staffForm.locator('[name="role"]').selectOption("banner_manager");
  assert.ok(
    (
      await staffForm.locator('[name="role"] option:checked').textContent()
    ).includes("Quản lý banner"),
  );
  await staffForm.locator("button.primary").click();
  await page.waitForFunction(
    () => !document.querySelector("#admin-dialog").open,
  );
  const staffSession = await f.auth.login({
    identifier: "v3.banner",
    password: f.password,
  });
  const staffContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await staffContext.addCookies([
    {
      url: f.base,
      name: "jielien_session",
      value: staffSession.token,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const staffPage = await staffContext.newPage();
  await staffPage.goto(f.base + "/tai-khoan");
  await staffPage.locator("#profile-form").waitFor();
  await staffPage.locator('a[href="/quan-tri"]').click();
  await staffPage.waitForURL("**/quan-tri");
  await staffPage.locator('[data-section="banners-editor"]').click();
  await staffPage.locator("#banner-form").waitFor();
  assert.equal(
    await staffPage.locator('[data-section="settings-editor"]').count(),
    0,
  );
  assert.equal(await staffPage.locator('[data-section="users"]').count(), 0);
  await staffContext.close();
  pass(
    "Admin-assigned banner_manager role can use Studio through account without settings/users access",
  );
  // Missing mobile image must fall back to desktop without changing the schedule.
  const banner = (await f.request("/api/admin/banners")).data.items.find(
    (b) => b.id === f.banners[0].id,
  );
  await f.save(
    "/api/admin/banners/" + banner.id,
    {
      title: banner.title,
      assetId: banner.asset_id,
      assetMobileId: null,
      slot: banner.slot,
      targetPath: banner.target_path,
      status: "published",
      version: banner.version,
    },
    "PATCH",
  );
  await go("/");
  assert.ok(
    (
      await page.locator(".hero picture img").evaluate((el) => el.currentSrc)
    ).endsWith(f.assets[0].url),
  );
  // Optional site outage does not break catalog/cart or reveal an Admin navigation link.
  await page.route("**/api/site", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"test outage"}',
    }),
  );
  await go("/");
  assert.equal(await page.locator(".hero").count(), 1);
  assert.equal(await page.locator(".poster").count(), 0);
  assert.equal(await page.locator('a[href="/quan-tri"]').count(), 0);
  await page.unroute("**/api/site");
  pass(
    "mobile fallback and optional-content outage preserve usable, private storefront",
  );
  let release;
  const blocked = new Promise((resolve) => (release = resolve));
  await page.route("**/api/products?**", async (route) => {
    await blocked;
    await route.continue();
  });
  await page.goto(f.base + "/");
  assert.equal(
    await page.locator("[data-add]").first().isDisabled(),
    true,
    "SSR purchase buttons wait for authoritative hydration",
  );
  release();
  await page.waitForFunction(
    () => document.querySelector("#main")?.dataset.hydrated === "true",
  );
  await page.unroute("**/api/products?**");
  await page.route("**/api/products?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"message":"Catalog unavailable test"}',
    }),
  );
  await go("/san-pham");
  await page.locator("#retry-init").waitFor();
  assert.equal(await page.locator('a[href="/quan-tri"]').count(), 0);
  await page.unroute("**/api/products?**");
  await page.locator("#retry-init").click();
  await page.locator(".catalog-content .product-card").first().waitFor();
  pass(
    "slow/error catalog has safe SSR controls, visible retry and no fake success",
  );
  await f.db.pool.query(
    "INSERT INTO categories(name,slug,sort_order,status) SELECT 'Ngành hàng kiểm thử '||i,'category-stress-'||i,100+i,'active' FROM generate_series(1,100) i",
  );
  await go("/");
  assert.equal(await page.locator(".category-card").count(), 8);
  assert.equal(await page.locator("#category-dropdown a").count(), 108);
  await page.setViewportSize({ width: 320, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.locator("#mobile-menu").click();
  assert.equal(await page.locator("#category-dropdown").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#category-dropdown").isVisible(), false);
  const touchContext = await browser.newContext({
    viewport: { width: 320, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await touchContext.newPage();
  await touchPage.goto(f.base + "/");
  await touchPage.waitForFunction(
    () => document.querySelector("#main")?.dataset.hydrated === "true",
  );
  await touchPage.locator("#mobile-menu").tap();
  await touchPage.locator("#category-dropdown a").first().tap();
  await touchPage.waitForURL("**/danh-muc/*");
  assert.ok(
    await touchPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await touchContext.close();
  pass(
    "many database categories remain navigable with touch at 320px without overflowing",
  );
  assert.deepEqual(errors, []);
  pass("no browser JavaScript exceptions");
  console.log(`V3 browser complete: ${checks} checks passed.`);
} finally {
  await browser?.close();
  await f.cleanup();
}
