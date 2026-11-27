// Lucian UX/UI Prompt #403 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#403
// Lucian UX/UI Prompt #062 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#062
// Lucian UX/UI Prompt #416 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#416
import { icon } from "/ui-icons.js";
import { resolveAdminRoute } from "/admin-nav.js";
import { logoutSession } from "/auth-session.js";
import { canAccessAdmin } from "/admin-access.js";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const money = (value) => Number(value || 0).toLocaleString("vi-VN") + "đ";
const date = (value) =>
  value && !Number.isNaN(new Date(value).valueOf())
    ? new Date(value).toLocaleString("vi-VN")
    : "—";
const statusNames = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang chuẩn bị",
  shipped: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
};
const accountViews = [
  ["profile", "user", "Thông tin tài khoản"],
  ["orders", "receipt", "Đơn hàng"],
  ["addresses", "home", "Địa chỉ"],
  ["security", "shield", "Bảo mật"],
  ["favorites", "heart", "Yêu thích", "/yeu-thich"],
  ["notifications", "bell", "Thông báo"],
];
const accountRoleLabels = new Map(Object.entries({
  admin: "Quản trị viên", boss: "Chủ cửa hàng", sales: "Bán hàng",
  warehouse: "Nhân viên kho", finance: "Kế toán", catalog_manager: "Quản lý sản phẩm",
  banner_manager: "Quản lý banner", writer: "Biên tập viên", seo: "Tối ưu tìm kiếm",
  content: "Quản lý nội dung", viewer: "Chỉ xem", customer: "Khách hàng",
}));
const root = $("#account-main");
let user = null;
let csrfToken = "";
let authMode =
  new URLSearchParams(location.search).get("mode") === "register"
    ? "register"
    : "login";
let activeView = "profile";
let viewVersion = 0;
let notificationTimer;
let authBusy = false;
let addressRows = [];
let recoveryMode=['forgot','reset'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):null;
let resetToken=recoveryMode==='reset'?new URLSearchParams(location.hash.slice(1)).get('token'):null;
if(resetToken)history.replaceState(null,'',location.pathname+'?mode=reset');
async function completeAuth(result) {
  authMode='login';user=result.user;csrfToken=result.csrfToken||'';
  const redirect=safeRedirect();if(redirect){location.assign(redirect);return;}
  accountShell();await renderView('profile');notify('Đăng nhập thành công.');
}
function renderRecovery(){
  const reset=recoveryMode==='reset';
  root.innerHTML=`<section class="panel auth-form-panel"><h1>${reset?'Đặt lại mật khẩu':'Quên mật khẩu'}</h1><p>${reset?'Chọn mật khẩu mới. Sau khi hoàn tất, mọi phiên cũ sẽ được đăng xuất.':'Nhập số điện thoại hoặc email. Liên kết khôi phục chỉ được gửi tới email đã lưu; tài khoản chỉ có số điện thoại cần cửa hàng xác minh và hỗ trợ.'}</p>${reset&&!resetToken?'<p class="form-error" role="alert">Thiếu mã khôi phục. Hãy mở lại liên kết trong email hoặc yêu cầu liên kết mới.</p>':`<form id="recovery-form">${reset?'<div class="field"><label for="reset-password">Mật khẩu mới</label><input id="reset-password" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></div><div class="field"><label for="reset-confirmation">Nhập lại mật khẩu</label><input id="reset-confirmation" name="confirmation" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></div>':'<div class="field"><label for="recovery-identifier">Số điện thoại hoặc email</label><input id="recovery-identifier" name="identifier" autocomplete="username" required maxlength="200"></div>'}<div id="recovery-error" class="form-error" role="alert"></div><button class="primary">${reset?'Lưu mật khẩu mới':'Yêu cầu liên kết khôi phục'}</button><p id="recovery-message" role="status"></p></form>`}<button type="button" class="secondary" id="back-to-login">Quay lại đăng nhập</button>${reset?'<button type="button" class="secondary" id="forgot-password">Yêu cầu liên kết mới</button>':''}</section>`;
}
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return {};
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Máy chủ chưa trả lời đúng định dạng. Vui lòng thử lại.");
  }
  if (!response.ok) {
    const error = new Error(data.message || "Chưa hoàn tất được yêu cầu.");
    error.status = response.status;
    throw error;
  }
  return data;
}
function notify(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = false;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    $("#notice").hidden = true;
  }, 3500);
}
function labelStatus(status) {
  return statusNames[status] || status || "Chưa xác định";
}
function badge(status) {
  return `<span class="badge ${["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].includes(status) ? status : ""}">${escape(labelStatus(status))}</span>`;
}
function empty(title, text, link = "") {
  return `<div class="empty"><span class="empty-icon">${icon("bag", { size: 26 })}</span><h3>${escape(title)}</h3><p>${escape(text)}</p>${link ? `<a class="primary" href="${escape(link)}">Khám phá sản phẩm</a>` : ""}</div>`;
}
function safeRedirect() {
  const target = new URLSearchParams(location.search).get("redirect");
  return (["/quan-tri", "/thanh-toan", "/gio-hang", "/"].includes(target) || (typeof target === "string" && !!resolveAdminRoute(target.split(/[?#]/)[0])))
    ? target
    : null;
}
const authCopy = {
  login: {
    title: "Đăng nhập",
    description: "Đăng nhập để theo dõi đơn hàng và quản lý thông tin nhận hàng.",
  },
  register: {
    title: "Tạo tài khoản",
    description: "Tạo tài khoản để theo dõi đơn hàng và quản lý thông tin nhận hàng.",
  },
};
function authFormMarkup(enter = false) {
  const register = authMode === "register";
  const { title } = authCopy[authMode];
  return `<div class="u416-pn${enter ? " is-entering" : ""}">
    <form id="auth-form" class="u403-form">
      ${register ? `<div class="auth-register-row">
        <div class="u403-f">
          <input class="u403-in" id="fullName" name="fullName" autocomplete="name" required minlength="2" maxlength="100" placeholder=" ">
          <label for="fullName">Họ và tên</label>
        </div>
        <div class="u403-f">
          <input class="u403-in" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" placeholder=" ">
          <label for="phone">Số điện thoại</label>
        </div>
      </div>
      <div class="u403-f">
        <input class="u403-in" id="email" name="email" type="email" autocomplete="email" maxlength="200" aria-describedby="auth-email-hint" placeholder=" ">
        <label for="email">Email (không bắt buộc)</label>
      </div>
      <p class="auth-hint" id="auth-email-hint">Dùng email bạn kiểm soát để nhận liên kết khôi phục mật khẩu.</p>` : `<div class="u403-f">
        <input class="u403-in" id="identifier" name="identifier" autocomplete="username" required maxlength="200" aria-describedby="auth-identifier-hint" placeholder=" " spellcheck="false" autocapitalize="none">
        <label for="identifier">Tài khoản</label>
      </div>
      <p class="auth-hint" id="auth-identifier-hint">Tên đăng nhập, số điện thoại hoặc email</p>`}
      <div class="u403-f u403-pw">
        <input class="u403-in" id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="${register ? 10 : 1}" maxlength="72" ${register ? 'aria-describedby="auth-password-hint"' : ""} placeholder=" ">
        <label for="password">Mật khẩu</label>
        <button type="button" id="show-password" class="u403-eye" aria-controls="password" aria-label="Hiển thị mật khẩu" aria-pressed="false">
          <svg viewBox="0 0 20 20" aria-hidden="true"><g class="lid"><path d="M2 10s3-5.2 8-5.2S18 10 18 10s-3 5.2-8 5.2S2 10 2 10z"/><circle cx="10" cy="10" r="2.4"/></g><g class="lash"><path d="M3 10.4c2 2.4 4.4 3.4 7 3.4s5-1 7-3.4M6 13l-1 1.6M10 14v1.8M14 13l1 1.6"/></g></svg>
        </button>
      </div>
      ${register ? '<p class="auth-hint" id="auth-password-hint">Tối thiểu 10 ký tự, tối đa 72 byte UTF-8; chữ có dấu có thể chiếm nhiều byte.</p>' : '<div class="u062-row"><button type="button" id="forgot-password">Quên mật khẩu?</button></div>'}
      <p id="auth-error" class="u403-msg" role="alert"></p>
      <button type="submit" id="auth-submit" class="u403-go">
        <span>${title}</span><i aria-hidden="true"></i>
        <svg class="u403-check" viewBox="0 0 22 22" aria-hidden="true"><path d="M5.5 11.5l4 4L17 7.5"/></svg>
      </button>
      <p class="u403-live" role="status"></p>
    </form>
    <p class="form-note">${register ? "Khi đăng ký, bạn đồng ý với " : "Thông tin tài khoản được bảo vệ theo "}<a href="/chinh-sach/bao-mat">chính sách thông tin cá nhân</a>.</p>
  </div>`;
}
function authMarkup() {
  const { title, description } = authCopy[authMode];
  return `<section class="ux u062 u403 u416" data-mode="${authMode}" aria-labelledby="auth-title">
    <div class="auth-visual">
      <p class="auth-visual-label">Tài khoản Jielien</p>
      <ul class="auth-visual-features">
        <li>${icon("receipt")} Xem đơn hàng</li>
        <li>${icon("home")} Địa chỉ nhận hàng</li>
        <li>${icon("heart")} Yêu thích</li>
      </ul>
    </div>
    <div class="u062-pane">
      <div class="auth-heading">
        <span class="u062-logo" aria-hidden="true">${icon("user", { size: 22 })}</span>
        <h1 id="auth-title">${title}</h1>
        <p id="auth-description">${description}</p>
      </div>
      <div class="u416-tl" role="tablist" aria-label="Đăng nhập hoặc đăng ký">
        <span class="u416-th" aria-hidden="true"></span>
        ${Object.entries(authCopy).map(([mode, copy]) => `<button type="button" class="u416-tab" id="auth-${mode}-tab" data-auth-mode="${mode}" role="tab" aria-controls="auth-panel" aria-selected="${authMode === mode}" tabindex="${authMode === mode ? 0 : -1}">${copy.title}</button>`).join("")}
      </div>
      <div id="auth-panel" role="tabpanel" aria-labelledby="auth-${authMode}-tab">${authFormMarkup()}</div>
    </div>
  </section>`;
}
function renderAuth(focus = false) {
  root.innerHTML = authMarkup();
  if (focus) $("#identifier, #fullName")?.focus();
}
function switchAuthTab(tab) {
  const nextMode = tab.dataset.authMode;
  if (authBusy || nextMode === authMode) return;
  authMode = nextMode;
  const layout = tab.closest(".u416");
  const panel = $("#auth-panel", layout);
  const { title, description } = authCopy[authMode];
  layout.dataset.mode = authMode;
  $("#auth-title", layout).textContent = title;
  $("#auth-description", layout).textContent = description;
  for (const option of $$("[data-auth-mode]", layout)) {
    option.setAttribute("aria-selected", String(option === tab));
    option.tabIndex = option === tab ? 0 : -1;
  }
  panel.setAttribute("aria-labelledby", tab.id);
  panel.innerHTML = authFormMarkup(true);
  tab.focus({ preventScroll: true });
}
function updateAccountIdentity() {
  const name = user.fullName || user.full_name || "Bạn";
  const initials = name.trim().split(/\s+/u).slice(-2)
    .map((part) => Array.from(part)[0] || "").join("").toLocaleUpperCase("vi");
  const roles = (user.roles || []).map((role) => accountRoleLabels.get(role)).filter(Boolean);
  $("#account-avatar").textContent = initials;
  $("#account-name").textContent = name;
  $("#account-email").textContent = user.email || "Chưa thêm địa chỉ email";
  $("#account-role").textContent = roles.join(", ") || "Tài khoản Jielien";
}
function accountShell() {
  const canManage = canAccessAdmin(user);
  const navItems = accountViews.map(([view, symbol, label, href]) => {
    const text = `${icon(symbol)} ${label}`;
    return href
      ? `<a href="${href}">${text}</a>`
      : `<button type="button" data-view="${view}">${text}</button>`;
  });
  root.innerHTML = `<header class="account-heading">
    <h1>Tài khoản của bạn</h1>
    ${canManage ? '<a href="/quan-tri" class="secondary">Quản trị cửa hàng</a>' : ""}
  </header>
  <div class="account-identity">
    <span id="account-avatar" class="account-avatar" data-no-translate aria-hidden="true"></span>
    <div class="account-identity-copy">
      <p id="account-name" data-no-translate></p>
      <p id="account-email"></p>
    </div>
    <p class="account-role" id="account-role"></p>
    ${user.isDemo ? '<p class="account-demo" role="status">Tài khoản thử nghiệm. Số điện thoại và địa chỉ email chưa được xác minh.</p>' : ""}
  </div>
  <div class="account-layout">
    <div class="account-navigation">
      <button type="button" id="account-menu" aria-label="Danh mục tài khoản" aria-describedby="account-current-view" aria-controls="account-nav" aria-expanded="false">
        ${icon("menu")} <span id="account-current-view"></span> ${icon("chevronDown")}
      </button>
      <nav id="account-nav" class="account-nav" aria-label="Điều hướng tài khoản">
        ${navItems.join("")}
        <button type="button" id="logout">${icon("logout")} Đăng xuất</button>
      </nav>
    </div>
    <section id="account-content" class="panel" tabindex="-1"></section>
  </div>`;
  updateAccountIdentity();
}
function profileMarkup() {
  return `<div class="content-header"><div><h2>Thông tin tài khoản</h2><p>Cập nhật họ tên và địa chỉ email của bạn.</p></div></div><form id="profile-form"><div class="fields"><div class="field"><label for="profile-name">Họ và tên</label><input id="profile-name" name="fullName" required minlength="2" maxlength="100" value="${escape(user.fullName)}" autocomplete="name"></div><div class="field"><label for="profile-phone">Số điện thoại đăng nhập</label><input id="profile-phone" class="readonly-field" aria-describedby="profile-phone-help" readonly value="${escape(user.phone)}"><small id="profile-phone-help" class="readonly-note">${icon("lock", { size: 15 })} Không thể thay đổi</small></div><div class="field full"><label for="profile-email">Email</label><input id="profile-email" name="email" type="email" maxlength="200" value="${escape(user.email || "")}" autocomplete="email"></div><div class="field full"><label for="profile-password">Mật khẩu hiện tại khi đổi email</label><input id="profile-password" aria-describedby="profile-password-help" name="currentPassword" type="password" autocomplete="current-password"><small id="profile-password-help">Chỉ cần nhập khi thay đổi hoặc xóa email.</small></div></div><div id="profile-error" class="form-error" role="alert"></div><button class="primary">Lưu thông tin</button></form>`;
}
function securityMarkup() {
  return `<div class="content-header"><div><h2>Đổi mật khẩu</h2><p>Sau khi đổi, các phiên đăng nhập sẽ được đăng xuất để bảo vệ tài khoản.</p></div></div><form id="password-form"><div class="field"><label for="current-password">Mật khẩu hiện tại</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">Mật khẩu mới</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="72"><small>Tối thiểu 10 ký tự, tối đa 72 byte UTF-8.</small></div><div class="field"><label for="confirm-password">Nhập lại mật khẩu mới</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></div><div id="password-error" class="form-error" role="alert"></div><button class="primary">Đổi mật khẩu</button></form>`;
}
function orderOverview(orders) {
  const counts = { pending: 0, processing: 0, shipped: 0, delivered: 0 };
  for (const { status } of orders) {
    const group = status === "confirmed" ? "processing" : status;
    if (Object.hasOwn(counts, group)) counts[group]++;
  }
  const labels = [
    ["pending", "clock", "Chờ xác nhận"],
    ["processing", "box", "Đang xử lý"],
    ["shipped", "truck", "Đang giao"],
    ["delivered", "check", "Hoàn thành"],
  ];
  return `<div class="account-order-summary" role="group" aria-label="Tổng quan đơn hàng">${labels.map(([status, symbol, title]) =>
    `<article class="account-order-stat">${icon(symbol)}<h3>${title}</h3><strong>${counts[status]}</strong></article>`
  ).join("")}</div>`;
}
function orderCard(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return `<article class="order-card"><div class="order-card-header"><div><h3>Đơn hàng ${escape(order.id)}</h3><small>${date(order.createdAt)}</small></div>${badge(order.status)}</div><div class="order-card-items">${items
    .slice(0, 2)
    .map(
      (item) =>
        `<div class="order-preview"><img src="${escape(item.image)}" alt="" width="45" height="45" loading="lazy" decoding="async"><span>${escape(item.name)}<b>${escape(item.quantity)} × ${money(item.price)}</b></span></div>`,
    )
    .join(
      "",
    )}${items.length > 2 ? `<span class="small muted">Và ${items.length - 2} sản phẩm khác</span>` : ""}</div><div class="order-card-footer"><span>Tổng cộng <strong>${money(order.total)}</strong></span><button class="secondary" data-order="${escape(order.id)}">Xem chi tiết</button></div></article>`;
}
function addressValue(address, camel, snake) {
  return address[camel] ?? address[snake] ?? "";
}
function addressesMarkup(addresses) {
  return `<div class="content-header"><div><h2>Địa chỉ nhận hàng</h2><p>Thêm địa chỉ để chuẩn bị cho những lần mua sắm sau.</p></div></div><div class="address-list">${addresses.length ? addresses.map((address) => `<article class="address-card"><h3>${escape(addressValue(address, "recipientName", "recipient_name"))}${addressValue(address, "isDefault", "is_default") ? '<span class="badge active">Mặc định</span>' : ""}</h3><div class="address-actions"><button class="secondary" type="button" data-edit-address="${escape(address.id)}">Sửa</button><button class="secondary" type="button" data-delete-address="${escape(address.id)}">Xóa</button></div><p>${escape(address.phone)}</p><p>${escape(addressValue(address, "addressDetail", "address_detail"))}</p><p>${escape(address.district || addressValue(address, "wardCode", "ward_code"))}${(address.district || addressValue(address, "wardCode", "ward_code")) && (address.province || addressValue(address, "provinceCode", "province_code")) ? ", " : ""}${escape(address.province || addressValue(address, "provinceCode", "province_code"))}</p></article>`).join("") : '<p class="muted small">Bạn chưa lưu địa chỉ nhận hàng nào.</p>'}</div><form id="address-form" class="address-form"><input type="hidden" name="id" id="address-id" value=""><h3>Thêm địa chỉ mới</h3><div class="fields"><div class="field"><label for="recipientName">Họ tên người nhận <span class="required">*</span></label><input id="recipientName" name="recipientName" required minlength="2" maxlength="100" autocomplete="name" value="${escape(user.fullName || user.full_name || "")}"></div><div class="field"><label for="addressPhone">Số điện thoại <span class="required">*</span></label><input id="addressPhone" name="phone" type="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" autocomplete="tel" value="${escape(user.phone || "")}"></div><div class="field"><label for="addressProvince">Tỉnh / Thành phố <span class="required">*</span></label><input id="addressProvince" name="province" required maxlength="100" autocomplete="address-level1" placeholder="Tỉnh / thành phố nhận hàng"></div><div class="field"><label for="addressDistrict">Phường / Xã <span class="required">*</span></label><input id="addressDistrict" name="district" required maxlength="100" autocomplete="address-level2" placeholder="Phường / xã nhận hàng"></div><div class="field full"><label for="addressDetail">Địa chỉ chi tiết <span class="required">*</span></label><input id="addressDetail" name="addressDetail" required minlength="5" maxlength="250" autocomplete="street-address" placeholder="Số nhà, tên đường"></div></div><label class="check-label"><input type="checkbox" name="isDefault"> Đặt làm địa chỉ mặc định</label><div id="address-error" class="form-error" role="alert"></div><button class="primary" style="margin-top:15px">Lưu địa chỉ</button></form>`;
}
async function renderView(view, focus = true) {
  activeView = accountViews.some(([key, , , href]) => key === view && !href)
    ? view
    : "profile";
  const version = ++viewVersion;
  const content = $("#account-content");
  if (!content) return;
  $$("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
    if (button.dataset.view === activeView)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#account-current-view").textContent = accountViews.find(([key]) => key === activeView)[2];
  $("#account-menu").setAttribute("aria-expanded", "false");
  content.setAttribute("aria-busy", "true");
  if (activeView === "orders" || activeView === "addresses")
    content.innerHTML = '<div class="loading" role="status">Đang tải thông tin…</div>';
  try {
    let html;
    if (activeView === "profile") html = profileMarkup();
    else if (activeView === "security") html = securityMarkup();
    else if (activeView === "notifications") {
      html = '<div class="content-header"><div><h2>Thông báo</h2><p>Thông báo trong tài khoản chưa khả dụng. Bạn có thể xem trạng thái mua hàng trong mục Đơn hàng.</p></div></div><button class="secondary" type="button" data-open-orders>Xem đơn hàng</button>';
    } else if (activeView === "orders") {
      const { orders = [] } = await api("/api/account/orders");
      html = `<div class="content-header"><div><h2>Đơn hàng</h2><p>Tổng quan theo lịch sử hiển thị của tài khoản.</p></div></div>${orderOverview(orders)}${orders.length ? `<div class="order-list">${orders.map(orderCard).join("")}</div>` : empty("Chưa có đơn hàng nào", "Các đơn đặt từ tài khoản này sẽ hiển thị tại đây.", "/san-pham")}`;
    } else {
      const { addresses = [] } = await api("/api/account/addresses");
      addressRows = addresses;
      html = addressesMarkup(addresses);
    }
    if (version !== viewVersion) return;
    content.innerHTML = html;
    if (focus) {
      const heading = $("h2", content);
      heading?.setAttribute("tabindex", "-1");
      (heading || content).focus();
    }
  } catch (error) {
    if (version === viewVersion)
      content.innerHTML = `<div class="form-error" role="alert">${escape(error.message)}</div><button class="secondary" id="retry-view">Thử tải lại</button>`;
  } finally {
    if (version === viewVersion) content.removeAttribute("aria-busy");
  }
}
async function submitAuth(form) {
  if (authBusy || !form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const errorBox = $("#auth-error", form);
  const status = $(".u403-live", form);
  errorBox.textContent = "";
  form.classList.remove("is-invalid");
  if (
    authMode === "register" &&
    new TextEncoder().encode(data.password).byteLength > 72
  ) {
    errorBox.textContent =
      "Mật khẩu tối đa 72 byte UTF-8. Bạn hãy chọn mật khẩu ngắn hơn.";
    return;
  }
  authBusy = true;
  const button = $("#auth-submit", form);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  status.textContent = "Đang xử lý…";
  try {
    const result = await api("/api/auth/" + authMode, {
      method: "POST",
      body: data,
    });
    if (form.isConnected && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      button.removeAttribute("aria-busy");
      button.classList.add("is-ok");
      status.textContent = authMode === "register" ? "Đã tạo tài khoản." : "Đăng nhập thành công.";
      await new Promise((resolve) => setTimeout(resolve, 340));
    }
    await completeAuth(result);
  } catch (error) {
    if (form.isConnected) {
      errorBox.textContent = error.message;
      if (authMode === "login" && error.status === 401) form.classList.add("is-invalid");
    }
  } finally {
    authBusy = false;
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.classList.remove("is-ok");
      status.textContent = "";
    }
  }
}
function orderDetail(order) {
  const c = order.customer || {};
  return `<div class="detail-split"><div><h3>Người nhận</h3><p><b>${escape(c.name)}</b></p><p>${escape(c.phone)}</p><p>${escape(c.address)}</p><p>${escape(c.district)}, ${escape(c.province)}</p></div><div><h3>Thông tin đơn</h3><p>${escape(order.id)}</p><p>${date(order.createdAt)}</p><p>${badge(order.status)}</p><p>Thanh toán: ${order.payment === "bank_transfer" ? "Chuyển khoản ngân hàng / VietQR" : "Thanh toán khi nhận hàng"}</p><p>${order.paymentStatus === "paid" ? "Đã ghi nhận thu tiền" : "Chưa ghi nhận thu tiền"}</p></div></div>${(order.items || []).map((item) => `<div class="order-preview"><img src="${escape(item.image)}" alt="" width="45" height="45" loading="lazy" decoding="async"><span>${escape(item.name)}<b>${escape(item.quantity)} × ${money(item.price)}</b></span><strong class="small">${money(item.lineTotal)}</strong></div>`).join("")}<div class="total-row"><span>Tiền hàng</span><b>${money(order.subtotal)}</b></div><div class="total-row"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="total-row"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="total-row grand"><span>Tổng cộng</span><b>${money(order.total)}</b></div>${order.payment === "bank_transfer" && order.paymentStatus !== "paid" && order.status !== "cancelled" ? `<p><a class="secondary" href="/don-hang/${encodeURIComponent(order.id)}">Xem VietQR và thông tin chuyển khoản</a></p>` : ""}${order.note ? `<p class="dialog-note">Ghi chú: ${escape(order.note)}</p>` : ""}`;
}
async function openOrder(id) {
  $("#order-dialog-title").textContent = "Đơn hàng " + id;
  $("#order-dialog-content").innerHTML =
    '<div class="loading">Đang tải đơn hàng…</div>';
  $("#order-dialog").showModal();
  try {
    const { order } = await api("/api/orders/" + encodeURIComponent(id));
    $("#order-dialog-content").innerHTML = orderDetail(order);
  } catch (error) {
    $("#order-dialog-content").innerHTML =
      `<div class="form-error" role="alert">${escape(error.message)}</div>`;
  }
}
root.addEventListener("submit", async (event) => {
  event.preventDefault();
  if(event.target.id==='recovery-form'){
    const form=event.target,button=form.querySelector('button'),error=$('#recovery-error');
    if(button.disabled||!form.reportValidity())return;
    const data=Object.fromEntries(new FormData(form));error.textContent='';
    if(recoveryMode==='reset'&&(data.newPassword!==data.confirmation||new TextEncoder().encode(data.newPassword).byteLength>72)){error.textContent='Mật khẩu nhập lại phải khớp; tối đa 72 byte UTF-8.';return;}
    button.disabled=true;
    try{
      if(recoveryMode==='reset'){
        await api('/api/auth/password/reset',{method:'POST',body:{token:resetToken,newPassword:data.newPassword}});
        resetToken=null;recoveryMode=null;user=null;csrfToken='';authMode='login';history.replaceState(null,'',location.pathname);renderAuth();notify('Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.');
      }else{
        const result=await api('/api/auth/password/forgot',{method:'POST',body:{identifier:data.identifier}});$('#recovery-message').textContent=result.message;
      }
    }catch(e){if(error.isConnected)error.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
    return;
  }
  if (["profile-form", "password-form"].includes(event.target.id)) {
    const form = event.target;
    if (!form.reportValidity()) return;
    const profile = form.id === "profile-form";
    const errorBox = $(profile ? "#profile-error" : "#password-error");
    const data = Object.fromEntries(new FormData(form));
    const button = $("button", form);
    if (button.disabled) return;
    errorBox.textContent = "";
    if (
      !profile &&
      (data.newPassword !== data.confirmation ||
        new TextEncoder().encode(data.newPassword).byteLength > 72)
    ) {
      errorBox.textContent =
        data.newPassword !== data.confirmation
          ? "Mật khẩu nhập lại chưa khớp."
          : "Mật khẩu tối đa 72 byte UTF-8.";
      return;
    }
    button.disabled = true;
    try {
      if (profile) {
        const result = await api("/api/account/profile", {
          method: "PATCH",
          body: data,
        });
        if (!user || user.id !== result.user.id) return;
        user = result.user;
        updateAccountIdentity();
        if (form.isConnected) {
          form.elements.fullName.value = user.fullName || "";
          form.elements.email.value = user.email || "";
          form.elements.currentPassword.value = "";
        }
        notify("Đã lưu thông tin tài khoản.");
      } else {
        await api("/api/account/password", {
          method: "POST",
          body: {
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
          },
        });
        user = null;
        csrfToken = "";
        localStorage.removeItem("jielien-cart-v2");
        localStorage.removeItem("jielien-cart-owner");
        authMode = "login";
        renderAuth(true);
        notify("Đã đổi mật khẩu. Bạn hãy đăng nhập lại bằng mật khẩu mới.");
      }
    } catch (error) {
      if (errorBox.isConnected) errorBox.textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
    return;
  }
  if (event.target.id === "auth-form") await submitAuth(event.target);
  if (event.target.getAttribute("id") === "address-form") {
    const form = event.target;
    if (!form.reportValidity()) return;
    const button = $("button", form);
    if (button.disabled) return;
    button.disabled = true;
    $("#address-error").textContent = "";
    const data = Object.fromEntries(new FormData(form));
    data.isDefault = Boolean(data.isDefault);
    if (data.id) data.id = Number(data.id);
    else delete data.id;
    try {
      await api("/api/account/addresses", { method: "POST", body: data });
      await renderView("addresses", false);
      notify("Đã lưu địa chỉ nhận hàng.");
    } catch (error) {
      if ($("#address-error")) $("#address-error").textContent = error.message;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }
});
root.addEventListener('click',event=>{
  if(event.target.id==='forgot-password'&&!authBusy){recoveryMode='forgot';resetToken=null;renderRecovery();}
  if(event.target.id==='back-to-login'){recoveryMode=null;resetToken=null;authMode='login';history.replaceState(null,'',location.pathname);renderAuth(true);}
});
root.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-address]");
  if (edit) {
    const address = addressRows.find(
      (a) => a.id === Number(edit.dataset.editAddress),
    );
    const form = $("#address-form");
    if (!address || !form) return;
    for (const [key, value] of Object.entries({
      id: address.id,
      recipientName: address.recipientName,
      phone: address.phone,
      province: address.province,
      district: address.district,
      addressDetail: address.addressDetail,
    })) {
      const input = form.elements.namedItem(key);
      if (input) input.value = value || "";
    }
    form.elements.namedItem("isDefault").checked = address.isDefault;
    $("h3", form).textContent = "Sửa địa chỉ";
    $("button", form).textContent = "Lưu thay đổi";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#recipientName").focus({ preventScroll: true });
  }
  const remove = event.target.closest("[data-delete-address]");
  if (remove) {
    if (remove.disabled) return;
    remove.disabled = true;
    try {
      await api("/api/account/addresses/" + remove.dataset.deleteAddress, {
        method: "DELETE",
      });
      await renderView("addresses", false);
      notify("Đã xóa địa chỉ.");
    } catch (error) {
      notify(error.message);
      remove.disabled = false;
    }
  }
});
root.addEventListener("click", async (event) => {
  const toggle = event.target.closest("#show-password");
  if (toggle) {
    const show = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.form.elements.password.type = show ? "text" : "password";
    return;
  }
  const authTab = event.target.closest("[data-auth-mode]");
  if (authTab) {
    switchAuthTab(authTab);
    return;
  }
  const menu = event.target.closest("#account-menu");
  if (menu) {
    menu.setAttribute("aria-expanded", String(menu.getAttribute("aria-expanded") !== "true"));
    return;
  }
  const view = event.target.closest("[data-view]");
  if (view) {
    renderView(view.dataset.view);
    return;
  }
  if (event.target.closest("[data-open-orders]")) {
    renderView("orders");
    return;
  }
  const order = event.target.closest("[data-order]");
  if (order) {
    openOrder(order.dataset.order);
    return;
  }
  if (event.target.closest("#retry-view")) renderView(activeView);
  if (event.target.closest("#retry-auth")) init();
  const logout = event.target.closest("#logout");
  if (logout) {
    await logoutSession({ button: logout, api, notify, onSignedOut() {
      user = null;
      csrfToken = "";
      renderAuth(true);
    } });
  }
});
root.addEventListener("input", (event) => {
  const form = event.target.closest("#auth-form.is-invalid");
  if (form) {
    form.classList.remove("is-invalid");
    $("#auth-error", form).textContent = "";
  }
});
root.addEventListener("keydown", (event) => {
  const menu = $("#account-menu");
  if (event.key === "Escape" && menu?.getAttribute("aria-expanded") === "true" && event.target.closest(".account-navigation")) {
    menu.setAttribute("aria-expanded", "false");
    menu.focus();
    return;
  }
  if (
    event.target.matches("[data-auth-mode]") &&
    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
  ) {
    event.preventDefault();
    const tabs = $$("[data-auth-mode]");
    const index = tabs.indexOf(event.target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
    tabs[next].click();
  }
});
$("#order-dialog").addEventListener("click", (event) => {
  if (event.target.closest("[data-close-dialog]")) $("#order-dialog").close();
});
async function init() {
  if(recoveryMode){renderRecovery();return;}
  root.innerHTML =
    '<div class="loading" role="status">Đang kiểm tra phiên đăng nhập…</div>';
  try {
    const result = await api("/api/auth/me");
    user = result.user;
    csrfToken = result.csrfToken || "";
    accountShell();
    await renderView("profile", false);
  } catch (error) {
    if (error.status === 401) {
      user = null;
      csrfToken = "";
      renderAuth();
    } else
      root.innerHTML = `<section class="panel access-panel"><h1>Chưa tải được tài khoản</h1><p>${escape(error.message)}</p><button class="primary" id="retry-auth">Thử lại</button></section>`;
  }
}
init();
