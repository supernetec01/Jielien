import { icon } from "/ui-icons.js";
import { canAccessAdmin } from "/admin-access.js";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (value) => Number(value).toLocaleString("vi-VN") + "đ";
const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
let categoryRows = [],
  brandRows = [];
let newsItems = [],
  siteData = {};
let categories = [
  ["Sữa cho bé", "milk-green"],
  ["Bỉm & tã", "diaper-pink"],
  ["Ăn dặm", "cereal"],
  ["Chăm sóc bé", "baby-care"],
  ["Đồ dùng cho bé", "bottle"],
  ["Đồ chơi", "toy"],
  ["Dành cho mẹ", "mom"],
];
const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast("Trình duyệt không cho phép lưu dữ liệu.");
    }
  },
};
let products = [];
let cart = {};
let favorites = [];
let coupon = "";
let quote = null;
let renderVersion = 0;
let toastTimeout;
let filterOpen = false;
let heroIndex = 0;
let checkoutKey = null;
let submitting = false;
let lastOrder = null;
let pendingOrder = null;
let identity = null;
let csrfToken = "";
let cartSync = Promise.resolve();
let paymentMethods = [
  {
    id: "cod",
    enabled: true,
    label: "Thanh toán khi nhận hàng (COD)",
    description: "Thanh toán cho nhân viên giao hàng khi nhận hàng.",
  },
];
function paymentLabel(method) {
  return method === "bank_transfer"
    ? "Chuyển khoản ngân hàng / VietQR"
    : "Thanh toán khi nhận hàng (COD)";
}
function orderButtonLabel(method = $("input[name=payment]:checked")?.value) {
  return method === "bank_transfer"
    ? "Đặt hàng và xem VietQR →"
    : "Đặt hàng COD →";
}
function paymentOptions() {
  return paymentMethods
    .map(
      (method) =>
        `<label class="payment-option${method.enabled ? "" : " payment-disabled"}"><input type="radio" name="payment" value="${escape(method.id)}" ${method.id === "cod" ? "checked" : ""} ${method.enabled ? "" : "disabled"}><span><b>${escape(method.label || paymentLabel(method.id))}</b><small>${escape(method.description || "")}${!method.enabled ? " Hiện chưa khả dụng." : ""}</small></span></label>`,
    )
    .join("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken && options.method && options.method !== "GET"
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...options.headers,
    },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Chưa nhận được phản hồi. Vui lòng thử lại.");
  }
  if (!response.ok) {
    const error = new Error(
      body.message || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
    );
    error.status = response.status;
    error.code = body.error;
    throw error;
  }
  return body;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function href(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== "" && value != null) search.set(key, value);
  return "/san-pham" + (search.size ? "?" + search.toString() : "");
}
function productLink(product) {
  return "/san-pham/" + encodeURIComponent(product.slug);
}
function catalogParams() {
  return Object.fromEntries(new URLSearchParams(location.search));
}
function changeFilters(changes) {
  const params = { ...catalogParams(), ...changes, page: "" };
  navigate(href(params));
}
function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Đường dẫn"><a href="/" data-link>Trang chủ</a>${items.map(([label, url]) => `<span aria-hidden="true">›</span>${url ? `<a href="${escape(url)}" data-link>${escape(label)}</a>` : `<span aria-current="page">${escape(label)}</span>`}`).join("")}</nav>`;
}
function empty(title, text, link = "/san-pham", label = "Khám phá sản phẩm") {
  return `<div class="empty"><span class="empty-icon" aria-hidden="true">${icon("cart")}</span><h2>${escape(title)}</h2><p>${escape(text)}</p>${link ? `<a href="${escape(link)}" data-link class="primary">${escape(label)} →</a>` : ""}</div>`;
}
function card(product) {
  const saved = favorites.includes(product.id);
  return `<article class="product-card">
    <span class="product-discount">-${Math.round((1 - product.price / product.oldPrice) * 100)}%</span>
    <button class="wish-button ${saved ? "active" : ""}" data-wish="${product.id}" aria-label="${saved ? "Bỏ yêu thích" : "Yêu thích"} ${escape(product.name)}" aria-pressed="${saved}">${icon(saved ? "heart-filled" : "heart")}</button>
    <a href="${productLink(product)}" data-link class="product-photo"><img src="${escape(product.image)}" alt="${escape(product.name)}" width="320" height="320" loading="lazy"></a>
    <div class="product-brand">${escape(product.brand)}</div>
    <h3><a href="${productLink(product)}" data-link>${escape(product.name)}</a></h3>
    <div class="product-price">${money(product.price)}</div><div class="old-price">${money(product.oldPrice)}</div>
    <div class="product-tags"><span>${escape(product.age)}</span>${product.stock <= 5 ? `<span class="stock-notice">${product.stock > 0 ? "Sắp hết" : "Hết hàng"}</span>` : ""}</div>
    <div class="product-actions"><button class="add-button" data-add="${product.id}" ${product.stock <= 0 ? "disabled" : ""}>${product.stock > 0 ? "+ Thêm vào giỏ" : "Tạm hết hàng"}</button></div>
  </article>`;
}
function productGrid(list) {
  return `<div class="products-grid">${list.map(card).join("")}</div>`;
}
function section(title, subtitle, list, url = "/san-pham") {
  return `<section class="panel"><div class="section-heading"><div><h2>${escape(title)}</h2>${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</div><a href="${escape(url)}" data-link>Xem tất cả →</a></div>${productGrid(list)}</section>`;
}
const heroes = [
  {
    eyebrow: "JIELIEN INTERNATIONAL",
    title: "Khám phá điều hay.<br><em>Nâng tầm cuộc sống.</em>",
    text: "Lựa chọn chất lượng cho gia đình.<br>Cùng Jielien chăm chút từng khoảnh khắc.",
    image: "/family.svg",
    link: "/san-pham",
  },
  {
    eyebrow: "ÊM ÁI TỪ NHỮNG NGÀY ĐẦU",
    title: "Bé thoải mái.<br>Mẹ thêm <em>an tâm.</em>",
    text: "Bỉm tã mềm mại và những món đồ<br>chăm sóc nhỏ xinh dành cho bé.",
    image: "/assets/diaper-blue.svg",
    link: href({ category: "Bỉm & tã" }),
  },
  {
    eyebrow: "DINH DƯỠNG CHO BÉ YÊU",
    title: "Một chút mới mẻ.<br>Vạn điều <em>khám phá.</em>",
    text: "Khám phá danh mục dinh dưỡng<br>và đồ dùng cho bữa ăn của bé.",
    image: "/assets/cereal.svg",
    link: href({ category: "Ăn dặm" }),
  },
];
function heroMarkup() {
  const banners = siteData.banners || [],
    count = banners.length || heroes.length;
  heroIndex = heroIndex % count;
  const banner = banners[heroIndex],
    h = heroes[heroIndex];
  const controls =
    count > 1
      ? `<div class="banner-controls" aria-label="Chọn banner"><button type="button" data-banner-step="-1" aria-label="Banner trước">${icon("arrow", { className: "previous-arrow" })}</button>${Array.from({ length: count }, (_, i) => `<button class="${i === heroIndex ? "active" : ""}" data-hero="${i}" aria-label="Banner ${i + 1}" aria-pressed="${i === heroIndex}"></button>`).join("")}<button type="button" data-banner-step="1" aria-label="Banner tiếp theo">${icon("arrow")}</button><button type="button" data-banner-pause aria-pressed="${bannerPaused}">${bannerPaused ? "Phát banner" : "Tạm dừng"}</button></div>`
      : "";
  return `<div class="hero"><div class="hero-content"><div class="eyebrow">${banner ? "JIELIEN INTERNATIONAL" : h.eyebrow}</div><h1>${banner ? escape(banner.title) : h.title}</h1>${banner ? "" : `<p>${h.text}</p>`}<a href="${escape(banner ? banner.target_path : h.link)}" ${banner ? "" : "data-link"} class="primary">Khám phá cho bé ${icon("arrow")}</a><div class="hero-note">Chọn cho bé · Chăm chút gia đình</div></div><div class="hero-art"><img src="${escape(banner ? banner.url : h.image)}" alt="${escape(banner ? banner.alt_text : "Sản phẩm và thế giới của bé")}" width="560" height="420" ${heroIndex === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></div>${controls}</div>`;
}
function couponMarkup() {
  const coupons = siteData.coupons || [];
  return coupons.length
    ? `<div class="coupon-strip">${coupons.map((c) => `<div class="coupon"><b>${c.discount_type === "shipping" ? "MIỄN PHÍ SHIP" : c.discount_type === "percentage" ? "GIẢM " + c.discount_value + "%" : "GIẢM " + money(Math.min(c.discount_value, c.maximum_discount ?? c.discount_value))}</b><span>${c.minimum_order ? "Đơn từ " + money(c.minimum_order) : "Theo điều kiện của mã"}</span><button data-copy="${escape(c.code)}">${escape(c.code)} ${icon("copy")}</button></div>`).join("")}</div>`
    : "";
}
function home() {
  document.title = "Jielien International — Sản phẩm & Tin tức";
  const sale = [...products]
    .sort((a, b) => 1 - b.price / b.oldPrice - (1 - a.price / a.oldPrice))
    .slice(0, 5);
  return `${identity ? `<div class="account-invitation"><span>Xin chào, <b>${escape(identity.fullName)}</b></span><a href="/tai-khoan">Đơn hàng & tài khoản →</a></div>` : `<div class="account-invitation"><span>Lưu địa chỉ, giỏ hàng và theo dõi đơn của mẹ</span><div><a href="/tai-khoan">Đăng nhập</a><a href="/tai-khoan?mode=register">Đăng ký tài khoản →</a></div></div>`}<section class="hero-layout" aria-label="Khám phá Jielien"><div id="hero-container">${heroMarkup()}</div><div class="hero-posters"><a class="hero-poster" href="${escape(href({ category: "Sữa cho bé" }))}" data-link><small>DINH DƯỠNG MỖI NGÀY</small><h2>Lựa chọn tốt.<br>Khởi đầu vui.</h2><span>Khám phá sản phẩm →</span><img src="/assets/milk-gold.svg" alt=""></a><a class="hero-poster" href="${escape(href({ category: "Chăm sóc bé" }))}" data-link><small>CHĂM CHÚT GIA ĐÌNH</small><h2>Điều nhỏ bé.<br>Yêu thương lớn.</h2><span>Xem bộ sản phẩm →</span><img src="/assets/baby-care.svg" alt=""></a></div></section>
    <div class="store-promise" aria-label="Mua sắm tại Jielien"><div>${icon("shield")}<p><b>Lựa chọn rõ ràng</b><small>Thông tin và quy cách sản phẩm</small></p></div><div>${icon("receipt")}<p><b>Theo dõi đơn hàng</b><small>Tra cứu trạng thái trực tuyến</small></p></div><div>${icon("heart")}<p><b>Mua sắm thuận tiện</b><small>Lưu sản phẩm bạn yêu thích</small></p></div><div>${icon("user")}<p><b>Tài khoản của bạn</b><small>Lưu địa chỉ và lịch sử mua hàng</small></p></div></div>
    <section class="panel"><div class="section-heading"><div><h2>Khám phá danh mục</h2><p>Tìm sản phẩm phù hợp cho bạn và gia đình.</p></div></div><div class="category-tiles">${categories.map(([name, img]) => `<a class="category-tile" href="${escape(href({ category: name }))}" data-link><span><img src="/assets/${img}.svg" alt=""></span>${escape(name)}</a>`).join("")}</div></section>
    <section class="flash-sale"><div class="section-heading"><div><h2>${icon("bolt")} Sản phẩm nổi bật</h2><div class="sale-note">Khám phá sản phẩm và giá bán hiện tại</div></div><a href="/san-pham?sort=discount" data-link>Xem tất cả →</a></div>${couponMarkup()}${productGrid(sale)}</section>
    ${section("Sữa & dinh dưỡng cho bé", "Chọn sản phẩm phù hợp với độ tuổi và nhu cầu của con.", products.filter((p) => p.category === "Sữa cho bé" || p.category === "Ăn dặm").slice(0, 5), href({ category: "Sữa cho bé" }))}
    <section class="panel"><div class="section-heading"><h2>Thương hiệu trong bộ sưu tập</h2></div><div class="brand-row">${[
      ...new Set(
        brandRows.length
          ? brandRows.map((b) => b.name)
          : products.map((p) => p.brand),
      ),
    ]
      .slice(0, 6)
      .map(
        (brand) =>
          `<a href="${escape(href({ brand }))}" data-link>${escape(brand)}</a>`,
      )
      .join("")}</div></section>
    ${section("Nâng niu bé yêu mỗi ngày", "Từ giấc ngủ êm đến giờ chơi thật vui.", products.filter((p) => ["Chăm sóc bé", "Đồ dùng cho bé", "Đồ chơi"].includes(p.category)).slice(0, 5))}
    <section class="panel"><div class="section-heading"><h2>Tin tức & Cẩm nang</h2><a href="/tin-tuc">Tất cả bài viết →</a></div><div class="news-grid">${newsItems.map((a) => `<article class="news-card"><a href="/tin-tuc/${escape(a.slug)}"><img src="${escape(a.coverUrl)}" alt="${escape(a.coverAlt)}"><h3>${escape(a.title)}</h3></a><p>${escape(a.excerpt)}</p></article>`).join("") || "<p>Chưa có bài viết được xuất bản.</p>"}</div></section>`;
}
function listing(categoryName) {
  const params = {
    ...catalogParams(),
    ...(categoryName ? { category: categoryName } : {}),
  };
  const tokens = normalize(params.q || "")
    .split(/\s+/)
    .filter(Boolean);
  let list = products.filter(
    (p) =>
      (!params.category || p.category === params.category) &&
      (!params.brand || p.brand === params.brand) &&
      (!params.age || p.age === params.age) &&
      (!params.min || p.price >= Number(params.min)) &&
      (!params.max || p.price <= Number(params.max)) &&
      tokens.every((token) =>
        normalize(p.name + " " + p.brand + " " + p.category).includes(token),
      ),
  );
  if (params.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (params.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (params.sort === "name")
    list.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  if (params.sort === "discount")
    list.sort((a, b) => 1 - b.price / b.oldPrice - (1 - a.price / a.oldPrice));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / 12));
  const page = Math.min(
    pages,
    Math.max(1, Number.parseInt(params.page, 10) || 1),
  );
  list = list.slice((page - 1) * 12, page * 12);
  const title = params.q
    ? `Kết quả cho “${params.q}”`
    : params.category || "Tất cả sản phẩm";
  document.title = title + " | Jielien";
  const options = (values, selected, all) =>
    `<option value="">${all}</option>${values.map((value) => `<option value="${escape(value)}" ${value === selected ? "selected" : ""}>${escape(value)}</option>`).join("")}`;
  return `${breadcrumbs([[title]])}<h1 class="page-title">${escape(title)}</h1><p class="page-subtitle">Tìm những điều phù hợp nhất cho mẹ và bé · ${total} sản phẩm</p>
  <div class="catalog-layout"><aside class="filter-panel ${filterOpen ? "open" : ""}" id="filter-panel" aria-label="Bộ lọc sản phẩm"><div class="filter-group"><h3>Danh mục</h3><select data-select-filter="category" aria-label="Lọc danh mục">${options(
    categories.map((c) => c[0]),
    params.category,
    "Tất cả danh mục",
  )}</select></div><div class="filter-group"><h3>Thương hiệu</h3><select data-select-filter="brand" aria-label="Lọc thương hiệu">${options([...new Set(products.map((p) => p.brand))], params.brand, "Tất cả thương hiệu")}</select></div><div class="filter-group"><h3>Độ tuổi</h3><select data-select-filter="age" aria-label="Lọc độ tuổi">${options([...new Set(products.map((p) => p.age))], params.age, "Tất cả độ tuổi")}</select></div><form id="price-filter" class="filter-group"><h3>Khoảng giá (đ)</h3><div class="filter-price"><input type="number" name="min" aria-label="Giá từ" min="0" max="100000000" placeholder="Từ" value="${escape(params.min || "")}"><input type="number" name="max" aria-label="Giá đến" min="0" max="100000000" placeholder="Đến" value="${escape(params.max || "")}"></div><button class="secondary">Áp dụng</button></form><div class="filter-group"><a href="/san-pham" data-link class="clear-filters">Xóa tất cả bộ lọc</a></div></aside>
  <section class="catalog-content"><div class="catalog-toolbar"><span><b>${total}</b> sản phẩm</span><button class="secondary filter-toggle" id="filter-toggle" aria-expanded="${filterOpen}">☷ Bộ lọc</button><label>Sắp xếp: <select id="sort" aria-label="Sắp xếp sản phẩm">${[
    ["", "Đề xuất cho mẹ"],
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
  ${total ? productGrid(list) : empty("Chưa tìm thấy sản phẩm", "Mẹ thử đổi từ khóa hoặc bỏ bớt bộ lọc nhé.", "/san-pham", "Xem tất cả sản phẩm")}
  ${pages > 1 ? `<nav class="pagination" aria-label="Trang sản phẩm">${Array.from({ length: pages }, (_, i) => `<a href="${escape(href({ ...params, page: i + 1 }))}" data-link class="${page === i + 1 ? "active" : ""}" ${page === i + 1 ? 'aria-current="page"' : ""}>${i + 1}</a>`).join("")}</nav>` : ""}</section></div>`;
}
function details(slug) {
  const p = products.find((p) => p.slug === slug);
  if (!p) return notFound();
  document.title = p.name + " | Jielien";
  const variants = products.filter(
    (item) => item.productId === p.productId && item.id !== p.id,
  );
  return `${breadcrumbs([[p.category, href({ category: p.category })], [p.name]])}<section class="panel detail-top"><div><div class="gallery-main">${p.oldPrice > p.price ? `<span class="product-discount">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}<img id="detail-image" src="${escape(p.image)}" alt="${escape(p.name)}" width="600" height="600" fetchpriority="high"></div><div class="gallery-thumbs">${(p.gallery?.length ? p.gallery : [{ url: p.image, alt: p.name }]).map((m, i) => `<button data-gallery="${escape(m.url)}" data-alt="${escape(m.alt || p.name)}" aria-label="Ảnh sản phẩm ${i + 1}"><img src="${escape(m.url)}" alt="" width="64" height="64"></button>`).join("")}</div></div><div class="detail-info"><div class="product-brand">${escape(p.brand)}</div><h1>${escape(p.name)}</h1><div class="detail-meta"><span class="in-stock">${stockText(p)}</span></div><div class="detail-pricing"><strong>${money(p.price)}</strong>${p.oldPrice > p.price ? `<del>${money(p.oldPrice)}</del>` : ""}<small>Giá cho quy cách đang chọn</small></div><div class="variant-label">Quy cách: <b>${escape(p.weight)}</b></div><div class="variants" role="radiogroup" aria-label="Chọn quy cách">${[p, ...variants].map((v) => `<button type="button" role="radio" aria-checked="${v.id === p.id}" tabindex="${v.id === p.id ? 0 : -1}" class="${v.id === p.id ? "active" : ""}" data-variant="${v.id}">${escape(v.weight || v.name)}${v.stock ? "" : " · Hết hàng"}</button>`).join("")}</div><label class="variant-label" for="detail-quantity">Số lượng</label>${quantityControl(p.id, 1, true)}<div class="buy-row"><button class="secondary" data-detail-add="${p.id}" ${!p.stock ? "disabled" : ""}>${icon("cart")} Thêm vào giỏ</button><button class="primary" data-buy="${p.id}" ${!p.stock ? "disabled" : ""}>${p.stock ? "Mua ngay" : "Tạm hết hàng"} ${icon("arrow")}</button></div><div class="purchase-promises">${siteData.freeShippingThreshold ? `<p>${icon("truck")} Miễn phí giao hàng từ ${money(siteData.freeShippingThreshold)}</p>` : ""}<p>${icon("tag")} Nhập mã ưu đãi ở giỏ hàng</p><a href="/chinh-sach/doi-tra">${icon("return")} Xem chính sách đổi trả</a></div><ul class="features">${p.features.map((f) => `<li>${escape(f)}</li>`).join("")}</ul></div></section>
  <section class="panel"><div class="tabs" role="tablist" aria-label="Thông tin sản phẩm"><button class="active" role="tab" id="tab-description" aria-selected="true" aria-controls="detail-tab-content" data-tab="description">Mô tả sản phẩm</button><button role="tab" id="tab-specs" aria-selected="false" aria-controls="detail-tab-content" data-tab="specs">Thông số</button><button role="tab" id="tab-notes" aria-selected="false" aria-controls="detail-tab-content" data-tab="notes">Lưu ý sử dụng</button></div><div class="tab-content" id="detail-tab-content" role="tabpanel" aria-labelledby="tab-description" data-product="${p.id}">${detailTab(p, "description")}</div></section>
  ${section(
    "Mẹ có thể quan tâm",
    "Khám phá thêm những lựa chọn cho bé.",
    products
      .filter((v) => v.id !== p.id && v.category === p.category)
      .concat(
        products.filter((v) => v.id !== p.id && v.category !== p.category),
      )
      .slice(0, 5),
    href({ category: p.category }),
  )}`;
}
function detailTab(p, tab) {
  if (tab === "specs")
    return `<table class="spec-table"><tbody>${[
      ["Thương hiệu", p.brand],
      ["Danh mục", p.category],
      ["Độ tuổi tham khảo", p.age],
      ["Quy cách", p.weight],
      ["Mã sản phẩm", "JL" + String(p.id).padStart(4, "0")],
      ...(siteData.demoMode ? [["Dữ liệu", "Danh mục mẫu để kiểm thử"]] : []),
    ]
      .map(
        ([key, value]) =>
          `<tr><td>${escape(key)}</td><td>${escape(value)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  if (tab === "notes")
    return "<h3>Mẹ đọc kỹ trước khi sử dụng</h3><p>Thông tin sản phẩm không thay thế tư vấn y tế. Khi sử dụng, bạn cần kiểm tra nguồn gốc, hạn sử dụng, độ tuổi và hướng dẫn từ nhà sản xuất. Bảo quản theo điều kiện ghi trên bao bì và hỏi chuyên gia y tế khi cần.</p>";
  return `<h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${p.descriptionHtml || ""}<ul>${p.features.map((feature) => `<li>${escape(feature)}</li>`).join("")}</ul>${siteData.demoMode ? '<p class="notice">Danh mục mẫu dùng để kiểm thử, chưa có đánh giá người mua.</p>' : ""}`;
}
function quantityControl(id, quantity, detail = false) {
  const p = products.find((p) => p.id === id);
  return `<div class="quantity-control"><button type="button" data-quantity="-1" data-id="${id}" ${detail ? "data-detail" : ""} aria-label="Giảm số lượng">${icon("minus")}</button><input type="number" required step="1" min="1" max="${Math.min(99, p?.stock || 1)}" value="${quantity}" aria-label="Số lượng ${escape(p?.name)}" ${detail ? 'id="detail-quantity"' : `data-cart-quantity="${id}"`}><button type="button" data-quantity="1" data-id="${id}" ${detail ? "data-detail" : ""} aria-label="Tăng số lượng">${icon("plus")}</button></div>`;
}
function cartItems() {
  return Object.entries(cart).map(([id, quantity]) => ({
    id: Number(id),
    quantity,
  }));
}
function updateCartCount() {
  $("#cart-count").textContent = Object.values(cart).reduce(
    (sum, q) => sum + q,
    0,
  );
}
function persistCart() {
  storage.set("jielien-cart-v2", cart);
  updateCartCount();
  if (identity) {
    const items = cartItems();
    cartSync = cartSync
      .then(() =>
        api("/api/cart", { method: "PUT", body: JSON.stringify({ items }) }),
      )
      .catch((error) => toast("Chưa đồng bộ giỏ tài khoản: " + error.message));
  }
}
function addToCart(id, quantity = 1) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    toast("Vui lòng nhập số lượng nguyên từ 1 trở lên.");
    return false;
  }
  const p = products.find((p) => p.id === id);
  if (!p || !p.stock) {
    toast("Sản phẩm hiện đã hết hàng.");
    return false;
  }
  const max = Math.min(99, p.stock);
  if ((cart[id] || 0) + quantity > max) {
    toast(`Chỉ còn ${max} sản phẩm có thể thêm vào giỏ.`);
    return false;
  }
  cart[id] = (cart[id] || 0) + quantity;
  persistCart();
  toast("Đã thêm vào giỏ hàng");
  return true;
}
async function fetchQuote() {
  if (!cartItems().length) {
    quote = null;
    return null;
  }
  quote = await api("/api/quote", {
    method: "POST",
    body: JSON.stringify({ items: cartItems(), coupon }),
  });
  return quote;
}
function summaryMarkup(q, checkout = false) {
  return `<aside class="panel summary"><h2>${checkout ? "Đơn hàng của mẹ" : "Thông tin thanh toán"}</h2>
  ${checkout ? `<div class="checkout-items">${q.items.map((item) => `<div class="checkout-mini"><img src="${escape(item.image)}" alt=""><div>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></div></div>`).join("")}</div>` : ""}
  ${shippingMarkup(q)}
  <form id="coupon-form" class="coupon-form"><input name="coupon" id="coupon" maxlength="30" placeholder="Nhập mã ưu đãi" aria-label="Mã ưu đãi" value="${escape(coupon)}"><button class="secondary">Áp dụng</button></form>
  ${coupon ? `<button class="filter-chip" id="remove-coupon">${escape(coupon)} ×</button>` : `<div class="coupon-suggestions">${(siteData.coupons || []).map((c) => `<button type="button" data-coupon="${escape(c.code)}">${escape(c.code)}</button>`).join("")}</div>`}
  <div id="coupon-error" class="form-error" role="alert"></div>
  <div class="summary-line"><span>Tạm tính (${q.items.reduce((s, p) => s + p.quantity, 0)} sản phẩm)</span><b>${money(q.subtotal)}</b></div>
  <div class="summary-line discount"><span>Giảm giá</span><b>−${money(q.discount)}</b></div><div class="summary-line"><span>Phí giao hàng</span><b>${q.shipping ? money(q.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng cộng</span><strong id="grand-total">${money(q.total)}</strong></div>
  ${checkout ? '<button class="primary" type="submit" form="checkout-form" id="place-order">Đặt hàng COD →</button>' : '<a href="/thanh-toan" data-link class="primary">Tiến hành đặt hàng →</a>'}
  <p class="summary-note">${checkout ? "Thanh toán theo phương thức đã chọn. Kiểm tra thông tin trước khi xác nhận." : "Kiểm tra sản phẩm và phí giao hàng trước khi đặt."}</p></aside>`;
}
async function cartPage(version) {
  document.title = "Giỏ hàng | Jielien";
  if (!cartItems().length)
    return `${breadcrumbs([["Giỏ hàng"]])}<section class="panel">${empty("Giỏ hàng của mẹ còn trống", "Chọn một chút yêu thương dành cho bé nhé.")}</section>`;
  let q;
  try {
    q = await fetchQuote();
  } catch (error) {
    if (coupon) {
      coupon = "";
      try {
        q = await fetchQuote();
        toast("Mã ưu đãi đã được bỏ vì không còn đủ điều kiện.");
      } catch {
        return cartError(error);
      }
    } else return cartError(error);
  }
  if (version !== renderVersion) return "";
  return `${breadcrumbs([["Giỏ hàng"]])}<h1 class="page-title">Giỏ hàng của mẹ</h1><p class="page-subtitle">${q.items.length} sản phẩm đã chọn · Kiểm tra lại trước khi đặt hàng</p><div class="cart-layout"><section class="panel"><div>${q.items
    .map((item) => {
      const p = products.find((p) => p.id === item.id);
      return `<article class="cart-item"><img src="${escape(item.image)}" alt="${escape(item.name)}"><div><h3><a href="${productLink(p)}" data-link>${escape(item.name)}</a></h3><small>${escape(p.brand)} · ${escape(p.weight)}</small>${quantityControl(item.id, item.quantity)}<button class="remove-item" data-remove="${item.id}">Xóa sản phẩm</button></div><div><div class="product-price">${money(item.lineTotal)}</div><div class="old-price">${money(p.oldPrice * item.quantity)}</div></div></article>`;
    })
    .join(
      "",
    )}</div><a href="/san-pham" data-link class="back-link">← Tiếp tục mua sắm</a></section>${summaryMarkup(q)}</div>`;
}
function cartError(error) {
  return `${breadcrumbs([["Giỏ hàng"]])}<section class="panel"><div class="form-error" role="alert">${escape(error.message)}</div><p>Mẹ có thể bỏ sản phẩm không còn đủ hàng hoặc làm mới thông tin.</p>${Object.keys(
    cart,
  )
    .map((id) => {
      const p = products.find((p) => p.id === Number(id));
      return `<p>${escape(p?.name || id)} <button class="danger-button" data-remove="${id}">Xóa khỏi giỏ</button></p>`;
    })
    .join(
      "",
    )}<button class="secondary" id="refresh-cart">Làm mới giỏ hàng</button></section>`;
}
async function checkoutPage(version) {
  document.title = "Đặt hàng | Jielien";
  if (!cartItems().length)
    return `${breadcrumbs([["Đặt hàng"]])}<section class="panel">${empty("Chưa có sản phẩm để đặt hàng", "Mẹ thêm sản phẩm vào giỏ trước khi tiếp tục nhé.")}</section>`;
  let q;
  try {
    q = await fetchQuote();
  } catch (error) {
    return cartError(error);
  }
  if (version !== renderVersion) return "";
  if (!checkoutKey) checkoutKey = crypto.randomUUID();
  return `${breadcrumbs([["Giỏ hàng", "/gio-hang"], ["Đặt hàng"]])}<div class="checkout-steps"><span>1. Giỏ hàng</span><span>→</span><span class="active">2. Thông tin giao hàng</span><span>→</span><span>3. Hoàn tất</span></div><div class="checkout-account">${identity ? `Đang đặt hàng với tài khoản <b>${escape(identity.fullName)}</b>. Đơn sẽ được lưu vào lịch sử mua hàng.` : `Mẹ có thể đặt hàng không cần tài khoản hoặc <a href="/tai-khoan?redirect=/thanh-toan">đăng nhập</a> / <a href="/tai-khoan?mode=register&redirect=/thanh-toan">đăng ký</a> để lưu địa chỉ và đơn hàng.`}</div><div class="checkout-layout"><div><form id="checkout-form"><section class="panel form-section"><h2>Thông tin người nhận</h2><div class="fields"><div class="field"><label for="name">Họ và tên <span>*</span></label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Họ tên người nhận"></div><div class="field"><label for="phone">Số điện thoại <span>*</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" placeholder="09xxxxxxxx"></div><div class="field full"><label for="email">Email (không bắt buộc)</label><input id="email" name="email" type="email" autocomplete="email" maxlength="150" placeholder="Email để ghi nhận trong đơn"></div></div></section><section class="panel form-section"><h2>Địa chỉ giao hàng</h2><div class="fields"><div class="field"><label for="province">Tỉnh / Thành phố <span>*</span></label><input id="province" name="province" autocomplete="address-level1" required minlength="2" maxlength="100" placeholder="Ví dụ: TP. Hồ Chí Minh"></div><div class="field"><label for="district">Khu vực giao hàng <span>*</span></label><input id="district" name="district" autocomplete="address-level2" required minlength="2" maxlength="100" placeholder="Khu vực giao hàng"></div><div class="field full"><label for="address">Địa chỉ chi tiết <span>*</span></label><input id="address" name="address" autocomplete="street-address" required minlength="8" maxlength="250" placeholder="Số nhà, tên đường, phường / xã"></div><div class="field full"><label for="note">Ghi chú cho đơn hàng</label><textarea id="note" name="note" maxlength="500" placeholder="Thông tin cần lưu ý khi giao hàng (nếu có)"></textarea></div></div></section><section class="panel form-section"><h2>Phương thức thanh toán</h2>${paymentOptions()}<label class="agreement"><input name="agreement" type="checkbox" required><span>Tôi đã kiểm tra thông tin và đồng ý với <a href="/chinh-sach/giao-hang" target="_blank" rel="noopener">điều kiện mua hàng</a> và <a href="/chinh-sach/bao-mat" target="_blank" rel="noopener">chính sách thông tin cá nhân</a>.${siteData.demoMode ? " Đây là đơn thử nghiệm, chưa giao thực tế." : ""}</span></label><div id="checkout-error" class="form-error" role="alert"></div></section></form></div>${summaryMarkup(q, true)}</div>`;
}
async function orderPage(id) {
  let order = lastOrder?.id === id ? lastOrder : null;
  if (!order) {
    let token;
    try {
      token = sessionStorage.getItem("jielien-order-" + id);
    } catch {}
    if (token) {
      try {
        ({ order } = await api(
          `/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
        ));
      } catch {}
    }
  }
  if (!order && identity) {
    try {
      ({ order } = await api("/api/orders/" + encodeURIComponent(id)));
    } catch {}
  }
  if (!order)
    return `${breadcrumbs([["Đơn hàng"]])}<section class="panel">${empty("Tra cứu thông tin đơn hàng", "Mẹ dùng mã đơn và số điện thoại đã đặt để xem thông tin.", "/tra-cuu-don-hang", "Tra cứu đơn hàng")}</section>`;
  document.title = `Đơn ${order.id} | Jielien`;
  return `${breadcrumbs([["Đơn hàng " + order.id]])}<div class="success-head"><span class="success-mark">✓</span><h1>Đã ghi nhận đơn hàng của mẹ!</h1><p>Cảm ơn mẹ đã ghé Jielien. Đơn được lưu tại máy chủ thử nghiệm.</p></div>${orderMarkup(order)}<div class="button-row"><a href="/san-pham" data-link class="primary">Tiếp tục mua sắm →</a><a href="/tra-cuu-don-hang" data-link class="secondary">Tra cứu đơn hàng</a></div>`;
}
function transferMarkup(order) {
  if (order.payment !== "bank_transfer") return "";
  if (order.paymentStatus === "paid")
    return `<div class="transfer-paid" role="status">✓ Đã nhận tiền chuyển khoản. Cảm ơn mẹ!</div>`;
  if (order.status === "cancelled")
    return `<p class="notice">Đơn đã hủy. Mẹ không chuyển khoản cho đơn này.</p>`;
  const t = order.transfer;
  if (!t)
    return `<p class="notice">Chưa tải được thông tin nhận tiền. Mẹ thử cập nhật trạng thái đơn.</p>`;
  return `<section class="transfer-panel" aria-label="Hướng dẫn chuyển khoản"><div class="transfer-qr">${t.qrDataUrl ? `<img id="transfer-qr" src="${escape(t.qrDataUrl)}" alt="VietQR chuyển khoản cho đơn ${escape(order.id)}" width="280" height="280">` : ""}<p>Quét bằng ứng dụng ngân hàng</p></div><div><h2>Chuyển khoản thanh toán đơn hàng</h2><dl class="transfer-details"><dt>Ngân hàng</dt><dd>${escape(t.bankName)}</dd><dt>Số tài khoản</dt><dd><b>${escape(t.accountNumber)}</b> <button class="copy-transfer" data-copy-transfer="${escape(t.accountNumber)}" aria-label="Sao chép số tài khoản">Sao chép</button></dd><dt>Chủ tài khoản</dt><dd>${escape(t.accountName)}</dd><dt>Số tiền</dt><dd><b>${money(t.amount)}</b> <button class="copy-transfer" data-copy-transfer="${t.amount}" aria-label="Sao chép số tiền">Sao chép</button></dd><dt>Nội dung chuyển khoản</dt><dd><b>${escape(t.reference)}</b> <button class="copy-transfer" data-copy-transfer="${escape(t.reference)}" aria-label="Sao chép nội dung chuyển khoản">Sao chép</button></dd></dl><p>Giữ nguyên số tiền và nội dung để cửa hàng đối soát đúng đơn. Kiểm tra tên người nhận trong ứng dụng ngân hàng trước khi xác nhận.</p><p class="notice">Đang chờ đối soát. Quét mã không tự xác nhận đã trả tiền; cửa hàng sẽ cập nhật sau khi nhận tiền. Nếu đã chuyển, mẹ không thanh toán lại.</p><button class="secondary" data-refresh-payment="${escape(order.id)}">Cập nhật trạng thái thanh toán</button></div></section>`;
}
function orderMarkup(order) {
  return `<section class="panel order-card"><div class="order-number"><strong>Mã đơn: ${escape(order.id)}</strong><span class="status">${escape({ pending: "Chờ xác nhận", confirmed: "Đã xác nhận", processing: "Đang chuẩn bị", shipped: "Đang giao", delivered: "Đã giao", cancelled: "Đã hủy" }[order.status] || order.status)} · ${escape(paymentLabel(order.payment))}</span></div>${transferMarkup(order)}<div class="order-details"><div><h3>Người nhận</h3><p><b>${escape(order.customer.name)}</b></p><p>${escape(order.customer.phone)}</p><p>${escape(order.customer.address)}</p><p>${escape(order.customer.district)}, ${escape(order.customer.province)}</p></div><div><h3>Thông tin đơn</h3><p>Ngày đặt: ${new Date(order.createdAt).toLocaleString("vi-VN")}</p><p>Phương thức: ${escape(paymentLabel(order.payment))}</p><p>Thanh toán: ${order.paymentStatus === "paid" ? "Đã ghi nhận thu tiền" : "Chưa ghi nhận thu tiền"}</p>${order.note ? `<p>Ghi chú: ${escape(order.note)}</p>` : ""}</div></div>${order.items.map((item) => `<div class="checkout-mini"><img src="${escape(item.image)}" alt=""><div>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></div><strong>${money(item.lineTotal)}</strong></div>`).join("")}<div class="summary-line"><span>Tạm tính</span><b>${money(order.subtotal)}</b></div><div class="summary-line discount"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="summary-line"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng thanh toán</span><strong>${money(order.total)}</strong></div><p class="notice">Mẹ lưu mã đơn để tra cứu cùng số điện thoại. Vận chuyển được cửa hàng xử lý thủ công.</p></section>`;
}
function lookupPage() {
  document.title = "Tra cứu đơn hàng | Jielien";
  return `${breadcrumbs([["Tra cứu đơn hàng"]])}<section class="panel lookup-panel"><h1>Đơn hàng của mẹ</h1><p class="page-subtitle">Nhập mã đơn và số điện thoại đã dùng khi đặt hàng.</p><form id="lookup-form"><div class="field"><label for="order-id">Mã đơn hàng</label><input id="order-id" name="id" required maxlength="60" placeholder="JL-…" autocomplete="off"></div><div class="field"><label for="lookup-phone">Số điện thoại nhận hàng</label><input id="lookup-phone" type="tel" inputmode="tel" name="phone" required autocomplete="tel" placeholder="09xxxxxxxx"></div><div id="lookup-error" class="form-error" role="alert"></div><button class="primary">Tra cứu đơn hàng →</button></form></section><div id="lookup-result" aria-live="polite"></div>`;
}
const policies = {
  "gioi-thieu": [
    "Về Jielien",
    "<p>Khám phá các sản phẩm dành cho mẹ, bé và gia đình tại Jielien.</p>",
  ],
  "giao-hang": [
    "Giao hàng & thanh toán",
    "<p>Phí giao hàng và các phương thức khả dụng được hiển thị trước khi bạn xác nhận đặt hàng. Vui lòng liên hệ cửa hàng để xác nhận thời gian giao.</p>",
  ],
  "doi-tra": [
    "Chính sách đổi trả",
    "<p>Cửa hàng đang cập nhật điều kiện đổi trả. Vui lòng liên hệ để được tư vấn trước khi đặt hàng.</p>",
  ],
  "bao-mat": [
    "Thông tin cá nhân",
    "<p>Vui lòng liên hệ cửa hàng nếu cần hỗ trợ về thông tin đã cung cấp. Nội dung chính sách bảo mật đang được cập nhật.</p>",
  ],
};
const articles = {
  "ngu-ngon": [
    "Tạo thói quen ngủ nhẹ nhàng cho bé",
    "<p>Một không gian yên tĩnh, ánh sáng dịu và thói quen đều đặn giúp bé làm quen với giờ nghỉ. Mỗi em bé có nhu cầu khác nhau, nên mẹ đừng quá áp lực về một lịch trình cố định.</p><h2>Quan sát tín hiệu của con</h2><p>Chú ý khi bé ngáp, dụi mắt hoặc trở nên khó chịu. Những hoạt động nhẹ nhàng trước giờ ngủ giúp mẹ và bé có thời gian thư giãn cùng nhau.</p><h2>An toàn luôn là điều đầu tiên</h2><p>Tuân thủ hướng dẫn ngủ an toàn phù hợp độ tuổi từ nhân viên y tế. Khi bé có vấn đề kéo dài về giấc ngủ, hãy trao đổi với bác sĩ. Bài viết là nội dung tham khảo, không phải tư vấn y tế cá nhân.</p>",
  ],
  "an-dam": [
    "Cùng mẹ chuẩn bị hành trình ăn dặm",
    "<p>Bữa ăn đầu đời là dịp để bé khám phá hương vị và kết cấu mới. Mẹ có thể bắt đầu bằng việc tìm hiểu dấu hiệu sẵn sàng và hỏi nhân viên y tế về thời điểm phù hợp cho con.</p><h2>Chuẩn bị nhẹ nhàng</h2><p>Chọn dụng cụ sạch, phù hợp độ tuổi, sắp xếp một góc ăn thoải mái và luôn quan sát bé trong suốt bữa ăn. Không ép bé ăn khi con mệt hoặc chưa sẵn sàng.</p><h2>Đi từng bước theo nhịp của bé</h2><p>Thực phẩm, độ đặc và lượng ăn cần phù hợp với từng trẻ. Kiểm tra nhãn thực phẩm, lưu ý dị ứng và nhận hướng dẫn từ chuyên gia nếu mẹ có thắc mắc.</p>",
  ],
  "cham-soc-me": [
    "Dành một khoảng nhỏ cho chính mẹ",
    "<p>Chăm sóc một em bé là hành trình nhiều niềm vui và cũng rất cần sức lực. Mẹ xứng đáng được nghỉ ngơi và nhận sự hỗ trợ.</p><h2>Một khoảng nghỉ nhỏ</h2><p>Một tách đồ uống ấm, vài trang sách hoặc cuộc trò chuyện với người thân có thể giúp mẹ thư giãn. Hãy chia sẻ việc chăm con với người tin cậy khi có thể.</p><h2>Lắng nghe chính mình</h2><p>Nếu mẹ thấy lo âu hoặc kiệt sức kéo dài, hãy nói với người thân và tìm hỗ trợ từ chuyên gia y tế. Mẹ không cần tự mình làm tất cả.</p>",
  ],
};
function contentPage(slug, article = false) {
  let data = (article ? articles : policies)[slug];
  if (!article && data) {
    const key = {
      "gioi-thieu": "policy_about",
      "giao-hang": "policy_shipping",
      "doi-tra": "policy_returns",
      "bao-mat": "policy_privacy",
    }[slug];
    const saved = (siteData.settings || []).find(
      (s) => s.key === key,
    )?.value_json;
    if (saved)
      data = [
        data[0],
        String(saved)
          .split(/\n\s*\n/)
          .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
          .join(""),
      ];
  }
  if (!data) return notFound();
  document.title = data[0] + " | Jielien";
  return `${breadcrumbs([[article ? "Góc của mẹ" : "Thông tin cửa hàng"], [data[0]]])}<article class="panel content-page"><div class="eyebrow">${article ? "GÓC NHỎ CỦA MẸ" : "THÔNG TIN MINH BẠCH"}</div><h1>${data[0]}</h1>${data[1]}<a class="back-link" href="/" data-link>← Về trang chủ</a></article>`;
}
function wishlistPage() {
  const list = products.filter((p) => favorites.includes(p.id));
  document.title = "Sản phẩm yêu thích | Jielien";
  return `${breadcrumbs([["Sản phẩm yêu thích"]])}<section class="panel"><div class="section-heading"><div><h1 class="page-title">Một chút yêu thích của mẹ ♡</h1><p>${list.length} sản phẩm được lưu trên trình duyệt này</p></div></div>${list.length ? productGrid(list) : empty("Danh sách yêu thích còn trống", "Chạm vào trái tim trên sản phẩm để lưu lại cho lần mua sau.")}</section>`;
}
function notFound() {
  document.title = "Không tìm thấy trang | Jielien";
  return `<section class="panel" style="margin-top:25px">${empty("Chưa tìm thấy trang này", "Mẹ quay về trang chủ để tiếp tục khám phá nhé.", "/", "Về trang chủ")}</section>`;
}
async function render({ scroll = true } = {}) {
  const version = ++renderVersion;
  closeMenu();
  closeMiniCart();
  $("#catalog-filter-dialog")?.close();
  $("#suggestions").hidden = true;
  const path = decodeURIComponent(location.pathname);
  const main = $("#main");
  main.setAttribute("aria-busy", "true");
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  try {
    let html;
    if (path === "/") html = home();
    else if (path === "/san-pham" || path === "/danh-muc") html = listing();
    else if (path.startsWith("/danh-muc/")) {
      const data = await api("/api/categories");
      const c = data.categories.find((c) => c.slug === path.split("/")[2]);
      if (c) {
        html = listing(c.name);
      } else html = notFound();
    } else if (path.startsWith("/san-pham/"))
      html = details(path.slice("/san-pham/".length));
    else if (path === "/gio-hang") html = await cartPage(version);
    else if (path === "/thanh-toan") html = await checkoutPage(version);
    else if (path.startsWith("/don-hang/"))
      html = await orderPage(path.slice("/don-hang/".length));
    else if (path === "/tra-cuu-don-hang") html = lookupPage();
    else if (path === "/yeu-thich") html = wishlistPage();
    else if (path.startsWith("/chinh-sach/"))
      html = contentPage(path.split("/")[2]);
    else if (path.startsWith("/bai-viet/"))
      html = contentPage(path.split("/")[2], true);
    else html = notFound();
    if (version !== renderVersion) return;
    main.innerHTML = html;
    if (scroll) main.focus({ preventScroll: true });
    $("#search").value = new URLSearchParams(location.search).get("q") || "";
    $$(".mobile-bottom a").forEach((a) =>
      a.classList.toggle(
        "active",
        new URL(a.href).pathname === location.pathname,
      ),
    );
    bindPage();
    enhancePage();
  } catch (error) {
    if (version === renderVersion)
      main.innerHTML = `<div class="server-error"><h2>Chưa tải được nội dung</h2><p>${escape(error.message)}</p><button class="primary" id="retry-render">Thử lại</button></div>`;
  } finally {
    if (version === renderVersion) main.removeAttribute("aria-busy");
  }
}
function navigate(url, options = {}) {
  if (submitting) {
    toast("Đang ghi nhận đơn. Mẹ chờ kết quả trước khi rời trang nhé.");
    return;
  }
  if (pendingOrder) {
    toast("Cần xác nhận lần gửi đơn trước. Mẹ bấm Kiểm tra đơn vừa gửi.");
    return;
  }
  const parsed = new URL(url, location.origin);
  history.pushState({}, "", parsed.pathname + parsed.search);
  render(options);
}
function closeMenu() {
  $("#category-dropdown").hidden = true;
  $("#menu-backdrop").hidden = true;
  $("#category-menu").setAttribute("aria-expanded", "false");
  $("#mobile-menu").setAttribute("aria-expanded", "false");
}
function toggleMenu() {
  const hidden = !$("#category-dropdown").hidden;
  const bottom = $(".site-header").getBoundingClientRect().bottom;
  $("#category-dropdown").style.top = bottom + "px";
  $("#menu-backdrop").style.top = bottom + "px";
  $("#category-dropdown").hidden = hidden;
  $("#menu-backdrop").hidden = hidden;
  $("#category-menu").setAttribute("aria-expanded", String(!hidden));
  $("#mobile-menu").setAttribute("aria-expanded", String(!hidden));
  if (!hidden) $("#category-dropdown a")?.focus();
}
function checkoutDraft() {
  const form = $("#checkout-form");
  return form ? Object.fromEntries(new FormData(form)) : null;
}
function restoreDraft(data) {
  if (!data) return;
  const form = $("#checkout-form");
  if (!form) return;
  for (const [key, value] of Object.entries(data)) {
    const input = form.elements.namedItem(key);
    if (input?.type === "checkbox") input.checked = true;
    else if (input) input.value = value;
  }
  if ($("#place-order")) $("#place-order").textContent = orderButtonLabel();
}
function bindPage() {
  if ($("#checkout-form") && identity) prefillCheckout();
  $$("[data-tab]").forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
  });
  $("#sort")?.addEventListener("change", (event) =>
    changeFilters({ sort: event.target.value }),
  );
  $$("[data-select-filter]").forEach((select) =>
    select.addEventListener("change", () => {
      if (!select.closest("#catalog-filter-dialog"))
        changeFilters({ [select.dataset.selectFilter]: select.value });
    }),
  );
  $("#price-filter")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    if (
      data.get("min") &&
      data.get("max") &&
      Number(data.get("min")) > Number(data.get("max"))
    ) {
      toast("Giá từ cần nhỏ hơn hoặc bằng giá đến.");
      return;
    }
    if (event.target.closest("#catalog-filter-dialog")) applyCatalogFilters();
    else changeFilters({ min: data.get("min"), max: data.get("max") });
  });
  $("#filter-toggle")?.addEventListener("click", () => {
    if (innerWidth <= 850) {
      openCatalogFilters();
      return;
    }
    filterOpen = !filterOpen;
    $("#filter-panel").classList.toggle("open", filterOpen);
    $("#filter-toggle").setAttribute("aria-expanded", String(filterOpen));
    if (filterOpen)
      $("#filter-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#coupon-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("button", event.target);
    button.disabled = true;
    const next = $("#coupon").value.trim().toUpperCase();
    const old = coupon;
    const draft = checkoutDraft();
    try {
      coupon = next;
      await fetchQuote();
      await render({ scroll: false });
      restoreDraft(draft);
      toast(next ? "Đã áp dụng mã " + next : "Đã bỏ mã ưu đãi");
    } catch (error) {
      coupon = old;
      $("#coupon-error").textContent = error.message;
      button.disabled = false;
    }
  });
  $("#checkout-form")?.addEventListener("submit", submitOrder);
  $("#lookup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("button", event.target);
    button.disabled = true;
    $("#lookup-error").textContent = "";
    $("#lookup-result").innerHTML = "";
    try {
      const data = Object.fromEntries(new FormData(event.target));
      const { order } = await api("/api/orders/lookup", {
        method: "POST",
        body: JSON.stringify(data),
      });
      $("#lookup-result").innerHTML = orderMarkup(order);
      $("#lookup-result").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      $("#lookup-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
async function prefillCheckout() {
  const form = $("#checkout-form");
  if (!form || pendingOrder) return;
  const set = (name, value, overwrite = false) => {
    const input = form.elements.namedItem(name);
    if (input && (overwrite || !input.value)) input.value = value || "";
  };
  set("name", identity.fullName);
  set("phone", identity.phone);
  set("email", identity.email);
  try {
    const { addresses } = await api("/api/account/addresses");
    if (!form.isConnected || pendingOrder || !addresses.length) return;
    const choose = (address, overwrite) => {
      if (!address) return;
      set("name", address.recipientName, overwrite);
      set("phone", address.phone, overwrite);
      set("address", address.addressDetail, overwrite);
      set("province", address.province, overwrite);
      set("district", address.district, overwrite);
    };
    choose(addresses.find((a) => a.isDefault) || addresses[0], false);
    const box = document.createElement("div");
    box.className = "field full";
    box.style.marginBottom = "18px";
    box.innerHTML = `<label for="saved-address">Chọn địa chỉ đã lưu</label><select id="saved-address"><option value="">Nhập địa chỉ khác</option>${addresses.map((a) => `<option value="${a.id}">${escape(a.recipientName + " — " + a.addressDetail + ", " + (a.province || ""))}</option>`).join("")}</select>`;
    form.querySelector(".form-section").append(box);
    $("#saved-address").value = String(
      (addresses.find((a) => a.isDefault) || addresses[0]).id,
    );
    $("#saved-address").addEventListener("change", (event) =>
      choose(
        addresses.find((a) => a.id === Number(event.target.value)),
        true,
      ),
    );
  } catch {
    /* Manual address entry remains available when the saved list cannot load. */
  }
}
async function submitOrder(event) {
  event.preventDefault();
  if (submitting) return;
  const form = event.target;
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const payload = pendingOrder?.payload || {
    items: cartItems(),
    coupon,
    customer: {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      address: data.address.trim(),
      province: data.province.trim(),
      district: data.district.trim(),
    },
    payment: data.payment,
    note: data.note.trim(),
    idempotencyKey: checkoutKey,
  };
  submitting = true;
  $("#place-order").disabled = true;
  $("#place-order").textContent = "Đang ghi nhận đơn…";
  $("#checkout-error").textContent = "";
  try {
    await cartSync;
    const { order } = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    lastOrder = order;
    try {
      sessionStorage.setItem("jielien-order-" + order.id, order.token);
    } catch {}
    cart = {};
    coupon = "";
    quote = null;
    checkoutKey = null;
    pendingOrder = null;
    persistCart();
    try {
      ({ products } = await api("/api/products"));
      try {
        newsItems = (await api("/api/news")).items.slice(0, 3);
        siteData = await api("/api/site");
        const contact = $("#company-contact");
        if (contact)
          contact.textContent = (siteData.settings || [])
            .map((s) => s.value_json)
            .filter(Boolean)
            .join(" · ");
      } catch {
        /* Catalog and checkout remain available when optional content cannot load. */
      }
    } catch {}
    submitting = false;
    navigate("/don-hang/" + encodeURIComponent(order.id));
  } catch (error) {
    const uncertain =
      !error.status ||
      (error.status >= 500 && error.code !== "payment_unavailable");
    pendingOrder = uncertain ? { payload } : null;
    if (!uncertain) checkoutKey = crypto.randomUUID();
    $("#checkout-error").textContent =
      error.message +
      (uncertain
        ? " Chưa xác nhận được lần gửi này. Bấm Kiểm tra đơn vừa gửi để nhận kết quả bằng cùng mã yêu cầu; thông tin được giữ nguyên để tránh tạo đơn trùng."
        : "");
    $("#place-order").disabled = false;
    $("#place-order").textContent = uncertain
      ? "Kiểm tra đơn vừa gửi →"
      : orderButtonLabel(payload.payment);
    $$("#checkout-form input[type=radio]").forEach((input) => {
      input.disabled =
        uncertain || !paymentMethods.find((m) => m.id === input.value)?.enabled;
    });
    $$(
      '#checkout-form input:not([type="radio"]):not([type="checkbox"]), #checkout-form textarea',
    ).forEach((input) => {
      input.readOnly = uncertain;
    });
    $$("#coupon-form input, #coupon-form button, #remove-coupon").forEach(
      (input) => {
        input.disabled = uncertain;
      },
    );
    $("#checkout-error").scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } finally {
    submitting = false;
  }
}
document.addEventListener(
  "click",
  (event) => {
    if ((submitting || pendingOrder) && !event.target.closest("#place-order")) {
      const action = event.target.closest(
        "a[href],button[data-add],button[data-buy],button[data-detail-add],button[data-remove],button[data-quantity],#mobile-menu,#category-menu",
      );
      if (action) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast(
          submitting
            ? "Đang ghi nhận đơn. Mẹ chờ kết quả nhé."
            : "Bấm Kiểm tra đơn vừa gửi để xác nhận kết quả trước khi tiếp tục.",
        );
      }
    }
  },
  true,
);
document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-link]");
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  ) {
    event.preventDefault();
    if (link.classList.contains("cart-link") && innerWidth > 700) {
      openMiniCart();
      return;
    }
    navigate(link.href);
    return;
  }
  const gallery = event.target.closest("[data-gallery]");
  if (gallery) {
    $("#detail-image").src = gallery.dataset.gallery;
    $("#detail-image").alt = gallery.dataset.alt;
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    if (addToCart(Number(add.dataset.add))) {
      addedFeedback(add);
      openMiniCart();
    }
    return;
  }
  const wish = event.target.closest("[data-wish]");
  if (wish) {
    const id = Number(wish.dataset.wish);
    favorites = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    storage.set("jielien-favorites", favorites);
    if (location.pathname === "/yeu-thich") render({ scroll: false });
    else {
      wish.classList.toggle("active", favorites.includes(id));
      wish.setAttribute("aria-pressed", String(favorites.includes(id)));
      wish.innerHTML = icon(favorites.includes(id) ? "heart-filled" : "heart");
      const p = products.find((p) => p.id === id);
      wish.setAttribute(
        "aria-label",
        (favorites.includes(id) ? "Bỏ yêu thích " : "Yêu thích ") + p.name,
      );
    }
    return;
  }
  const detailAdd = event.target.closest("[data-detail-add],[data-buy]");
  if (detailAdd) {
    const id = Number(detailAdd.dataset.detailAdd || detailAdd.dataset.buy);
    const input = $("#detail-quantity");
    if (!input.reportValidity()) return;
    if (addToCart(id, Number(input.value))) {
      if (detailAdd.dataset.buy) navigate("/thanh-toan");
      else {
        addedFeedback(detailAdd);
        openMiniCart();
      }
    }
    return;
  }
  const quantity = event.target.closest("[data-quantity]");
  if (quantity) {
    const id = Number(quantity.dataset.id);
    const p = products.find((p) => p.id === id);
    const input = quantity.hasAttribute("data-detail")
      ? $("#detail-quantity")
      : $(`[data-cart-quantity="${id}"]`);
    const next = Number(input.value) + Number(quantity.dataset.quantity);
    if (next < 1 || next > Math.min(99, p.stock)) {
      toast(
        next < 1
          ? "Dùng nút Xóa để bỏ sản phẩm khỏi giỏ."
          : `Chỉ còn ${p.stock} sản phẩm trong kho.`,
      );
      return;
    }
    if (quantity.hasAttribute("data-detail")) input.value = next;
    else {
      cart[id] = next;
      persistCart();
      await render({ scroll: false });
    }
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    delete cart[remove.dataset.remove];
    persistCart();
    render({ scroll: false });
    return;
  }
  const filter = event.target.closest("[data-remove-filter]");
  if (filter) {
    changeFilters({ [filter.dataset.removeFilter]: "" });
    return;
  }
  const banner = event.target.closest("[data-hero]");
  if (banner) {
    heroIndex = Number(banner.dataset.hero);
    $("#hero-container").innerHTML = heroMarkup();
    return;
  }
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    const p = products.find(
      (p) => p.id === Number($("#detail-tab-content").dataset.product),
    );
    $$("[data-tab]").forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
      t.tabIndex = t === tab ? 0 : -1;
    });
    $("#detail-tab-content").innerHTML = detailTab(p, tab.dataset.tab);
    $("#detail-tab-content").setAttribute("aria-labelledby", tab.id);
    return;
  }
  const copyTransfer = event.target.closest("[data-copy-transfer]");
  if (copyTransfer) {
    try {
      await navigator.clipboard.writeText(copyTransfer.dataset.copyTransfer);
      toast("Đã sao chép thông tin chuyển khoản.");
    } catch {
      toast(
        "Chưa sao chép được. Mẹ chọn và sao chép thông tin đang hiển thị nhé.",
      );
    }
    return;
  }
  const refresh = event.target.closest("[data-refresh-payment]");
  if (refresh) {
    refresh.disabled = true;
    try {
      const id = refresh.dataset.refreshPayment;
      let result;
      if ($("#lookup-form")) {
        result = await api("/api/orders/lookup", {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries(new FormData($("#lookup-form"))),
          ),
        });
      } else {
        let token;
        try {
          token = sessionStorage.getItem("jielien-order-" + id);
        } catch {}
        result = await api(
          "/api/orders/" +
            encodeURIComponent(id) +
            (token ? "?token=" + encodeURIComponent(token) : ""),
        );
      }
      lastOrder = result.order;
      if ($("#lookup-result"))
        $("#lookup-result").innerHTML = orderMarkup(result.order);
      else await render({ scroll: false });
      toast(
        result.order.paymentStatus === "paid"
          ? "Đã nhận tiền chuyển khoản."
          : "Chưa có xác nhận mới. Nếu đã chuyển, mẹ không thanh toán lại.",
      );
    } catch (error) {
      toast(error.message);
    } finally {
      if (refresh.isConnected) refresh.disabled = false;
    }
    return;
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      toast("Đã sao chép mã " + copy.dataset.copy);
    } catch {
      toast("Mã ưu đãi: " + copy.dataset.copy);
    }
    return;
  }
  if (event.target.closest("#remove-coupon")) {
    const draft = checkoutDraft();
    coupon = "";
    await render({ scroll: false });
    restoreDraft(draft);
    return;
  }
  if (event.target.closest("#refresh-cart")) {
    try {
      ({ products } = await api("/api/products"));
      try {
        newsItems = (await api("/api/news")).items.slice(0, 3);
        siteData = await api("/api/site");
        const contact = $("#company-contact");
        if (contact)
          contact.textContent = (siteData.settings || [])
            .map((s) => s.value_json)
            .filter(Boolean)
            .join(" · ");
      } catch {
        /* Catalog and checkout remain available when optional content cannot load. */
      }
      for (const [id, q] of Object.entries(cart)) {
        const p = products.find((p) => p.id === Number(id));
        if (!p?.stock) delete cart[id];
        else cart[id] = Math.min(q, p.stock);
      }
      persistCart();
      render({ scroll: false });
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (event.target.closest("#retry-render")) render();
});
document.addEventListener("change", (event) => {
  if (
    event.target.matches("input[name=payment]") &&
    !pendingOrder &&
    !submitting
  )
    $("#place-order").textContent = orderButtonLabel();
  if (event.target.matches("[data-cart-quantity]")) {
    const id = Number(event.target.dataset.cartQuantity);
    const p = products.find((p) => p.id === id);
    if (!event.target.reportValidity()) {
      event.target.value = cart[id];
      return;
    }
    cart[id] = Math.min(
      99,
      p.stock,
      Math.max(1, Math.floor(Number(event.target.value))),
    );
    persistCart();
    render({ scroll: false });
  }
});
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const q = $("#search").value.trim();
  navigate(href({ q }));
});
$("#search").addEventListener("input", () => {
  const q = normalize($("#search").value.trim());
  const tokens = q.split(/\s+/).filter(Boolean);
  const results = products
    .filter((p) =>
      tokens.every((token) =>
        normalize(p.name + " " + p.brand + " " + p.category).includes(token),
      ),
    )
    .slice(0, 5);
  $("#suggestions").hidden = !q;
  if (q)
    $("#suggestions").innerHTML = results.length
      ? results
          .map(
            (p) =>
              `<a href="${productLink(p)}" data-link class="suggestion-item"><img src="${escape(p.image)}" alt=""><span>${escape(p.name)}</span><b>${money(p.price)}</b></a>`,
          )
          .join("")
      : '<div class="suggestion-item">Chưa tìm thấy sản phẩm phù hợp.</div>';
});
$("#category-menu").addEventListener("click", toggleMenu);
$("#mobile-menu").addEventListener("click", toggleMenu);
$("#menu-backdrop").addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const wasOpen = !$("#category-dropdown").hidden;
    closeMenu();
    $("#suggestions").hidden = true;
    if (wasOpen)
      (window.innerWidth <= 600
        ? $("#mobile-menu")
        : $("#category-menu")
      ).focus();
  }
  if (
    event.key === "ArrowDown" &&
    event.target === $("#search") &&
    !$("#suggestions").hidden
  ) {
    event.preventDefault();
    $("#suggestions a")?.focus();
  }
  if (
    event.target.matches("[data-tab]") &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  ) {
    event.preventDefault();
    const tabs = $$("[data-tab]");
    const current = tabs.indexOf(event.target);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    tabs[index].click();
    tabs[index].focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-form")) $("#suggestions").hidden = true;
});
window.addEventListener("popstate", () => {
  if (submitting || pendingOrder) {
    history.pushState({}, "", "/thanh-toan");
    toast("Mẹ xác nhận kết quả đơn đang gửi trước khi rời trang nhé.");
    return;
  }
  render();
});
window.addEventListener("beforeunload", (event) => {
  if (submitting || pendingOrder) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === "jielien-cart-v2" && !submitting && !pendingOrder) {
    hydrateCart();
    updateCartCount();
    if (["/gio-hang", "/thanh-toan"].includes(location.pathname))
      render({ scroll: false });
  }
});
function hydrateCart() {
  const stored = storage.get("jielien-cart-v2", {});
  cart = {};
  for (const p of products) {
    const q = stored?.[p.id];
    if (Number.isInteger(q) && q > 0 && q <= 99) cart[p.id] = q;
  }
  const saved = storage.get("jielien-favorites", []);
  favorites = Array.isArray(saved)
    ? saved.filter((id) => products.some((p) => p.id === id))
    : [];
}
// UI lifecycle: services, prices and cart synchronization remain in the existing adapters.
let purchaseObserver,
  revealObserver,
  bannerTimer,
  bannerPaused = false;
let miniVersion = 0,
  miniTimer,
  miniOpener;
function applyCatalogFilters() {
  const changes = {};
  $$("#filter-panel [data-select-filter]").forEach(
    (input) => (changes[input.dataset.selectFilter] = input.value),
  );
  const form = $("#price-filter");
  if (form) {
    const prices = new FormData(form);
    changes.min = prices.get("min");
    changes.max = prices.get("max");
    if (
      changes.min &&
      changes.max &&
      Number(changes.min) > Number(changes.max)
    ) {
      toast("Giá từ cần nhỏ hơn hoặc bằng giá đến.");
      return;
    }
  }
  $("#catalog-filter-dialog")?.close();
  filterOpen = false;
  changeFilters(changes);
}
function openCatalogFilters() {
  const panel = $("#filter-panel");
  if (!panel) return;
  const anchor = document.createElement("span");
  panel.before(anchor);
  const dialog = document.createElement("dialog");
  dialog.id = "catalog-filter-dialog";
  dialog.setAttribute("aria-labelledby", "catalog-filter-title");
  dialog.innerHTML = `<div class="drawer-heading"><h2 id="catalog-filter-title">Lọc sản phẩm</h2><button type="button" data-close-filter aria-label="Đóng bộ lọc">${icon("close")}</button></div><div class="filter-dialog-body"></div><div class="filter-dialog-actions"><button type="button" class="secondary" data-clear-filter>Xóa lọc</button><button type="button" class="primary" data-apply-filter>Áp dụng</button></div>`;
  document.body.append(dialog);
  dialog.querySelector(".filter-dialog-body").append(panel);
  panel.classList.add("open");
  dialog.addEventListener("close", () => {
    anchor.replaceWith(panel);
    panel.classList.remove("open");
    dialog.remove();
    $("#filter-toggle")?.setAttribute("aria-expanded", "false");
    $("#filter-toggle")?.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-filter]")) dialog.close();
    if (event.target.closest("[data-apply-filter]")) applyCatalogFilters();
    if (event.target.closest("[data-clear-filter]")) {
      $$("#filter-panel select,#filter-panel input").forEach(
        (input) => (input.value = ""),
      );
    }
  });
  $("#filter-toggle").setAttribute("aria-expanded", "true");
  dialog.showModal();
}
function stockText(p) {
  return p.stock <= 0
    ? `${icon("alert")} Tạm hết hàng`
    : p.stock <= 5
      ? `${icon("alert")} Chỉ còn ${p.stock} sản phẩm`
      : `${icon("check")} Còn hàng`;
}
function shippingMarkup(q) {
  if (!q.freeShippingThreshold) return "";
  const left = Math.max(0, q.freeShippingThreshold - q.subtotal);
  return `<div class="free-shipping">${q.shipping === 0 ? `${icon("check")} Bạn được miễn phí giao hàng` : `Mua thêm <b>${money(left)}</b> để được miễn phí giao hàng`}<progress max="${q.freeShippingThreshold}" value="${Math.min(q.subtotal, q.freeShippingThreshold)}" aria-label="Tiến độ miễn phí giao hàng"></progress></div>`;
}
function addedFeedback(button) {
  if (!button || button.disabled) return;
  const old = button.innerHTML;
  button.innerHTML = `${icon("check")} Đã thêm`;
  setTimeout(() => {
    if (button.isConnected) button.innerHTML = old;
  }, 1200);
  const badge = $("#cart-count");
  badge.classList.remove("cart-bounce");
  void badge.offsetWidth;
  badge.classList.add("cart-bounce");
}
function miniDialog() {
  if ($("#mini-cart")) return $("#mini-cart");
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog id="mini-cart" class="mini-cart" aria-labelledby="mini-title"><div class="drawer-heading"><div><span class="eyebrow">JIELIEN · MUA SẮM</span><h2 id="mini-title">Giỏ hàng của bạn</h2></div><button type="button" data-close-mini aria-label="Đóng giỏ hàng">${icon("close")}</button></div><div id="mini-content"></div></dialog>`,
  );
  const d = $("#mini-cart");
  d.addEventListener("click", (event) => {
    if (event.target === d || event.target.closest("[data-close-mini]")) {
      closeMiniCart();
      return;
    }
    const control = event.target.closest(
      "[data-mini-change],[data-mini-remove]",
    );
    if (!control) return;
    const id = Number(control.dataset.item),
      p = products.find((p) => p.id === id);
    if (control.hasAttribute("data-mini-remove")) delete cart[id];
    else {
      const next = (cart[id] || 0) + Number(control.dataset.miniChange);
      if (next < 1) return;
      if (next > Math.min(99, p?.stock || 0)) {
        toast(`Chỉ còn ${p?.stock || 0} sản phẩm`);
        return;
      }
      cart[id] = next;
    }
    persistCart();
    scheduleMiniQuote();
  });
  d.addEventListener("cancel", () => {
    miniVersion++;
    clearTimeout(miniTimer);
  });
  d.addEventListener("close", () => {
    miniOpener?.isConnected && miniOpener.focus({ preventScroll: true });
  });
  return d;
}
function closeMiniCart() {
  clearTimeout(miniTimer);
  miniVersion++;
  $("#mini-cart")?.close();
}
function scheduleMiniQuote() {
  clearTimeout(miniTimer);
  miniVersion++;
  $("#mini-content").setAttribute("aria-busy", "true");
  miniTimer = setTimeout(updateMiniCart, 250);
}
async function updateMiniCart() {
  const version = ++miniVersion,
    box = $("#mini-content");
  if (!box) return;
  if (!cartItems().length) {
    box.innerHTML = empty(
      "Giỏ hàng đang trống",
      "Chọn một món đồ phù hợp cho gia đình nhé.",
    );
    box.removeAttribute("aria-busy");
    return;
  }
  try {
    const q = await api("/api/quote", {
      method: "POST",
      body: JSON.stringify({ items: cartItems(), coupon }),
    });
    if (version !== miniVersion) return;
    box.innerHTML = `<div class="mini-items">${q.items.map((item) => `<article class="mini-item"><img src="${escape(item.image)}" alt="" width="72" height="72"><div><a href="${productLink(products.find((p) => p.id === item.id))}" data-link>${escape(item.name)}</a><b>${money(item.price)}</b><div class="mini-quantity"><button data-mini-change="-1" data-item="${item.id}" aria-label="Giảm số lượng ${escape(item.name)}" ${item.quantity === 1 ? "disabled" : ""}>${icon("minus")}</button><span>${item.quantity}</span><button data-mini-change="1" data-item="${item.id}" aria-label="Tăng số lượng ${escape(item.name)}">${icon("plus")}</button><button data-mini-remove data-item="${item.id}" aria-label="Xóa ${escape(item.name)}">${icon("trash")}</button></div></div></article>`).join("")}</div>${shippingMarkup(q)}<div class="summary-line"><span>Tạm tính</span><b>${money(q.subtotal)}</b></div><div class="summary-line"><span>Phí giao hàng</span><b>${money(q.shipping)}</b></div><div class="summary-line total"><span>Tổng thanh toán</span><strong>${money(q.total)}</strong></div><div class="mini-actions"><a class="primary" href="/thanh-toan" data-link>Thanh toán ${icon("arrow")}</a><a class="secondary" href="/gio-hang" data-link>Xem giỏ hàng</a></div>`;
  } catch (error) {
    if (version === miniVersion)
      box.innerHTML = `<p class="form-error" role="alert">${escape(error.message)}</p><a class="secondary" href="/gio-hang" data-link>Kiểm tra giỏ hàng</a>`;
  } finally {
    if (version === miniVersion) box.removeAttribute("aria-busy");
  }
}
function openMiniCart() {
  const d = miniDialog();
  miniOpener = document.activeElement;
  if (!d.open) d.showModal();
  $("#mini-content").innerHTML =
    '<div class="skeleton-block" role="status" aria-label="Đang cập nhật giỏ hàng"></div>';
  updateMiniCart();
}
function renderCompany() {
  const values = Object.fromEntries(
    (siteData.settings || []).map((s) => [s.key, s.value_json]),
  );
  const phone = values.hotline || values.contactPhone;
  const links = [];
  if (phone && /^(?:0|\+84)[0-9 .()-]{8,16}$/.test(phone))
    links.push(
      `<a href="tel:${escape(phone.replace(/[ .()-]/g, ""))}">${icon("phone")} ${escape(phone)}</a>`,
    );
  for (const [key, label, hosts] of [
    ["zalo", "Chat Zalo", ["zalo.me"]],
    [
      "messenger_url",
      "Messenger",
      ["m.me", "messenger.com", "www.messenger.com"],
    ],
  ]) {
    try {
      const u = new URL(values[key]);
      if (
        u.protocol === "https:" &&
        hosts.includes(u.hostname) &&
        !u.username &&
        !u.password
      )
        links.push(
          `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${icon("chat")} ${label}</a>`,
        );
    } catch {}
  }
  const email = values.email_support || values.contactEmail;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    links.push(`<a href="mailto:${escape(email)}">${escape(email)}</a>`);
  const contact = $("#company-contact");
  if (contact)
    contact.innerHTML =
      (values.companyName
        ? `<strong>${escape(values.companyName)}</strong>`
        : "") +
      links.join("") +
      ["store_address", "working_hours"]
        .map((k) => (values[k] ? `<span>${escape(values[k])}</span>` : ""))
        .join("");
  if (links.length) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<details class="contact-fab"><summary aria-label="Liên hệ tư vấn">${icon("chat")}<span>Tư vấn</span></summary><div>${links.join("")}</div></details>`,
    );
  }
  const promo = $(".top-promo");
  if (promo) {
    promo.hidden = !siteData.freeShippingThreshold;
    promo.textContent = siteData.freeShippingThreshold
      ? `Miễn phí giao hàng cho đơn từ ${money(siteData.freeShippingThreshold)}`
      : "";
  }
  $$("[data-demo]").forEach((el) => (el.hidden = !siteData.demoMode));
}
function enhancePage() {
  purchaseObserver?.disconnect();
  revealObserver?.disconnect();
  clearInterval(bannerTimer);
  $("#sticky-purchase")?.remove();
  document.body.classList.toggle("checkout-page", !!$("#checkout-form"));
  document.body.classList.toggle("product-page", !!$(".detail-top"));
  const buy = $(".buy-row");
  if (buy) {
    const p = products.find(
      (p) => p.slug === decodeURIComponent(location.pathname.split("/").at(-1)),
    );
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="sticky-purchase" hidden><div><b>${money(p.price)}</b><small>${escape(p.weight)}</small></div><button class="secondary" data-sticky-add="${p.id}" ${!p.stock ? "disabled" : ""} aria-label="Thêm vào giỏ">${icon("cart")}</button><button class="primary" data-sticky-buy="${p.id}" ${!p.stock ? "disabled" : ""}>${p.stock ? "Mua ngay" : "Tạm hết hàng"} ${icon("arrow")}</button></div>`,
    );
    purchaseObserver = new IntersectionObserver(
      (entries) => {
        $("#sticky-purchase").hidden = entries[0].isIntersecting;
      },
      { threshold: 0 },
    );
    purchaseObserver.observe(buy);
  }
  const form = $("#checkout-form");
  if (form) {
    const email = $("#email")?.closest(".field"),
      note = $("#note")?.closest(".field");
    if (email && note) {
      const extras = document.createElement("details");
      extras.className = "checkout-extras panel";
      extras.innerHTML =
        "<summary>Email và ghi chú <small>Không bắt buộc</small></summary>";
      extras.append(email, note);
      form.insertBefore(extras, form.lastElementChild);
    }
    const total = $("#grand-total"),
      submit = $("#place-order");
    if (total && submit) {
      const bar = document.createElement("div");
      bar.className = "checkout-submit-bar";
      bar.innerHTML = `<div><small>Tổng thanh toán</small><b>${escape(total.textContent)}</b></div>`;
      submit.before(bar);
      bar.append(submit);
    }
    form.addEventListener(
      "invalid",
      (event) => {
        const input = event.target;
        input.closest("details")?.setAttribute("open", "");
        input.setAttribute("aria-invalid", "true");
        let error = $("#error-" + input.id);
        if (!error && input.id) {
          error = document.createElement("small");
          error.id = "error-" + input.id;
          error.className = "field-error";
          error.setAttribute("role", "alert");
          input.after(error);
        }
        if (error) {
          error.textContent =
            input.validity.patternMismatch && input.name === "phone"
              ? "Nhập số điện thoại hợp lệ, ví dụ 09xxxxxxxx."
              : input.validity.valueMissing
                ? "Vui lòng điền thông tin này."
                : input.validationMessage;
          input.setAttribute("aria-describedby", error.id);
        }
      },
      true,
    );
    form.addEventListener("input", (event) => {
      if (event.target.validity?.valid) {
        event.target.removeAttribute("aria-invalid");
        const error = $("#error-" + event.target.id);
        if (error) error.textContent = "";
      }
    });
  }
  if (location.pathname === "/") {
    $$("#main > section").forEach((section) => {
      if (section.getBoundingClientRect().top < innerHeight) return;
      section.classList.add("reveal-ready");
    });
    revealObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            revealObserver.unobserve(e.target);
          }
        }),
      { threshold: 0.05 },
    );
    $$(".reveal-ready").forEach((e) => revealObserver.observe(e));
    bannerTimer = setInterval(() => {
      const container = $("#hero-container");
      if (
        !container ||
        bannerPaused ||
        container.matches(":hover,:focus-within") ||
        document.hidden ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        return;
      const count = siteData.banners?.length || heroes.length;
      if (count < 2) return;
      heroIndex = (heroIndex + 1) % count;
      container.innerHTML = heroMarkup();
    }, 6000);
  }
}
document.addEventListener("click", (event) => {
  const variant = event.target.closest("[data-variant]");
  if (variant) {
    const p = products.find((p) => p.id === Number(variant.dataset.variant));
    history.replaceState({}, "", productLink(p));
    render({ scroll: false }).then(() =>
      $(`[data-variant="${p.id}"]`)?.focus({ preventScroll: true }),
    );
    return;
  }
  const sticky = event.target.closest("[data-sticky-add],[data-sticky-buy]");
  if (sticky) {
    if (
      addToCart(
        Number(sticky.dataset.stickyAdd || sticky.dataset.stickyBuy),
        Number($("#detail-quantity").value),
      )
    ) {
      if (sticky.dataset.stickyBuy) navigate("/thanh-toan");
      else openMiniCart();
    }
    return;
  }
  const code = event.target.closest("[data-coupon]");
  if (code) {
    $("#coupon").value = code.dataset.coupon;
    $("#coupon-form").requestSubmit();
  }
  const step = event.target.closest("[data-banner-step]");
  if (step) {
    const count = siteData.banners?.length || heroes.length;
    heroIndex = (heroIndex + Number(step.dataset.bannerStep) + count) % count;
    $("#hero-container").innerHTML = heroMarkup();
    $(
      '#hero-container [data-banner-step=\"' + step.dataset.bannerStep + '\"]',
    )?.focus();
  }
  const pause = event.target.closest("[data-banner-pause]");
  if (pause) {
    bannerPaused = !bannerPaused;
    pause.setAttribute("aria-pressed", String(bannerPaused));
    pause.textContent = bannerPaused ? "Phát banner" : "Tạm dừng";
  }
});
document.addEventListener("keydown", (event) => {
  const radio = event.target.closest("[data-variant]");
  if (
    !radio ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  const buttons = $$("[data-variant]"),
    i = buttons.indexOf(radio);
  buttons[
    (i +
      (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
      buttons.length) %
      buttons.length
  ].click();
});

async function init() {
  try {
    ({ products } = await api("/api/products"));
    try {
      newsItems = (await api("/api/news")).items.slice(0, 3);
    } catch {}
    try {
      siteData = await api("/api/site");
    } catch {
      /* Shopping remains available. */
    }
    try {
      categoryRows = (await api("/api/categories")).categories;
      const images = new Map(categories);
      categories = categoryRows.map((c) => [
        c.name,
        images.get(c.name) || "toy",
      ]);
      const nav = $(".nav-inner");
      nav.querySelectorAll("a").forEach((a) => a.remove());
      nav.insertAdjacentHTML(
        "beforeend",
        categoryRows
          .filter((c) => !c.parent_id && !c.parentId)
          .slice(0, 6)
          .map(
            (c) =>
              `<a href="${escape(href({ category: c.name }))}" data-link>${escape(c.name)}</a>`,
          )
          .join("") + '<a href="/tin-tuc">Tin tức & Cẩm nang</a>',
      );
    } catch {
      /* Retain the existing local fallback. */
    }
    try {
      brandRows = (await api("/api/brands")).brands || [];
    } catch {}
    renderCompany();
    hydrateCart();
    try {
      const session = await api("/api/auth/me");
      identity = session.user;
      csrfToken = session.csrfToken;
    } catch (error) {
      if (error.status !== 401) throw error;
      identity = null;
      csrfToken = "";
      if (storage.get("jielien-cart-owner", null)) {
        cart = {};
        storage.set("jielien-cart-v2", {});
        storage.set("jielien-cart-owner", null);
      }
    }
    const adminLink = document.getElementById("staff-admin-link");
    if (adminLink) {
      const allowAdmin = canAccessAdmin(identity);
      adminLink.hidden = !allowAdmin;
      adminLink.style.display = allowAdmin ? "" : "none";
    }
    if (identity) {
      const owner = storage.get("jielien-cart-owner", null);
      if (owner && owner !== identity.id) cart = {};
      storage.set("jielien-cart-owner", identity.id);
      try {
        const remote = await api("/api/cart");
        for (const item of remote.items) {
          const p = products.find((p) => p.id === item.id);
          if (p?.stock)
            cart[item.id] = Math.min(
              p.stock,
              99,
              Math.max(item.quantity, cart[item.id] || 0),
            );
        }
        persistCart();
      } catch {
        toast(
          "Chưa tải được giỏ đã lưu. Tài khoản vẫn đăng nhập; mẹ có thể thử tải lại trang.",
        );
      }
      const label = $("#account-label");
      if (label) label.textContent = identity.fullName;
    }
    try {
      ({ methods: paymentMethods } = await api("/api/payment-methods"));
    } catch {
      /* COD remains available if the method list cannot load. */
    }
    updateCartCount();
    $("#category-dropdown").innerHTML = categories
      .map(
        ([name, img]) =>
          `<a href="${escape(href({ category: name }))}" data-link><img src="/assets/${img}.svg" alt="">${escape(name)}<span style="margin-left:auto">›</span></a>`,
      )
      .join("");
    await render();
  } catch (error) {
    $("#main").innerHTML =
      `<div class="server-error"><h1>Chưa kết nối được cửa hàng</h1><p>${escape(error.message)}</p><button id="retry-init" class="primary">Thử kết nối lại</button></div>`;
    $("#retry-init").addEventListener("click", init);
  }
}
init();

document.addEventListener("keydown", (event) => {
  if (
    !event.target.closest("#suggestions") ||
    !["ArrowDown", "ArrowUp"].includes(event.key)
  )
    return;
  event.preventDefault();
  const links = $$("#suggestions a"),
    index = links.indexOf(event.target.closest("a"));
  links[
    (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length
  ]?.focus();
});
