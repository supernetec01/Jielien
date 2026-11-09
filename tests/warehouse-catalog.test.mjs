import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createApp } from "./support/app.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
test("three private SKUs retain independent images/prices/stocks; multiwarehouse allocation, stale prices, deletion and snapshots remain consistent", async (t) => {
  const db = await createTestDatabase(),
    dir = await mkdtemp(join(tmpdir(), "warehouse-fixture-"));
  let app;
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  app = await createApp({
    pool: db.pool,
    legacyPath: null,
    mediaDirectory: dir,
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`,
    auth = createAuth(db.pool);
  await auth.ensureAdmin({
    name: "Admin kho",
    email: "warehouse@example.test",
    phone: "0987654321",
    password: "Warehouse-Fixture-2026!",
  });
  const session = await auth.login({
    identifier: "warehouse@example.test",
    password: "Warehouse-Fixture-2026!",
  });
  const request = async (
    path,
    body,
    method = "GET",
    authorized = true,
    csrf = true,
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authorized ? { Cookie: `jielien_session=${session.token}` } : {}),
        ...(csrf ? { "X-CSRF-Token": session.csrfToken } : {}),
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
  const catalog = "/api/admin/catalog/products";
  let p = (
    await ok(
      catalog,
      { name: "Bộ thử ba SKU", slug: "bo-thu-ba-sku", categoryIds: [1] },
      "POST",
    )
  ).product;
  p = (
    await ok(
      `${catalog}/${p.id}/variants`,
      {
        version: p.version,
        variants: [1, 2, 3].map((i) => ({
          name: "Loại " + i,
          sku: "PRIVATE-TEST-" + i,
          price: i * 100,
          originalPrice: i * 100,
          status: "active",
        })),
      },
      "POST",
    )
  ).product;
  const ids = p.variants.map((v) => v.id),
    other = (
      await ok(
        catalog,
        {
          name: "Sản phẩm riêng thứ hai",
          slug: "san-pham-rieng-thu-hai",
          categoryIds: [1],
        },
        "POST",
      )
    ).product;
  assert.equal(
    (
      await request(
        `${catalog}/${other.id}/variants`,
        {
          version: other.version,
          variants: [
            {
              ...p.variants[0],
              rowVersion: p.variants[0].row_version,
              originalPrice: 100,
            },
          ],
        },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `${catalog}/${other.id}/variants`,
        {
          version: other.version,
          variants: [{ name: "Trùng SKU", sku: "private-test-1", price: 10 }],
        },
        "POST",
      )
    ).status,
    409,
  );
  const images = [];
  for (const [i, color] of ["#cc3333", "#33cc33", "#3333cc"].entries()) {
    const image = await sharp({
      create: { width: 80, height: 80, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    const r = await fetch(base + "/api/admin/media/uploads", {
      method: "POST",
      headers: {
        Cookie: `jielien_session=${session.token}`,
        "X-CSRF-Token": session.csrfToken,
        "Content-Type": "image/png",
        "X-Image-Alt": encodeURIComponent("Ảnh SKU " + (i + 1)),
      },
      body: image,
    });
    assert.equal(r.status, 201);
    images.push((await r.json()).asset);
  }
  p = (
    await ok(
      `${catalog}/${p.id}/media`,
      {
        version: p.version,
        media: images.map((a, i) => ({ assetId: a.id, variantId: ids[i] })),
      },
      "PUT",
    )
  ).product;
  assert.equal(
    (
      await request(
        `${catalog}/${other.id}/media`,
        {
          version: other.version,
          media: [{ assetId: images[0].id, variantId: ids[0] }],
        },
        "PUT",
      )
    ).status,
    400,
  );
  p = (
    await ok(
      `${catalog}/${p.id}`,
      {
        version: p.version,
        name: p.name,
        slug: p.slug,
        status: "active",
        description: "Ba lựa chọn riêng",
        categoryIds: [1],
      },
      "PATCH",
    )
  ).product;
  const w1 = (await ok("/api/admin/warehouses", { name: "Kho thử A" }, "POST"))
      .warehouse,
    w2 = (await ok("/api/admin/warehouses", { name: "Kho thử B" }, "POST"))
      .warehouse;
  assert.equal(
    (
      await request(
        "/api/admin/warehouses",
        { name: "Không có quyền" },
        "POST",
        false,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/admin/warehouses",
        { name: "Thiếu CSRF" },
        "POST",
        true,
        false,
      )
    ).status,
    403,
  );
  const stocks = async (w) => (await ok("/api/admin/warehouses/" + w)).items;
  for (let i = 0; i < 3; i++)
    await ok(
      `/api/admin/warehouses/${w1.id}/skus/${ids[i]}`,
      {
        quantity: [5, 7, 9][i],
        price: (i + 1) * 100,
        originalPrice: (i + 1) * 100,
        reason: "Nhập hàng fixture",
      },
      "POST",
    );
  await ok(
    `/api/admin/warehouses/${w2.id}/skus/${ids[0]}`,
    { quantity: 3, price: 80, originalPrice: 100, reason: "Giá kho B fixture" },
    "POST",
  );
  const detail = (await ok("/api/catalog/products/private-test-1")).product;
  assert.equal(detail.price, 80);
  assert.equal(detail.stock, 8);
  assert.equal(detail.image, images[0].url);
  const options = (await ok("/api/catalog/products/private-test-1")).variants;
  assert.equal(options.length, 3);
  for (let i = 0; i < 3; i++) {
    const variant = (await ok("/api/catalog/products/private-test-" + (i + 1)))
      .product;
    assert.equal(variant.image, images[i].url);
    assert.equal(variant.stock, [8, 7, 9][i]);
    assert.equal(variant.price, [80, 200, 300][i]);
  }
  let quote = await ok(
    "/api/quote",
    { items: [{ id: ids[0], quantity: 4 }] },
    "POST",
  );
  assert.equal(quote.subtotal, 340);
  assert.deepEqual(
    quote.items[0].allocations.map((a) => [a.warehouseId, a.quantity, a.price]),
    [
      [w2.id, 3, 80],
      [w1.id, 1, 100],
    ],
  );
  const customer = {
    name: "Khách fixture",
    phone: "0912345678",
    province: "TP Hồ Chí Minh",
    district: "Khu thử",
    address: "123 Đường Kiểm Thử",
  };
  const payload = {
    items: [{ id: ids[0], quantity: 4 }],
    customer,
    payment: "cod",
    idempotencyKey: "warehouse-fixture-order-0001",
    pricingKey: quote.pricingKey,
  };
  let row = (await stocks(w2.id))[0];
  await ok(
    `/api/admin/warehouses/${w2.id}/skus/${ids[0]}`,
    {
      quantity: 3,
      price: 90,
      originalPrice: 100,
      version: row.row_version,
      reason: "Đổi giá sau báo giá",
    },
    "PUT",
  );
  assert.equal((await request("/api/orders", payload, "POST")).status, 409);
  assert.equal(
    Number(
      (
        await db.pool.query(
          "SELECT sum(reserved) AS n FROM inventory_balances WHERE variant_id=$1",
          [ids[0]],
        )
      ).rows[0].n,
    ),
    0,
  );
  quote = await ok("/api/quote", { items: payload.items }, "POST");
  payload.pricingKey = quote.pricingKey;
  const order = (await ok("/api/orders", payload, "POST")).order;
  assert.equal(order.subtotal, 370);
  assert.equal(order.items.length, 2);
  assert.equal((await ok("/api/orders", payload, "POST")).order.id, order.id);
  assert.equal(
    (
      await request(
        `${catalog}/${p.id}`,
        { version: p.version, reason: "Không được xóa hàng đang giữ" },
        "DELETE",
      )
    ).status,
    409,
  );
  row = (await stocks(w2.id))[0];
  assert.equal(
    (
      await request(
        `/api/admin/warehouses/${w2.id}/skus/${ids[0]}`,
        { version: row.row_version, reason: "Không được xóa hàng đang giữ" },
        "DELETE",
      )
    ).status,
    409,
  );
  await ok(
    `/api/admin/orders/${order.id}/status`,
    { status: "cancelled", note: "Hủy fixture để kiểm tra xóa" },
    "PATCH",
  );
  const returnedOrder = (
    await ok(
      "/api/orders",
      {
        ...payload,
        idempotencyKey: "warehouse-delivered-fixture-02",
        pricingKey: (await ok("/api/quote", { items: payload.items }, "POST"))
          .pricingKey,
      },
      "POST",
    )
  ).order;
  for (const status of ["confirmed", "processing", "shipped", "delivered"])
    await ok(
      `/api/admin/orders/${returnedOrder.id}/status`,
      { status, note: "Giao hàng fixture" },
      "PATCH",
    );
  let returned = (
    await ok(
      "/api/admin/returns",
      {
        orderNumber: returnedOrder.id,
        reason: "Hoàn toàn bộ SKU từ hai kho",
        items: [{ variantId: ids[0], quantity: 4, condition: "sealed" }],
      },
      "POST",
    )
  ).item;
  assert.equal(
    (
      await request(
        `${catalog}/${p.id}`,
        { version: p.version, reason: "Không xóa khi còn yêu cầu hoàn" },
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    Number(
      (
        await db.pool.query(
          "SELECT sum(quantity) AS n FROM return_items WHERE return_id=$1",
          [returned.id],
        )
      ).rows[0].n,
    ),
    4,
  );
  for (const action of [
    "authorize",
    "receive",
    "inspect",
    "approve",
    "complete",
  ])
    returned = (
      await ok(
        `/api/admin/returns/${returned.id}/${action}`,
        { version: returned.version },
        "POST",
      )
    ).item;
  row = (await stocks(w2.id))[0];
  await ok(
    `/api/admin/warehouses/${w2.id}/skus/${ids[0]}`,
    { version: row.row_version, reason: "Xóa riêng tại kho B" },
    "DELETE",
  );
  assert.equal((await stocks(w1.id)).length, 3);
  assert.equal((await stocks(w2.id)).length, 0);
  row = (await stocks(w1.id)).find((r) => r.variant_id === ids[1]);
  const mutations = await Promise.all(
    [8, 10].map((quantity) =>
      request(
        `/api/admin/warehouses/${w1.id}/skus/${ids[1]}`,
        {
          version: row.row_version,
          quantity,
          price: 200,
          originalPrice: 200,
          reason: "Sửa đồng thời",
        },
        "PUT",
      ),
    ),
  );
  assert.deepEqual(mutations.map((r) => r.status).sort(), [200, 409]);
  const race = await Promise.all(
    [1, 2].map((n) =>
      request(
        "/api/orders",
        {
          items: [{ id: ids[2], quantity: 9 }],
          customer,
          payment: "cod",
          idempotencyKey: "warehouse-last-stock-race-" + n,
        },
        "POST",
      ),
    ),
  );
  assert.deepEqual(
    race.map((r) => r.status).sort(),
    [201, 409],
    "concurrent checkout cannot oversell",
  );
  const winner = race.find((r) => r.status === 201).data.order;
  await ok(
    `/api/admin/orders/${winner.id}/status`,
    { status: "cancelled", note: "Hủy đơn kiểm thử tranh tồn" },
    "PATCH",
  );
  const beforeReceipt = (await stocks(w1.id)).find(
    (r) => r.variant_id === ids[1],
  );
  await ok(
    `/api/admin/warehouses/${w1.id}/skus/${ids[1]}`,
    {
      version: beforeReceipt.row_version,
      quantity: 2,
      mode: "receive",
      reason: "Nhập thêm không ghi đè tồn",
    },
    "PUT",
  );
  assert.equal(
    (await stocks(w1.id)).find((r) => r.variant_id === ids[1]).on_hand,
    beforeReceipt.on_hand + 2,
  );
  const rowsBeforeRemoval = await stocks(w1.id);
  const versions = rowsBeforeRemoval.map((r) => ({
    variantId: r.variant_id,
    version: r.row_version,
  }));
  assert.equal(
    (
      await request(
        `/api/admin/warehouses/${w1.id}/products/${p.id}`,
        {
          reason: "Sai phiên bản không được xóa",
          versions: versions.map((v) => ({ ...v, version: 0 })),
        },
        "DELETE",
      )
    ).status,
    409,
  );
  await ok(
    `/api/admin/warehouses/${w1.id}/products/${p.id}`,
    { reason: "Xóa cả sản phẩm riêng ở kho A", versions },
    "DELETE",
  );
  assert.equal((await stocks(w1.id)).length, 0);
  let document = (
    await ok(
      "/api/admin/inventory/documents",
      {
        type: "receipt",
        targetWarehouseId: w1.id,
        reason: "Phiếu nhập cũ trước khi xóa",
        items: [{ variantId: ids[0], quantity: 1 }],
      },
      "POST",
    )
  ).document;
  for (const action of ["submit", "approve"])
    document = (
      await ok(
        `/api/admin/inventory/documents/${document.id}/${action}`,
        { version: document.version },
        "POST",
      )
    ).document;
  await ok(
    `${catalog}/${p.id}`,
    { version: p.version, reason: "Dọn sản phẩm thử và tồn mọi kho" },
    "DELETE",
  );
  assert.equal((await request(`${catalog}/${p.id}`)).status, 404);
  assert.equal(
    (await request("/api/catalog/products/private-test-1")).status,
    404,
  );
  assert.equal(
    Number(
      (
        await db.pool.query(
          "SELECT count(*) FROM inventory_balances WHERE variant_id=ANY($1::bigint[])",
          [ids],
        )
      ).rows[0].count,
    ),
    0,
  );
  assert.equal(
    (
      await request(
        `/api/admin/warehouses/${w1.id}/skus/${ids[0]}`,
        {
          quantity: 5,
          price: 1,
          originalPrice: 1,
          reason: "Không cho phục hồi tồn ngầm",
        },
        "POST",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/admin/inventory/documents/${document.id}/post`,
        { version: document.version },
        "POST",
      )
    ).status,
    409,
    "old receipt cannot resurrect deleted stock",
  );
  const historical = (
    await ok("/api/orders/" + order.id + "?token=" + order.token)
  ).order;
  assert.equal(historical.subtotal, 370);
  assert.equal(historical.items[0].image, images[0].url);
  assert.deepEqual(
    historical.items.map((i) => i.price),
    [90, 100],
  );
  assert.equal((await fetch(base + images[0].url)).status, 200);
  const net = (
    await db.pool.query(
      "SELECT sum(quantity_change) AS total FROM inventory_movements WHERE variant_id=ANY($1::bigint[])",
      [ids],
    )
  ).rows[0].total;
  assert.equal(Number(net), 0, "inventory ledger reconciles after deletion");
});
