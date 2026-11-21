import { escape, renderBlocks } from "./commerce-common.mjs";
import { bannerPicture } from "../public/v3-storefront.js";
import { icon } from "../public/ui-icons.js";

export async function articleResources(article, catalog, operations) {
  const ids = new Set(article.relatedProductIds || []);
  const inlineIds = new Set();
  for (const block of article.contentBlocks || []) {
    if (block.type === "product") ids.add(block.productId);
    if (block.type === "banner") inlineIds.add(block.bannerId);
  }
  const [products, left, right, inline] = await Promise.all([
    catalog.byProductIds([...ids]),
    article.hideSideBanners ? [] : operations.banners(true, { slot: "article_left" }),
    article.hideSideBanners ? [] : operations.banners(true, { slot: "article_right" }),
    inlineIds.size ? operations.banners(true, { slot: "article_inline", ids: [...inlineIds] }) : [],
  ]);
  return {
    products: new Map(products.map((p) => [p.productId, p])),
    banners: [...left, ...right, ...inline],
  };
}

function productCard(product, sidebar = false) {
  if (!product) return "";
  const name = product.productName || product.name;
  return `<a class="journal-product${sidebar ? " journal-product-small" : ""}" href="/san-pham/${encodeURIComponent(product.slug)}">
    ${product.image ? `<img src="${escape(product.image)}" alt="" width="96" height="96" loading="lazy">` : ""}
    <span><strong>${escape(name)}</strong><small>${Number(product.price).toLocaleString("vi-VN")} ₫</small></span>
    ${sidebar ? "" : icon("arrow")}</a>`;
}

function advertisement(banner, side = "") {
  if (!banner) return "";
  const artwork = side
    ? `<img width="160" height="600" loading="lazy" src="${escape(banner.url)}" alt="${escape(banner.alt || banner.alt_text || banner.title)}" style="object-position:${Number(banner.focal_x)}% ${Number(banner.focal_y)}%">`
    : bannerPicture(banner);
  return `<a class="journal-ad${side ? " journal-rail journal-rail-" + side : " journal-inline-ad"}" href="${escape(banner.target_path)}" aria-label="${escape(banner.title)}">${artwork}</a>`;
}

export function articleContent(article, { products, banners }) {
  const blocks = article.contentBlocks || [];
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const level = block.level === 3 ? 3 : 2;
      return `<h${level} id="muc-${index + 1}">${escape(block.text)}</h${level}>`;
    }
    if (block.type === "product") return productCard(products.get(block.productId));
    if (block.type === "banner")
      return advertisement(banners.find((b) => b.id === block.bannerId && b.slot === "article_inline"));
    if (block.type === "faq")
      return `${blocks[index - 1]?.type === "faq" ? "" : '<h2>Câu hỏi thường gặp</h2>'}<details class="journal-faq"><summary>${escape(block.question)}</summary><p>${escape(block.answer)}</p></details>`;
    return renderBlocks([block]);
  }).join("");
}

function articleCard(article, category) {
  const url = "/tin-tuc/" + encodeURIComponent(article.slug);
  return `<article class="news-card article-card">
    ${article.coverUrl ? `<a class="article-visual" href="${url}" aria-label="${escape(article.title)}"><img width="640" height="400" loading="lazy" src="${escape(article.coverUrl)}" alt="${escape(article.coverAlt)}"></a>` : ""}
    <div class="article-content">${category ? `<small>${escape(category.name)}</small>` : ""}
    <h2><a href="${url}">${escape(article.title)}</a></h2><p>${escape(article.excerpt)}</p></div>
  </article>`;
}

export function journalList({ heading, featured, categories, items, page, query, path, categoryId }) {
  const filters = new URLSearchParams();
  for (const key of ["q", "category", "tag"])
    if (query.get(key)) filters.set(key, query.get(key));
  const pageLink = (target) => {
    filters.set("page", target);
    return path + "?" + filters.toString();
  };
  return `<div class="journal-index">
    <header class="journal-index-header"><div><h1>${escape(heading)}</h1><p>Bài mới và hướng dẫn chọn, sử dụng sản phẩm.</p></div>
      <form method="get" role="search"><label for="journal-search">Tìm bài viết</label><div>
        <input id="journal-search" name="q" type="search" maxlength="120" value="${escape(query.get("q"))}">
        ${["category", "tag"].map((key) => query.has(key) ? `<input type="hidden" name="${key}" value="${escape(query.get(key))}">` : "").join("")}
        <button class="btn btn-primary">Tìm</button></div></form></header>
    <nav class="journal-topics" aria-label="Chuyên mục"><a href="/tin-tuc"${path === "/tin-tuc" && !categoryId ? ' aria-current="page"' : ""}>Tất cả bài viết</a>
      ${categories.map((c) => `<a href="/tin-tuc/chuyen-muc/${encodeURIComponent(c.slug)}"${Number(categoryId) === c.id ? ' aria-current="page"' : ""}>${escape(c.name)}</a>`).join("")}</nav>
    ${featured ? `<a class="campaign-wide" href="${escape(featured.target_path)}">${bannerPicture(featured)}<div><h2>${escape(featured.title)}</h2><p>${escape(featured.subtitle)}</p></div></a>` : ""}
    ${items.length ? `<div class="news-grid">${items.map((a) => articleCard(a, categories.find((c) => c.id === a.categoryId))).join("")}</div>` : '<p class="journal-empty">Chưa tìm thấy bài viết phù hợp.</p>'}
    ${page > 1 || items.length === 12 ? `<nav class="journal-pagination" aria-label="Trang tin tức">${page > 1 ? `<a href="${escape(pageLink(page - 1))}">← Trang trước</a>` : ""}${items.length === 12 ? `<a href="${escape(pageLink(page + 1))}">Trang sau →</a>` : ""}</nav>` : ""}
  </div>`;
}

export function journalArticle(article, resources, related, category) {
  const content = article.contentBlocks || [];
  const headings = content.flatMap((b, i) => b.type === "heading"
    ? [`<li><a href="#muc-${i + 1}">${escape(b.text)}</a></li>`] : []);
  const toc = headings.length ? `<h2>Mục lục</h2><ul>${headings.join("")}</ul>` : "";
  const products = (article.relatedProductIds || []).slice(0, 8)
    .map((id) => productCard(resources.products.get(id), true)).join("");
  const left = !article.hideSideBanners && resources.banners.find((b) => b.slot === "article_left");
  const right = !article.hideSideBanners && resources.banners.find((b) => b.slot === "article_right");
  const summary = (article.quickSummary || article.excerpt || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const date = new Date(article.publishedAt);
  return `<div class="journal-article-page${left ? " has-left-rail" : ""}${right ? " has-right-rail" : ""}">
    ${advertisement(left, "left")}
    <div class="journal-article-layout">
      <article class="article-body journal-article">
        <nav class="journal-breadcrumb" aria-label="Đường dẫn"><a href="/tin-tuc">Tin tức</a>
          ${category ? `<span aria-hidden="true">/</span><a href="/tin-tuc/chuyen-muc/${encodeURIComponent(category.slug)}">${escape(category.name)}</a>` : ""}</nav>
        <h1>${escape(article.title)}</h1>
        <p class="journal-byline"><span>${escape(article.author)}</span><time datetime="${date.toISOString()}">${date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time></p>
        ${article.excerpt && article.quickSummary ? `<p class="journal-lead">${escape(article.excerpt)}</p>` : ""}
        ${article.coverUrl ? `<img class="journal-cover" width="960" height="540" src="${escape(article.coverUrl)}" alt="${escape(article.coverAlt)}" fetchpriority="high">` : ""}
        ${summary.length ? `<section class="journal-summary"><h2>Tóm tắt nhanh</h2>${summary.length === 1 ? `<p>${escape(summary[0])}</p>` : `<ul>${summary.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>`}</section>` : ""}
        ${toc ? `<nav class="journal-mobile-toc" aria-label="Mục lục bài viết">${toc}</nav>` : ""}
        <div class="journal-prose">${articleContent(article, resources)}</div>
        ${article.author ? `<section class="journal-author">${icon("user")}<div><h2>${escape(article.author)}</h2>${article.authorBio ? `<p>${escape(article.authorBio)}</p>` : "<p>Tác giả bài viết</p>"}</div></section>` : ""}
      </article>
      ${headings.length || products ? `<aside class="journal-article-sidebar">
        ${toc ? `<nav aria-label="Mục lục bài viết">${toc}</nav>` : ""}
        ${products ? `<section><h2>Sản phẩm liên quan</h2>${products}</section>` : ""}
      </aside>` : ""}
      ${related.length ? `<section class="journal-related"><h2>Bài viết liên quan</h2><div class="news-grid">${related.map((a) => articleCard(a)).join("")}</div></section>` : ""}
    </div>
    ${advertisement(right, "right")}
  </div>`;
}
