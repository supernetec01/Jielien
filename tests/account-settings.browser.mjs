import { clickAccountNav } from "./support/account-navigation.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createApp } from "./support/app.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";

const database = await createTestDatabase();
let app, browser;
let checks = 0;
const pass = (message) => console.log(`PASS ${++checks}: ${message}`);
try {
  app = await createApp({
    pool: database.pool,
    legacyPath: null,
    bankConfig: { enabled: false },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(10000);
  const password = "Account-Original-2026";
  const newPassword = "Account-Replacement-2026";
  await page.goto(base + "/tai-khoan?mode=register");
  const thumb = await page.locator(".u416-th").elementHandle();
  const registerTab = page.locator("#auth-register-tab");
  await registerTab.press("ArrowLeft");
  await page.locator("#identifier").waitFor();
  assert.equal(await page.locator("#auth-panel").getAttribute("aria-labelledby"), "auth-login-tab");
  assert.equal(await thumb.evaluate((indicator) => indicator.isConnected), true);
  await page.locator("#auth-login-tab").press("End");
  assert.equal(await registerTab.getAttribute("aria-selected"), "true");
  await page.locator("#fullName").fill("Mẹ kiểm thử tài khoản");
  await page.locator("#phone").fill("0912345678");
  await page.locator("#email").fill("account@example.test");
  await page.locator("#password").fill(password);
  await page.locator("#auth-submit").click();
  await page.locator("#profile-form").waitFor();
  const previousSession = (await context.cookies()).find(
    (cookie) => cookie.name === "jielien_session",
  );
  assert.equal(previousSession.httpOnly, true);
  pass(
    "responsive registration opens the editable profile with HttpOnly session",
  );

  const menu = page.locator("#account-menu");
  await menu.focus();
  await page.keyboard.press("Enter");
  assert.equal(await menu.getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator('[data-view="profile"]').getAttribute("aria-current"), "page");
  await page.keyboard.press("Escape");
  assert.equal(await menu.getAttribute("aria-expanded"), "false");
  await clickAccountNav(page, '[data-view="orders"]');
  await page.locator(".account-order-summary").waitFor();
  assert.deepEqual(await page.locator(".account-order-stat strong").allTextContents(), ["0", "0", "0", "0"]);
  assert.equal(await page.locator('[data-view="orders"]').getAttribute("aria-current"), "page");
  await clickAccountNav(page, '[data-view="notifications"]');
  await page.getByRole("heading", { name: "Thông báo", exact: true }).waitFor();
  await clickAccountNav(page, '[data-view="profile"]');
  await page.locator("#profile-form").waitFor();
  pass("keyboard mobile menu exposes current view and the empty order summary displays zeroes");

  await page.locator("#profile-name").fill("Mẹ đã cập nhật");
  await page.locator("#profile-form button").click();
  await page.waitForFunction(() =>
    document.querySelector("#notice")?.textContent.includes("Đã lưu thông tin"),
  );
  assert.equal(await page.locator("#account-name").textContent(), "Mẹ đã cập nhật");
  await page.reload();
  await page.locator("#profile-name").waitFor();
  assert.equal(
    await page.locator("#profile-name").inputValue(),
    "Mẹ đã cập nhật",
  );
  pass("profile name changes persist after reloading");

  await page.locator("#profile-email").fill("updated@example.test");
  await page.locator("#profile-form button").click();
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#profile-error")?.textContent),
  );
  const unchanged = await page.evaluate(async () =>
    (await fetch("/api/auth/me")).json(),
  );
  assert.equal(unchanged.user.email, "account@example.test");
  await page.locator("#profile-password").fill(password);
  await page.locator("#profile-form button").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#profile-email")?.value ===
        "updated@example.test" &&
      document.querySelector("#profile-password")?.value === "" &&
      document.querySelector("#profile-form button")?.disabled === false,
  );
  await page.reload();
  await page.locator("#profile-email").waitFor();
  assert.equal(
    await page.locator("#profile-email").inputValue(),
    "updated@example.test",
  );
  pass(
    "email cannot change without reauthentication and persists with current password",
  );

  await clickAccountNav(page, '[data-view="addresses"]');
  await page.locator("#addressProvince").fill("TP Hồ Chí Minh");
  await page.locator("#addressDistrict").fill("Phường Bến Nghé");
  await page.locator("#addressDetail").fill("123 Đường Thử Nghiệm");
  await page.locator('input[name="isDefault"]').check();
  assert.deepEqual(
    await page
      .locator("#address-form")
      .evaluate((form) =>
        [...form.elements]
          .filter((el) => el.willValidate && !el.validity.valid)
          .map((el) => ({
            id: el.id,
            value: el.value,
            reason: el.validationMessage,
          })),
      ),
    [],
  );
  await page.locator("#address-form button").click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-edit-address]") ||
      Boolean(document.querySelector("#address-error")?.textContent),
  );
  assert.equal(await page.locator("#address-error").textContent(), "");
  await page.locator("[data-edit-address]").waitFor();
  assert.equal(await page.locator(".address-card .badge").count(), 1);
  await page.locator("[data-edit-address]").click();
  assert.equal(
    await page.locator("#addressDetail").inputValue(),
    "123 Đường Thử Nghiệm",
  );
  await page.locator("#addressDetail").fill("456 Đường Đã Sửa");
  await page.locator("#address-form button").click();
  await page.waitForFunction(() =>
    document
      .querySelector(".address-list")
      ?.textContent.includes("456 Đường Đã Sửa"),
  );
  assert.equal(await page.locator(".address-card").count(), 1);
  pass(
    "address editing updates the existing default address without creating a duplicate",
  );

  await page.locator("#addressProvince").fill("Hà Nội");
  await page.locator("#addressDistrict").fill("Phường Ba Đình");
  await page.locator("#addressDetail").fill("789 Đường Dự Phòng");
  await page.locator("#address-form button").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".address-card").length === 2,
  );
  const defaultCard = page
    .locator(".address-card")
    .filter({ has: page.locator(".badge") });
  await defaultCard.locator("[data-delete-address]").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".address-card").length === 1,
  );
  assert.ok(
    (await page.locator(".address-card").textContent()).includes(
      "789 Đường Dự Phòng",
    ),
  );
  assert.equal(await page.locator(".address-card .badge").count(), 1);
  await page.reload();
  await clickAccountNav(page, '[data-view="addresses"]');
  await page.locator(".address-card").waitFor();
  assert.equal(await page.locator(".address-card").count(), 1);
  assert.equal(await page.locator(".address-card .badge").count(), 1);
  pass(
    "deleting the default address promotes the remaining address and survives reload",
  );

  const otherLogin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "updated@example.test", password }),
  });
  assert.equal(otherLogin.status, 200);
  const otherSessionCookie = otherLogin.headers.get("set-cookie").split(";")[0];
  await clickAccountNav(page, '[data-view="security"]');
  await page.locator("#current-password").fill(password);
  await page.locator("#new-password").fill(newPassword);
  await page.locator("#confirm-password").fill("Different-Confirmation-2026");
  await page.locator("#password-form button").click();
  assert.ok(
    (await page.locator("#password-error").textContent()).includes("chưa khớp"),
  );
  assert.equal(
    await page.evaluate(async () => (await fetch("/api/auth/me")).status),
    200,
  );
  pass("mismatched password confirmation preserves the existing session");

  await page.locator("#confirm-password").fill(newPassword);
  await page.locator("#password-form button").click();
  await page.locator("#identifier").waitFor();
  assert.equal(
    (await context.cookies()).some(
      (cookie) => cookie.name === "jielien_session",
    ),
    false,
  );
  const stale = await fetch(base + "/api/auth/me", {
    headers: { Cookie: `${previousSession.name}=${previousSession.value}` },
  });
  assert.equal(stale.status, 401);
  const otherStale = await fetch(base + "/api/auth/me", {
    headers: { Cookie: otherSessionCookie },
  });
  assert.equal(otherStale.status, 401);
  pass("password change returns to login and revokes sessions on both devices");

  await page.locator("#identifier").fill("updated@example.test");
  const passwordInput = page.locator("#password");
  const passwordToggle = page.getByRole("button", { name: "Hiển thị mật khẩu" });
  await passwordInput.fill(password);
  await passwordInput.press("Tab");
  assert.equal(await passwordToggle.evaluate((button) => button === document.activeElement), true);
  await passwordToggle.press("Space");
  assert.equal(await passwordToggle.getAttribute("aria-pressed"), "true");
  assert.equal(await passwordInput.getAttribute("type"), "text");
  await passwordToggle.press("Space");
  assert.equal(await passwordInput.getAttribute("type"), "password");

  let releaseLogin;
  const holdLogin = new Promise((resolve) => { releaseLogin = resolve; });
  await page.route("**/api/auth/login", async (route) => {
    await holdLogin;
    await route.continue();
  }, { times: 1 });
  const submit = page.locator("#auth-submit");
  try {
    await submit.click();
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await submit.getAttribute("aria-busy"), "true");
  } finally {
    releaseLogin();
  }
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#auth-error")?.textContent),
  );
  assert.equal(await submit.isEnabled(), true);
  await passwordInput.fill(newPassword);
  assert.equal(await page.locator("#auth-error").textContent(), "");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    window.sawAuthSuccess = false;
    const button = document.querySelector("#auth-submit");
    const observer = new MutationObserver(() => {
      if (button.classList.contains("is-ok")) {
        window.sawAuthSuccess = true;
        observer.disconnect();
      }
    });
    observer.observe(button, { attributes: true, attributeFilter: ["class"] });
  });
  await submit.click();
  await page.locator("#profile-form").waitFor();
  assert.equal(await page.evaluate(() => window.sawAuthSuccess), true);
  assert.equal(
    await page.locator("#profile-name").inputValue(),
    "Mẹ đã cập nhật",
  );
  assert.deepEqual(errors, []);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  pass(
    "keyboard password visibility, pending and failed login states, successful retry and no mobile overflow",
  );

  let injectedCartFailure = false;
  await page.route("**/api/cart", async (route) => {
    if (route.request().method() === "GET" && !injectedCartFailure) {
      injectedCartFailure = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "test_cart_unavailable",
          message: "Temporary test cart failure",
        }),
      });
    } else await route.continue();
  });
  await page.goto(base + "/san-pham/sua-little-grow-so-3-800g");
  await page.locator('[data-buy="1"]').waitFor();
  await page.waitForFunction(
    () => document.querySelector("#main")?.dataset.hydrated === "true",
  );
  assert.equal(injectedCartFailure, true);
  assert.equal(
    await page.locator("#account-label").textContent(),
    "Mẹ đã cập nhật",
  );
  const sessionAfterFailure = await page.evaluate(async () =>
    (await fetch("/api/auth/me")).json(),
  );
  await page.locator('[data-buy="1"]').click();
  await page.locator("#saved-address").waitFor();
  assert.ok(
    (await page.locator(".checkout-account").textContent()).includes(
      "Mẹ đã cập nhật",
    ),
  );
  await page.locator('input[name="agreement"]').check();
  const orderResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/orders" &&
      response.request().method() === "POST",
  );
  await page.locator("#place-order").click();
  const orderResponse = await orderResponsePromise;
  assert.equal(orderResponse.status(), 201);
  const orderRequestHeaders = await orderResponse.request().allHeaders();
  assert.equal(
    orderRequestHeaders["x-csrf-token"],
    sessionAfterFailure.csrfToken,
  );
  const { order } = await orderResponse.json();
  assert.equal(order.userId, sessionAfterFailure.user.id);
  await page.waitForURL("**/don-hang/*");
  const ownHistory = await page.evaluate(async () =>
    (await fetch("/api/account/orders")).json(),
  );
  assert.ok(ownHistory.orders.some((entry) => entry.id === order.id));
  assert.deepEqual(errors, []);
  pass(
    "temporary cart loading failure preserves identity and CSRF for authenticated checkout and order history",
  );
  console.log(`Passed ${checks} account settings browser checks.`);
} finally {
  await browser?.close();
  await closeServer(app);
  await database.cleanup();
}
