import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { frontendFixture } from "./support/frontend-v3.mjs";
import { createTestDatabase } from "./support/database.mjs";
let f;
test.before(async () => {
  f = await frontendFixture();
});
test.after(async () => f?.cleanup());
test("V3 empty deployment has no seeded catalog or fake campaigns", async () => {
  const empty = await frontendFixture({ populate: false });
  try {
    assert.equal(
      (await empty.request("/api/products", undefined, "GET", null)).data.total,
      0,
    );
    const html = await (await fetch(empty.base + "/")).text();
    assert.ok(html.includes("Chưa có sản phẩm"));
    assert.doesNotMatch(
      html,
      /href=["']\/quan-tri|JIELIEN DESIGN CONCEPT|Newsletter|staff-admin-link/,
    );
    assert.equal((await empty.request("/api/site")).data.banners.length, 0);
  } finally {
    await empty.cleanup();
  }
});
test("V3 catalog pages/filter/sort are bounded in SQL, categories are dynamic and SKU lookup is targeted", async () => {
  const data = (await f.request("/api/products?limit=3&page=2")).data;
  assert.equal(data.items.length, 3);
  assert.equal(data.total, 16);
  assert.equal(data.page, 2);
  const cats = (await f.request("/api/categories")).data.categories;
  assert.equal(cats.length, 8);
  assert.ok(cats[0].image_url.startsWith("/media/"));
  assert.ok(!("version" in cats[0]));
  for (const category of [cats[0].slug, cats[0].name, String(cats[0].id)])
    assert.equal(
      (
        await f.request(
          "/api/products?category=" + encodeURIComponent(category),
        )
      ).data.total,
      2,
    );
  const sorted = (await f.request("/api/products?sort=price-desc&limit=4")).data
    .items;
  assert.ok(sorted[0].price >= sorted[3].price);
  assert.equal(
    (await f.request("/api/products?limit=100000")).data.items.length,
    16,
  );
  assert.equal((await f.request("/api/products?page=Infinity")).data.page, 1);
  assert.equal((await f.request("/api/products?min=NaN")).status, 400);
  const sku = (await f.request("/api/catalog/skus?ids=" + data.items[0].id))
    .data.products;
  assert.equal(sku.length, 1);
  assert.equal(sku[0].id, data.items[0].id);
  assert.equal((await f.request("/api/catalog/skus?ids=-1")).status, 400);
  const detail = (await f.request("/api/catalog/products/" + sku[0].slug)).data;
  assert.equal(detail.variants.length, 2);
  assert.equal(detail.product.id, sku[0].id);
  const parent = (
    await f.db.pool.query(
      "INSERT INTO products(name,slug,status) VALUES('Large fixture','large-fixture','active') RETURNING id",
    )
  ).rows[0];
  await f.db.pool.query(
    "INSERT INTO product_variants(product_id,name,slug,sku,price,original_price,status) SELECT $1,'Bulk fixture '||i,'bulk-fixture-'||i,'BULK-'||i,100000,100000,'active' FROM generate_series(1,80) i",
    [parent.id],
  );
  const bounded = (await f.request("/api/products")).data;
  assert.equal(bounded.total, 96);
  assert.equal(bounded.products.length, 48);
  assert.equal(
    (await f.request("/api/products?limit=10000")).data.items.length,
    48,
  );
});
test("V3 banner slots enforce schedules, sort order, safe links, versions and public setting whitelist", async () => {
  const base = {
    slot: "home_hero",
    title: "Banner kiểm thử",
    assetId: f.assets[0].id,
    targetPath: "/san-pham",
    status: "published",
    sortOrder: 1,
  };
  const expired = (
    await f.save("/api/admin/banners", {
      ...base,
      endsAt: "2020-01-01T00:00:00Z",
    })
  ).item;
  const future = (
    await f.save("/api/admin/banners", {
      ...base,
      startsAt: "2099-01-01T00:00:00Z",
    })
  ).item;
  const draft = (
    await f.save("/api/admin/banners", { ...base, status: "draft" })
  ).item;
  const first = (
    await f.save("/api/admin/banners", {
      ...base,
      title: "Đứng trước",
      sortOrder: -10,
      assetMobileId: f.assets[1].id,
      ctaLabel: "Xem sản phẩm",
      focalX: 20,
      focalY: 30,
    })
  ).item;
  const publicSite = (await f.request("/api/site", undefined, "GET", null))
    .data;
  assert.ok(
    !publicSite.banners.some((b) =>
      [expired.id, future.id, draft.id].includes(b.id),
    ),
  );
  assert.equal(
    publicSite.banners.filter((b) => b.slot === "home_hero")[0].title,
    "Đứng trước",
  );
  assert.equal(publicSite.banners.find((b) => b.id === first.id).focal_x, 20);
  assert.ok(
    publicSite.banners.every((b) => !("created_by" in b) && !("version" in b)),
  );
  for (const targetPath of [
    "https://evil.example",
    "//evil.example",
    "/quan-tri",
    "/san-pham/../quan-tri",
    "/san-pham?redirect=https://evil.example",
  ])
    assert.equal(
      (await f.request("/api/admin/banners", { ...base, targetPath }, "POST"))
        .status,
      400,
    );
  assert.equal(
    (await f.request("/api/admin/banners", { ...base, slot: "wrong" }, "POST"))
      .status,
    400,
  );
  assert.equal(
    (await f.request("/api/admin/banners", { ...base, focalX: 101 }, "POST"))
      .status,
    400,
  );
  const edited = await f.request(
    "/api/admin/banners/" + first.id,
    { ...base, version: first.version, subtitle: "Đã sửa" },
    "PATCH",
  );
  assert.equal(edited.status, 201);
  assert.equal(
    (
      await f.request(
        "/api/admin/banners/" + first.id,
        { ...base, version: first.version },
        "PATCH",
      )
    ).status,
    409,
  );
  await f.db.pool.query(
    "INSERT INTO site_settings(key,value_json) VALUES('private_test_key','\"not-public\"')",
  );
  assert.ok(
    !(await f.request("/api/site", undefined, "GET", null)).data.settings.some(
      (s) => s.key === "private_test_key",
    ),
  );
});
test("V3 slots remain independent when another slot has hundreds of campaigns", async () => {
  const bulk = (
    await f.db.pool.query(
      "INSERT INTO page_banners(title,asset_id,target_path,status,slot,sort_order) SELECT 'Slot saturation fixture',$1,'/san-pham','published','home_hero',-100 FROM generate_series(1,200) RETURNING id",
      [f.assets[0].id],
    )
  ).rows.map((r) => r.id);
  try {
    const banners = (await f.request("/api/site", undefined, "GET", null)).data
      .banners;
    assert.equal(banners.filter((b) => b.slot === "home_hero").length, 10);
    for (const slot of [
      "home_side_top",
      "home_side_bottom",
      "home_wide",
      "category_hero",
      "article_featured",
    ])
      assert.ok(
        banners.some((b) => b.slot === slot),
        slot,
      );
  } finally {
    await f.db.pool.query(
      "DELETE FROM page_banners WHERE id=ANY($1::bigint[])",
      [bulk],
    );
  }
});
test("V3 mobile/category media is public only when attached to an eligible active entry", async () => {
  const privateMedia = await f.upload("#102a37");
  assert.equal((await fetch(f.base + privateMedia.url)).status, 404);
  const banner = (
    await f.save("/api/admin/banners", {
      title: "Mobile riêng",
      assetId: f.assets[0].id,
      assetMobileId: privateMedia.id,
      slot: "home_side_top",
      targetPath: "/san-pham",
      status: "published",
    })
  ).item;
  assert.equal((await fetch(f.base + privateMedia.url)).status, 200);
  await f.save(
    "/api/admin/banners/" + banner.id,
    {
      title: banner.title,
      assetId: banner.asset_id,
      assetMobileId: privateMedia.id,
      slot: banner.slot,
      targetPath: banner.target_path,
      status: "archived",
      version: banner.version,
    },
    "PATCH",
  );
  assert.equal((await fetch(f.base + privateMedia.url)).status, 404);
  const svg = await fetch(f.base + "/api/admin/media/uploads", {
    method: "POST",
    headers: {
      ...f.headers,
      "Content-Type": "image/svg+xml",
      "X-Image-Alt": "invalid",
    },
    body: '<svg onload="alert(1)"/>',
  });
  assert.ok([400, 415].includes(svg.status));
});
test("V3 Banner Studio honors staff permission, authentication and CSRF independently of hidden navigation", async () => {
  const customer = await f.auth.register({
    fullName: "Khách thử",
    phone: "0912345678",
    password: f.password,
  });
  const cs = await f.auth.login({
    identifier: "0912345678",
    password: f.password,
  });
  assert.equal((await fetch(f.base + "/quan-tri")).status, 401);
  assert.equal(
    (
      await fetch(f.base + "/admin.html", {
        headers: { Cookie: `jielien_session=${cs.token}` },
      })
    ).status,
    403,
  );
  const body = {
    title: "Không đủ quyền",
    assetId: f.assets[0].id,
    slot: "home_wide",
    targetPath: "/san-pham",
    status: "published",
  };
  assert.equal(
    (await f.request("/api/admin/banners", body, "POST", null)).status,
    401,
  );
  assert.equal(
    (await f.request("/api/admin/banners", body, "POST", cs)).status,
    403,
  );
  assert.equal(
    (await f.request("/api/admin/banners", body, "POST", f.session, false))
      .status,
    403,
  );
  await f.auth.createStaff(f.admin.id, {
    fullName: "Nhân viên banner",
    username: "banner.staff",
    phone: "0912345679",
    password: f.password,
    roles: ["banner_manager"],
  });
  const staff = await f.auth.login({
    identifier: "banner.staff",
    password: f.password,
  });
  assert.equal(
    (await f.request("/api/admin/banners", body, "POST", staff)).status,
    201,
  );
  assert.equal(
    (await f.request("/api/admin/users", undefined, "GET", staff)).status,
    403,
  );
  assert.equal(
    (
      await f.request(
        "/api/admin/settings/site",
        { key: "companyName", value: "Forbidden" },
        "PATCH",
        staff,
      )
    ).status,
    403,
  );
  const html = await (
    await fetch(f.base + "/", {
      headers: { Cookie: `jielien_session=${staff.token}` },
    })
  ).text();
  assert.doesNotMatch(html, /href=["']\/quan-tri|staff-admin-link/);
});
test("V3 retains server-rendered product/article metadata and real canonical/redirect/sitemap URLs", async () => {
  const sku = (await f.request("/api/products?limit=1")).data.items[0];
  const html = await (await fetch(f.base + "/san-pham/" + sku.slug)).text();
  assert.ok(html.includes(sku.name));
  assert.ok(html.includes("application/ld+json"));
  assert.ok(html.includes("https://jielien.example/san-pham/" + sku.slug));
  assert.doesNotMatch(html, /href=["']#\//);
  const news = await (await fetch(f.base + "/tin-tuc/cam-hung-1")).text();
  assert.ok(news.includes("Nội dung CMS được render tại máy chủ."));
  assert.ok(news.includes("BlogPosting"));
  assert.ok(news.includes("BreadcrumbList"));
  assert.ok(news.includes("Sản phẩm liên quan"));
  assert.ok(news.includes("/shell-v3.js"));
  assert.doesNotMatch(news, /href=["']\/quan-tri/);
  assert.equal((await fetch(f.base + "/tin-tuc/khong-ton-tai")).status, 404);
  await f.save("/api/admin/seo/redirects", {
    oldPath: "/tin-tuc/cu",
    newPath: "/tin-tuc/cam-hung-1",
  });
  assert.equal(
    (await fetch(f.base + "/tin-tuc/cu", { redirect: "manual" })).status,
    301,
  );
  assert.ok(
    (await (await fetch(f.base + "/sitemap.xml")).text()).includes(
      "/tin-tuc/cam-hung-1",
    ),
  );
});
test("V3 additive migration preserves legacy banner IDs, asset, version and dates", async () => {
  const db = await createTestDatabase();
  try {
    const files = (await readdir(new URL("../db/migrations/", import.meta.url)))
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const file of files.filter((n) => Number(n.slice(0, 3)) < 13))
      await db.pool.query(
        await readFile(
          new URL("../db/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const asset = (
      await db.pool.query(
        "INSERT INTO media_assets(storage_key,mime_type,size_bytes,width,height,alt_text) VALUES('legacy.webp','image/webp',20,10,10,'Legacy') RETURNING id",
      )
    ).rows[0];
    const before = (
      await db.pool.query(
        "INSERT INTO page_banners(title,asset_id,target_path,status,version,starts_at,ends_at) VALUES('Legacy banner',$1,'/san-pham','published',7,'2026-01-01','2027-01-01') RETURNING *",
        [asset.id],
      )
    ).rows[0];
    await db.pool.query(
      await readFile(
        new URL("../db/migrations/013_frontend_v3.sql", import.meta.url),
        "utf8",
      ),
    );
    const after = (
      await db.pool.query("SELECT * FROM page_banners WHERE id=$1", [before.id])
    ).rows[0];
    for (const key of Object.keys(before))
      assert.deepEqual(after[key], before[key]);
    assert.equal(after.slot, "home_hero");
    assert.equal(after.asset_mobile_id, null);
    assert.equal(after.focal_x, 50);
  } finally {
    await db.cleanup();
  }
});
