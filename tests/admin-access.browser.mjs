import assert from "node:assert/strict";
import { once } from "node:events";
import { chromium } from "playwright-core";
import { createApp } from "../server.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
let app, browser;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    auth = createAuth(db.pool),
    password = "Navigation-Test-Only!2026";
  const admin = await auth.ensureAdmin({
    name: "Admin test",
    username: "admin",
    phone: "0987654321",
    email: "admin@example.test",
    password,
  });
  const customer = await auth.register({
    fullName: "Customer test",
    phone: "0912345678",
    password,
  });
  await db.pool.query("INSERT INTO roles(name) VALUES('navigation_no_access')");
  await auth.createStaff(admin.id, {
    fullName: "No access staff",
    username: "no.access",
    phone: "0912345679",
    password,
    roles: ["navigation_no_access"],
  });
  await auth.createStaff(admin.id, {
    fullName: "Viewer test",
    username: "viewer.test",
    phone: "0912345670",
    password,
    roles: ["viewer"],
  });
  const sessions = {
    guest: null,
    customer,
    no_access: await auth.login({ identifier: "no.access", password }),
    viewer: await auth.login({ identifier: "viewer.test", password }),
    admin: await auth.login({ identifier: "admin", password }),
  };
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  for (const [name, session] of Object.entries(sessions)) {
    const allow = ["viewer", "admin"].includes(name),
      context = await browser.newContext({
        viewport: { width: 375, height: 900 },
      });
    if (session)
      await context.addCookies([
        {
          url: base,
          name: "jielien_session",
          value: session.token,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/");
    await page.locator(".hero").waitFor();
    assert.equal(
      await page.locator("#staff-admin-link").isVisible(),
      allow,
      `${name}: footer visibility`,
    );
    assert.equal(
      await page.getByText("JIELIEN DESIGN CONCEPT", { exact: false }).count(),
      0,
    );
    await page.goto(base + "/tai-khoan");
    await page.locator(session ? "#profile-form" : "#auth-form").waitFor();
    assert.equal(
      await page.locator('a[href="/quan-tri"]').count(),
      allow ? 1 : 0,
      `${name}: account link`,
    );
    await page.goto(base + "/quan-tri");
    await page.locator(allow ? ".admin-layout" : ".access-panel").waitFor();
    assert.equal(
      await page.locator(".admin-layout").count(),
      allow ? 1 : 0,
      `${name}: direct admin shell`,
    );
    const products = await context.request.get(base + "/api/admin/products");
    assert.equal(products.status(), session ? (allow ? 200 : 403) : 401);
    const users = await context.request.get(base + "/api/admin/users");
    assert.equal(
      users.status(),
      session ? (name === "admin" ? 200 : 403) : 401,
    );
    if (name !== "admin") {
      const mutation = await context.request.patch(
        base + "/api/admin/variants/1",
        {
          headers: session ? { "X-CSRF-Token": session.csrfToken } : {},
          data: { price: 1, rowVersion: 1 },
        },
      );
      assert.equal(
        mutation.status(),
        session ? 403 : 401,
        `${name}: mutation denied`,
      );
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${name} footer/account/direct access and backend RBAC`);
    await context.close();
  }
  // A new page/session after logout must not retain the old staff entry.
  const context = await browser.newContext();
  const session = sessions.admin;
  await context.addCookies([
    {
      url: base,
      name: "jielien_session",
      value: session.token,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  await page.goto(base + "/tai-khoan");
  await page.locator("#logout").click();
  await page.locator("#auth-form").waitFor();
  await page.goto(base + "/");
  await page.locator(".hero").waitFor();
  assert.equal(await page.locator("#staff-admin-link").isVisible(), false);
  await context.close();
  console.log("PASS: logout hides the staff entry on next storefront visit");
  console.log("Admin navigation browser complete: 6 checks passed.");
} finally {
  await browser?.close();
  await closeServer(app);
  await db.cleanup();
}
