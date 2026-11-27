import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";

const db = await createTestDatabase();
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const out = "docs/screenshots/auth-ui";
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 375, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/tai-khoan");
      await page.locator("#auth-form").waitFor();
      for (const mode of ["login", "register"]) {
        await page.locator(`#auth-${mode}-tab`).click();
        assert.equal(await page.locator(`#auth-${mode}-tab`).getAttribute("aria-selected"), "true");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode} ${colorScheme} ${width}px fits`);
        assert.ok(await page.locator("#show-password").evaluate(element => element.offsetWidth >= 40 && element.offsetHeight >= 40));
        assert.equal(await page.locator("#auth-form").count(), 1);
        assert.equal(await page.locator(".auth-layout").evaluate(element => getComputedStyle(element).colorScheme), colorScheme);
        assert.equal(await page.locator(".u416-th").evaluate(element => parseFloat(getComputedStyle(element).transitionDuration)), 0.000001);
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: `${out}/${mode}-${colorScheme}-${width}.png`, fullPage: true });
      }
    }
  }
  console.log("PASS: login/register light and dark at 320/375/768/1440/1920px, reduced motion and touch targets");

  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base + "/tai-khoan");
  await page.locator("#auth-login-tab").focus();
  await page.keyboard.press("End");
  assert.equal(await page.locator("#auth-register-tab").evaluate(element => document.activeElement === element), true);
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#auth-login-tab").evaluate(element => document.activeElement === element), true);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#fullName").evaluate(element => document.activeElement === element), true);
  assert.notEqual(await page.locator("#fullName").evaluate(element => getComputedStyle(element.nextElementSibling).transform), "none");
  await page.locator("#password").fill("Fixture-Password-2026!");
  await page.locator("#show-password").focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  assert.equal(await page.locator("#show-password").getAttribute("aria-label"), "Ẩn mật khẩu");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#password").getAttribute("type"), "password");
  assert.equal(await page.locator("#show-password").getAttribute("aria-pressed"), "false");
  await page.evaluate(() => document.querySelector("#fullName").value = "Tên tự điền fixture");
  await page.locator("#email").focus();
  assert.notEqual(await page.locator("#fullName").evaluate(element => getComputedStyle(element.nextElementSibling).transform), "none", "autofill keeps label raised");
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  assert.equal(await page.locator(".auth-layout").evaluate(element => getComputedStyle(element).colorScheme), "dark");
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  assert.equal(await page.locator(".auth-layout").evaluate(element => getComputedStyle(element).colorScheme), "light");
  console.log("PASS: keyboard tabs, floating/autofilled labels, password visibility and live theme change");

  await page.locator("#fullName").fill("");
  await page.locator("#phone").fill("123");
  await page.locator("#auth-submit").click();
  assert.equal(await page.locator("#fullName").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#fullName").evaluate(element => document.activeElement === element), true);
  assert.equal(await page.locator("#auth-error").getAttribute("data-input-id"), "fullName");
  const nameError = await page.locator("#auth-error").textContent();
  await page.locator("#phone").fill("0912345679");
  assert.equal(await page.locator("#auth-error").textContent(), nameError, "editing another field retains the focused field error");
  await page.locator("#fullName").fill("Khách đăng ký fixture");
  assert.equal(await page.locator("#fullName").getAttribute("aria-describedby"), null);
  assert.equal(await page.locator("#fullName").getAttribute("aria-invalid"), null);
  await page.locator("#phone").fill("123");
  await page.locator("#auth-submit").click();
  assert.equal(await page.locator("#phone").getAttribute("aria-invalid"), "true");
  await page.locator("#phone").fill("0912345679");
  assert.equal(await page.locator("#phone").getAttribute("aria-describedby"), null);
  await page.locator("#password").fill("á".repeat(40));
  await page.locator("#auth-submit").click();
  await page.locator("#auth-error").filter({ hasText: "72 byte" }).waitFor();
  assert.equal(await page.locator("#password").getAttribute("aria-describedby"), "auth-password-help auth-error");
  await page.screenshot({ path: `${out}/registration-validation-375.png`, fullPage: true });
  const password = randomBytes(24).toString("base64url");
  await page.locator("#password").fill(password);
  assert.equal(await page.locator("#password").getAttribute("aria-describedby"), "auth-password-help");
  let release;
  let registrations = 0;
  await page.route("**/api/auth/register", async route => {
    registrations++;
    await new Promise(resolve => { release = resolve; });
    await route.continue();
  });
  await page.locator("#auth-submit").click();
  await page.waitForFunction(() => document.querySelector("#auth-submit")?.classList.contains("is-busy"));
  assert.equal(await page.locator("#auth-submit").isDisabled(), true);
  assert.equal(await page.locator("#auth-submit").getAttribute("aria-busy"), "true");
  await page.locator("#auth-login-tab").click();
  assert.equal(await page.locator("#auth-register-tab").getAttribute("aria-selected"), "true", "busy auth cannot change mode");
  await page.evaluate(() => document.querySelector("#auth-form").requestSubmit());
  assert.equal(registrations, 1, "double submit is blocked");
  release();
  await page.locator("#profile-form").waitFor();
  await page.unroute("**/api/auth/register");
  assert.ok((await context.cookies()).find(cookie => cookie.name === "jielien_session")?.httpOnly);
  await page.locator("#account-menu").click();
  await page.locator("#logout").click();
  await page.locator("#auth-form").waitFor();
  await page.locator("#auth-register-tab").click();
  await page.locator("#fullName").fill("Khách trùng số fixture");
  await page.locator("#phone").fill("0912345679");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator("#auth-error.is-on").filter({ hasText: /.+/ }).waitFor();
  assert.equal(await page.locator("#auth-submit").isDisabled(), false);
  console.log("PASS: native/UTF-8 validation, real phone-only registration, loading state, duplicate submit and duplicate account errors");

  await page.locator("#auth-login-tab").click();
  await page.locator("#identifier").fill("0912345679");
  await page.locator("#password").fill("Wrong-Fixture-Password!");
  await page.locator("#auth-submit").click();
  await page.locator("#auth-error.is-on").filter({ hasText: /.+/ }).waitFor();
  assert.equal(await page.locator("#auth-submit").isDisabled(), false);
  assert.equal(await page.locator("#password").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#password").getAttribute("aria-describedby"), "auth-error");
  assert.equal(await page.locator("#identifier").getAttribute("aria-describedby"), null, "server error does not describe the valid identifier");
  const passwordError = await page.locator("#auth-error").textContent();
  await page.locator("#identifier").fill("0912345678");
  assert.equal(await page.locator("#auth-error").textContent(), passwordError, "editing another field retains the password error");
  await page.locator("#identifier").fill("0912345679");
  assert.equal(await page.locator("#auth-error").textContent(), passwordError);
  await page.screenshot({ path: `${out}/login-error-375.png`, fullPage: true });
  await page.locator("#password").fill(password);
  assert.equal(await page.locator("#password").getAttribute("aria-describedby"), null);
  assert.equal(await page.locator("#password").getAttribute("aria-invalid"), null);
  await page.locator("#password").press("Enter");
  await page.locator("#profile-form").waitFor();
  await page.locator("#account-menu").click();
  await page.locator("#logout").click();
  await page.locator("#forgot-password").click();
  await page.locator("#recovery-identifier").waitFor();
  await page.locator("#back-to-login").click();
  await page.locator("#identifier").waitFor();
  await page.goto(base + "/tai-khoan?redirect=/gio-hang");
  await page.locator("#identifier").fill("0912345679");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/gio-hang");
  console.log("PASS: wrong-password feedback/retry, real Enter login, recovery navigation and safe post-login redirect");

  const offline = await browser.newContext({ viewport: { width: 375, height: 844 } });
  const offlinePage = await offline.newPage();
  offlinePage.on("pageerror", error => errors.push(error.message));
  await offlinePage.goto(base + "/tai-khoan");
  await offlinePage.locator("#identifier").fill("0912345679");
  await offlinePage.locator("#password").fill(password);
  await offline.setOffline(true);
  await offlinePage.locator("#auth-submit").click();
  await offlinePage.locator("#auth-error.is-on").filter({ hasText: /.+/ }).waitFor();
  assert.equal(await offlinePage.locator("#auth-submit").isDisabled(), false);
  await offline.setOffline(false);
  await offlinePage.emulateMedia({ reducedMotion: "no-preference" });
  await offlinePage.locator("#auth-register-tab").click();
  await offlinePage.waitForFunction(() => {
    const thumb = document.querySelector(".u416-th").getBoundingClientRect();
    const tab = document.querySelector("#auth-register-tab").getBoundingClientRect();
    return Math.abs(thumb.left - tab.left) < 1;
  });
  assert.notEqual(await offlinePage.locator(".u416-th").evaluate(element => getComputedStyle(element).transitionDuration), "1e-06s, 1e-06s");
  console.log("PASS: network failure leaves retry enabled and normal-motion tab reaches its final state");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
