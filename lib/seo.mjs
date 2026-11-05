import { escape, renderBlocks, reject } from "./commerce-common.mjs";
export function seoConfig(env = process.env) {
  let base = "";
  if (env.PUBLIC_BASE_URL) {
    const u = new URL(env.PUBLIC_BASE_URL);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw Error("PUBLIC_BASE_URL must be an HTTPS origin");
    base = u.origin;
  }
  return { base, index: !!base && env.SEO_INDEXING_ENABLED === "true" };
}
const schemaJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
const format = (v) => Number(v).toLocaleString("vi-VN") + "đ";
function meta(title, description, path, schema, config, image) {
  const canonical = config.base ? config.base + path : "";
  if (schema && config.base) {
    const parent = path.startsWith("/tin-tuc/")
      ? { name: "Tin tức", item: config.base + "/tin-tuc" }
      : { name: "Sản phẩm", item: config.base + "/san-pham" };
    schema = {
      "@context": "https://schema.org",
      "@graph": [
        schema,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Trang chủ",
              item: config.base,
            },
            { "@type": "ListItem", position: 2, ...parent },
            { "@type": "ListItem", position: 3, name: title, item: canonical },
          ],
        },
      ],
    };
  }
  return `<title>${escape(title)} | Jielien International</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${config.index ? "index,follow" : "noindex,nofollow"}">${canonical ? `<link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}">` : ""}<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta name="twitter:card" content="summary_large_image">${image && config.base ? `<meta property="og:image" content="${escape(config.base + image)}">` : ""}${schema ? `<script type="application/ld+json">${schemaJson(schema)}</script>` : ""}`;
}
export function newsDocument(
  body,
  title,
  description,
  path,
  config,
  schema,
  image,
) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${meta(title, description, path, schema, config, image)}<link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/style.css"></head><body><header class="site-header"><div class="wrap header-main"><a href="/"><img class="brand-logo" src="/assets/jielien-logo.jpg" alt="Jielien International" width="128" height="96"></a><nav><a class="brand-news-link" href="/san-pham">Sản phẩm</a><a class="brand-news-link" href="/tin-tuc">Tin tức</a><a class="brand-news-link" href="/tai-khoan">Tài khoản</a><a class="brand-news-link" href="/gio-hang">Giỏ hàng</a></nav></div></header><main class="wrap" style="padding:32px 16px">${body}</main><footer class="site-footer"><div class="wrap">Jielien International · <a href="/">Trang chủ</a></div></footer></body></html>`;
}
export function createSeo({ pool, store, cms, config }) {
  async function render(path, url, template) {
    const redirect = (
      await pool.query("SELECT new_path FROM seo_redirects WHERE old_path=$1", [
        path,
      ])
    ).rows[0];
    if (redirect) return { status: 301, location: redirect.new_path };
    if (path === "/") {
      const products = (await store.listProducts()).slice(0, 8),
        news = (await cms.publicList()).items.slice(0, 3);
      const body = `<h1>Jielien International</h1><p>Khám phá sản phẩm, lựa chọn phân loại và đặt hàng.</p><a href="/san-pham">Xem sản phẩm</a><div class="news-grid">${products.map((p) => `<article><a href="/san-pham/${p.slug}"><img width="160" height="160" src="${escape(p.image)}" alt="${escape(p.name)}"><h2>${escape(p.name)}</h2></a><p>${format(p.price)}</p></article>`).join("")}</div><h2>Tin tức & Cẩm nang</h2>${news.map((a) => `<p><a href="/tin-tuc/${a.slug}">${escape(a.title)}</a></p>`).join("")}`;
      const html = await template();
      return {
        body: html
          .replace(
            /<title>[^<]*<\/title>/,
            meta(
              "Jielien International",
              "Sản phẩm và tin tức từ Jielien.",
              path,
              {
                "@context": "https://schema.org",
                "@type": "Organization",
                name: "Jielien International",
              },
              config,
            ),
          )
          .replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, `$1${body}$2`),
      };
    }
    if (path === "/robots.txt")
      return {
        type: "text/plain; charset=utf-8",
        body: config.index
          ? `User-agent: *\nDisallow: /quan-tri\nDisallow: /tai-khoan\nDisallow: /api/\nDisallow: /thanh-toan\nDisallow: /gio-hang\nSitemap: ${config.base}/sitemap.xml\n`
          : "User-agent: *\nDisallow: /\n",
      };
    if (path === "/sitemap.xml") {
      const urls = [];
      if (config.index) {
        urls.push("/", "/san-pham", "/tin-tuc");
        for (const p of await store.listProducts())
          urls.push("/san-pham/" + p.slug);
        const articles = (
          await pool.query(
            "SELECT r.snapshot->>'slug' AS slug FROM articles a JOIN article_revisions r ON r.id=a.published_revision_id WHERE a.status<>'archived' AND a.published_at<=now()",
          )
        ).rows;
        for (const a of articles) urls.push("/tin-tuc/" + a.slug);
        for (const c of (
          await pool.query("SELECT slug FROM categories WHERE status='active'")
        ).rows)
          urls.push("/danh-muc/" + c.slug);
      }
      return {
        type: "application/xml; charset=utf-8",
        body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((p) => `<url><loc>${escape(config.base + p)}</loc></url>`).join("")}</urlset>`,
      };
    }
    const newsGroup = path.match(/^\/tin-tuc\/(chuyen-muc|the)\/([a-z0-9-]+)$/);
    if (path === "/tin-tuc" || newsGroup) {
      const query = Object.fromEntries(url.searchParams);
      let heading = "Tin tức & Cẩm nang";
      if (newsGroup) {
        const table =
          newsGroup[1] === "chuyen-muc" ? "article_categories" : "article_tags";
        const group = (
          await pool.query(`SELECT id,name FROM ${table} WHERE slug=$1`, [
            newsGroup[2],
          ])
        ).rows[0];
        if (!group) reject(404, "not_found", "Không tìm thấy chuyên mục/tag.");
        heading = group.name;
        query[newsGroup[1] === "chuyen-muc" ? "category" : "tag"] = String(
          group.id,
        );
      }
      const { items, page } = await cms.publicList(query);
      const categories = await cms.taxonomy("categories");
      const body = `<h1>${escape(heading)}</h1><nav>${categories.map((c) => `<a class="brand-news-link" href="/tin-tuc/chuyen-muc/${c.slug}">${escape(c.name)}</a>`).join("")}</nav><form><label>Tìm bài <input name="q" value="${escape(url.searchParams.get("q") || "")}"></label><button>Tìm</button></form><div class="news-grid">${items.map((a) => `<article class="news-card"><a href="/tin-tuc/${a.slug}"><img src="${escape(a.coverUrl)}" alt="${escape(a.coverAlt)}"><h2>${escape(a.title)}</h2></a><p>${escape(a.excerpt)}</p></article>`).join("") || "<p>Chưa có bài viết được xuất bản.</p>"}</div><nav>${page > 1 ? `<a href="?page=${page - 1}">← Trang trước</a>` : ""}${items.length === 12 ? `<a href="?page=${page + 1}">Trang sau →</a>` : ""}</nav>`;
      return {
        body: newsDocument(
          body,
          "Tin tức & Cẩm nang",
          "Nội dung do đội ngũ Jielien biên tập.",
          path,
          config,
        ),
      };
    }
    if (path.startsWith("/bai-viet/")) {
      try {
        const a = await cms.publicGet(path.slice(10));
        return { status: 301, location: "/tin-tuc/" + a.slug };
      } catch (e) {
        if (e.status !== 404) throw e;
      }
    }
    if (/^\/tin-tuc\/[a-z0-9-]+$/.test(path)) {
      const a = await cms.publicGet(path.split("/").at(-1));
      const relatedIds = a.relatedProductIds || [];
      const related = (await store.listProducts())
        .filter((p) => relatedIds.includes(p.productId))
        .filter(
          (p, i, all) =>
            all.findIndex((v) => v.productId === p.productId) === i,
        );
      const toc = a.contentBlocks
        .filter((b) => b.type === "heading")
        .map((b) => `<li>${escape(b.text)}</li>`)
        .join("");
      const schema = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: a.title,
        datePublished: a.publishedAt,
        dateModified: new Date(
          Math.max(+new Date(a.publishedAt), +new Date(a.updatedAt)),
        ).toISOString(),
        author: { "@type": "Person", name: a.author },
        publisher: { "@type": "Organization", name: "Jielien International" },
        ...(config.base
          ? {
              image: config.base + a.coverUrl,
              mainEntityOfPage: config.base + path,
            }
          : {}),
      };
      return {
        body: newsDocument(
          `<article class="article-body"><nav><a href="/tin-tuc">Tin tức</a> / ${escape(a.title)}</nav><h1>${escape(a.title)}</h1><p>${escape(a.excerpt)}</p><p>${escape(a.author)} · ${new Date(a.publishedAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p><img src="${escape(a.coverUrl)}" alt="${escape(a.coverAlt)}">${toc ? `<aside aria-label="Mục lục"><h2>Trong bài viết</h2><ul>${toc}</ul></aside>` : ""}${renderBlocks(a.contentBlocks)}${related.length ? `<section><h2>Sản phẩm liên quan</h2>${related.map((p) => `<p><a href="/san-pham/${p.slug}">${escape(p.name)}</a> · ${format(p.price)}</p>`).join("")}</section>` : ""}</article>`,
          a.seoTitle || a.title,
          a.seoDescription,
          path,
          config,
          schema,
          a.coverUrl,
        ),
      };
    }
    if (
      path === "/san-pham" ||
      path.startsWith("/san-pham/") ||
      path.startsWith("/danh-muc/")
    ) {
      const products = await store.listProducts();
      let title = "Sản phẩm Jielien",
        description = "Danh mục sản phẩm và phân loại SKU.",
        schema,
        body;
      if (path.startsWith("/san-pham/")) {
        const p = products.find((p) => p.slug === path.slice(10));
        if (!p) reject(404, "not_found", "Không tìm thấy sản phẩm.");
        const parent = (
          await pool.query(
            "SELECT content_blocks,seo_title,seo_description FROM products WHERE id=$1",
            [p.productId],
          )
        ).rows[0];
        title = parent.seo_title || p.name;
        description = parent.seo_description || p.description;
        const gallery = (
          await pool.query(
            "SELECT url,alt_text FROM product_media WHERE product_id=$1 ORDER BY sort_order,id",
            [p.productId],
          )
        ).rows;
        body = `<article><h1>${escape(p.name)}</h1><img width="320" height="320" src="${escape(p.image)}" alt="${escape(p.name)}"><p>${format(p.price)} · ${p.stock > 0 ? "Còn hàng" : "Hết hàng"}</p><p>${escape(p.description)}</p>${renderBlocks(parent.content_blocks)}<div class="gallery">${gallery.map((m) => `<img src="${escape(m.url)}" alt="${escape(m.alt_text || p.name)}">`).join("")}</div><a href="/gio-hang">Giỏ hàng</a></article>`;
        schema = {
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          sku: p.sku,
          description: p.description,
          ...(config.base ? { image: config.base + p.image } : {}),
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: "VND",
            availability:
              "https://schema.org/" + (p.stock > 0 ? "InStock" : "OutOfStock"),
            ...(config.base ? { url: config.base + path } : {}),
          },
        };
      } else {
        let filtered = products;
        if (path.startsWith("/danh-muc/")) {
          const cat = (
            await pool.query(
              "SELECT * FROM categories WHERE slug=$1 AND status='active'",
              [path.slice(10)],
            )
          ).rows[0];
          if (!cat) reject(404, "not_found", "Không tìm thấy danh mục.");
          title = cat.name;
          description = cat.description;
          const ids = (
            await pool.query(
              "SELECT product_id FROM product_categories WHERE category_id=$1",
              [cat.id],
            )
          ).rows.map((r) => r.product_id);
          filtered = products.filter((p) => ids.includes(p.productId));
        }
        body = `<h1>${escape(title)}</h1><p>${escape(description)}</p><div class="news-grid">${filtered.map((p) => `<article><a href="/san-pham/${p.slug}"><img width="160" height="160" src="${escape(p.image)}" alt="${escape(p.name)}"><h2>${escape(p.name)}</h2></a><p>${format(p.price)}</p></article>`).join("")}</div>`;
      }
      const html = await template();
      return {
        body: html
          .replace(
            /<title>[^<]*<\/title>/,
            meta(
              title,
              description,
              path,
              schema,
              { ...config, index: config.index && !url.search },
              products[0]?.image,
            ),
          )
          .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, "")
          .replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, `$1${body}$2`),
      };
    }
    return null;
  }
  return { render };
}
