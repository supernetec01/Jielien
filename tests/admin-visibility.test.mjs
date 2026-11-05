import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canAccessAdmin } from "../public/admin-access.js";

test("Admin entry is hidden for guests and customers", () => {
  assert.equal(canAccessAdmin(null), false);
  assert.equal(canAccessAdmin({ roles: ["customer"], permissions: [] }), false);
  assert.equal(canAccessAdmin({ roles: ["customer"], permissions: ["catalog.read"] }), false);
});

test("Admin entry is visible for staff with an actual workspace permission", () => {
  for (const permission of ["dashboard.read", "catalog.read", "orders.read", "content.read", "settings.read", "reports.read"]) {
    assert.equal(canAccessAdmin({ roles: ["staff"], permissions: [permission] }), true);
  }
  assert.equal(canAccessAdmin({ roles: ["viewer"], permissions: ["catalog.read"] }), true);
  assert.equal(canAccessAdmin({ roles: ["warehouse"], permissions: ["inventory.read"] }), true);
});

test("Staff roles without Admin screen access do not get an entry", () => {
  assert.equal(canAccessAdmin({ roles: ["staff"], permissions: [] }), false);
  assert.equal(canAccessAdmin({ roles: ["staff"], permissions: ["unrelated.read"] }), false);
});

test("The storefront hides its Admin link before authentication", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="staff-admin-link" hidden style="display:none"/);
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /canAccessAdmin\(identity\)/);
});
