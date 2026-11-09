import { icon } from "./ui-icons.js";
export const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) => Number(v).toLocaleString("vi-VN") + "\u00a0₫";
export const categoryLink = (c) => "/danh-muc/" + encodeURIComponent(c.slug);
export function bannerPicture(b, { priority = false } = {}) {
  return `<picture>${b.mobile_url ? `<source media="(max-width:680px)" srcset="${escape(b.mobile_url)}">` : ""}<img src="${escape(b.url)}" alt="${escape(b.alt || b.alt_text)}" width="1600" height="900" sizes="(max-width:900px) 100vw, 65vw" ${priority ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"'} decoding="async" style="object-position:${Number(b.focal_x ?? 50)}% ${Number(b.focal_y ?? 50)}%"></picture>`;
}
export function renderHero(banners, index = 0, settings = {}) {
  const list = banners.filter((b) => b.slot === "home_hero"),
    b = list[index % Math.max(1, list.length)];
  return `<div class="hero hero-main${b ? " has-campaign" : ""}">${b ? bannerPicture(b, { priority: true }) : ""}<div class="hero-copy"><span class="hero-kicker">${escape(settings.companyName || "JIELIEN INTERNATIONAL")}</span><h1>${b ? escape(b.title) : "Khám phá điều hay.<br><em>Sống thêm tiện nghi.</em>"}</h1><p>${escape(b?.subtitle || settings.tagline || "Khám phá những lựa chọn phù hợp cho gia đình và cuộc sống của bạn.")}</p><a class="btn btn-primary" href="${escape(b?.target_path || "/san-pham")}" data-link>${escape(b?.cta_label || "Khám phá sản phẩm")} ${icon("arrow")}</a></div>${list.length > 1 ? `<div class="hero-pager banner-controls" aria-label="Chọn banner">${list.map((_, i) => `<button data-hero="${i}" class="${i === index ? "active" : ""}" aria-label="Banner ${i + 1}" aria-pressed="${i === index}"></button>`).join("")}<button type="button" data-banner-pause aria-pressed="false">Tạm dừng</button></div>` : ""}</div>`;
}
export function renderCard(p, saved = false, ready = true) {
  const discount =
    p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return `<article class="product-card">${discount ? `<span class="product-badge product-discount">-${discount}%</span>` : ""}<button class="product-fav wish-button ${saved ? "active" : ""}" data-wish="${p.id}" ${!ready ? "disabled" : ""} aria-label="${saved ? "Bỏ yêu thích" : "Yêu thích"} ${escape(p.name)}" aria-pressed="${saved}">${icon("heart")}</button><a class="product-image product-photo" href="/san-pham/${encodeURIComponent(p.slug)}" data-link>${p.image ? `<img src="${escape(p.image)}" alt="${escape(p.name)}" width="420" height="420" loading="lazy" decoding="async">` : `<span class="image-placeholder">${icon("box")}<small>Chưa có ảnh</small></span>`}</a><div class="product-info"><span class="micro product-brand">${escape(p.brand)}</span><h3><a href="/san-pham/${encodeURIComponent(p.slug)}" data-link>${escape(p.name)}</a></h3><div class="price product-price">${p.priceVaries ? "Từ " : ""}${money(p.price)}</div>${discount ? `<del class="old-price">${money(p.oldPrice)}</del>` : ""}<p class="sku-note">${escape(p.weight || p.sku)}</p><div class="product-bottom product-actions"><span class="available ${p.stock ? "" : "unavailable"}">${p.stock > 0 ? "Còn hàng" : "Hết hàng"}</span><button class="quick-add add-button" data-add="${p.id}" ${p.stock <= 0 || !ready ? "disabled" : ""} aria-label="Thêm ${escape(p.name)} vào giỏ">${icon("bag")}<span>${p.stock > 0 ? "Thêm vào giỏ" : "Hết hàng"}</span></button></div></div></article>`;
}
export function renderHome({
  products,
  categories,
  siteData,
  newsItems,
  favorites = [],
  heroIndex = 0,
  selected = "",
  ready = true,
}) {
  const settings = Object.fromEntries(
      (siteData.settings || []).map((s) => [s.key, s.value_json]),
    ),
    banners = siteData.banners || [];
  const sides = ["home_side_top", "home_side_bottom"]
    .map((slot, i) => {
      const b = banners.find((b) => b.slot === slot);
      return b
        ? `<a class="poster ${i ? "two" : "one"}" href="${escape(b.target_path)}" data-link>${bannerPicture(b)}<div class="poster-copy"><span class="p-eyebrow">${escape(b.subtitle)}</span><h3>${escape(b.title)}</h3><span class="p-link">${escape(b.cta_label)} ${icon("arrow")}</span></div></a>`
        : "";
    })
    .join("");
  const wide = banners.find((b) => b.slot === "home_wide");
  const trust = [1, 2, 3, 4].map((i) => settings["trust" + i]).filter(Boolean);
  return `<section class="hero-area"><div class="hero-grid"><div id="hero-container">${renderHero(banners, heroIndex, settings)}</div>${sides ? `<div class="poster-stack">${sides}</div>` : ""}</div>${trust.length ? `<div class="trust-row">${trust.map((t) => `<div class="trust-item"><span class="trust-icon">${icon("check")}</span><b>${escape(t)}</b></div>`).join("")}</div>` : ""}</section>
  ${
    categories.length
      ? `<section class="section"><div class="section-title"><div><span class="eyebrow">KHÁM PHÁ JIELIEN</span><h2>Điều bạn cần, ở ngay đây.</h2><p>Lựa chọn theo sở thích và nhu cầu của bạn.</p></div><a class="textlink" href="/san-pham" data-link>Tất cả danh mục ${icon("arrow")}</a></div><div class="category-grid">${categories
          .slice(0, 8)
          .map(
            (c) =>
              `<a class="category-card" href="${categoryLink(c)}" data-link><div class="category-visual"><span class="category-blob"></span>${c.image_url ? `<img src="${escape(c.image_url)}" alt="" width="120" height="120" loading="lazy">` : icon("box")}</div><span>${escape(c.name)}</span></a>`,
          )
          .join("")}</div></section>`
      : ""
  }
  ${wide ? `<a class="campaign-wide" href="${escape(wide.target_path)}" data-link>${bannerPicture(wide)}<div><small>${escape(wide.subtitle)}</small><h2>${escape(wide.title)}</h2><span class="btn btn-primary">${escape(wide.cta_label)} ${icon("arrow")}</span></div></a>` : ""}
  <section class="section"><div class="section-title"><div><span class="eyebrow">LỰA CHỌN CHO BẠN</span><h2>Khám phá sản phẩm</h2><p>Giá và tình trạng hàng theo từng phân loại.</p></div><a class="textlink" href="/san-pham" data-link>Xem tất cả ${icon("arrow")}</a></div><div class="filter-tabs"><button class="filter-tab ${!selected ? "active" : ""}" data-home-category="">Tất cả</button>${categories.map((c) => `<button class="filter-tab ${selected === c.slug ? "active" : ""}" data-home-category="${escape(c.slug)}">${escape(c.name)}</button>`).join("")}</div><div class="product-grid products-grid">${products.map((p) => renderCard(p, favorites.includes(p.id), ready)).join("") || '<div class="empty"><h3>Chưa có sản phẩm</h3><p>Sản phẩm được xuất bản sẽ xuất hiện tại đây.</p></div>'}</div></section>
  <section class="section"><div class="section-title"><div><span class="eyebrow">JIELIEN JOURNAL</span><h2>Cảm hứng cho mỗi ngày</h2><p>Câu chuyện và kiến thức từ đội ngũ Jielien.</p></div><a class="textlink" href="/tin-tuc">Đọc thêm ${icon("arrow")}</a></div><div class="feature-news">${newsItems.map((a) => `<article class="article-card"><a class="article-visual" href="/tin-tuc/${escape(a.slug)}"><img src="${escape(a.coverUrl)}" alt="${escape(a.coverAlt)}" width="640" height="400" loading="lazy"></a><div class="article-content"><h3><a href="/tin-tuc/${escape(a.slug)}">${escape(a.title)}</a></h3><p>${escape(a.excerpt)}</p><a class="read" href="/tin-tuc/${escape(a.slug)}">Đọc bài viết ${icon("arrow")}</a></div></article>`).join("") || '<p class="empty-editorial">Chưa có bài viết được xuất bản.</p>'}</div></section>`;
}
export function hydratePublicShell(categories, siteData = {}) {
  const settings = Object.fromEntries(
    (siteData.settings || []).map((s) => [s.key, s.value_json]),
  );
  settings.contactPhone = settings.hotline || settings.contactPhone;
  settings.contactEmail = settings.email_support || settings.contactEmail;
  settings.address = settings.store_address || settings.address;
  const links = categories
    .map((c) => `<a href="${categoryLink(c)}" data-link>${escape(c.name)}</a>`)
    .join("");
  for (const id of ["dynamic-nav", "footer-categories", "category-dropdown"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = links;
  }
  for (const [id, key] of [
    ["company-tagline", "tagline"],
    ["company-phone", "contactPhone"],
    ["company-address", "address"],
    ["company-email", "contactEmail"],
    ["company-footer", "footerText"],
    ["company-legal", "legalName"],
    ["company-registration", "registrationNumber"],
  ]) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = settings[key] || "";
      el.hidden = !settings[key];
    }
  }
  const contact = document.getElementById("company-contact");
  if (contact) contact.textContent = settings.companyName || "";
}

const href = (params = {}) =>
  "/san-pham" +
  (Object.entries(params).some(([, v]) => v !== "" && v != null)
    ? "?" +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== "" && v != null),
        ),
      )
    : "");
const breadcrumbs = (items) =>
  `<nav class="breadcrumbs" aria-label="Đường dẫn"><a href="/" data-link>Trang chủ</a>${items.map(([label, url]) => `<span aria-hidden="true">›</span>${url ? `<a href="${escape(url)}" data-link>${escape(label)}</a>` : `<span aria-current="page">${escape(label)}</span>`}`).join("")}</nav>`;
const empty = (title, text, url, label) =>
  `<div class="empty"><h2>${title}</h2><p>${text}</p><a class="btn btn-primary" href="${url}" data-link>${label}</a></div>`;

export function renderListing({
  listingData,
  categories,
  params = {},
  siteData = {},
  favorites = [],
  filterOpen = false,
  ready = true,
}) {
  const list = listingData.items,
    total = listingData.total,
    pages = listingData.pages,
    page = listingData.page;
  const currentCategory = categories.find(
    (c) =>
      c.slug === params.category ||
      c.name === params.category ||
      String(c.id) === params.category,
  );
  const title = params.q
    ? `Kết quả cho “${params.q}”`
    : currentCategory?.name || params.category || "Tất cả sản phẩm";

  const options = (values, selected, all) =>
    `<option value="">${all}</option>${values.map((value) => `<option value="${escape(value)}" ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`;
  const categoryBanner = (siteData.banners || []).find(
    (b) => b.slot === "category_hero",
  );
  return `${categoryBanner ? `<a class="campaign-wide category-campaign" href="${escape(categoryBanner.target_path)}" data-link>${bannerPicture(categoryBanner)}<h2>${escape(categoryBanner.title)}</h2></a>` : ""}${breadcrumbs([[title]])}<h1 class="page-title">${escape(title)}</h1><p class="page-subtitle">Lựa chọn phù hợp cho cuộc sống của bạn · ${total} sản phẩm</p>
  <div class="catalog-layout"><aside class="filter-panel ${filterOpen ? "open" : ""}" id="filter-panel" aria-label="Bộ lọc sản phẩm"><div class="filter-group"><h3>Danh mục</h3><select data-select-filter="category" aria-label="Lọc danh mục">${options(
    categories.map((c) => c.name),
    currentCategory?.name || params.category,
    "Tất cả danh mục",
  )}</select></div><div class="filter-group"><h3>Thương hiệu</h3><select data-select-filter="brand" aria-label="Lọc thương hiệu">${options(listingData.facets.brands, params.brand, "Tất cả thương hiệu")}</select></div><div class="filter-group"><h3>Độ tuổi</h3><select data-select-filter="age" aria-label="Lọc độ tuổi">${options(listingData.facets.ages, params.age, "Tất cả độ tuổi")}</select></div><form id="price-filter" class="filter-group"><h3>Khoảng giá (đ)</h3><div class="filter-price"><input type="number" name="min" aria-label="Giá từ" min="0" max="100000000" placeholder="Từ" value="${escape(params.min || "")}"><input type="number" name="max" aria-label="Giá đến" min="0" max="100000000" placeholder="Đến" value="${escape(params.max || "")}"></div><button class="secondary">Áp dụng</button></form><div class="filter-group"><a href="/san-pham" data-link class="clear-filters">Xóa tất cả bộ lọc</a></div></aside>
  <section class="catalog-content"><div class="catalog-toolbar"><span><b>${total}</b> sản phẩm</span><button class="secondary filter-toggle" id="filter-toggle" aria-expanded="${filterOpen}">☷ Bộ lọc</button><label>Sắp xếp: <select id="sort" aria-label="Sắp xếp sản phẩm">${[
    ["", "Đề xuất cho bạn"],
    ["price-asc", "Giá thấp đến cao"],
    ["price-desc", "Giá cao đến thấp"],
    ["discount", "Giảm giá nhiều nhất"],
    ["name", "Tên A–Z"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${params.sort === value ? "selected" : ""}>${label}</option>`,
    )
    .join("")}</select></label></div>
  <div class="active-filters">${["category", "brand", "age", "q", "min", "max"]
    .filter((key) => params[key])
    .map(
      (key) =>
        `<button class="filter-chip" data-remove-filter="${key}">${escape((key === "min" ? "Từ " : key === "max" ? "Đến " : "") + params[key])} ×</button>`,
    )
    .join("")}</div>
  ${total ? `<div class="product-grid products-grid">${list.map((p) => renderCard(p, favorites.includes(p.id), ready)).join("")}</div>` : empty("Chưa tìm thấy sản phẩm", "Bạn thử đổi từ khóa hoặc bỏ bớt bộ lọc nhé.", "/san-pham", "Xem tất cả sản phẩm")}
  ${pages > 1 ? `<nav class="pagination" aria-label="Trang sản phẩm">${Array.from({ length: pages }, (_, i) => `<a href="${escape(href({ ...params, page: i + 1 }))}" data-link class="${page === i + 1 ? "active" : ""}" ${page === i + 1 ? 'aria-current="page"' : ""}>${i + 1}</a>`).join("")}</nav>` : ""}</section></div>`;
}

export function renderDetail(p, variants, { ready = true } = {}) {
  return `${breadcrumbs([[p.category, href({ category: p.category })], [p.name]])}<section class="panel detail-top"><div><div class="gallery-main">${p.oldPrice > p.price ? `<span class="product-badge product-discount">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}${p.image ? `<img id="detail-image" src="${escape(p.image)}" alt="${escape(p.name)}" width="800" height="800" fetchpriority="high">` : `<span class="image-placeholder">${icon("box")}<small>Chưa có ảnh</small></span>`}</div><div class="gallery-thumbs">${(p
    .gallery?.length
    ? p.gallery
    : [{ url: p.image, alt: p.name }]
  )
    .filter((m) => m.url)
    .map(
      (m, i) =>
        `<button ${!ready ? "disabled" : ""} data-gallery="${escape(m.url)}" data-alt="${escape(m.alt || p.name)}" aria-label="Ảnh sản phẩm ${i + 1}"><img src="${escape(m.url)}" alt="${escape(m.alt || p.name)}"></button>`,
    )
    .join(
      "",
    )}</div><p class="detail-label">Kiểm tra quy cách và thông tin sản phẩm trước khi đặt hàng.</p></div><div class="detail-info"><div class="product-brand">${escape(p.brand)}</div><h1>${escape(p.name)}</h1><div class="detail-meta"><span>Mã SKU: ${escape(p.sku || String(p.id))}</span><span class="in-stock">${p.stock > 5 ? "Còn hàng" : p.stock > 0 ? `Chỉ còn ${p.stock} sản phẩm` : "Tạm hết hàng"}</span></div><div class="detail-pricing"><strong>${p.priceVaries ? "Từ " : ""}${money(p.price)}</strong>${p.oldPrice > p.price ? `<del>${money(p.oldPrice)}</del>` : ""}<small>Giá theo kho còn hàng; báo giá cuối được xác nhận ở bước thanh toán</small></div><div class="variant-label">Lựa chọn đang xem: <b>${escape(p.weight)}</b></div><div class="variants" role="radiogroup" aria-label="Chọn quy cách">${[
    p,
    ...variants,
  ]
    .sort((a, b) => a.id - b.id)
    .map(
      (v) =>
        `<button type="button" role="radio" aria-checked="${v.id === p.id}" tabindex="${v.id === p.id ? 0 : -1}" class="${v.id === p.id ? "active" : ""}" data-variant="${v.id}" ${!ready ? "disabled" : ""}>${escape(v.weight || v.name)}${v.stock ? "" : " · Hết hàng"}</button>`,
    )
    .join(
      "",
    )}</div><div class="variant-label">Số lượng</div>${quantityControl(p.id, 1, true, p, ready)}<div class="buy-row"><button class="secondary" data-detail-add="${p.id}" ${!p.stock || !ready ? "disabled" : ""}>+ Thêm vào giỏ</button><button class="primary" data-buy="${p.id}" ${!p.stock || !ready ? "disabled" : ""}>Mua ngay →</button></div><div class="delivery-note">Phí giao hàng và ưu đãi được xác nhận trong bước thanh toán.</div><div class="delivery-note">Nhập mã ưu đãi ở giỏ hàng.</div><ul class="features">${p.features.map((f) => `<li>${escape(f)}</li>`).join("")}</ul></div></section>
  <section class="panel"><div class="tabs" role="tablist" aria-label="Thông tin sản phẩm"><button class="active" role="tab" id="tab-description" aria-selected="true" aria-controls="detail-tab-content" data-tab="description" ${!ready ? "disabled" : ""}>Mô tả sản phẩm</button><button role="tab" id="tab-specs" aria-selected="false" aria-controls="detail-tab-content" data-tab="specs" ${!ready ? "disabled" : ""}>Thông số</button><button role="tab" id="tab-notes" aria-selected="false" aria-controls="detail-tab-content" data-tab="notes" ${!ready ? "disabled" : ""}>Lưu ý sử dụng</button></div><div class="tab-content" id="detail-tab-content" role="tabpanel" aria-labelledby="tab-description" data-product="${p.id}">${`<h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${p.descriptionHtml || ""}<ul>${(p.features || []).map((f) => `<li>${escape(f)}</li>`).join("")}</ul>`}</div></section>`;
}

const productLink = (p) => "/san-pham/" + encodeURIComponent(p.slug);
function quantityControl(id, quantity, detail, p, ready = true) {
  return `<div class="quantity-control"><button ${!ready ? "disabled" : ""} type="button" data-quantity="-1" data-id="${id}" data-detail aria-label="Giảm số lượng">−</button><input ${!ready ? "disabled" : ""} id="detail-quantity" type="number" required min="1" step="1" max="${Math.min(99, p.stock || 1)}" value="${quantity}" aria-label="Số lượng ${escape(p.name)}"><button ${!ready ? "disabled" : ""} type="button" data-quantity="1" data-id="${id}" data-detail aria-label="Tăng số lượng">+</button></div>`;
}
