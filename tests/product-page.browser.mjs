import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { frontendFixture } from "./support/frontend-v3.mjs";

const layoutWidths = [320, 375, 768, 1280, 1440, 1920];
const interactionWidths = [375, 768, 1280];
const outOfStockColors = {
  "background-color": "rgb(233, 235, 239)",
  color: "rgb(75, 85, 99)",
};
const selectedOutline = {
  "outline-color": "rgb(9, 20, 50)",
  "outline-style": "solid",
  "outline-width": "2px",
  "outline-offset": "2px",
};

async function checkStyles(locator, expected) {
  const actual = await locator.evaluate((element, properties) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(
      properties.map((property) => [property, style.getPropertyValue(property)]),
    );
  }, Object.keys(expected));
  assert.deepEqual(actual, expected);
}

async function checkGalleryFrame(page, width) {
  const frame = page.locator(".gallery-main");
  const box = await frame.boundingBox();
  assert.ok(box && Math.abs(box.width - box.height) <= 1, `square gallery at ${width}px`);
  assert.ok(box.width <= 640, `gallery caps at 640px at viewport ${width}px`);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `the page fits viewport ${width}px`,
  );
  await checkStyles(frame, {
    "background-color": "rgb(255, 255, 255)",
    "border-top-color": "rgb(229, 231, 235)",
    "border-top-width": "1px",
    "border-top-left-radius": "16px",
  });
}

async function checkImageResolution(image, width) {
  const pixels = await image.evaluate(async (element) => {
    await element.decode();
    return {
      url: element.currentSrc,
      actual: element.naturalWidth,
      needed: Math.ceil(element.getBoundingClientRect().width * devicePixelRatio),
      dpr: devicePixelRatio,
    };
  });
  if (pixels.actual < pixels.needed) {
    console.warn(
      `Ảnh cần thêm pixel ở ${width}px/DPR ${pixels.dpr}: ${pixels.url} (${pixels.actual}px, cần khoảng ${pixels.needed}px theo độ rộng CSS)`,
    );
  }
}

const fixture = await frontendFixture();
let browser;
try {
  const product = fixture.products[0];
  const [inStock, outOfStock] = product.variants;
  const [cover, parentImage, thirdImage, fourthImage] = fixture.assets;
  const smallCover = await fixture.upload("#315c58", 360, 405);
  const fifthImage = await fixture.upload("#e6e8e3", 1000, 750);
  await fixture.save(
    `/api/admin/catalog/products/${product.id}/media`,
    {
      version: product.version,
      media: [
        { assetId: parentImage.id },
        { assetId: cover.id, variantId: inStock.id },
        { assetId: smallCover.id, variantId: outOfStock.id },
        { assetId: thirdImage.id },
        { assetId: fourthImage.id },
        { assetId: fifthImage.id },
      ],
    },
    "PUT",
  );
  await fixture.save("/api/admin/inventory/adjust", {
    variantId: outOfStock.id,
    warehouseId: 1,
    quantityChange: -20,
    reason: "Fixture trạng thái hết hàng trên trang sản phẩm",
  });
  const productPath = "/san-pham/" + inStock.slug;
  const { data } = await fixture.request("/api/catalog/products/" + inStock.slug);
  assert.equal(data.product.image, cover.url);
  assert.equal(data.product.stock, 20);
  assert.equal(data.variants.find((variant) => variant.id === outOfStock.id)?.stock, 0);

  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({ deviceScaleFactor: dpr, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of dpr === 1 ? layoutWidths : interactionWidths) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(fixture.base + productPath);
      await page.locator("#main[data-hydrated=true]:not([aria-busy])").waitFor();
      await checkGalleryFrame(page, width);

      const image = page.locator("#detail-image");
      assert.equal(await image.getAttribute("src"), cover.url);
      assert.equal(await image.getAttribute("alt"), data.product.name);
      assert.equal(await image.getAttribute("loading"), "eager");
      assert.equal(await image.getAttribute("fetchpriority"), "high");
      assert.equal(await image.getAttribute("decoding"), "async");
      assert.equal(await image.getAttribute("width"), "640");
      assert.equal(await image.getAttribute("height"), "640");
      await checkStyles(image, { "object-fit": "contain" });
      await checkImageResolution(image, width);
      if (!interactionWidths.includes(width)) continue;

      const gallery = page.getByRole("group", { name: "Ảnh sản phẩm" });
      const activeThumb = gallery.getByRole("button", { name: "Xem ảnh 2/5", exact: true });
      assert.equal(await activeThumb.getAttribute("aria-current"), "true");
      await checkStyles(activeThumb, {
        width: "72px",
        height: "72px",
        "border-top-color": "rgb(135, 187, 42)",
        "border-top-width": "2px",
      });
      if (width === 375) {
        await checkStyles(gallery, { "overflow-x": "auto", "scroll-snap-type": "x mandatory" });
        assert.ok(await gallery.evaluate((element) => element.scrollWidth > element.clientWidth));
      }
      const lastThumb = gallery.getByRole("button", { name: "Xem ảnh 5/5", exact: true });
      await activeThumb.focus();
      for (let tab = 0; tab < 3; tab++) await page.keyboard.press("Tab");
      assert.ok(await lastThumb.evaluate((element) => element === document.activeElement));
      if (width === 375) assert.ok(await gallery.evaluate((element) => element.scrollLeft > 0));
      await lastThumb.hover();
      await checkStyles(lastThumb, { filter: "none" });
      assert.equal(await lastThumb.locator("img").getAttribute("loading"), "lazy");
      await checkStyles(lastThumb.locator("img"), { "object-fit": "contain" });
      const galleryRequests = [];
      const trackGalleryRequests = (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/"))
          galleryRequests.push(request.url());
      };
      page.on("request", trackGalleryRequests);
      await page.keyboard.press("Enter");
      assert.equal(await image.getAttribute("src"), fifthImage.url);
      assert.equal(await image.getAttribute("alt"), await lastThumb.getAttribute("data-alt"));
      assert.equal(await lastThumb.getAttribute("aria-current"), "true");
      assert.equal(await gallery.locator('[aria-current="true"]').count(), 1);
      assert.equal(await activeThumb.getAttribute("aria-current"), "false");
      await checkImageResolution(image, width);
      page.off("request", trackGalleryRequests);
      assert.deepEqual(galleryRequests, [], "gallery navigation uses the existing image URLs");

      const variants = page.getByRole("radiogroup", { name: "Chọn quy cách" });
      const availableOption = variants.locator(`[data-variant="${inStock.id}"]`);
      const unavailableOption = variants.locator(`[data-variant="${outOfStock.id}"]`);
      assert.equal(await availableOption.getAttribute("aria-checked"), "true");
      assert.equal(await availableOption.locator(".variant-name svg").count(), 1);
      assert.equal(await availableOption.locator(".variant-availability").count(), 0);
      await checkStyles(availableOption, {
        "background-color": "rgb(255, 255, 255)",
        "border-top-color": "rgb(135, 187, 42)",
        color: "rgb(9, 20, 50)",
        "min-height": "44px",
        ...selectedOutline,
      });
      assert.equal(await unavailableOption.isEnabled(), true, "out-of-stock SKUs can be viewed");
      assert.equal((await unavailableOption.locator(".variant-availability").innerText()).trim(), "Hết hàng");
      await checkStyles(unavailableOption, {
        ...outOfStockColors,
        "border-top-color": "rgb(201, 205, 212)",
        "min-height": "44px",
      });

      await availableOption.press("ArrowRight");
      await page.waitForURL("**/san-pham/" + outOfStock.slug);
      await page.waitForFunction((id) =>
        document.activeElement?.getAttribute("data-variant") === String(id) &&
        document.activeElement?.getAttribute("aria-checked") === "true", outOfStock.id);
      assert.equal(await unavailableOption.locator(".variant-name svg").count(), 1);
      assert.equal(await unavailableOption.locator(".variant-availability svg").count(), 1);
      await checkStyles(unavailableOption, { ...outOfStockColors, ...selectedOutline });
      assert.equal((await page.locator(".stock-status").innerText()).trim(), "Hết hàng");
      assert.equal((await page.locator(".purchase-stock-note").innerText()).trim(), "Phân loại này tạm hết hàng");
      assert.equal(await image.getAttribute("src"), smallCover.url);
      await checkImageResolution(image, width);
      await checkGalleryFrame(page, width);

      const quantity = page.locator("#detail-quantity");
      assert.equal(await quantity.isEnabled(), true);
      assert.equal(await quantity.getAttribute("max"), "1");
      assert.equal(await quantity.inputValue(), "1");
      await checkStyles(quantity, outOfStockColors);
      for (const selector of ["[data-detail-add]", "[data-buy]", "[data-sticky-add]", "[data-sticky-buy]"]) {
        const button = page.locator(selector);
        assert.equal(await button.isDisabled(), true);
        await checkStyles(button, { ...outOfStockColors, opacity: "1" });
      }
      await checkStyles(page.locator(".detail-label"), { "font-size": "14px" });

      await unavailableOption.press("ArrowLeft");
      await page.waitForURL("**/san-pham/" + inStock.slug);
      await availableOption.and(page.locator('[aria-checked="true"]')).waitFor();
      assert.equal(await page.locator("[data-buy]").isEnabled(), true);
      assert.equal(await page.locator(".purchase-stock-note").count(), 0);
      console.log(`PASS ${width}px / DPR ${dpr} — gallery, thumbnail, SKU và điều khiển mua hàng`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }

  const ssr = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 1280, height: 1000 } });
  await ssr.goto(fixture.base + "/san-pham/" + outOfStock.slug);
  await checkGalleryFrame(ssr, 1280);
  assert.equal(await ssr.locator("[data-buy]").isDisabled(), true);
  await checkStyles(ssr.locator("[data-buy]"), { ...outOfStockColors, opacity: "1" });
  await ssr.close();
  console.log("PASS SSR — khung 1:1 và trạng thái mua hiển thị trước khi JavaScript chạy");
} finally {
  if (browser) await browser.close();
  await fixture.cleanup();
}
