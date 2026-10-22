import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../server.mjs";

const products = [
  {
    id: 1,
    slug: "sua-cho-be",
    name: "Sữa cho bé",
    image: "/product-milk.svg",
    price: 250000,
    oldPrice: 290000,
    stock: 3,
  },
  {
    id: 2,
    slug: "binh-sua",
    name: "Bình sữa",
    image: "/product-bottle.svg",
    price: 99000,
    oldPrice: 129000,
    stock: 8,
  },
  {
    id: 3,
    slug: "het-hang",
    name: "Hết hàng",
    image: "/product-toy.svg",
    price: 150000,
    oldPrice: 190000,
    stock: 0,
  },
];
const customer = {
  name: "Nguyễn An",
  phone: "0912345678",
  email: "an@example.com",
  address: "123 Đường Mới",
  province: "Hồ Chí Minh",
  district: "Quận 1",
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "jielien-api-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(catalogPath, JSON.stringify(products));
  let server;
  const start = async () => {
    server = await createApp({ dataDir: join(dir, "data"), catalogPath });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await start();
  const request = async (path, body, options = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      ...options,
    });
    return {
      status: response.status,
      headers: response.headers,
      data: await response.json(),
    };
  };
  t.after(async () => {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return {
    request,
    restart: async () => {
      await new Promise((resolve) => server.close(resolve));
      base = await start();
    },
    base: () => base,
  };
}
const orderBody = (overrides = {}) => ({
  items: [{ id: 1, quantity: 1 }],
  coupon: "",
  customer,
  payment: "cod",
  note: "Gọi trước khi giao",
  idempotencyKey: "test-request-0001",
  ...overrides,
});

test("catalog and quote use authoritative prices and shipping, not submitted totals", async (t) => {
  const { request } = await fixture(t);
  const result = await request("/api/products");
  assert.equal(result.status, 200);
  assert.equal(result.data.products.length, 3);
  assert.equal(result.headers.get("cache-control"), "no-store");
  const q = await request("/api/quote", {
    items: [{ id: 1, quantity: 1, price: 1 }],
    subtotal: 1,
    total: 1,
    shipping: 0,
  });
  assert.equal(q.status, 200);
  assert.equal(q.data.items[0].price, 250000);
  assert.equal(q.data.total, 275000);
  assert.equal(q.data.shipping, 25000);
});
test("coupons enforce thresholds and recompute totals", async (t) => {
  const { request } = await fixture(t);
  const q = await request("/api/quote", {
    items: [{ id: 1, quantity: 2 }],
    coupon: "mebe50",
  });
  assert.equal(q.data.discount, 50000);
  assert.equal(q.data.shipping, 0);
  assert.equal(q.data.total, 450000);
  const free = await request("/api/quote", {
    items: [
      { id: 1, quantity: 1 },
      { id: 2, quantity: 1 },
    ],
    coupon: "FREESHIP",
  });
  assert.equal(free.data.total, 349000);
  assert.equal(free.data.shipping, 0);
  for (const coupon of ["MEBE50", "FREESHIP", "FAKE"])
    assert.equal(
      (await request("/api/quote", { items: [{ id: 2, quantity: 1 }], coupon }))
        .status,
      400,
    );
});
test("orders persist server totals and reserve stock, retries remain idempotent", async (t) => {
  const { request } = await fixture(t);
  const body = orderBody({ subtotal: 1, discount: 999999, total: 0 });
  const first = await request("/api/orders", body);
  assert.equal(first.status, 201);
  assert.equal(first.data.order.total, 275000);
  assert.equal(first.data.order.status, "pending");
  assert.ok(first.data.order.token.length > 30);
  const retry = await request("/api/orders", body);
  assert.equal(retry.status, 201);
  assert.equal(retry.data.order.id, first.data.order.id);
  assert.equal((await request("/api/products")).data.products[0].stock, 2);
  assert.equal(
    (
      await request(
        "/api/orders",
        orderBody({ items: [{ id: 1, quantity: 2 }] }),
      )
    ).status,
    409,
  );
  assert.equal((await request("/api/products")).data.products[0].stock, 2);
});
test("stock is atomic and out of stock cannot be quoted or ordered", async (t) => {
  const { request } = await fixture(t);
  for (const path of ["/api/quote", "/api/orders"])
    assert.equal(
      (await request(path, orderBody({ items: [{ id: 3, quantity: 1 }] })))
        .status,
      409,
    );
  const results = await Promise.all(
    ["request-a-111", "request-b-222"].map((idempotencyKey) =>
      request(
        "/api/orders",
        orderBody({ items: [{ id: 1, quantity: 2 }], idempotencyKey }),
      ),
    ),
  );
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 409]);
  assert.equal((await request("/api/products")).data.products[0].stock, 1);
});
test("rejects malformed items, quantities and invalid customer/payment", async (t) => {
  const { request } = await fixture(t);
  for (const items of [
    [],
    [{ id: 999, quantity: 1 }],
    [{ id: 1, quantity: 0 }],
    [{ id: 1, quantity: 1.5 }],
    [{ id: 1, quantity: 100 }],
    [
      { id: 1, quantity: 1 },
      { id: 1, quantity: 1 },
    ],
  ])
    assert.equal((await request("/api/quote", { items })).status, 400);
  for (const invalid of [
    { customer: { ...customer, phone: "12" } },
    { customer: { ...customer, name: "" } },
    { customer: { ...customer, address: "" } },
    { customer: { ...customer, email: "bad" } },
    { payment: "card" },
    { idempotencyKey: "" },
  ])
    assert.equal(
      (await request("/api/orders", orderBody(invalid))).status,
      400,
    );
  const multiline = await request(
    "/api/orders",
    orderBody({ note: "Gọi trước khi giao\nGiao giờ hành chính" }),
  );
  assert.equal(multiline.status, 201);
  assert.equal(
    multiline.data.order.note,
    "Gọi trước khi giao\nGiao giờ hành chính",
  );
});
test("orders and stock survive a restart with a new app", async (t) => {
  const { request, restart } = await fixture(t);
  const first = await request("/api/orders", orderBody());
  await restart();
  assert.equal((await request("/api/products")).data.products[0].stock, 2);
  const found = await request(
    `/api/orders/${first.data.order.id}?token=${first.data.order.token}`,
  );
  assert.equal(found.status, 200);
  assert.equal(found.data.order.customer.name, customer.name);
  assert.equal(
    (await request("/api/orders", orderBody())).data.order.id,
    first.data.order.id,
  );
  assert.equal((await request("/api/products")).data.products[0].stock, 2);
});
test("order privacy requires correct token or exact order ID plus phone", async (t) => {
  const { request } = await fixture(t);
  const {
    data: { order },
  } = await request("/api/orders", orderBody());
  assert.equal((await request(`/api/orders/${order.id}`)).status, 404);
  assert.equal(
    (await request(`/api/orders/${order.id}?token=wrong`)).status,
    404,
  );
  assert.equal((await request("/api/orders")).status, 404);
  const found = await request("/api/orders/lookup", {
    id: order.id,
    phone: "+84 912 345 678",
  });
  assert.equal(found.status, 200);
  assert.equal(found.data.order.customer.phone, customer.phone);
  assert.equal(found.data.order.token, undefined);
  assert.equal(
    (await request("/api/orders/lookup", { id: order.id, phone: "0987654321" }))
      .status,
    404,
  );
});
test("lookup brute force is rate limited", async (t) => {
  const { request } = await fixture(t);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request("/api/orders/lookup", {
          id: "UNKNOWN",
          phone: customer.phone,
        })
      ).status,
      404,
    );
  assert.equal(
    (
      await request("/api/orders/lookup", {
        id: "UNKNOWN",
        phone: customer.phone,
      })
    ).status,
    429,
  );
});
test("request body size, JSON and content type are limited", async (t) => {
  const { request, base } = await fixture(t);
  assert.equal(
    (await request("/api/quote", { padding: "a".repeat(33000) })).status,
    413,
  );
  const invalid = await fetch(base() + "/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(invalid.status, 400);
  const text = await fetch(base() + "/api/quote", {
    method: "POST",
    body: "{}",
  });
  assert.equal(text.status, 415);
});
test("static routing hides source, database and traversal paths; serves allowed frontend routes", async (t) => {
  const { base } = await fixture(t);
  for (const path of [
    "/server.mjs",
    "/package.json",
    "/data/store.sqlite",
    "/.git/config",
    "/%2e%2e%2fserver.mjs",
    "/not-a-real-page",
  ]) {
    const r = await fetch(base() + path);
    assert.ok([403, 404].includes(r.status), `${path} must not be public`);
  }
  for (const path of [
    "/",
    "/san-pham",
    "/san-pham/example",
    "/danh-muc/sua",
    "/gio-hang",
    "/thanh-toan",
    "/don-hang/JL1",
    "/tra-cuu-don-hang",
    "/yeu-thich",
    "/chinh-sach/giao-hang",
    "/bai-viet/example",
  ]) {
    const r = await fetch(base() + path);
    assert.equal(r.status, 200, path);
    assert.ok(r.headers.get("content-type").startsWith("text/html"));
  }
});
