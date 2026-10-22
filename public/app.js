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
const categories = [
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("Máy chủ chưa phản hồi đúng định dạng. Vui lòng thử lại.");
  }
  if (!response.ok) {
    const error = new Error(
      body.message || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
    );
    error.status = response.status;
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
  return `<div class="empty"><span class="empty-icon" aria-hidden="true">♡</span><h2>${escape(title)}</h2><p>${escape(text)}</p>${link ? `<a href="${escape(link)}" data-link class="primary">${escape(label)} →</a>` : ""}</div>`;
}
function card(product) {
  const saved = favorites.includes(product.id);
  return `<article class="product-card">
    <span class="product-discount">-${Math.round((1 - product.price / product.oldPrice) * 100)}%</span>
    <button class="wish-button ${saved ? "active" : ""}" data-wish="${product.id}" aria-label="${saved ? "Bỏ yêu thích" : "Yêu thích"} ${escape(product.name)}" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
    <a href="${productLink(product)}" data-link class="product-photo"><img src="${escape(product.image)}" alt="${escape(product.name)} — ảnh minh họa" loading="lazy"></a>
    <div class="product-brand">${escape(product.brand)}</div>
    <h3><a href="${productLink(product)}" data-link>${escape(product.name)}</a></h3>
    <div class="product-price">${money(product.price)}</div><div class="old-price">${money(product.oldPrice)}</div>
    <div class="product-tags"><span>${escape(product.age)}</span><span>${product.stock > 0 ? "Còn hàng" : "Hết hàng"}</span></div>
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
    eyebrow: "LỚN LÊN CÙNG YÊU THƯƠNG",
    title: "Điều nhỏ xinh.<br>Yêu thương <em>thật lớn.</em>",
    text: "Cùng mẹ chăm chút từng khoảnh khắc,<br>cho hành trình khôn lớn của con.",
    image: "/family.svg",
    link: "/san-pham",
    background: "#fce4eb",
  },
  {
    eyebrow: "ÊM ÁI TỪ NHỮNG NGÀY ĐẦU",
    title: "Bé thoải mái.<br>Mẹ thêm <em>an tâm.</em>",
    text: "Bỉm tã mềm mại và những món đồ<br>chăm sóc nhỏ xinh dành cho bé.",
    image: "/assets/diaper-blue.svg",
    link: href({ category: "Bỉm & tã" }),
    background: "#e5f0e9",
  },
  {
    eyebrow: "DINH DƯỠNG CHO BÉ YÊU",
    title: "Một chút mới mẻ.<br>Vạn điều <em>khám phá.</em>",
    text: "Khám phá danh mục dinh dưỡng<br>và đồ dùng cho bữa ăn của bé.",
    image: "/assets/cereal.svg",
    link: href({ category: "Ăn dặm" }),
    background: "#fff0d8",
  },
];
function heroMarkup() {
  const h = heroes[heroIndex];
  return `<div class="hero" style="background:${h.background}"><div class="hero-content"><div class="eyebrow">${h.eyebrow}</div><h1>${h.title}</h1><p>${h.text}</p><a href="${escape(h.link)}" data-link class="primary">Khám phá cho bé →</a><div class="hero-note">Chọn kỹ cho con · An tâm cho mẹ</div></div><div class="hero-art"><img src="${h.image}" alt="Minh họa sản phẩm và thế giới của bé"></div><div class="banner-controls" aria-label="Chọn banner">${heroes.map((_, i) => `<button class="${i === heroIndex ? "active" : ""}" data-hero="${i}" aria-label="Banner ${i + 1}" aria-pressed="${i === heroIndex}"></button>`).join("")}</div></div>`;
}
function home() {
  document.title = "Jielien — Thế giới mẹ và bé";
  const sale = [...products]
    .sort((a, b) => 1 - b.price / b.oldPrice - (1 - a.price / a.oldPrice))
    .slice(0, 5);
  return `<section class="hero-layout"><nav class="category-sidebar" aria-label="Danh mục">${categories.map(([name, img]) => `<a href="${escape(href({ category: name }))}" data-link><img src="/assets/${img}.svg" alt="">${name}<span style="margin-left:auto;color:#aaa">›</span></a>`).join("")}</nav><div id="hero-container">${heroMarkup()}</div></section>
    <div class="small-banners">${[
      ["DINH DƯỠNG MỖI NGÀY", "Bé khỏe, mẹ vui", "Sữa cho bé", "milk-gold"],
      ["ÊM ÁI SUỐT NGÀY DÀI", "Mềm như mẹ ôm", "Bỉm & tã", "diaper-blue"],
      [
        "DỊU NHẸ CHO LÀN DA",
        "Chăm chút yêu thương",
        "Chăm sóc bé",
        "baby-care",
      ],
    ]
      .map(
        ([tag, title, category, img]) =>
          `<a class="small-banner" href="${escape(href({ category }))}" data-link><div><small>${tag}</small><h3>${title}</h3><b>Khám phá ngay →</b></div><img src="/assets/${img}.svg" alt=""></a>`,
      )
      .join("")}</div>
    <section class="panel"><div class="section-heading"><div><h2>Mẹ tìm gì cho bé?</h2><p>Đủ đầy những điều bé cần, từ những ngày đầu tiên.</p></div></div><div class="category-tiles">${categories.map(([name, img]) => `<a class="category-tile" href="${escape(href({ category: name }))}" data-link><span><img src="/assets/${img}.svg" alt=""></span>${name}</a>`).join("")}</div></section>
    <section class="flash-sale"><div class="section-heading"><div><h2><span>ϟ</span> Ưu đãi mẹ & bé</h2><div class="sale-note">Giá xinh, yêu thương đong đầy · Sản phẩm minh họa</div></div><a href="/san-pham?sort=discount" data-link>Xem tất cả →</a></div><div class="coupon-strip"><div class="coupon"><b>GIẢM 50K</b><span>Đơn từ 500K</span><button data-copy="MEBE50">MEBE50 ▣</button></div><div class="coupon"><b>MIỄN PHÍ SHIP</b><span>Đơn từ 299K</span><button data-copy="FREESHIP">FREESHIP ▣</button></div></div>${productGrid(sale)}</section>
    ${section("Sữa & dinh dưỡng cho bé", "Chọn sản phẩm phù hợp với độ tuổi và nhu cầu của con.", products.filter((p) => p.category === "Sữa cho bé" || p.category === "Ăn dặm").slice(0, 5), href({ category: "Sữa cho bé" }))}
    <section class="panel"><div class="section-heading"><h2>Thương hiệu trong bộ sưu tập</h2></div><div class="brand-row">${[
      ...new Set(products.map((p) => p.brand)),
    ]
      .slice(0, 6)
      .map(
        (brand) =>
          `<a href="${escape(href({ brand }))}" data-link>${escape(brand)}</a>`,
      )
      .join("")}</div></section>
    ${section("Nâng niu bé yêu mỗi ngày", "Từ giấc ngủ êm đến giờ chơi thật vui.", products.filter((p) => ["Chăm sóc bé", "Đồ dùng cho bé", "Đồ chơi"].includes(p.category)).slice(0, 5))}
    <section class="panel"><div class="section-heading"><div><h2>Góc nhỏ của mẹ</h2><p>Đồng hành cùng mẹ trong từng chặng đường.</p></div></div><div class="journal-grid">${[
      [
        "ngu-ngon",
        "☀",
        "Một giấc ngủ êm,<br>một ngày thật vui.",
        "CHĂM SÓC BÉ",
        "Tạo thói quen ngủ nhẹ nhàng cho bé",
      ],
      [
        "an-dam",
        "♧",
        "Bữa đầu đời,<br>vạn điều mới mẻ.",
        "DINH DƯỠNG",
        "Cùng mẹ chuẩn bị hành trình ăn dặm",
      ],
      [
        "cham-soc-me",
        "♡",
        "Mẹ cũng cần<br>được chăm chút.",
        "GÓC CỦA MẸ",
        "Dành một khoảng nhỏ cho chính mẹ",
      ],
    ]
      .map(
        ([slug, icon, art, tag, title]) =>
          `<article><a class="story-art" href="/bai-viet/${slug}" data-link>${icon}<b>${art}</b></a><small>${tag}</small><h3><a href="/bai-viet/${slug}" data-link>${title}</a></h3><a href="/bai-viet/${slug}" data-link>Đọc cùng Jielien →</a></article>`,
      )
      .join("")}</div></section>`;
}
function listing() {
  const params = catalogParams();
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
  return `${breadcrumbs([[title]])}<h1 class="page-title">${escape(title)}</h1><p class="page-subtitle">Tìm những điều phù hợp nhất cho mẹ và bé · ${total} sản phẩm minh họa</p>
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
  const variants = products
    .filter((item) => item.type === p.type && item.id !== p.id)
    .slice(0, 3);
  return `${breadcrumbs([[p.category, href({ category: p.category })], [p.name]])}<section class="panel detail-top"><div><div class="gallery-main"><span class="product-discount">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span><img id="detail-image" src="${escape(p.image)}" alt="${escape(p.name)} — hình sản phẩm minh họa"></div><div class="gallery-thumbs"><button aria-label="Ảnh sản phẩm chính"><img src="${escape(p.image)}" alt=""></button></div><p class="detail-label">Hình SVG minh họa. Thông tin và thương hiệu trong bản thử nghiệm.</p></div><div class="detail-info"><div class="product-brand">${escape(p.brand)}</div><h1>${escape(p.name)}</h1><div class="detail-meta"><span>Mã sản phẩm: JL${String(p.id).padStart(4, "0")}</span><span class="in-stock">${p.stock ? `✓ Còn ${p.stock} sản phẩm` : "Tạm hết hàng"}</span></div><div class="detail-pricing"><strong>${money(p.price)}</strong><del>${money(p.oldPrice)}</del><small>Giá minh họa, đã gồm thuế giả định trong dữ liệu mẫu.</small></div><ul class="features">${p.features.map((f) => `<li>${escape(f)}</li>`).join("")}</ul><div class="variant-label">Lựa chọn đang xem: <b>${escape(p.weight)}</b></div><div class="variants"><a class="active" href="${productLink(p)}" data-link>${escape(p.weight)}</a>${variants.map((v) => `<a href="${productLink(v)}" data-link>${escape(v.name.replace(v.brand, ""))}</a>`).join("")}</div><div class="variant-label">Số lượng</div>${quantityControl(p.id, 1, true)}<div class="buy-row"><button class="secondary" data-detail-add="${p.id}" ${!p.stock ? "disabled" : ""}>+ Thêm vào giỏ</button><button class="primary" data-buy="${p.id}" ${!p.stock ? "disabled" : ""}>Mua ngay →</button></div><div class="delivery-note">♧ Miễn phí giao hàng từ 499.000đ. Phí tiêu chuẩn 25.000đ.</div><div class="delivery-note">♢ Mã <b>MEBE50</b>: giảm 50.000đ cho đơn từ 500.000đ.</div></div></section>
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
      ["Dữ liệu", "Minh họa phục vụ phát triển website"],
    ]
      .map(
        ([key, value]) =>
          `<tr><td>${escape(key)}</td><td>${escape(value)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  if (tab === "notes")
    return "<h3>Mẹ đọc kỹ trước khi sử dụng</h3><p>Thông tin trong website là dữ liệu minh họa, không thay thế nhãn sản phẩm hoặc tư vấn y tế. Khi dùng sản phẩm thật, mẹ cần kiểm tra nguồn gốc, hạn sử dụng, độ tuổi và hướng dẫn từ nhà sản xuất. Bảo quản theo điều kiện ghi trên bao bì và hỏi chuyên gia y tế khi cần.</p>";
  return `<h3>${escape(p.name)}</h3><p>${escape(p.description)}</p><ul>${p.features.map((feature) => `<li>${escape(feature)}</li>`).join("")}</ul><p class="notice">Sản phẩm, thương hiệu và giá ở đây là dữ liệu thử nghiệm. Chưa có đánh giá người mua thực tế.</p>`;
}
function quantityControl(id, quantity, detail = false) {
  const p = products.find((p) => p.id === id);
  return `<div class="quantity-control"><button type="button" data-quantity="-1" data-id="${id}" ${detail ? "data-detail" : ""} aria-label="Giảm số lượng">−</button><input type="number" required step="1" min="1" max="${Math.min(99, p?.stock || 1)}" value="${quantity}" aria-label="Số lượng ${escape(p?.name)}" ${detail ? 'id="detail-quantity"' : `data-cart-quantity="${id}"`}><button type="button" data-quantity="1" data-id="${id}" ${detail ? "data-detail" : ""} aria-label="Tăng số lượng">+</button></div>`;
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
  toast("Đã thêm vào giỏ hàng của mẹ ♡");
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
  <div class="free-shipping">${q.shipping === 0 ? "✓ Đơn hàng được miễn phí giao hàng" : "Mua từ 499.000đ để được miễn phí giao hàng"}</div>
  <form id="coupon-form" class="coupon-form"><input name="coupon" id="coupon" maxlength="30" placeholder="Mã ưu đãi (MEBE50)" aria-label="Mã ưu đãi" value="${escape(coupon)}"><button class="secondary">Áp dụng</button></form>
  ${coupon ? `<button class="filter-chip" id="remove-coupon">${escape(coupon)} ×</button>` : '<div class="summary-note">MEBE50: giảm 50K từ 500K · FREESHIP: miễn ship từ 299K. Mỗi đơn áp dụng 1 mã.</div>'}
  <div id="coupon-error" class="form-error" role="alert"></div>
  <div class="summary-line"><span>Tạm tính (${q.items.reduce((s, p) => s + p.quantity, 0)} sản phẩm)</span><b>${money(q.subtotal)}</b></div>
  <div class="summary-line discount"><span>Giảm giá</span><b>−${money(q.discount)}</b></div><div class="summary-line"><span>Phí giao hàng</span><b>${q.shipping ? money(q.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng cộng</span><strong id="grand-total">${money(q.total)}</strong></div>
  ${checkout ? '<button class="primary" type="submit" form="checkout-form" id="place-order">Đặt hàng COD →</button>' : '<a href="/thanh-toan" data-link class="primary">Tiến hành đặt hàng →</a>'}
  <p class="summary-note">${checkout ? "Đơn sẽ được lưu ở máy chủ thử nghiệm. Chưa phát sinh thu tiền hoặc giao hàng." : "Giá và ưu đãi được xác thực bởi máy chủ khi đặt hàng."}</p></aside>`;
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
  return `${breadcrumbs([["Giỏ hàng", "/gio-hang"], ["Đặt hàng"]])}<div class="checkout-steps"><span>1. Giỏ hàng</span><span>→</span><span class="active">2. Thông tin giao hàng</span><span>→</span><span>3. Hoàn tất</span></div><div class="checkout-layout"><div><form id="checkout-form"><section class="panel form-section"><h2>Thông tin người nhận</h2><div class="fields"><div class="field"><label for="name">Họ và tên <span>*</span></label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Họ tên người nhận"></div><div class="field"><label for="phone">Số điện thoại <span>*</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" placeholder="09xxxxxxxx"></div><div class="field full"><label for="email">Email (không bắt buộc)</label><input id="email" name="email" type="email" autocomplete="email" maxlength="150" placeholder="Email để ghi nhận trong đơn"></div></div></section><section class="panel form-section"><h2>Địa chỉ giao hàng</h2><div class="fields"><div class="field"><label for="province">Tỉnh / Thành phố <span>*</span></label><input id="province" name="province" autocomplete="address-level1" required minlength="2" maxlength="100" placeholder="Ví dụ: TP. Hồ Chí Minh"></div><div class="field"><label for="district">Quận / Huyện / Khu vực <span>*</span></label><input id="district" name="district" autocomplete="address-level2" required minlength="2" maxlength="100" placeholder="Khu vực giao hàng"></div><div class="field full"><label for="address">Địa chỉ chi tiết <span>*</span></label><input id="address" name="address" autocomplete="street-address" required minlength="8" maxlength="250" placeholder="Số nhà, tên đường, phường / xã"></div><div class="field full"><label for="note">Ghi chú cho đơn hàng</label><textarea id="note" name="note" maxlength="500" placeholder="Thông tin cần lưu ý khi giao hàng (nếu có)"></textarea></div></div></section><section class="panel form-section"><h2>Phương thức thanh toán</h2><label class="payment-option"><input type="radio" name="payment" value="cod" checked><span><b>Thanh toán khi nhận hàng (COD)</b><small>Không yêu cầu thông tin thẻ hoặc chuyển khoản.</small></span></label><label class="agreement"><input name="agreement" type="checkbox" required><span>Tôi đã kiểm tra thông tin và đồng ý với <a href="/chinh-sach/giao-hang" target="_blank" rel="noopener">điều kiện mua hàng</a> và <a href="/chinh-sach/bao-mat" target="_blank" rel="noopener">chính sách thông tin cá nhân</a>. Đây là đơn thử nghiệm, chưa được giao thực tế.</span></label><div id="checkout-error" class="form-error" role="alert"></div></section></form></div>${summaryMarkup(q, true)}</div>`;
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
  if (!order)
    return `${breadcrumbs([["Đơn hàng"]])}<section class="panel">${empty("Tra cứu thông tin đơn hàng", "Mẹ dùng mã đơn và số điện thoại đã đặt để xem thông tin.", "/tra-cuu-don-hang", "Tra cứu đơn hàng")}</section>`;
  document.title = `Đơn ${order.id} | Jielien`;
  return `${breadcrumbs([["Đơn hàng " + order.id]])}<div class="success-head"><span class="success-mark">✓</span><h1>Đã ghi nhận đơn hàng của mẹ!</h1><p>Cảm ơn mẹ đã ghé Jielien. Đơn được lưu tại máy chủ thử nghiệm.</p></div>${orderMarkup(order)}<div class="button-row"><a href="/san-pham" data-link class="primary">Tiếp tục mua sắm →</a><a href="/tra-cuu-don-hang" data-link class="secondary">Tra cứu đơn hàng</a></div>`;
}
function orderMarkup(order) {
  return `<section class="panel order-card"><div class="order-number"><strong>Mã đơn: ${escape(order.id)}</strong><span class="status">Đã ghi nhận · COD</span></div><div class="order-details"><div><h3>Người nhận</h3><p><b>${escape(order.customer.name)}</b></p><p>${escape(order.customer.phone)}</p><p>${escape(order.customer.address)}</p><p>${escape(order.customer.district)}, ${escape(order.customer.province)}</p></div><div><h3>Thông tin đơn</h3><p>Ngày đặt: ${new Date(order.createdAt).toLocaleString("vi-VN")}</p><p>Thanh toán: khi nhận hàng (COD)</p><p>Trạng thái: đang chờ xử lý trong hệ thống thử</p>${order.note ? `<p>Ghi chú: ${escape(order.note)}</p>` : ""}</div></div>${order.items.map((item) => `<div class="checkout-mini"><img src="${escape(item.image)}" alt=""><div>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></div><strong>${money(item.lineTotal)}</strong></div>`).join("")}<div class="summary-line"><span>Tạm tính</span><b>${money(order.subtotal)}</b></div><div class="summary-line discount"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="summary-line"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng thanh toán COD</span><strong>${money(order.total)}</strong></div><p class="notice">Mẹ lưu mã đơn để tra cứu cùng số điện thoại. Website thử nghiệm chưa kết nối đơn vị vận chuyển, email hoặc thu tiền.</p></section>`;
}
function lookupPage() {
  document.title = "Tra cứu đơn hàng | Jielien";
  return `${breadcrumbs([["Tra cứu đơn hàng"]])}<section class="panel lookup-panel"><h1>Đơn hàng của mẹ</h1><p class="page-subtitle">Nhập mã đơn và số điện thoại đã dùng khi đặt hàng.</p><form id="lookup-form"><div class="field"><label for="order-id">Mã đơn hàng</label><input id="order-id" name="id" required maxlength="60" placeholder="JL-…" autocomplete="off"></div><div class="field"><label for="lookup-phone">Số điện thoại nhận hàng</label><input id="lookup-phone" type="tel" inputmode="tel" name="phone" required autocomplete="tel" placeholder="09xxxxxxxx"></div><div id="lookup-error" class="form-error" role="alert"></div><button class="primary">Tra cứu đơn hàng →</button></form></section><div id="lookup-result" aria-live="polite"></div>`;
}
const policies = {
  "gioi-thieu": [
    "Về Jielien",
    "<p>Jielien là bản phát triển website thương mại điện tử dành cho mẹ và bé, xây dựng theo yêu cầu tham khảo mô hình AVAKids. Đây là website độc lập, không phải chi nhánh, đối tác hoặc kênh bán hàng chính thức của AVAKids.</p><h2>Những gì mẹ có thể trải nghiệm</h2><p>Tìm kiếm và lọc sản phẩm, xem thông tin chi tiết, lưu sản phẩm yêu thích, quản lý giỏ hàng, đặt đơn COD thử nghiệm và tra cứu đơn đã lưu.</p><h2>Dữ liệu minh họa</h2><p>Tên thương hiệu, sản phẩm, giá, ưu đãi và hình SVG là dữ liệu mẫu. Chưa có đăng ký tài khoản, thanh toán trực tuyến hoặc giao hàng thực tế. Không có đánh giá khách hàng hay số liệu bán hàng giả.</p>",
  ],
  "giao-hang": [
    "Giao hàng & thanh toán",
    "<h2>Phí giao hàng trong bản thử nghiệm</h2><p>Phí tiêu chuẩn: 25.000đ/đơn. Miễn phí khi tổng sản phẩm trước giảm giá từ 499.000đ. Mã FREESHIP miễn phí vận chuyển từ 299.000đ; mã MEBE50 giảm 50.000đ từ 500.000đ. Mỗi đơn dùng một mã.</p><h2>Đặt hàng COD</h2><p>Người nhận điền họ tên, số điện thoại và địa chỉ. Máy chủ xác thực giá, tồn kho, mã giảm giá và lưu đơn bằng SQLite. Việc gửi lại cùng một yêu cầu đặt hàng không tạo đơn trùng.</p><h2>Phạm vi vận hành</h2><p>Đây là môi trường thử nghiệm. Đơn chưa được chuyển tới kho hoặc đơn vị vận chuyển, không có yêu cầu thu tiền. Thời gian giao hàng chưa được cam kết. Đơn vị kinh doanh cần bổ sung quy trình vận hành trước khi mở bán.</p>",
  ],
  "doi-tra": [
    "Chính sách đổi trả",
    "<p>Website đang trong giai đoạn thử nghiệm; chưa nhận giao hàng hoặc xử lý đổi trả thực tế.</p><h2>Trước khi mở bán</h2><p>Đơn vị kinh doanh cần công bố thời hạn, điều kiện hàng nguyên vẹn, chứng từ mua hàng, trường hợp ngoại lệ và thời gian hoàn tiền cho từng nhóm sản phẩm.</p><p>Không gửi hàng hoặc thanh toán dựa trên dữ liệu minh họa của website này.</p>",
  ],
  "bao-mat": [
    "Thông tin cá nhân",
    "<h2>Dữ liệu được lưu khi đặt hàng</h2><p>Họ tên, số điện thoại, email tùy chọn, địa chỉ và ghi chú được lưu cùng đơn ở cơ sở dữ liệu SQLite trên máy chủ. Không yêu cầu mật khẩu, số thẻ hay tài khoản ngân hàng.</p><h2>Dữ liệu trên trình duyệt</h2><p>Giỏ hàng và danh sách yêu thích được lưu trong localStorage để phục hồi sau khi tải lại. Thông tin người nhận không được lưu trong localStorage. Mã truy cập đơn được lưu trong sessionStorage của phiên trình duyệt. Mẹ có thể tra cứu bằng mã đơn và số điện thoại.</p><h2>Trong giai đoạn phát triển</h2><p>Nên dùng thông tin giả để kiểm thử. Máy chủ chưa cung cấp giao diện quản trị, xóa dữ liệu tự phục vụ hoặc dịch vụ chăm sóc khách hàng. Trước khi nhận dữ liệu thật cần có HTTPS, phân quyền quản trị, sao lưu và quy trình bảo vệ dữ liệu.</p>",
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
  const data = (article ? articles : policies)[slug];
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
  $("#suggestions").hidden = true;
  const path = decodeURIComponent(location.pathname);
  const main = $("#main");
  main.setAttribute("aria-busy", "true");
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
  try {
    let html;
    if (path === "/") html = home();
    else if (path === "/san-pham" || path === "/danh-muc") html = listing();
    else if (path.startsWith("/san-pham/"))
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
}
function bindPage() {
  $$("[data-tab]").forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
  });
  $("#sort")?.addEventListener("change", (event) =>
    changeFilters({ sort: event.target.value }),
  );
  $$("[data-select-filter]").forEach((select) =>
    select.addEventListener("change", () =>
      changeFilters({ [select.dataset.selectFilter]: select.value }),
    ),
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
    changeFilters({ min: data.get("min"), max: data.get("max") });
  });
  $("#filter-toggle")?.addEventListener("click", () => {
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
    payment: "cod",
    note: data.note.trim(),
    idempotencyKey: checkoutKey,
  };
  submitting = true;
  $("#place-order").disabled = true;
  $("#place-order").textContent = "Đang ghi nhận đơn…";
  $("#checkout-error").textContent = "";
  try {
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
    } catch {}
    submitting = false;
    navigate("/don-hang/" + encodeURIComponent(order.id));
  } catch (error) {
    const uncertain = !error.status || error.status >= 500;
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
      : "Đặt hàng COD →";
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
        "a[data-link],button[data-add],button[data-buy],button[data-detail-add],button[data-remove],button[data-quantity],#mobile-menu,#category-menu",
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
    navigate(link.href);
    return;
  }
  const add = event.target.closest("[data-add]");
  if (add) {
    addToCart(Number(add.dataset.add));
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
      wish.textContent = favorites.includes(id) ? "♥" : "♡";
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
    if (addToCart(id, Number(input.value)) && detailAdd.dataset.buy)
      navigate("/thanh-toan");
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
async function init() {
  try {
    ({ products } = await api("/api/products"));
    hydrateCart();
    updateCartCount();
    $("#category-dropdown").innerHTML = categories
      .map(
        ([name, img]) =>
          `<a href="${escape(href({ category: name }))}" data-link><img src="/assets/${img}.svg" alt="">${name}<span style="margin-left:auto">›</span></a>`,
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
