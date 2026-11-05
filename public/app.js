import { icon } from "/ui-icons.js";
import {
  renderHome,
  renderListing,
  renderDetail,
  renderHero,
  renderCard,
  bannerPicture,
  hydratePublicShell,
  categoryLink,
} from "/v3-storefront.js";
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
let newsItems = [],
  siteData = {};
let categories = [],
  listingData = {
    items: [],
    total: 0,
    page: 1,
    pages: 1,
    facets: { brands: [], ages: [] },
  },
  homeCategory = "";
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
    throw new Error("Máy chủ chưa phản hồi đúng định dạng. Vui lòng thử lại.");
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
  return `<div class="empty"><span class="empty-icon" aria-hidden="true">♡</span><h2>${escape(title)}</h2><p>${escape(text)}</p>${link ? `<a href="${escape(link)}" data-link class="primary">${escape(label)} →</a>` : ""}</div>`;
}
function card(product) {
  return renderCard(product, favorites.includes(product.id));
}
function remember(items) {
  const cache = new Map(products.map((p) => [p.id, p]));
  for (const p of items) cache.set(p.id, p);
  products = [...cache.values()];
}
async function loadCatalog(params = {}) {
  const data = await api(
    "/api/products?" + new URLSearchParams({ limit: 12, ...params }),
  );
  remember(data.items);
  return data;
}
async function loadSavedProducts(ids) {
  const list = [
    ...new Set(ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0)),
  ].slice(0, 200);
  if (list.length)
    remember((await api("/api/catalog/skus?ids=" + list.join(","))).products);
}
function productGrid(list) {
  return `<div class="product-grid products-grid">${list.map(card).join("")}</div>`;
}
function section(title, subtitle, list, url = "/san-pham") {
  return `<section class="panel"><div class="section-heading"><div><h2>${escape(title)}</h2>${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</div><a href="${escape(url)}" data-link>Xem tất cả →</a></div>${productGrid(list)}</section>`;
}
function heroMarkup() {
  return renderHero(
    siteData.banners || [],
    heroIndex,
    Object.fromEntries(
      (siteData.settings || []).map((s) => [s.key, s.value_json]),
    ),
  );
}
function home() {
  document.title = "Jielien International — Lựa chọn cho cuộc sống";
  return renderHome({
    products: listingData.items.slice(0, 8),
    categories,
    siteData,
    newsItems,
    favorites,
    heroIndex,
    selected: homeCategory,
  });
}
function listing(categoryName) {
  const params = {
    ...catalogParams(),
    ...(categoryName ? { category: categoryName } : {}),
  };
  document.title =
    (categories.find(
      (c) => c.slug === params.category || c.name === params.category,
    )?.name || "Sản phẩm") + " | Jielien";
  return renderListing({
    listingData,
    categories,
    params,
    siteData,
    favorites,
    filterOpen,
  });
}
function details(slug) {
  const p = products.find((p) => p.slug === slug);
  if (!p) return notFound();
  document.title = p.name + " | Jielien";
  return renderDetail(
    p,
    products.filter((v) => v.productId === p.productId && v.id !== p.id),
  );
}
function detailTab(p, tab) {
  if (tab === "specs")
    return `<table class="spec-table"><tbody>${[
      ["Thương hiệu", p.brand],
      ["Danh mục", p.category],
      ["Độ tuổi tham khảo", p.age],
      ["Quy cách", p.weight],
      ["Mã sản phẩm", "JL" + String(p.id).padStart(4, "0")],
    ]
      .map(
        ([key, value]) =>
          `<tr><td>${escape(key)}</td><td>${escape(value)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  if (tab === "notes")
    return "<h3>Bạn đọc kỹ trước khi sử dụng</h3><p>Kiểm tra thông tin trên nhãn sản phẩm và hướng dẫn từ nhà sản xuất trước khi sử dụng. Khi dùng sản phẩm thật, mẹ cần kiểm tra nguồn gốc, hạn sử dụng, độ tuổi và hướng dẫn từ nhà sản xuất. Bảo quản theo điều kiện ghi trên bao bì và hỏi chuyên gia y tế khi cần.</p>";
  return `<h3>${escape(p.name)}</h3><p>${escape(p.description)}</p>${p.descriptionHtml || ""}<ul>${p.features.map((feature) => `<li>${escape(feature)}</li>`).join("")}</ul><p class="notice">Thông tin chi tiết theo sản phẩm và phân loại bạn đang xem.</p>`;
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
  return `<aside class="panel summary"><h2>${checkout ? "Đơn hàng của bạn" : "Thông tin thanh toán"}</h2>
  ${checkout ? `<div class="checkout-items">${q.items.map((item) => `<div class="checkout-mini"><img src="${escape(item.image)}" alt=""><div>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></div></div>`).join("")}</div>` : ""}
  <div class="free-shipping">${q.shipping === 0 ? "✓ Đơn hàng được miễn phí giao hàng" : "Mua từ 499.000đ để được miễn phí giao hàng"}</div>
  <form id="coupon-form" class="coupon-form"><input name="coupon" id="coupon" maxlength="30" placeholder="Mã ưu đãi (MEBE50)" aria-label="Mã ưu đãi" value="${escape(coupon)}"><button class="secondary">Áp dụng</button></form>
  ${coupon ? `<button class="filter-chip" id="remove-coupon">${escape(coupon)} ×</button>` : '<div class="summary-note">MEBE50: giảm 50K từ 500K · FREESHIP: miễn ship từ 299K. Mỗi đơn áp dụng 1 mã.</div>'}
  <div id="coupon-error" class="form-error" role="alert"></div>
  <div class="summary-line"><span>Tạm tính (${q.items.reduce((s, p) => s + p.quantity, 0)} sản phẩm)</span><b>${money(q.subtotal)}</b></div>
  <div class="summary-line discount"><span>Giảm giá</span><b>−${money(q.discount)}</b></div><div class="summary-line"><span>Phí giao hàng</span><b>${q.shipping ? money(q.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng cộng</span><strong id="grand-total">${money(q.total)}</strong></div>
  ${checkout ? '<button class="primary" type="submit" form="checkout-form" id="place-order">Đặt hàng COD →</button>' : '<a href="/thanh-toan" data-link class="primary">Tiến hành đặt hàng →</a>'}
  <p class="summary-note">${checkout ? "Với chuyển khoản, chỉ thanh toán sau khi kiểm tra ngân hàng, người nhận và mã đơn trên màn hình tiếp theo." : "Giá và ưu đãi được xác thực bởi máy chủ khi đặt hàng."}</p></aside>`;
}
async function cartPage(version) {
  document.title = "Giỏ hàng | Jielien";
  if (!cartItems().length)
    return `${breadcrumbs([["Giỏ hàng"]])}<section class="panel">${empty("Giỏ hàng của mẹ còn trống", "Chọn một chút yêu thương dành cho bạn nhé.")}</section>`;
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
  return `${breadcrumbs([["Giỏ hàng"]])}<section class="panel"><div class="form-error" role="alert">${escape(error.message)}</div><p>Bạn có thể bỏ sản phẩm không còn đủ hàng hoặc làm mới thông tin.</p>${Object.keys(
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
    return `${breadcrumbs([["Đặt hàng"]])}<section class="panel">${empty("Chưa có sản phẩm để đặt hàng", "Bạn thêm sản phẩm vào giỏ trước khi tiếp tục nhé.")}</section>`;
  let q;
  try {
    q = await fetchQuote();
  } catch (error) {
    return cartError(error);
  }
  if (version !== renderVersion) return "";
  if (!checkoutKey) checkoutKey = crypto.randomUUID();
  return `${breadcrumbs([["Giỏ hàng", "/gio-hang"], ["Đặt hàng"]])}<div class="checkout-steps"><span>1. Giỏ hàng</span><span>→</span><span class="active">2. Thông tin giao hàng</span><span>→</span><span>3. Hoàn tất</span></div><div class="checkout-account">${identity ? `Đang đặt hàng với tài khoản <b>${escape(identity.fullName)}</b>. Đơn sẽ được lưu vào lịch sử mua hàng.` : `Bạn có thể đặt hàng không cần tài khoản hoặc <a href="/tai-khoan?redirect=/thanh-toan">đăng nhập</a> / <a href="/tai-khoan?mode=register&redirect=/thanh-toan">đăng ký</a> để lưu địa chỉ và đơn hàng.`}</div><div class="checkout-layout"><div><form id="checkout-form"><section class="panel form-section"><h2>Thông tin người nhận</h2><div class="fields"><div class="field"><label for="name">Họ và tên <span>*</span></label><input id="name" name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Họ tên người nhận"></div><div class="field"><label for="phone">Số điện thoại <span>*</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" placeholder="09xxxxxxxx"></div><div class="field full"><label for="email">Email (không bắt buộc)</label><input id="email" name="email" type="email" autocomplete="email" maxlength="150" placeholder="Email để ghi nhận trong đơn"></div></div></section><section class="panel form-section"><h2>Địa chỉ giao hàng</h2><div class="fields"><div class="field"><label for="province">Tỉnh / Thành phố <span>*</span></label><input id="province" name="province" autocomplete="address-level1" required minlength="2" maxlength="100" placeholder="Ví dụ: TP. Hồ Chí Minh"></div><div class="field"><label for="district">Quận / Huyện / Khu vực <span>*</span></label><input id="district" name="district" autocomplete="address-level2" required minlength="2" maxlength="100" placeholder="Khu vực giao hàng"></div><div class="field full"><label for="address">Địa chỉ chi tiết <span>*</span></label><input id="address" name="address" autocomplete="street-address" required minlength="8" maxlength="250" placeholder="Số nhà, tên đường, phường / xã"></div><div class="field full"><label for="note">Ghi chú cho đơn hàng</label><textarea id="note" name="note" maxlength="500" placeholder="Thông tin cần lưu ý khi giao hàng (nếu có)"></textarea></div></div></section><section class="panel form-section"><h2>Phương thức thanh toán</h2>${paymentOptions()}<label class="agreement"><input name="agreement" type="checkbox" required><span>Tôi đã kiểm tra thông tin và đồng ý với <a href="/chinh-sach/giao-hang" target="_blank" rel="noopener">điều kiện mua hàng</a> và <a href="/chinh-sach/bao-mat" target="_blank" rel="noopener">chính sách thông tin cá nhân</a>. </span></label><div id="checkout-error" class="form-error" role="alert"></div></section></form></div>${summaryMarkup(q, true)}</div>`;
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
    return `${breadcrumbs([["Đơn hàng"]])}<section class="panel">${empty("Tra cứu thông tin đơn hàng", "Bạn dùng mã đơn và số điện thoại đã đặt để xem thông tin.", "/tra-cuu-don-hang", "Tra cứu đơn hàng")}</section>`;
  document.title = `Đơn ${order.id} | Jielien`;
  return `${breadcrumbs([["Đơn hàng " + order.id]])}<div class="success-head"><span class="success-mark">✓</span><h1>Đã ghi nhận đơn hàng của mẹ!</h1><p>Cảm ơn bạn đã ghé Jielien. Đơn được lưu trong hệ thống.</p></div>${orderMarkup(order)}<div class="button-row"><a href="/san-pham" data-link class="primary">Tiếp tục mua sắm →</a><a href="/tra-cuu-don-hang" data-link class="secondary">Tra cứu đơn hàng</a></div>`;
}
function transferMarkup(order) {
  if (order.payment !== "bank_transfer") return "";
  if (order.paymentStatus === "paid")
    return `<div class="transfer-paid" role="status">✓ Đã nhận tiền chuyển khoản. Cảm ơn bạn!</div>`;
  if (order.status === "cancelled")
    return `<p class="notice">Đơn đã hủy. Bạn không chuyển khoản cho đơn này.</p>`;
  const t = order.transfer;
  if (!t)
    return `<p class="notice">Chưa tải được thông tin nhận tiền. Bạn thử cập nhật trạng thái đơn.</p>`;
  return `<section class="transfer-panel" aria-label="Hướng dẫn chuyển khoản"><div class="transfer-qr">${t.qrDataUrl ? `<img id="transfer-qr" src="${escape(t.qrDataUrl)}" alt="VietQR chuyển khoản cho đơn ${escape(order.id)}" width="280" height="280">` : ""}<p>Quét bằng ứng dụng ngân hàng</p></div><div><h2>Chuyển khoản thanh toán đơn hàng</h2><dl class="transfer-details"><dt>Ngân hàng</dt><dd>${escape(t.bankName)}</dd><dt>Số tài khoản</dt><dd><b>${escape(t.accountNumber)}</b> <button class="copy-transfer" data-copy-transfer="${escape(t.accountNumber)}" aria-label="Sao chép số tài khoản">Sao chép</button></dd><dt>Chủ tài khoản</dt><dd>${escape(t.accountName)}</dd><dt>Số tiền</dt><dd><b>${money(t.amount)}</b> <button class="copy-transfer" data-copy-transfer="${t.amount}" aria-label="Sao chép số tiền">Sao chép</button></dd><dt>Nội dung chuyển khoản</dt><dd><b>${escape(t.reference)}</b> <button class="copy-transfer" data-copy-transfer="${escape(t.reference)}" aria-label="Sao chép nội dung chuyển khoản">Sao chép</button></dd></dl><p>Giữ nguyên số tiền và nội dung để cửa hàng đối soát đúng đơn. Kiểm tra tên người nhận trong ứng dụng ngân hàng trước khi xác nhận.</p><p class="notice">Đang chờ đối soát. Quét mã không tự xác nhận đã trả tiền; cửa hàng sẽ cập nhật sau khi nhận tiền. Nếu đã chuyển, bạn không thanh toán lại.</p><button class="secondary" data-refresh-payment="${escape(order.id)}">Cập nhật trạng thái thanh toán</button></div></section>`;
}
function orderMarkup(order) {
  return `<section class="panel order-card"><div class="order-number"><strong>Mã đơn: ${escape(order.id)}</strong><span class="status">${escape({ pending: "Chờ xác nhận", confirmed: "Đã xác nhận", processing: "Đang chuẩn bị", shipped: "Đang giao", delivered: "Đã giao", cancelled: "Đã hủy" }[order.status] || order.status)} · ${escape(paymentLabel(order.payment))}</span></div>${transferMarkup(order)}<div class="order-details"><div><h3>Người nhận</h3><p><b>${escape(order.customer.name)}</b></p><p>${escape(order.customer.phone)}</p><p>${escape(order.customer.address)}</p><p>${escape(order.customer.district)}, ${escape(order.customer.province)}</p></div><div><h3>Thông tin đơn</h3><p>Ngày đặt: ${new Date(order.createdAt).toLocaleString("vi-VN")}</p><p>Phương thức: ${escape(paymentLabel(order.payment))}</p><p>Thanh toán: ${order.paymentStatus === "paid" ? "Đã ghi nhận thu tiền" : "Chưa ghi nhận thu tiền"}</p>${order.note ? `<p>Ghi chú: ${escape(order.note)}</p>` : ""}</div></div>${order.items.map((item) => `<div class="checkout-mini"><img src="${escape(item.image)}" alt=""><div>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></div><strong>${money(item.lineTotal)}</strong></div>`).join("")}<div class="summary-line"><span>Tạm tính</span><b>${money(order.subtotal)}</b></div><div class="summary-line discount"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="summary-line"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="summary-line total"><span>Tổng thanh toán</span><strong>${money(order.total)}</strong></div><p class="notice">Bạn lưu mã đơn để tra cứu cùng số điện thoại. Vận chuyển được cửa hàng xử lý thủ công.</p></section>`;
}
function lookupPage() {
  document.title = "Tra cứu đơn hàng | Jielien";
  return `${breadcrumbs([["Tra cứu đơn hàng"]])}<section class="panel lookup-panel"><h1>Đơn hàng của bạn</h1><p class="page-subtitle">Nhập mã đơn và số điện thoại đã dùng khi đặt hàng.</p><form id="lookup-form"><div class="field"><label for="order-id">Mã đơn hàng</label><input id="order-id" name="id" required maxlength="60" placeholder="JL-…" autocomplete="off"></div><div class="field"><label for="lookup-phone">Số điện thoại nhận hàng</label><input id="lookup-phone" type="tel" inputmode="tel" name="phone" required autocomplete="tel" placeholder="09xxxxxxxx"></div><div id="lookup-error" class="form-error" role="alert"></div><button class="primary">Tra cứu đơn hàng →</button></form></section><div id="lookup-result" aria-live="polite"></div>`;
}
function contentPage(slug, article = false) {
  if (article) return notFound();
  const title = {
    "gioi-thieu": "Về Jielien",
    "bao-mat": "Thông tin cá nhân",
    "giao-hang": "Giao hàng & thanh toán",
    "doi-tra": "Đổi trả hàng",
  }[slug];
  if (!title) return notFound();
  const company = Object.fromEntries(
    (siteData.settings || []).map((s) => [s.key, s.value_json]),
  );
  return `${breadcrumbs([["Thông tin cửa hàng"], [title]])}<article class="panel content-page"><h1>${title}</h1><p>${escape(company.footerText || "Thông tin chi tiết đang được cập nhật. Vui lòng liên hệ Jielien qua thông tin được công bố trên website.")}</p>${company.contactEmail ? `<p>${escape(company.contactEmail)}</p>` : ""}${company.contactPhone ? `<p>${escape(company.contactPhone)}</p>` : ""}</article>`;
}
function wishlistPage() {
  const list = products.filter((p) => favorites.includes(p.id));
  document.title = "Sản phẩm yêu thích | Jielien";
  return `${breadcrumbs([["Sản phẩm yêu thích"]])}<section class="panel"><div class="section-heading"><div><h1 class="page-title">Sản phẩm bạn yêu thích</h1><p>${list.length} sản phẩm được lưu trên trình duyệt này</p></div></div>${list.length ? productGrid(list) : empty("Danh sách yêu thích còn trống", "Chạm vào trái tim trên sản phẩm để lưu lại cho lần mua sau.")}</section>`;
}
function notFound() {
  document.title = "Không tìm thấy trang | Jielien";
  return `<section class="panel" style="margin-top:25px">${empty("Chưa tìm thấy trang này", "Bạn quay về trang chủ để tiếp tục khám phá nhé.", "/", "Về trang chủ")}</section>`;
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
    if (path === "/") {
      listingData = await loadCatalog({ limit: 8, category: homeCategory });
      html = home();
    } else if (path === "/san-pham" || path === "/danh-muc") {
      listingData = await loadCatalog(catalogParams());
      html = listing();
    } else if (path.startsWith("/danh-muc/")) {
      const data = await api("/api/categories");
      const c = data.categories.find((c) => c.slug === path.split("/")[2]);
      if (c) {
        listingData = await loadCatalog({
          ...catalogParams(),
          category: c.slug,
        });
        html = listing(c.slug);
      } else html = notFound();
    } else if (path.startsWith("/san-pham/")) {
      const data = await api(
        "/api/catalog/products/" + encodeURIComponent(path.slice(10)),
      );
      remember(data.variants);
      remember([data.product]);
      html = details(path.slice(10));
    } else if (path === "/gio-hang") {
      await loadSavedProducts(Object.keys(cart));
      html = await cartPage(version);
    } else if (path === "/thanh-toan") {
      await loadSavedProducts(Object.keys(cart));
      html = await checkoutPage(version);
    } else if (path.startsWith("/don-hang/"))
      html = await orderPage(path.slice("/don-hang/".length));
    else if (path === "/tra-cuu-don-hang") html = lookupPage();
    else if (path === "/yeu-thich") {
      await loadSavedProducts(favorites);
      html = wishlistPage();
    } else if (path.startsWith("/chinh-sach/"))
      html = contentPage(path.split("/")[2]);
    else if (path.startsWith("/bai-viet/"))
      html = contentPage(path.split("/")[2], true);
    else html = notFound();
    if (version !== renderVersion) return;
    main.innerHTML = html;
    main.dataset.hydrated = "true";
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
    toast("Đang ghi nhận đơn. Bạn chờ kết quả trước khi rời trang nhé.");
    return;
  }
  if (pendingOrder) {
    toast("Cần xác nhận lần gửi đơn trước. Bạn bấm Kiểm tra đơn vừa gửi.");
    return;
  }
  const parsed = new URL(url, location.origin);
  history.pushState({}, "", parsed.pathname + parsed.search);
  render(options);
}
function closeMenu() {
  ["#category-menu", "#mobile-menu"].forEach((s) =>
    $(s).setAttribute("aria-expanded", "false"),
  );
  $("#category-dropdown").hidden = true;
  $("#menu-backdrop").hidden = true;
  $("#category-menu").setAttribute("aria-expanded", "false");
  $("#mobile-menu").setAttribute("aria-expanded", "false");
}
function toggleMenu() {
  const opening = $("#category-dropdown").hidden;
  ["#category-menu", "#mobile-menu"].forEach((s) =>
    $(s).setAttribute("aria-expanded", String(opening)),
  );
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
      remember((await loadCatalog()).items);
      try {
        newsItems = (await api("/api/news")).items.slice(0, 3);
        siteData = await api("/api/site");
        hydratePublicShell(categories, siteData);
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
            ? "Đang ghi nhận đơn. Bạn chờ kết quả nhé."
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
  const gallery = event.target.closest("[data-gallery]");
  if (gallery) {
    $("#detail-image").src = gallery.dataset.gallery;
    $("#detail-image").alt = gallery.dataset.alt;
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
  const categoryTab = event.target.closest("[data-home-category]");
  if (categoryTab) {
    homeCategory = categoryTab.dataset.homeCategory;
    await render({ scroll: false });
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
        "Chưa sao chép được. Bạn chọn và sao chép thông tin đang hiển thị nhé.",
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
          : "Chưa có xác nhận mới. Nếu đã chuyển, bạn không thanh toán lại.",
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
      remember((await loadCatalog()).items);
      try {
        newsItems = (await api("/api/news")).items.slice(0, 3);
        siteData = await api("/api/site");
        hydratePublicShell(categories, siteData);
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
let searchTimer,
  searchVersion = 0;
$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const version = ++searchVersion,
    q = $("#search").value.trim();
  $("#suggestions").hidden = !q;
  if (!q) return;
  searchTimer = setTimeout(async () => {
    try {
      const { items } = await api(
        "/api/catalog/search?" + new URLSearchParams({ q, limit: 5 }),
      );
      if (version !== searchVersion) return;
      $("#suggestions").innerHTML =
        items
          .map(
            (p) =>
              `<a href="${productLink(p)}" data-link class="suggestion-item">${p.image ? `<img src="${escape(p.image)}" alt="">` : ""}<span>${escape(p.name)}</span><b>${money(p.price)}</b></a>`,
          )
          .join("") ||
        '<div class="suggestion-item">Chưa tìm thấy sản phẩm phù hợp.</div>';
    } catch {
      if (version === searchVersion)
        $("#suggestions").innerHTML =
          '<div class="suggestion-item">Chưa tải được gợi ý. Nhấn tìm kiếm để thử lại.</div>';
    }
  }, 180);
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
    toast("Bạn xác nhận kết quả đơn đang gửi trước khi rời trang nhé.");
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
  for (const [id, q] of Object.entries(stored || {}))
    if (
      Number.isSafeInteger(Number(id)) &&
      Number(id) > 0 &&
      Number.isInteger(q) &&
      q > 0 &&
      q <= 99
    )
      cart[id] = q;
  const saved = storage.get("jielien-favorites", []);
  favorites = Array.isArray(saved)
    ? saved.filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 200)
    : [];
}
async function init() {
  try {
    categories = (await api("/api/categories")).categories;
    document
      .querySelectorAll("[data-v3-icon]")
      .forEach((el) => (el.innerHTML = icon(el.dataset.v3Icon)));
    remember((await loadCatalog()).items);
    try {
      newsItems = (await api("/api/news")).items.slice(0, 3);
      siteData = await api("/api/site");
      hydratePublicShell(categories, siteData);
    } catch {
      /* Catalog and checkout remain available when optional content cannot load. */
    }
    await loadSavedProducts([
      ...Object.keys(storage.get("jielien-cart-v2", {})),
      ...(Array.isArray(storage.get("jielien-favorites", []))
        ? storage.get("jielien-favorites", [])
        : []),
    ]);
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
    if (identity) {
      const owner = storage.get("jielien-cart-owner", null);
      if (owner && owner !== identity.id) cart = {};
      storage.set("jielien-cart-owner", identity.id);
      try {
        const remote = await api("/api/cart");
        await loadSavedProducts(remote.items.map((i) => i.id));
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
          "Chưa tải được giỏ đã lưu. Tài khoản vẫn đăng nhập; bạn có thể thử tải lại trang.",
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
    hydratePublicShell(categories, siteData);
    await render();
  } catch (error) {
    $("#main").innerHTML =
      `<div class="server-error"><h1>Chưa kết nối được cửa hàng</h1><p>${escape(error.message)}</p><button id="retry-init" class="primary">Thử kết nối lại</button></div>`;
    $("#main").dataset.hydrated = "true";
    $("#retry-init").addEventListener("click", init);
  }
}
init();
