import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createApp } from "../server.mjs";
import { createAuth } from "../lib/auth.mjs";
import { createCms } from "../lib/cms.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
async function fixture(t, options = {}) {
  const db = await createTestDatabase(),
    dir = await mkdtemp(join(tmpdir(), "jielien-commerce-"));
  let app;
  try {
    app = await createApp({
      pool: db.pool,
      legacyPath: null,
      mediaDirectory: dir,
      ...options,
    });
  } catch (e) {
    await db.cleanup();
    throw e;
  }
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  t.after(async () => {
    await closeServer(app);
    await db.cleanup();
    await rm(dir, { recursive: true, force: true });
  });
  const auth = createAuth(db.pool),
    password = "TestCommercePass!2026";
  const admin = await auth.ensureAdmin({
    name: "Admin Test",
    phone: "0987654321",
    email: "admin@example.test",
    password,
  });
  const session = await auth.login({
    identifier: "admin@example.test",
    password,
  });
  const base = `http://127.0.0.1:${app.address().port}`;
  const request = async (
    path,
    body,
    method = "GET",
    who = session,
    csrf = true,
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(who ? { Cookie: `jielien_session=${who.token}` } : {}),
        "Content-Type": "application/json",
        ...(who && csrf ? { "X-CSRF-Token": who.csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data;
    try {
      data = await r.json();
    } catch {}
    return { status: r.status, data };
  };
  const upload = async () => {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#86b529" },
    })
      .png()
      .toBuffer();
    const r = await fetch(base + "/api/admin/media/uploads", {
      method: "POST",
      headers: {
        Cookie: `jielien_session=${session.token}`,
        "X-CSRF-Token": session.csrfToken,
        "Content-Type": "image/png",
        "X-Image-Alt": encodeURIComponent("Ảnh kiểm thử"),
      },
      body: bytes,
    });
    assert.equal(r.status, 201);
    return (await r.json()).asset;
  };
  return { db, auth, password, admin, session, base, request, upload };
}
test("catalog creates three real SKUs, publishes with media, handles concurrency and preserves stock transactions", async (t) => {
  const { request, upload, base, db, session } = await fixture(t);
  assert.equal(
    (await request("/api/admin/catalog/products", {}, "POST", null)).status,
    401,
  );
  const asset = await upload();
  assert.equal(
    (await fetch(base + asset.url)).status,
    404,
    "unattached media private",
  );
  const category = (
    await request(
      "/api/admin/catalog/categories",
      { name: "Công ty", slug: "cong-ty" },
      "POST",
    )
  ).data.item;
  const body = {
    name: "Sản phẩm công ty",
    slug: "san-pham-cong-ty",
    categoryIds: [category.id],
    description: "Mô tả thật",
    descriptionBlocks: [
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ],
    status: "draft",
  };
  let r = await request("/api/admin/catalog/products", body, "POST");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let p = r.data.product;
  assert.equal(
    (
      await request(
        "/api/admin/catalog/products/" + p.id,
        { ...body, status: "active", version: p.version },
        "PATCH",
      )
    ).status,
    422,
  );
  r = await request(
    "/api/admin/catalog/products/" + p.id + "/variants",
    {
      version: p.version,
      variants: [1, 2, 3].map((i) => ({
        name: "Phân loại " + i,
        sku: "COMPANY-" + i,
        price: i * 100000,
        status: "active",
      })),
    },
    "POST",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  p = r.data.product;
  assert.equal(p.variants.length, 3);
  assert.equal(
    (
      await request(
        "/api/admin/catalog/products/" + p.id + "/variants",
        {
          version: p.version,
          variants: [{ name: "Trùng", sku: "company-1", price: 1 }],
        },
        "POST",
      )
    ).status,
    409,
  );
  r = await request(
    "/api/admin/catalog/products/" + p.id + "/media",
    { version: p.version, media: [{ assetId: asset.id }] },
    "PUT",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  p = r.data.product;
  const results = await Promise.all([
    request(
      "/api/admin/catalog/products/" + p.id,
      { ...body, status: "active", version: p.version },
      "PATCH",
    ),
    request(
      "/api/admin/catalog/products/" + p.id,
      { ...body, status: "active", version: p.version },
      "PATCH",
    ),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await fetch(base + asset.url)).status, 200);
  const products = (await request("/api/products")).data.products.filter(
    (v) => v.productId === p.id,
  );
  assert.equal(products.length, 3);
  assert.ok(products.every((v) => v.stock === 0));
  assert.ok(!JSON.stringify(products).includes("cost_price"));
  const badImage = await fetch(base + "/api/admin/media/uploads", {
    method: "POST",
    headers: {
      Cookie: `jielien_session=${session.token}`,
      "X-CSRF-Token": session.csrfToken,
      "Content-Type": "image/png",
      "X-Image-Alt": "Bad",
    },
    body: "<svg onload=alert(1)>",
  });
  assert.equal(badImage.status, 415);
  const warehouses = (await request("/api/admin/inventory/documents")).data
      .warehouses,
    normal = warehouses.find((w) => w.type === "normal"),
    damaged = warehouses.find((w) => w.type === "damaged");
  const createPost = async (b) => {
    let r = await request("/api/admin/inventory/documents", b, "POST");
    assert.equal(r.status, 201, JSON.stringify(r.data));
    let d = r.data.document;
    for (const a of ["submit", "approve", "post"]) {
      r = await request(
        "/api/admin/inventory/documents/" + d.id + "/" + a,
        { version: d.version },
        "POST",
      );
      assert.equal(r.status, 200, JSON.stringify(r.data));
      d = r.data.document;
    }
    return d;
  };
  const doc = await createPost({
    type: "receipt",
    targetWarehouseId: normal.id,
    reason: "Nhập thử",
    items: [{ variantId: products[0].id, quantity: 10 }],
  });
  assert.equal(
    (
      await request(
        "/api/admin/inventory/documents/" + doc.id + "/post",
        { version: doc.version },
        "POST",
      )
    ).status,
    200,
  );
  await createPost({
    type: "transfer",
    sourceWarehouseId: normal.id,
    targetWarehouseId: damaged.id,
    reason: "Hàng hư thử",
    items: [{ variantId: products[0].id, quantity: 4 }],
  });
  assert.equal(
    (await request("/api/products")).data.products.find(
      (v) => v.id === products[0].id,
    ).stock,
    6,
  );
  const counts = await db.pool.query(
    "SELECT count(*) AS count FROM inventory_movements WHERE reference_type='inventory_document'",
  );
  assert.equal(counts.rows[0].count, 3);
  const html = await (
    await fetch(base + "/san-pham/" + products[0].slug)
  ).text();
  assert.ok(html.includes("application/ld+json"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
});
test("admin creates employee username; CMS revisions, permissions, publication, redirect and scheduled jobs are real", async (t) => {
  const { request, auth, password, base, db, upload } = await fixture(t);
  const asset = await upload();
  const staffBody = {
    fullName: "Biên tập thử",
    username: "writer.test",
    phone: "0912345678",
    password,
    roles: ["writer"],
  };
  assert.equal(
    (
      await request(
        "/api/admin/users",
        { ...staffBody, roles: ["admin"] },
        "POST",
      )
    ).status,
    400,
  );
  let r = await request("/api/admin/users", staffBody, "POST");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const writer = await auth.login({ identifier: "writer.test", password });
  assert.equal(writer.user.username, "writer.test");
  assert.ok(!writer.user.roles.includes("customer"));
  assert.equal(
    (await request("/api/admin/users", staffBody, "POST", writer)).status,
    403,
  );
  const category = (
    await request(
      "/api/admin/cms/categories",
      { name: "Kiến thức", slug: "kien-thuc" },
      "POST",
    )
  ).data.item;
  const b = {
    title: "Hướng dẫn công ty",
    slug: "huong-dan-cong-ty",
    excerpt: "Thông tin đã kiểm chứng",
    categoryId: category.id,
    coverUrl: asset.url,
    coverAlt: "Mô tả ảnh",
    contentBlocks: [
      { type: "heading", level: 2, text: "Tiêu chí" },
      { type: "paragraph", text: "<script>alert(1)</script>" },
    ],
    seoTitle: "Hướng dẫn Jielien",
    seoDescription: "Nội dung đã kiểm duyệt",
  };
  r = await request("/api/admin/cms/articles", b, "POST", writer);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let a = r.data.article;
  assert.equal(
    (await request("/api/news/" + b.slug, undefined, "GET", null)).status,
    404,
  );
  assert.equal(
    (
      await request(
        "/api/admin/cms/articles/" + a.id + "/publish",
        { version: a.version },
        "POST",
        writer,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/admin/cms/articles/" + a.id,
        { ...b, version: a.version },
        "PATCH",
        writer,
        false,
      )
    ).status,
    403,
  );
  const flow = async () => {
    a = (
      await request(
        "/api/admin/cms/articles/" + a.id + "/submit",
        { version: a.version },
        "POST",
        writer,
      )
    ).data.article;
    a = (
      await request(
        "/api/admin/cms/articles/" + a.id + "/approve",
        { version: a.version },
        "POST",
      )
    ).data.article;
    a = (
      await request(
        "/api/admin/cms/articles/" + a.id + "/publish",
        { version: a.version },
        "POST",
      )
    ).data.article;
  };
  await flow();
  const html = await (await fetch(base + "/tin-tuc/" + b.slug)).text();
  assert.ok(html.includes("<h1>Hướng dẫn công ty</h1>"));
  assert.ok(html.includes("BlogPosting"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  r = await request(
    "/api/admin/cms/articles/" + a.id,
    {
      ...b,
      title: "Bản đang biên tập",
      slug: "huong-dan-moi",
      version: a.version,
    },
    "PATCH",
    writer,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  a = r.data.article;
  assert.equal(
    (await request("/api/news/" + b.slug, undefined, "GET", null)).data.article
      .title,
    b.title,
    "public revision survives draft edit",
  );
  await flow();
  const redirect = await fetch(base + "/tin-tuc/" + b.slug, {
    redirect: "manual",
  });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/tin-tuc/huong-dan-moi");
  assert.equal((await fetch(base + "/tin-tuc/does-not-exist")).status, 404);
  assert.ok(
    (await (await fetch(base + "/robots.txt")).text()).includes("Disallow: /"),
  );
  assert.ok(
    !(await (await fetch(base + "/sitemap.xml")).text()).includes(
      "/tin-tuc/huong-dan-moi",
    ),
  );
  a = (
    await request(
      "/api/admin/cms/articles",
      { ...b, slug: "hen-gio" },
      "POST",
      writer,
    )
  ).data.article;
  a = (
    await request(
      "/api/admin/cms/articles/" + a.id + "/submit",
      { version: a.version },
      "POST",
      writer,
    )
  ).data.article;
  a = (
    await request(
      "/api/admin/cms/articles/" + a.id + "/approve",
      { version: a.version },
      "POST",
    )
  ).data.article;
  a = (
    await request(
      "/api/admin/cms/articles/" + a.id + "/publish",
      {
        version: a.version,
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
      },
      "POST",
    )
  ).data.article;
  assert.equal(a.status, "scheduled");
  await db.pool.query(
    "UPDATE articles SET scheduled_at=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  await db.pool.query(
    "UPDATE article_publish_jobs SET due_at=now()-interval '1 minute' WHERE article_id=$1",
    [a.id],
  );
  await Promise.all([createCms(db.pool).runDue(), createCms(db.pool).runDue()]);
  assert.equal(
    (await request("/api/news/hen-gio", undefined, "GET", null)).status,
    200,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*) AS count FROM article_workflow_events WHERE article_id=$1 AND to_status='published'",
        [a.id],
      )
    ).rows[0].count,
    1,
  );
  assert.equal((await request("/api/admin/reports/summary")).status, 200);
});

test("CSV preview is read-only, commit is atomic/idempotent, exports escape formula injection; site settings and promotions persist", async (t) => {
  const { request, db, upload, base } = await fixture(t);
  const cat = (
    await request(
      "/api/admin/catalog/categories",
      { name: "CSV category", slug: "csv-category" },
      "POST",
    )
  ).data.item;
  const headers =
    "mode,parent_slug,product_name,primary_category_slug,variant_sku,variant_name,price_vnd,original_price_vnd,publish_action";
  const csv =
    headers +
    "\ncreate,csv-product,CSV Product,csv-category,CSV-ONE,First SKU,100000,120000,draft";
  const count = (await db.pool.query("SELECT count(*) AS n FROM products"))
    .rows[0].n;
  let r = await request("/api/admin/catalog/import", { csv }, "POST");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.errors, []);
  assert.equal(
    (await db.pool.query("SELECT count(*) AS n FROM products")).rows[0].n,
    count,
  );
  const body = { csv, token: r.data.token, commit: true };
  r = await request("/api/admin/catalog/import", body, "POST");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.summary.products, 1);
  assert.equal(
    (await request("/api/admin/catalog/import", body, "POST")).status,
    200,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*) AS n FROM product_variants WHERE sku='CSV-ONE'",
      )
    ).rows[0].n,
    1,
  );
  const invalid =
    headers + "\ncreate,bad,CSV Bad,csv-category,BAD,Bad SKU,-100,120000,draft";
  const preview = await request(
    "/api/admin/catalog/import",
    { csv: invalid },
    "POST",
  );
  assert.ok(preview.data.errors.length);
  assert.equal(
    (
      await request(
        "/api/admin/catalog/import",
        { csv: invalid, token: preview.data.token, commit: true },
        "POST",
      )
    ).status,
    400,
  );
  await db.pool.query(
    "UPDATE products SET name='=DANGEROUS()' WHERE slug='csv-product'",
  );
  assert.ok(
    (await request("/api/admin/catalog/export")).data.csv.includes(
      "'=DANGEROUS()",
    ),
  );
  assert.equal(
    (
      await request(
        "/api/admin/settings/site",
        { key: "DATABASE_URL", value: "must not persist" },
        "PATCH",
      )
    ).status,
    400,
  );
  r = await request(
    "/api/admin/settings/site",
    { key: "companyName", value: "Jielien Test" },
    "PATCH",
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await request(
        "/api/admin/settings/site",
        { key: "companyName", value: "Stale", version: 0 },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/admin/coupons",
        {
          code: "NEWTEST",
          discountType: "fixed",
          discountValue: 10000,
          minimumOrder: 100000,
          usageLimit: 5,
          status: "active",
        },
        "POST",
      )
    ).status,
    201,
  );
  const quote = await request(
    "/api/quote",
    { items: [{ id: 1, quantity: 1 }], coupon: "NEWTEST" },
    "POST",
    null,
  );
  assert.equal(quote.status, 200, JSON.stringify(quote.data));
  assert.equal(quote.data.discount, 10000);
  const asset = await upload();
  assert.equal(
    (
      await request(
        "/api/admin/banners",
        {
          title: "New banner",
          assetId: asset.id,
          targetPath: "https://evil.test",
          status: "published",
        },
        "POST",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/admin/banners",
        {
          title: "New banner",
          assetId: asset.id,
          targetPath: "/san-pham",
          status: "published",
        },
        "POST",
      )
    ).status,
    201,
  );
  assert.equal((await fetch(base + asset.url)).status, 200);
});
test("returns are quantity bounded and inspected damaged items restock exactly once without changing payment", async (t) => {
  const { request, db } = await fixture(t);
  let r = await request(
    "/api/orders",
    {
      items: [{ id: 1, quantity: 2 }],
      customer: {
        name: "Khách test",
        phone: "0912345678",
        address: "123 Đường kiểm thử",
        province: "TP Hồ Chí Minh",
        district: "Quận 1",
      },
      payment: "cod",
      coupon: "",
      note: "",
      idempotencyKey: crypto.randomUUID(),
    },
    "POST",
    null,
  );
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const order = r.data.order;
  for (const status of ["confirmed", "processing", "shipped", "delivered"])
    assert.equal(
      (
        await request(
          "/api/admin/orders/" + order.id + "/status",
          { status, reason: "Test transition" },
          "PATCH",
        )
      ).status,
      200,
    );
  const b = {
    orderNumber: order.id,
    reason: "Kiểm định hàng hư",
    items: [{ variantId: 1, quantity: 1, condition: "damaged" }],
  };
  r = await request("/api/admin/returns", b, "POST");
  assert.equal(r.status, 201, JSON.stringify(r.data));
  let ret = r.data.item;
  assert.equal(
    (
      await request(
        "/api/admin/returns",
        { ...b, items: [{ variantId: 1, quantity: 2, condition: "sealed" }] },
        "POST",
      )
    ).status,
    409,
  );
  for (const action of ["authorize", "receive", "inspect", "approve"]) {
    r = await request(
      "/api/admin/returns/" + ret.id + "/" + action,
      { version: ret.version },
      "POST",
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
    ret = r.data.item;
  }
  const done = await Promise.all([
    request(
      "/api/admin/returns/" + ret.id + "/complete",
      { version: ret.version },
      "POST",
    ),
    request(
      "/api/admin/returns/" + ret.id + "/complete",
      { version: ret.version },
      "POST",
    ),
  ]);
  assert.ok(done.every((r) => r.status === 200));
  assert.equal(
    (
      await db.pool.query(
        "SELECT sum(quantity_change) AS n FROM inventory_movements WHERE reference_type='return'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT sum(ib.on_hand) AS n FROM inventory_balances ib JOIN warehouses w ON w.id=ib.warehouse_id WHERE w.type='damaged' AND ib.variant_id=1",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT p.status FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.order_number=$1",
        [order.id],
      )
    ).rows[0].status,
    "pending",
  );
});

test("legacy images, privileged payment separation and invalid inventory sources are protected", async (t) => {
  const { request, auth, password } = await fixture(t);
  const p = (await request("/api/admin/catalog/products/1")).data.product;
  const old = p.media[0];
  assert.ok(old.url.startsWith("/assets/"));
  let r = await request(
    "/api/admin/catalog/products/1/media",
    { version: p.version, media: [{ existingMediaId: old.id }] },
    "PUT",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.product.media[0].url, old.url);
  const docs = await request("/api/admin/inventory/documents");
  const normal = docs.data.warehouses.find((w) => w.type === "normal"),
    damaged = docs.data.warehouses.find((w) => w.type === "damaged");
  r = await request(
    "/api/admin/inventory/documents",
    {
      type: "receipt",
      sourceWarehouseId: damaged.id,
      targetWarehouseId: normal.id,
      reason: "Invalid duplicate stock",
      items: [{ variantId: 1, quantity: 1 }],
    },
    "POST",
  );
  assert.equal(r.status, 400);
  r = await request(
    "/api/admin/users",
    {
      fullName: "Sales test",
      username: "sales.test",
      phone: "0912345678",
      password,
      roles: ["sales"],
    },
    "POST",
  );
  assert.equal(r.status, 201);
  const sales = await auth.login({ identifier: "sales.test", password });
  assert.equal(
    (await request("/api/admin/orders/JL-unknown/payment", {}, "POST", sales))
      .status,
    403,
  );
  assert.equal((await request("/api/admin/reports/export")).status, 200);
  const exportData = (await request("/api/admin/audit/export")).data.csv;
  assert.ok(!exportData.includes("password_hash"));
  assert.equal(
    (await request("/api/admin/operations/status")).data.database,
    "ok",
  );
  assert.equal(
    (
      await request(
        "/api/admin/cms/articles",
        { title: "Bài lỗi", slug: "bai-loi", tagIds: "not-array" },
        "POST",
      )
    ).status,
    400,
  );
});
test("public HTML metadata, canonical, sitemap and offers reflect only active real data in explicit HTTPS configuration", async (t) => {
  const { base, request } = await fixture(t, {
    seoConfiguration: {
      PUBLIC_BASE_URL: "https://shop.example.test",
      SEO_INDEXING_ENABLED: "true",
    },
  });
  const p = (await request("/api/products")).data.products[0];
  const r = await fetch(base + "/san-pham/" + p.slug);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes("https://shop.example.test/san-pham/" + p.slug));
  assert.ok(html.includes("BreadcrumbList"));
  assert.ok(html.includes('"price":' + p.price));
  assert.ok(!html.includes("aggregateRating"));
  assert.ok(
    (await (await fetch(base + "/sitemap.xml")).text()).includes(
      "https://shop.example.test/san-pham/" + p.slug,
    ),
  );
  assert.ok(
    !(await (await fetch(base + "/sitemap.xml")).text()).includes("/quan-tri"),
  );
  assert.equal(
    (await fetch(base + "/quan-tri")).headers.get("x-robots-tag"),
    "noindex, nofollow",
  );
  assert.equal((await request("/api/catalog/search?q=Sua")).status, 200);
  assert.equal(
    (await request("/api/catalog/products/" + p.slug)).data.product.id,
    p.id,
  );
});

test("SKU option combinations, shipping fields, draft preview and historical URL ownership are enforced", async (t) => {
  const { request, base, upload } = await fixture(t);
  const category = (
    await request(
      "/api/admin/catalog/categories",
      { name: "Options category", slug: "options-category" },
      "POST",
    )
  ).data.item;
  const attribute = (
    await request(
      "/api/admin/catalog/attributes",
      { name: "Test size", code: "test-size", values: ["S", "M"] },
      "POST",
    )
  ).data.item;
  const values = (
    await request("/api/admin/catalog/attributes")
  ).data.items.find((a) => a.id === attribute.id).values;
  const b = {
    name: "Product with options",
    slug: "product-with-options",
    categoryIds: [category.id],
    status: "draft",
  };
  let p = (await request("/api/admin/catalog/products", b, "POST")).data
    .product;
  const variants = values.map((v, i) => ({
    name: "Size " + v.value,
    sku: "SIZE-" + v.value,
    slug: "size-" + v.value.toLowerCase(),
    price: 100000,
    weightGrams: 250,
    lowStockThreshold: 3,
    attributeValueIds: [v.id],
  }));
  let r = await request(
    "/api/admin/catalog/products/" + p.id + "/variants",
    { version: p.version, variants },
    "POST",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  p = r.data.product;
  assert.equal(p.variants[0].weight_grams, 250);
  assert.equal(p.variants[0].low_stock_threshold, 3);
  assert.equal(
    (
      await request(
        "/api/admin/catalog/products/" + p.id + "/variants",
        {
          version: p.version,
          variants: [
            { ...variants[0], sku: "DUPLICATE-COMBO", slug: "duplicate-combo" },
          ],
        },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    (await request("/api/admin/catalog/products/" + p.id + "/preview")).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/admin/catalog/products/" + p.id + "/preview",
        undefined,
        "GET",
        null,
      )
    ).status,
    401,
  );
  assert.equal((await fetch(base + "/san-pham/size-s")).status, 404);
  const asset = await upload();
  p = (
    await request(
      "/api/admin/catalog/products/" + p.id + "/media",
      { version: p.version, media: [{ assetId: asset.id }] },
      "PUT",
    )
  ).data.product;
  p = (
    await request(
      "/api/admin/catalog/products/" + p.id,
      { ...b, status: "active", version: p.version },
      "PATCH",
    )
  ).data.product;
  r = await request(
    "/api/admin/catalog/products/" + p.id + "/variants",
    {
      version: p.version,
      variants: [
        {
          ...variants[0],
          id: p.variants[0].id,
          rowVersion: p.variants[0].row_version,
          slug: "size-s-new",
        },
      ],
    },
    "POST",
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  p = r.data.product;
  const old = await fetch(base + "/san-pham/size-s", { redirect: "manual" });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get("location"), "/san-pham/size-s-new");
  assert.equal(
    (
      await request(
        "/api/admin/catalog/products/" + p.id + "/variants",
        {
          version: p.version,
          variants: [
            { name: "Hijack", sku: "HIJACK", slug: "size-s", price: 1 },
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
        "/api/admin/seo/redirects",
        { oldPath: "/san-pham/old-manual", newPath: "/san-pham/size-s-new" },
        "POST",
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        "/api/admin/seo/redirects",
        { oldPath: "/san-pham/size-s-new", newPath: "/san-pham" },
        "POST",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/admin/seo/redirects",
        { oldPath: "/san-pham/old-path", newPath: "https://evil.example" },
        "POST",
      )
    ).status,
    400,
  );
});
test("restoring a reviewed revision creates a new draft without changing the public revision", async (t) => {
  const { request, upload, db } = await fixture(t);
  const asset = await upload();
  const category = (
    await request(
      "/api/admin/cms/categories",
      { name: "Revision category", slug: "revision-category" },
      "POST",
    )
  ).data.item;
  const body = {
    title: "Immutable revision article",
    slug: "immutable-revision",
    categoryId: category.id,
    excerpt: "Revision test summary",
    coverUrl: asset.url,
    coverAlt: "Revision cover",
    contentBlocks: [{ type: "paragraph", text: "Original body" }],
    seoTitle: "Revision title",
    seoDescription: "Revision description",
  };
  let a = (await request("/api/admin/cms/articles", body, "POST")).data.article;
  for (const action of ["submit", "approve", "publish"])
    a = (
      await request(
        "/api/admin/cms/articles/" + a.id + "/" + action,
        { version: a.version },
        "POST",
      )
    ).data.article;
  const revisions = (
    await request("/api/admin/cms/articles/" + a.id + "/revisions")
  ).data.items;
  const restored = await request(
    "/api/admin/cms/articles/" + a.id + "/restore",
    { version: a.version, revisionId: revisions[0].id },
    "POST",
  );
  assert.equal(restored.status, 200, JSON.stringify(restored.data));
  assert.equal(restored.data.article.status, "draft");
  assert.equal(
    (await request("/api/news/immutable-revision", undefined, "GET", null)).data
      .article.contentBlocks[0].text,
    "Original body",
  );
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*) AS n FROM article_revisions WHERE article_id=$1",
        [a.id],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await request(
        "/api/admin/cms/articles/" + a.id + "/restore",
        { version: a.version, revisionId: revisions[0].id },
        "POST",
      )
    ).status,
    409,
  );
});

test("CMS rejection requires a reviewer and returns a reviewed draft without bypassing publication", async (t) => {
  const { request } = await fixture(t);
  let a = (
    await request(
      "/api/admin/cms/articles",
      {
        title: "Bài cần sửa",
        slug: "bai-can-sua",
        contentBlocks: [{ type: "paragraph", text: "Nháp" }],
      },
      "POST",
    )
  ).data.article;
  a = (
    await request(
      "/api/admin/cms/articles/" + a.id + "/submit",
      { version: a.version },
      "POST",
    )
  ).data.article;
  const rejected = await request(
    "/api/admin/cms/articles/" + a.id + "/reject",
    { version: a.version },
    "POST",
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.article.status, "draft");
  assert.equal(
    (await request("/api/news/bai-can-sua", undefined, "GET", null)).status,
    404,
  );
  assert.equal(
    (await request("/api/admin/cms/articles?status=draft&q=khong-khop")).data
      .items.length,
    0,
  );
});

test("admin bootstrap works without a TTY using configured credentials and adds username without resetting the existing account", async (t) => {
  const { db, auth, admin, password } = await fixture(t);
  const { databaseUrl, createPool } = await import("../lib/database.mjs");
  const { spawn } = await import("node:child_process");
  const url = new URL(databaseUrl());
  url.searchParams.set("options", "-c search_path=" + db.schema);
  const probe = createPool({ connectionString: url.toString() });
  try {
    assert.equal(
      (await probe.query("SELECT current_schema() AS schema")).rows[0].schema,
      db.schema,
    );
  } finally {
    await probe.end();
  }
  const run = (extra) =>
    new Promise((resolve, reject) => {
      let stdout = "",
        stderr = "";
      const p = spawn(process.execPath, ["scripts/create-admin.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          ADMIN_EMAIL: "admin@example.test",
          ADMIN_PHONE: "0987654321",
          ADMIN_PASSWORD: password,
          ADMIN_USERNAME: "",
          ...extra,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.once("error", reject);
      p.once("close", (code) => resolve({ code, stdout, stderr }));
    });
  const success = await run({});
  assert.equal(success.code, 0, success.stderr);
  assert.ok(success.stdout.includes("Tài khoản quản trị đã sẵn sàng"));
  assert.ok(!success.stdout.includes(password));
  assert.equal(
    (await auth.login({ identifier: "admin", password })).user.id,
    admin.id,
  );
  const invalid = await run({ ADMIN_EMAIL: "invalid" });
  assert.equal(invalid.code, 1);
  assert.ok(invalid.stderr.includes("Email không hợp lệ"));
  assert.ok(!invalid.stderr.includes(password));
});

test("catalog and news pagination remain bounded for non-finite/fractional input and Vietnamese uppercase Đ is accent-normalized", async (t) => {
  const { request } = await fixture(t);
  const a = await request("/api/catalog/search?q=" + encodeURIComponent("Đồ"));
  const b = await request("/api/catalog/search?q=do");
  assert.deepEqual(
    a.data.items.map((p) => p.id),
    b.data.items.map((p) => p.id),
  );
  assert.equal(
    (await request("/api/catalog/search?page=Infinity")).data.page,
    100000,
  );
  assert.equal(
    (await request("/api/admin/catalog/products?page=1.25")).status,
    200,
  );
  assert.equal((await request("/api/news?page=1.25")).status, 200);
});
