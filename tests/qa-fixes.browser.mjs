import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    out = "docs/screenshots/qa-fixes";
  await mkdir(out, { recursive: true });
  const auth = createAuth(db.pool),
    password = "QaBrowserFixture!2026";
  await auth.ensureAdmin({
    email: "qa-browser@example.test",
    phone: "0987654321",
    password,
  });
  const admin = await auth.login({
    identifier: "qa-browser@example.test",
    password,
  });
  const values = {
    companyName: "Công ty QA <script>window.__xss=true</script>",
    footerText: "Thông tin QA <img src=x onerror=alert(1)>",
    contactPhone: "0912345678",
    contactEmail: "support@example.test",
    address: "123 Đường kiểm thử",
  };
  for (const [key, value] of Object.entries(values)) {
    const old = (
      await db.pool.query("SELECT version FROM site_settings WHERE key=$1", [
        key,
      ])
    ).rows[0];
    const r = await fetch(base + "/api/admin/settings/site", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `jielien_session=${admin.token}`,
        "X-CSRF-Token": admin.csrfToken,
      },
      body: JSON.stringify({ key, value, version: old?.version }),
    });
    assert.equal(r.status, 200, await r.text());
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext(),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(base);
  await page
    .locator("#company-contact")
    .filter({ hasText: values.companyName })
    .waitFor();
  await page.reload();
  await page
    .locator("#company-contact")
    .filter({ hasText: values.companyName })
    .waitFor();
  assert.equal(
    await page.locator("#company-footer").textContent(),
    values.footerText,
  );
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(
    await page.locator("#company-contact script,#company-footer img").count(),
    0,
  );
  await page
    .locator("#company-contact")
    .screenshot({ path: out + "/company-settings.png" });
  console.log(
    "PASS: admin settings persist into the public storefront after reload and render as text",
  );
  await page.goto(base + "/tai-khoan?mode=register");
  await page.locator("#fullName").fill("Khách kiểm thử QA");
  await page.locator("#phone").fill("0912345678");
  await page.locator("#email").fill("qa-browser-buyer@example.test");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator('#profile-form').waitFor();
  assert.equal((await page.request.get(base+'/api/auth/me')).status(),200,'registration creates a customer without OTP');
  assert.equal(await page.locator('#verification-form').count(),0);
  for (const width of [320, 375, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Account width ${width}`,
    );
    await page.screenshot({
      path: `${out}/account-${width}.png`,
      fullPage: true,
    });
  }
  await page.locator("#profile-form").waitFor();
  assert.ok(
    (await context.cookies()).some(
      (c) => c.name === "jielien_session" && c.httpOnly,
    ),
  );
  console.log(
    "PASS: customer registration requires no OTP, fits five viewports and creates a customer session",
  );
  await page.goto(base + "/tai-khoan");
  await page.locator("#logout").click();
  await page.locator("#auth-form").waitFor();
  await page.locator("#identifier").fill("0912345678");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator("#profile-form").waitFor();
  console.log("PASS: registered customer can log out and log back in");
  await page.route("**/api/site", (route) => route.abort());
  await page.goto(base);
  await page.locator("h1").first().waitFor();
  assert.ok(await page.locator('a[href="/san-pham"]').count());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: optional settings outage preserves storefront navigation; no JavaScript exceptions",
  );
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
