import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createApp } from "../../server.mjs";
import { createAuth } from "../../lib/auth.mjs";
import { createTestDatabase, closeServer } from "./database.mjs";
// Fixtures exist only inside this test's disposable schema/media directory.
export async function frontendFixture({ populate = true } = {}) {
  const db = await createTestDatabase(),
    directory = await mkdtemp(join(tmpdir(), "jielien-v3-"));
  let app;
  try {
    app = await createApp({
      pool: db.pool,
        legacyPath: null,
      mediaDirectory: directory,
      seoConfiguration: {
        PUBLIC_BASE_URL: "https://jielien.example",
        SEO_INDEXING_ENABLED: "true",
      },
    });
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
    const base = `http://127.0.0.1:${app.address().port}`,
      auth = createAuth(db.pool),
      password = "V3-Fixture-Only!2026";
    const admin = await auth.ensureAdmin({
      name: "Admin V3 test",
      username: "admin",
      email: "v3@example.test",
      phone: "0987654321",
      password,
    });
    const session = await auth.login({ identifier: "admin", password });
    const headers = {
      Cookie: `jielien_session=${session.token}`,
      "X-CSRF-Token": session.csrfToken,
    };
    async function request(
      path,
      body,
      method = "GET",
      who = session,
      csrf = true,
    ) {
      const r = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(who
            ? {
                Cookie: `jielien_session=${who.token}`,
                ...(csrf ? { "X-CSRF-Token": who.csrfToken } : {}),
              }
            : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, data: await r.json() };
    }
    async function save(path, body, method = "POST") {
      const r = await request(path, body, method);
      assert.ok(r.status < 300, path + " " + JSON.stringify(r));
      return r.data;
    }
    async function upload(color, width = 1000, height = 750) {
      const image = await sharp({
        create: { width, height, channels: 3, background: color },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="${width}" height="${height}"><circle cx="${width * 0.75}" cy="${height * 0.55}" r="${height * 0.3}" fill="#ffffff" opacity=".15"/><circle cx="${width * 0.7}" cy="${height * 0.4}" r="${height * 0.13}" fill="#d8ef9c" opacity=".3"/></svg>`,
            ),
          },
        ])
        .png()
        .toBuffer();
      const r = await fetch(base + "/api/admin/media/uploads", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "image/png",
          "X-Image-Alt": "V3%20test%20fixture",
        },
        body: image,
      });
      assert.equal(r.status, 201);
      return (await r.json()).asset;
    }
    const result = {
      db,
      app,
      auth,
      admin,
      password,
      session,
      headers,
      base,
      request,
      save,
      upload,
      categories: [],
      products: [],
      banners: [],
      assets: [],
      async cleanup() {
        await closeServer(app);
        await db.cleanup();
        await rm(directory, { recursive: true, force: true });
      },
    };
    if (!populate) return result;
    const desktop = await upload("#1d3b41", 1600, 900),
      mobile = await upload("#315c58", 750, 920),
      warm = await upload("#d5c2ae"),
      green = await upload("#9eb78c");
    result.assets = [desktop, mobile, warm, green];
    for (const [key, value] of Object.entries({
      companyName: "Jielien V3 Fixture",
      tagline: "Chọn lựa tinh tế, sống thêm tiện nghi",
      contactEmail: "hello@example.test",
      trust1: "Thông tin sản phẩm rõ ràng",
      trust2: "Theo dõi đơn hàng",
      trust3: "Thanh toán thuận tiện",
      trust4: "Hỗ trợ từ Jielien",
    }))
      await save("/api/admin/settings/site", { key, value }, "PATCH");
    const categories = [
      ["Nhà cửa & Gia dụng", "nha-cua"],
      ["Thiết bị & Công nghệ", "thiet-bi"],
      ["Chăm sóc cá nhân", "cham-soc"],
      ["Quà tặng", "qua-tang"],
      ["Phong cách sống", "phong-cach"],
      ["Văn phòng", "van-phong"],
      ["Du lịch", "du-lich"],
      ["Gia đình", "gia-dinh"],
    ];
    for (let i = 0; i < categories.length; i++) {
      const c = (
        await save("/api/admin/catalog/categories", {
          name: categories[i][0],
          slug: categories[i][1],
          imageAssetId: result.assets[i % 4].id,
          sortOrder: i,
        })
      ).item;
      result.categories.push(c);
      const body = {
        name: "Lựa chọn " + (i + 1),
        slug: "lua-chon-" + (i + 1),
        categoryIds: [Number(c.id)],
        description: "Mô tả trong schema kiểm thử V3",
        status: "draft",
      };
      let p = (await save("/api/admin/catalog/products", body)).product;
      p = (
        await save(`/api/admin/catalog/products/${p.id}/variants`, {
          version: p.version,
          variants: [1, 2].map((j) => ({
            name: `Sản phẩm ${i + 1} · Quy cách ${j}`,
            sku: `V3-${i + 1}-${j}`,
            price: (i + 1) * 100000 + j * 10000,
            originalPrice: (i + 1) * 100000 + j * 10000 + 30000,
            weight: j === 1 ? "Tiêu chuẩn" : "Cao cấp",
            status: "active",
          })),
        })
      ).product;
      p = (
        await save(
          `/api/admin/catalog/products/${p.id}/media`,
          { version: p.version, media: [{ assetId: result.assets[i % 4].id }] },
          "PUT",
        )
      ).product;
      p = (
        await save(
          `/api/admin/catalog/products/${p.id}`,
          { ...body, status: "active", version: p.version },
          "PATCH",
        )
      ).product;
      for (const v of p.variants)
        await save("/api/admin/inventory/adjust", {
          variantId: Number(v.id),
          warehouseId: 1,
          quantityChange: 20,
          reason: "Nhập hàng fixture V3",
        });
      result.products.push(p);
    }
    for (const [slot, title, asset] of [
      ["home_hero", "Khám phá điều hay. Sống thêm tiện nghi.", desktop],
      ["home_side_top", "Những lựa chọn cho tổ ấm.", green],
      ["home_side_bottom", "Chăm chút điều bạn yêu.", warm],
      ["home_wide", "Tìm cảm hứng cho mỗi ngày.", desktop],
      ["category_hero", "Khám phá bộ sưu tập", green],
      ["article_featured", "Góc cảm hứng Jielien", warm],
    ]) {
      result.banners.push(
        (
          await save("/api/admin/banners", {
            slot,
            title,
            subtitle: "Nội dung minh họa trong schema test",
            ctaLabel: "Khám phá ngay",
            assetId: asset.id,
            assetMobileId: mobile.id,
            alt: "Ảnh chiến dịch kiểm thử",
            targetPath: "/san-pham",
            sortOrder: 10,
            status: "published",
            focalX: 65,
            focalY: 45,
          })
        ).item,
      );
    }
    const articleCategory = (
      await save("/api/admin/cms/categories", {
        name: "Góc cảm hứng",
        slug: "goc-cam-hung",
      })
    ).item;
    for (let i = 1; i <= 3; i++) {
      let article = (
        await save("/api/admin/cms/articles", {
          title: `Cảm hứng cho không gian sống ${i}`,
          slug: "cam-hung-" + i,
          excerpt: "Những góc nhìn hữu ích dành cho cuộc sống mỗi ngày.",
          categoryId: Number(articleCategory.id),
          coverUrl: result.assets[i].url,
          coverAlt: "Ảnh bài viết kiểm thử",
          seoTitle: "Cảm hứng Jielien " + i,
          seoDescription: "Bài viết được xuất bản trong schema kiểm thử.",
          contentBlocks: [
            { type: "heading", text: "Lựa chọn phù hợp" },
            {
              type: "paragraph",
              text: "Nội dung CMS được render tại máy chủ.",
            },
          ],
          relatedProductIds: [Number(result.products[0].id)],
        })
      ).article;
      for (const action of ["submit", "approve", "publish"])
        article = (
          await save(`/api/admin/cms/articles/${article.id}/${action}`, {
            version: article.version,
          })
        ).article;
    }
    return result;
  } catch (error) {
    await closeServer(app);
    await db.cleanup();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
