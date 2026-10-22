import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createTestDatabase, closeServer } from "./support/database.mjs";
import { createStore } from "../db/store.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createCartService } from "../lib/cart.mjs";
import { createApp } from "../server.mjs";

const password = "PhaseOneTest!123";
const products = [
  {
    id: 1,
    slug: "sua-mau",
    name: "Sữa mẫu",
    brand: "Sample",
    category: "Sữa cho bé",
    type: "milk",
    image: "/assets/milk-green.svg",
    price: 250000,
    oldPrice: 300000,
    stock: 8,
    age: "1–3 tuổi",
    weight: "800g",
    description: "Test",
    features: [],
  },
];
const customer = {
  name: "Người mua thử",
  phone: "0912345678",
  address: "123 Đường Kiểm Thử",
  province: "TP Hồ Chí Minh",
  district: "Quận 1",
};
const orderBody = (key, extra = {}) => ({
  items: [{ id: 1, quantity: 2 }],
  coupon: "",
  customer,
  payment: "cod",
  note: "Đơn thử",
  idempotencyKey: key,
  ...extra,
});
const userBody = (number = 1) => ({
  fullName: `Khách thử ${number}`,
  phone: `091234567${number}`,
  email: `customer${number}@example.com`,
  password,
});
const adminBody = {
  name: "Quản trị thử",
  email: "admin-phase1@example.com",
  phone: "0987654321",
  password,
};
async function fixture(t, { http = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "jielien-phase1-"));
  const database = await createTestDatabase();
  const catalogPath = join(dir, "catalog.json");
  await writeFile(catalogPath, JSON.stringify(products));
  const store = await createStore({
    pool: database.pool,
    catalogPath,
    legacyPath: null,
  });
  const auth = createAuth(database.pool);
  let server, base;
  if (http) {
    server = await createApp({
      pool: database.pool,
      catalogPath,
      legacyPath: null,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
  }
  t.after(async () => {
    await closeServer(server);
    await database.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  const request = async (
    path,
    body,
    { session, csrf = true, method, ...options } = {},
  ) => {
    const headers = {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session
        ? {
            Cookie: session.cookie,
            ...(csrf ? { "X-CSRF-Token": session.csrfToken } : {}),
          }
        : {}),
    };
    const response = await fetch(base + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...options,
    });
    const text = await response.text();
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  };
  const sessionFrom = (result) => ({
    cookie: result.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
    csrfToken: result.data.csrfToken,
    user: result.data.user,
  });
  return { ...database, store, auth, request, sessionFrom, base };
}

test("accounts hash passwords and session tokens; customer cannot bootstrap admin; expiry and revocation are enforced", async (t) => {
  const { pool, auth } = await fixture(t);
  const input = {
    ...userBody(),
    roles: ["admin"],
    permissions: ["users.manage"],
  };
  const registered = await auth.register(input);
  assert.deepEqual(registered.user.roles, ["customer"]);
  assert.deepEqual(registered.user.permissions, []);
  const stored = (
    await pool.query("SELECT password_hash FROM users WHERE id=$1", [
      registered.user.id,
    ])
  ).rows[0];
  assert.notEqual(stored.password_hash, password);
  assert.match(stored.password_hash, /^\$2[aby]\$12\$/);
  const session = (
    await pool.query("SELECT token_hash FROM user_sessions WHERE user_id=$1", [
      registered.user.id,
    ])
  ).rows[0];
  assert.equal(
    session.token_hash,
    createHash("sha256").update(registered.token).digest("hex"),
  );
  assert.notEqual(session.token_hash, registered.token);
  assert.equal(
    (await auth.authenticate(registered.token)).user.id,
    registered.user.id,
  );
  await assert.rejects(
    auth.login({ identifier: input.email, password: "WrongPassword!123" }),
    { status: 401 },
  );
  await assert.rejects(
    auth.register({ ...userBody(2), password: "x".repeat(73) }),
    { status: 400 },
  );
  await assert.rejects(
    auth.register({ ...userBody(2), password: "短".repeat(25) }),
    { status: 400 },
  );
  await assert.rejects(
    auth.ensureAdmin({ email: input.email, phone: input.phone, password }),
    { status: 409 },
  );
  await auth.logout(registered.token);
  assert.equal(await auth.authenticate(registered.token), null);
  const signed = await auth.login({ identifier: input.phone, password });
  await pool.query(
    "UPDATE user_sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_hash=$1",
    [createHash("sha256").update(signed.token).digest("hex")],
  );
  assert.equal(await auth.authenticate(signed.token), null);
  const active = await auth.login({ identifier: input.email, password });
  await pool.query("UPDATE users SET status='inactive' WHERE id=$1", [
    registered.user.id,
  ]);
  assert.equal(await auth.authenticate(active.token), null);
});

test("address ownership and one-default constraint hold for two customers", async (t) => {
  const { auth, pool } = await fixture(t);
  const a = await auth.register(userBody(1)),
    b = await auth.register(userBody(2));
  const address = {
    recipientName: "Khách thử",
    phone: customer.phone,
    provinceCode: "79",
    wardCode: "001",
    province: customer.province,
    district: customer.district,
    addressDetail: customer.address,
    isDefault: true,
  };
  const first = await auth.saveAddress(a.user.id, address);
  await auth.saveAddress(a.user.id, {
    ...address,
    addressDetail: "456 Đường Mẫu",
  });
  const list = await auth.listAddresses(a.user.id);
  assert.equal(list.length, 2);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  assert.equal((await auth.listAddresses(b.user.id)).length, 0);
  await assert.rejects(
    auth.saveAddress(b.user.id, { ...address, id: first.id }),
    { status: 404 },
  );
  const owner = (
    await pool.query("SELECT user_id FROM user_addresses WHERE id=$1", [
      first.id,
    ])
  ).rows[0];
  assert.equal(owner.user_id, a.user.id);
});

test("HTTP sessions use HttpOnly cookies, enforce CSRF and isolate account orders and addresses", async (t) => {
  const { request, sessionFrom } = await fixture(t, { http: true });
  assert.equal((await request("/api/auth/me")).status, 401);
  const registration = await request("/api/auth/register", {
    ...userBody(1),
    roles: ["admin"],
  });
  assert.equal(registration.status, 201);
  assert.match(registration.headers.getSetCookie().join(";"), /HttpOnly/i);
  assert.match(registration.headers.getSetCookie().join(";"), /SameSite=Lax/i);
  const a = sessionFrom(registration);
  assert.deepEqual(a.user.roles, ["customer"]);
  assert.equal(
    (await request("/api/auth/me", undefined, { session: a })).status,
    200,
  );
  assert.equal(
    (await request("/api/admin/orders", undefined, { session: a })).status,
    403,
  );
  const address = {
    recipientName: "Người nhận",
    phone: customer.phone,
    addressDetail: customer.address,
    province: customer.province,
    district: customer.district,
    isDefault: true,
  };
  assert.equal(
    (
      await request("/api/account/addresses", address, {
        session: a,
        csrf: false,
      })
    ).status,
    403,
  );
  const saved = await request("/api/account/addresses", address, {
    session: a,
  });
  assert.equal(saved.status, 201);
  assert.equal(
    (
      await request("/api/orders", orderBody("account-csrf-001"), {
        session: a,
        csrf: false,
      })
    ).status,
    403,
  );
  const created = await request("/api/orders", orderBody("account-order-001"), {
    session: a,
  });
  assert.equal(created.status, 201);
  const number = created.data.order.id;
  const mine = await request("/api/account/orders", undefined, { session: a });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.orders.length, 1);
  assert.equal(mine.data.orders[0].id, number);
  assert.equal(mine.data.orders[0].token, undefined);
  const b = sessionFrom(await request("/api/auth/register", userBody(2)));
  assert.equal(
    (await request("/api/orders/" + number, undefined, { session: b })).status,
    404,
  );
  assert.equal(
    (await request("/api/account/orders", undefined, { session: b })).data
      .orders.length,
    0,
  );
  assert.equal(
    (await request("/api/account/addresses", undefined, { session: b })).data
      .addresses.length,
    0,
  );
  const overwrite = await request(
    "/api/account/addresses",
    { ...address, id: saved.data.address.id },
    { session: b },
  );
  assert.equal(overwrite.status, 404);
  const logout = await request("/api/auth/logout", {}, { session: a });
  assert.ok([200, 204].includes(logout.status));
  assert.equal(
    (await request("/api/auth/me", undefined, { session: a })).status,
    401,
  );
});

test("admin changes are permission/CSRF checked, pricing is database-backed, reservations release or consume and audit persists", async (t) => {
  const { auth, request, sessionFrom, pool } = await fixture(t, { http: true });
  await auth.ensureAdmin(adminBody);
  const login = await request("/api/auth/login", {
    identifier: adminBody.email,
    password,
  });
  assert.equal(login.status, 200);
  const admin = sessionFrom(login);
  assert.ok(admin.user.permissions.includes("inventory.manage"));
  assert.equal(
    (await request("/api/admin/dashboard", undefined, { session: admin }))
      .status,
    200,
  );
  const order = (await request("/api/orders", orderBody("admin-flow-001"))).data
    .order;
  assert.ok(order?.id);
  let balance = (
    await pool.query(
      "SELECT on_hand,reserved FROM inventory_balances WHERE warehouse_id=1 AND variant_id=1",
    )
  ).rows[0];
  assert.deepEqual(balance, { on_hand: 8, reserved: 2 });
  assert.equal(
    (
      await request(
        "/api/admin/variants/1",
        { price: 300000 },
        { session: admin, csrf: false, method: "PATCH" },
      )
    ).status,
    403,
  );
  const edited = await request(
    "/api/admin/variants/1",
    { price: 300000, originalPrice: 350000 },
    { session: admin, method: "PATCH" },
  );
  assert.equal(edited.status, 200);
  assert.equal((await request("/api/products")).data.products[0].price, 300000);
  assert.equal(
    (await request("/api/orders/" + order.id + "?token=" + order.token)).data
      .order.items[0].price,
    250000,
  );
  const bad = await request(
    "/api/admin/inventory/adjust",
    {
      variantId: 1,
      warehouseId: 1,
      quantityChange: -7,
      reason: "Không được giảm dưới giữ tồn",
    },
    { session: admin },
  );
  assert.equal(bad.status, 409);
  const adjustment = await request(
    "/api/admin/inventory/adjust",
    {
      variantId: 1,
      warehouseId: 1,
      quantityChange: 2,
      reason: "Nhập thêm hàng kiểm thử",
    },
    { session: admin },
  );
  assert.equal(adjustment.status, 200);
  assert.equal(
    (
      await request(
        `/api/admin/orders/${order.id}/status`,
        { status: "shipped" },
        { session: admin, method: "PATCH" },
      )
    ).status,
    409,
  );
  for (const status of ["confirmed", "processing", "shipped", "delivered"]) {
    const result = await request(
      `/api/admin/orders/${order.id}/status`,
      { status },
      { session: admin, method: "PATCH" },
    );
    assert.equal(
      result.status,
      200,
      `${status}: ${JSON.stringify(result.data)}`,
    );
    assert.equal(result.data.order.status, status);
  }
  balance = (
    await pool.query(
      "SELECT on_hand,reserved FROM inventory_balances WHERE warehouse_id=1 AND variant_id=1",
    )
  ).rows[0];
  assert.deepEqual(balance, { on_hand: 8, reserved: 0 });
  const second = (
    await request(
      "/api/orders",
      orderBody("admin-cancel-001", { items: [{ id: 1, quantity: 1 }] }),
    )
  ).data.order;
  const cancel = await request(
    `/api/admin/orders/${second.id}/status`,
    { status: "cancelled" },
    { session: admin, method: "PATCH" },
  );
  assert.equal(cancel.status, 200);
  balance = (
    await pool.query(
      "SELECT on_hand,reserved FROM inventory_balances WHERE warehouse_id=1 AND variant_id=1",
    )
  ).rows[0];
  assert.deepEqual(balance, { on_hand: 8, reserved: 0 });
  const payment = (
    await pool.query(
      "SELECT status FROM payments WHERE order_id=(SELECT id FROM orders WHERE order_number=$1)",
      [second.id],
    )
  ).rows[0];
  assert.equal(payment.status, "cancelled");
  const logs = await request("/api/admin/audit", undefined, { session: admin });
  assert.equal(logs.status, 200);
  assert.ok(logs.data.logs.some((log) => log.action === "variant.updated"));
  assert.ok(logs.data.logs.some((log) => log.action === "inventory.adjusted"));
  assert.ok(
    logs.data.logs.some((log) => log.action === "order.status_changed"),
  );
});

test("coupon use limit is transactional under concurrent checkout requests", async (t) => {
  const { pool, store } = await fixture(t);
  await pool.query("UPDATE coupons SET usage_limit=1 WHERE code='MEBE50'");
  const results = await Promise.allSettled(
    ["coupon-race-001", "coupon-race-002"].map((key) =>
      store.createOrder(orderBody(key, { coupon: "MEBE50" })),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const coupon = (
    await pool.query("SELECT used_count FROM coupons WHERE code='MEBE50'")
  ).rows[0];
  assert.equal(coupon.used_count, 1);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS count FROM coupon_redemptions",
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (await pool.query("SELECT count(*)::integer AS count FROM orders")).rows[0]
      .count,
    1,
  );
  assert.equal((await store.listProducts())[0].stock, 6);
});

test("authenticated carts persist per user, validate SKU/stock and do not reserve inventory before checkout", async (t) => {
  const { pool, auth } = await fixture(t);
  const a = await auth.register(userBody(1)),
    b = await auth.register(userBody(2));
  const carts = createCartService(pool);
  assert.deepEqual(await carts.getCart(a.user.id), []);
  await carts.saveCart(a.user.id, [{ id: 1, quantity: 2 }]);
  assert.deepEqual(await carts.getCart(a.user.id), [{ id: 1, quantity: 2 }]);
  assert.deepEqual(await createCartService(pool).getCart(a.user.id), [
    { id: 1, quantity: 2 },
  ]);
  assert.deepEqual(await carts.getCart(b.user.id), []);
  const before = (
    await pool.query(
      "SELECT on_hand,reserved FROM inventory_balances WHERE warehouse_id=1 AND variant_id=1",
    )
  ).rows[0];
  assert.deepEqual(before, { on_hand: 8, reserved: 0 });
  for (const items of [
    [{ id: 1, quantity: 0 }],
    [{ id: 999, quantity: 1 }],
    [{ id: 1, quantity: 9 }],
    [
      { id: 1, quantity: 1 },
      { id: 1, quantity: 1 },
    ],
  ])
    await assert.rejects(carts.saveCart(a.user.id, items));
  assert.deepEqual(await carts.getCart(a.user.id), [{ id: 1, quantity: 2 }]);
  await carts.saveCart(a.user.id, []);
  assert.deepEqual(await carts.getCart(a.user.id), []);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::integer AS count FROM carts WHERE user_id=$1 AND status='active'",
        [a.user.id],
      )
    ).rows[0].count,
    1,
  );
});
