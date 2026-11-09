import test from "node:test";
import assert from "node:assert/strict";
import { createTestDatabase } from "./support/database.mjs";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createOperations } from "../lib/operations.mjs";
import { createStore } from "../db/store.mjs";
import { shippingPolicy } from "../lib/shipping-policy.mjs";
test("upgrade settings validate contacts, retain versions, and daily report reconciles without multiplying order items", async () => {
  const db = await createTestDatabase();
  let app;
  try {
    app = await createApp({ pool: db.pool, legacyPath: null });
    await createAuth(db.pool).ensureAdmin({
      email: "upgrade-api@example.test",
      phone: "0987654321",
      name: "Kiểm thử",
      password: "Upgrade-API-Only-2026",
    });
    const user = (
        await db.pool.query(
          "SELECT id FROM users WHERE email='upgrade-api@example.test'",
        )
      ).rows[0],
      ops = createOperations(db.pool);
    const saved = await ops.saveSetting(
      { key: "hotline", value: "0900000000" },
      user,
    );
    await assert.rejects(() =>
      ops.saveSetting(
        { key: "hotline", value: "0911111111", version: saved.version - 1 },
        user,
      ),
    );
    assert.equal(
      (await ops.settings()).find((s) => s.key === "hotline").value_json,
      "0900000000",
    );
    for (const [key, value] of [
      ["hotline", "not-a-number"],
      ["zalo", "javascript:alert(1)"],
      ["messenger_url", "https://evil.example/"],
      ["email_support", "invalid"],
    ])
      await assert.rejects(() => ops.saveSetting({ key, value }, user));
    const store = await createStore({ pool: db.pool });
    const quote = await store.quote({ items: [{ id: 1, quantity: 1 }] });
    assert.equal(
      quote.freeShippingThreshold,
      shippingPolicy.freeShippingThreshold,
    );
    assert.equal(quote.shippingFee, shippingPolicy.shippingFee);
    const order = await store.createOrder({
      items: [
        { id: 1, quantity: 1 },
        { id: 2, quantity: 1 },
      ],
      payment: "cod",
      idempotencyKey: "upgrade-report-api-0001",
      customer: {
        name: "Khách mẫu",
        phone: "0912345678",
        address: "123 Đường Kiểm Thử",
        province: "TP Hồ Chí Minh",
        district: "Phường mẫu",
      },
    });
    const report = await ops.reports({});
    assert.equal(Number(report.orders), 1);
    assert.equal(Number(report.gmv), order.total);
    assert.equal(Number(report.collected), 0);
    assert.ok(report.series.length >= 30);
    assert.equal(
      report.series.reduce((sum, r) => sum + Number(r.gmv), 0),
      order.total,
    );
    assert.equal(report.topSkus.length, 2);
    assert.equal(
      report.series.reduce((sum, r) => sum + Number(r.orders), 0),
      1,
    );
    await assert.rejects(() =>
      ops.reports({ from: "2026-01-01", to: "2025-01-01" }),
    );
  } finally {
    app?.close();
    await db.cleanup();
  }
});
