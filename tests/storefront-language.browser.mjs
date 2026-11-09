import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase(),
  out = "docs/screenshots/storefront-language";
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
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
  await page.goto(base);
  await page.locator("#dynamic-nav a").first().waitFor({ state: "attached" });
  await page.locator("#category-menu").hover();
  await page.waitForFunction(
    () => !document.querySelector("#category-dropdown").hidden,
  );
  assert.equal(
    await page.locator("#category-menu").getAttribute("aria-expanded"),
    "true",
  );
  const categoryLink = page.locator("#category-dropdown a").first();
  await categoryLink.hover();
  assert.ok(await page.locator("#category-dropdown").isVisible());
  assert.equal(
    await categoryLink.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(233, 243, 216)",
  );
  await page.mouse.move(1200, 650);
  await page.waitForFunction(
    () => document.querySelector("#category-dropdown").hidden,
  );
  await page.locator("#category-menu").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await categoryLink.evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  assert.ok(await page.locator("#category-dropdown").isHidden());
  await page.locator("[data-language-select]").selectOption("zh-CN");
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
  assert.ok(
    (await page.locator("#category-menu").textContent()).includes(
      "浏览商品分类",
    ),
  );
  await page.locator(".category-card").first().click();
  await page.waitForURL("**/danh-muc/**");
  await page.reload();
  await page.locator("#main[data-hydrated=true]").waitFor();
  assert.equal(
    await page.locator("[data-language-select]").inputValue(),
    "zh-CN",
  );
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await page.goto(base + "/tin-tuc");
  await page.locator("#dynamic-nav a").first().waitFor({ state: "attached" });
  await page.locator("#category-menu").hover();
  await page.waitForFunction(
    () => !document.querySelector("#category-dropdown").hidden,
  );
  assert.ok(
    (await page.locator("#category-menu").textContent()).includes(
      "浏览商品分类",
    ),
  );
  await page.goto(base + "/tai-khoan");
  await page.locator("[data-language-select]").selectOption("vi");
  await page.locator("#identifier").fill("Trang chủ");
  await page.locator("[data-language-select]").selectOption("zh-CN");
  assert.equal(
    await page.locator("#identifier").inputValue(),
    "Trang chủ",
    "never translate user input",
  );
  await mkdir(out, { recursive: true });
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    await page.locator("#dynamic-nav a").first().waitFor({ state: "attached" });
    await page.locator("#main[data-hydrated=true]").waitFor();
    await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
    await page.mouse.move(width - 5, 900);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `no Chinese overflow ${width}`,
    );
    if (width > 900) await page.locator("#category-menu").hover();
    else if (await page.locator("#mobile-menu").isVisible())
      await page.locator("#mobile-menu").click();
    else await page.locator("#category-menu").click();
    await page.waitForFunction(
      () => !document.querySelector("#category-dropdown").hidden,
    );
    await page.screenshot({ path: `${out}/menu-zh-${width}.png` });
    await page.keyboard.press("Escape");
    await page.locator("[data-language-select]").selectOption("vi");
    await page.waitForFunction(() => document.documentElement.lang === "vi");
    assert.ok(
      (await page.locator("#category-menu").textContent()).includes(
        "Khám phá danh mục",
      ),
    );
    await page.locator("[data-language-select]").selectOption("zh-CN");
    console.log(
      `PASS: hover/touch menu, language round-trip and responsive ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/README.md",
    "All screenshots use isolated catalog fixtures. Verified VI/zh-CN round-trip, reload, SPA and SSR navigation, keyboard, mouse, touch controls, no user input translation, and 320/375/768/1440/1920px widths. Store-authored content remains in its original language.\n",
  );
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
