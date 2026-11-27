import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";

test("opening stock at product creation lands in the chosen warehouse with an opening movement; quick edits keep price sync honest", async (t) => {
  const db = await createTestDatabase();
  let app;
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
  });
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const auth = createAuth(db.pool);
  await auth.ensureAdmin({
    name: "Admin tồn đầu",
    email: "opening-stock@example.test",
    phone: "0987654321",
    password: "Opening-Stock-Fixture-2026!",
  });
  const session = await auth.login({
    identifier: "opening-stock@example.test",
    password: "Opening-Stock-Fixture-2026!",
  });
  const request = async (path, body, method = "GET") => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: `jielien_session=${session.token}`,
        "X-CSRF-Token": session.csrfToken,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json() };
  };
  const ok = async (path, body, method = "GET") => {
    const r = await request(path, body, method);
    assert.ok(r.status < 300, JSON.stringify(r));
    return r.data;
  };

  const warehouses = (await ok("/api/admin/warehouses")).warehouses;
  assert.ok(warehouses.length >= 1, "fixture có kho mặc định");
  const warehouse = warehouses.find((w) => w.type === "normal");

  const editorBody = {
    name: "Sản phẩm nhập tồn lúc tạo",
    slug: "san-pham-nhap-ton-luc-tao",
    categoryIds: [1],
    status: "draft",
    variants: [1, 2].map((i) => ({
      name: "Loại " + i,
      sku: "OPENING-STOCK-" + i,
      price: 100000 * i,
      originalPrice: 100000 * i,
    })),
    stock: {
      warehouseId: warehouse.id,
      items: [
        { sku: "OPENING-STOCK-1", quantity: 12 },
        { sku: "OPENING-STOCK-2", quantity: 0 },
      ],
    },
  };
  const created = (await ok("/api/admin/catalog/products/editor", editorBody, "POST")).product;
  const ids = created.variants.map((v) => v.id);

  const stock = await ok(`/api/admin/catalog/products/${created.id}/stock`);
  assert.deepEqual(
    stock.items.map((r) => [r.id, Number(r.available)]),
    [[ids[0], 12], [ids[1], 0]],
  );
  assert.equal(stock.balances.length, 2, "cả SKU 0 tồn cũng được đăng ký vào kho");
  assert.ok(stock.warehouses.some((w) => w.id === warehouse.id));
  const movements = (
    await db.pool.query(
      "SELECT variant_id,quantity_change,movement_type,reference_type FROM inventory_movements WHERE variant_id=ANY($1::bigint[]) ORDER BY variant_id",
      [ids],
    )
  ).rows;
  assert.deepEqual(movements, [
    { variant_id: ids[0], quantity_change: 12, movement_type: "opening", reference_type: "product_created" },
  ]);

  assert.equal(
    (await request(`/api/admin/catalog/products/${created.id}/editor`, {
      version: created.version,
      stock: { warehouseId: warehouse.id, items: [{ sku: "OPENING-STOCK-1", quantity: 5 }] },
    }, "PATCH")).status,
    400,
    "không nhập tồn qua PATCH sản phẩm đã có",
  );
  for (const bad of [
    { warehouseId: 999999, items: [{ sku: "OPENING-STOCK-1", quantity: 1 }] },
    { warehouseId: warehouse.id, items: [{ sku: "KHONG-TON-TAI", quantity: 1 }] },
    { warehouseId: warehouse.id, items: [{ sku: "OPENING-STOCK-1", quantity: -2 }] },
    { warehouseId: warehouse.id, items: [{ sku: "OPENING-STOCK-1", quantity: 1 }, { sku: "OPENING-STOCK-1", quantity: 2 }] },
  ]) {
    const r = await request("/api/admin/catalog/products/editor", {
      name: "Sản phẩm lỗi tồn",
      slug: "san-pham-loi-ton-" + Math.random().toString(36).slice(2, 8),
      categoryIds: [1],
      variants: [{ name: "Loại 1", sku: "OPENING-BAD-" + Math.random().toString(36).slice(2, 8).toUpperCase(), price: 1000 }],
      stock: bad,
    }, "POST");
    assert.equal(r.status, 400, JSON.stringify(bad));
  }

  // Sửa tồn nhanh từ phía sản phẩm dùng đúng API kho: đặt số mới kèm lý do.
  const balance = stock.balances.find((b) => b.variant_id === ids[0]);
  await ok(`/api/admin/warehouses/${warehouse.id}/skus/${ids[0]}`, {
    quantity: 20,
    mode: "set",
    reason: "Kiểm kê fixture",
    version: balance.row_version,
  }, "PUT");
  const afterSet = await ok(`/api/admin/catalog/products/${created.id}/stock`);
  assert.equal(Number(afterSet.items.find((r) => r.id === ids[0]).available), 20);
  const fresh = afterSet.balances.find((b) => b.variant_id === ids[0]);
  await ok(`/api/admin/warehouses/${warehouse.id}/skus/${ids[0]}`, {
    quantity: 3,
    mode: "receive",
    reason: "Nhập thêm fixture",
    version: fresh.row_version,
  }, "PUT");
  const afterReceive = await ok(`/api/admin/catalog/products/${created.id}/stock`);
  assert.equal(Number(afterReceive.items.find((r) => r.id === ids[0]).available), 23);

  // Giá tại kho bằng giá SKU thì không bị đánh dấu override; đổi giá SKU phải đồng bộ.
  const synced = (
    await db.pool.query("SELECT price_override FROM inventory_balances WHERE variant_id=$1", [ids[0]])
  ).rows[0];
  assert.equal(synced.price_override, false, "sửa tồn không ngắt đồng bộ giá");
  await ok(`/api/admin/catalog/products/${created.id}/variants`, {
    version: created.version,
    variants: created.variants.map((v) => ({
      id: v.id,
      rowVersion: v.row_version,
      name: v.name,
      sku: v.sku,
      price: v.id === ids[0] ? 150000 : v.price,
      originalPrice: v.id === ids[0] ? 150000 : v.original_price,
    })),
  }, "POST");
  const syncedPrice = (
    await db.pool.query("SELECT price,price_override FROM inventory_balances WHERE variant_id=$1", [ids[0]])
  ).rows[0];
  assert.equal(syncedPrice.price, 150000, "giá kho đồng bộ theo giá SKU khi không override");
  assert.equal(syncedPrice.price_override, false);

  // Đặt giá kho khác giá SKU thì override thật và không bị đồng bộ đè.
  const row = (await ok(`/api/admin/warehouses/${warehouse.id}`)).items.find((i) => i.variant_id === ids[0]);
  await ok(`/api/admin/warehouses/${warehouse.id}/skus/${ids[0]}`, {
    quantity: row.on_hand,
    price: 140000,
    originalPrice: 150000,
    reason: "Giá riêng tại kho fixture",
    version: row.row_version,
  }, "PUT");
  const overridden = (
    await db.pool.query("SELECT price,price_override FROM inventory_balances WHERE variant_id=$1", [ids[0]])
  ).rows[0];
  assert.equal(overridden.price_override, true);
  assert.equal(overridden.price, 140000);
});