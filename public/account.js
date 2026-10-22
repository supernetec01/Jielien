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
    throw new Error("Máy chủ chưa trả lời đúng định dạng. Mẹ thử lại nhé.");
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
  return `<div class="empty"><span class="empty-icon" aria-hidden="true">♡</span><h3>${escape(title)}</h3><p>${escape(text)}</p>${link ? `<a class="primary" href="${escape(link)}">Khám phá sản phẩm →</a>` : ""}</div>`;
}
function safeRedirect() {
  const target = new URLSearchParams(location.search).get("redirect");
  return ["/quan-tri", "/thanh-toan", "/gio-hang", "/"].includes(target)
    ? target
    : null;
}
function authMarkup() {
  return `<section class="auth-layout"><div class="auth-intro"><span class="eyebrow">MẸ AN TÂM · BÉ KHÔN LỚN</span><h1>Mỗi lần ghé,<br>thêm một chút<br>yêu thương.</h1><p>Đăng nhập để quản lý địa chỉ nhận hàng<br>và theo dõi những đơn hàng của mẹ.</p><div class="auth-heart" aria-hidden="true">♡</div><div class="intro-list">✓ Lưu địa chỉ cho những lần mua sau<br>✓ Xem lịch sử và trạng thái đơn hàng<br>✓ Thông tin cá nhân được quản lý trong tài khoản</div></div><div class="auth-form-panel"><div class="tabs" role="tablist" aria-label="Đăng nhập hoặc đăng ký"><button class="${authMode === "login" ? "active" : ""}" id="auth-login-tab" data-auth-mode="login" role="tab" aria-controls="auth-panel" aria-selected="${authMode === "login"}" tabindex="${authMode === "login" ? 0 : -1}">Đăng nhập</button><button class="${authMode === "register" ? "active" : ""}" id="auth-register-tab" data-auth-mode="register" role="tab" aria-controls="auth-panel" aria-selected="${authMode === "register"}" tabindex="${authMode === "register" ? 0 : -1}">Tạo tài khoản</button></div><div id="auth-panel" role="tabpanel" aria-labelledby="auth-${authMode}-tab"><form id="auth-form">${authMode === "register" ? '<div class="field"><label for="fullName">Họ và tên <span class="required">*</span></label><input id="fullName" name="fullName" autocomplete="name" required minlength="2" maxlength="100" placeholder="Tên của mẹ"></div><div class="field"><label for="phone">Số điện thoại <span class="required">*</span></label><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" placeholder="09xxxxxxxx"></div><div class="field"><label for="email">Email (không bắt buộc)</label><input id="email" name="email" type="email" autocomplete="email" maxlength="200" placeholder="Email của mẹ"></div>' : '<div class="field"><label for="identifier">Số điện thoại hoặc email</label><input id="identifier" name="identifier" autocomplete="username" required maxlength="200" placeholder="Số điện thoại / email đã đăng ký"></div>'}<div class="field"><label for="password">Mật khẩu <span class="required">*</span></label><input id="password" name="password" type="password" autocomplete="${authMode === "register" ? "new-password" : "current-password"}" required minlength="${authMode === "register" ? 10 : 1}" maxlength="72" placeholder="${authMode === "register" ? "Tối thiểu 10 ký tự" : "Mật khẩu của mẹ"}">${authMode === "register" ? "<small>Tối thiểu 10 ký tự, tối đa 72 byte UTF-8; chữ có dấu có thể chiếm nhiều byte.</small>" : ""}</div><label class="check-label"><input type="checkbox" id="show-password"> Hiển thị mật khẩu</label><div id="auth-error" class="form-error" role="alert"></div><button class="primary" id="auth-submit">${authMode === "register" ? "Tạo tài khoản →" : "Đăng nhập →"}</button></form><p class="form-note">${authMode === "register" ? "Khi đăng ký, mẹ đồng ý với " : "Thông tin tài khoản được bảo vệ theo "}<a href="/chinh-sach/bao-mat">chính sách thông tin cá nhân</a>. Không dùng mật khẩu của dịch vụ khác cho tài khoản thử nghiệm.</p></div></div></section>`;
}
function renderAuth(focus = false) {
  root.innerHTML = authMarkup();
  if (focus) $("#identifier, #fullName")?.focus();
}
function accountShell() {
  const canManage = (user.permissions || []).some((permission) =>
    [
      "catalog.manage",
      "orders.manage",
      "inventory.manage",
      "audit.read",
    ].includes(permission),
  );
  root.innerHTML = `<div class="account-banner"><div><h1>Chào ${escape(user.fullName || user.full_name || "mẹ")} ♡</h1><p>Mọi thông tin mua sắm của mẹ, ở cùng một nơi.</p></div><div class="actions">${canManage ? '<a href="/quan-tri" class="secondary">Quản trị cửa hàng ↗</a>' : ""}<button class="secondary" id="logout">Đăng xuất</button></div></div><div class="account-layout"><nav class="panel side-nav" aria-label="Mục tài khoản"><button data-view="profile" class="active">◎ Thông tin tài khoản</button><button data-view="orders">▤ Đơn hàng của mẹ</button><button data-view="addresses">⌂ Địa chỉ nhận hàng</button><button data-view="security">♢ Đổi mật khẩu</button></nav><section id="account-content" class="panel" tabindex="-1" aria-live="polite"></section></div>`;
}
function profileMarkup() {
  return `<div class="content-header"><div><h2>Thông tin tài khoản</h2><p>Mẹ có thể cập nhật thông tin liên hệ tại đây.</p></div></div><form id="profile-form"><div class="fields"><div class="field"><label for="profile-name">Họ và tên</label><input id="profile-name" name="fullName" required minlength="2" maxlength="100" value="${escape(user.fullName)}" autocomplete="name"></div><div class="field"><label for="profile-phone">Số điện thoại đăng nhập</label><input id="profile-phone" readonly value="${escape(user.phone)}"><small>Số điện thoại đăng nhập hiện được giữ nguyên.</small></div><div class="field full"><label for="profile-email">Email</label><input id="profile-email" name="email" type="email" maxlength="200" value="${escape(user.email || "")}" autocomplete="email"></div><div class="field full"><label for="profile-password">Mật khẩu hiện tại khi đổi email</label><input id="profile-password" name="currentPassword" type="password" autocomplete="current-password"><small>Chỉ cần nhập khi thay đổi hoặc xóa email.</small></div></div><div id="profile-error" class="form-error" role="alert"></div><button class="primary">Lưu thông tin</button></form>`;
}
function securityMarkup() {
  return `<div class="content-header"><div><h2>Đổi mật khẩu</h2><p>Sau khi đổi, các phiên đăng nhập sẽ được đăng xuất để bảo vệ tài khoản.</p></div></div><form id="password-form"><div class="field"><label for="current-password">Mật khẩu hiện tại</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="new-password">Mật khẩu mới</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="72"><small>Tối thiểu 10 ký tự, tối đa 72 byte UTF-8.</small></div><div class="field"><label for="confirm-password">Nhập lại mật khẩu mới</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" required minlength="10" maxlength="72"></div><div id="password-error" class="form-error" role="alert"></div><button class="primary">Đổi mật khẩu</button></form>`;
}
function orderCard(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return `<article class="order-card"><div class="order-card-header"><div><b>${escape(order.id)}</b><small>${date(order.createdAt)}</small></div>${badge(order.status)}</div><div class="order-card-items">${items
    .slice(0, 2)
    .map(
      (item) =>
        `<div class="order-preview"><img src="${escape(item.image)}" alt=""><span>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></span></div>`,
    )
    .join(
      "",
    )}${items.length > 2 ? `<span class="small muted">Và ${items.length - 2} sản phẩm khác</span>` : ""}</div><div class="order-card-footer"><span>Tổng cộng <strong>${money(order.total)}</strong></span><button class="secondary" data-order="${escape(order.id)}">Xem chi tiết</button></div></article>`;
}
function addressValue(address, camel, snake) {
  return address[camel] ?? address[snake] ?? "";
}
function addressesMarkup(addresses) {
  return `<div class="content-header"><div><h2>Địa chỉ nhận hàng</h2><p>Thêm địa chỉ để chuẩn bị cho những lần mua sắm sau.</p></div></div><div class="address-list">${addresses.length ? addresses.map((address) => `<article class="address-card"><h3>${escape(addressValue(address, "recipientName", "recipient_name"))}${addressValue(address, "isDefault", "is_default") ? '<span class="badge active">Mặc định</span>' : ""}</h3><div class="address-actions"><button class="secondary" type="button" data-edit-address="${address.id}">Sửa</button><button class="secondary" type="button" data-delete-address="${address.id}">Xóa</button></div><p>${escape(address.phone)}</p><p>${escape(addressValue(address, "addressDetail", "address_detail"))}</p><p>${escape(address.district || addressValue(address, "wardCode", "ward_code"))}${(address.district || addressValue(address, "wardCode", "ward_code")) && (address.province || addressValue(address, "provinceCode", "province_code")) ? ", " : ""}${escape(address.province || addressValue(address, "provinceCode", "province_code"))}</p></article>`).join("") : '<p class="muted small">Mẹ chưa lưu địa chỉ nhận hàng nào.</p>'}</div><form id="address-form" class="address-form"><input type="hidden" name="id" id="address-id" value=""><h3>Thêm địa chỉ mới</h3><div class="fields"><div class="field"><label for="recipientName">Họ tên người nhận <span class="required">*</span></label><input id="recipientName" name="recipientName" required minlength="2" maxlength="100" autocomplete="name" value="${escape(user.fullName || user.full_name || "")}"></div><div class="field"><label for="addressPhone">Số điện thoại <span class="required">*</span></label><input id="addressPhone" name="phone" type="tel" required pattern="(?:0|\\+84)[35789][0-9]{8}" maxlength="12" autocomplete="tel" value="${escape(user.phone || "")}"></div><div class="field"><label for="addressProvince">Tỉnh / Thành phố <span class="required">*</span></label><input id="addressProvince" name="province" required maxlength="100" autocomplete="address-level1" placeholder="Tỉnh / thành phố nhận hàng"></div><div class="field"><label for="addressDistrict">Phường / Xã <span class="required">*</span></label><input id="addressDistrict" name="district" required maxlength="100" autocomplete="address-level2" placeholder="Phường / xã nhận hàng"></div><div class="field full"><label for="addressDetail">Địa chỉ chi tiết <span class="required">*</span></label><input id="addressDetail" name="addressDetail" required minlength="5" maxlength="250" autocomplete="street-address" placeholder="Số nhà, tên đường"></div></div><label class="check-label"><input type="checkbox" name="isDefault"> Đặt làm địa chỉ mặc định</label><div id="address-error" class="form-error" role="alert"></div><button class="primary" style="margin-top:15px">Lưu địa chỉ →</button></form>`;
}
async function renderView(view, focus = true) {
  activeView = ["profile", "orders", "addresses", "security"].includes(view)
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
  content.setAttribute("aria-busy", "true");
  content.innerHTML = '<div class="loading">Đang tải thông tin…</div>';
  try {
    let html;
    if (activeView === "profile") html = profileMarkup();
    else if (activeView === "security") html = securityMarkup();
    else if (activeView === "orders") {
      const { orders = [] } = await api("/api/account/orders");
      html = `<div class="content-header"><div><h2>Đơn hàng của mẹ</h2><p>Những đơn hàng được đặt khi đăng nhập tài khoản này.</p></div></div>${orders.length ? `<div class="order-list">${orders.map(orderCard).join("")}</div>` : empty("Chưa có đơn hàng nào", "Mẹ bắt đầu chọn những món đồ cho bé yêu nhé.", "/san-pham")}`;
    } else {
      const { addresses = [] } = await api("/api/account/addresses");
      addressRows = addresses;
      html = addressesMarkup(addresses);
    }
    if (version !== viewVersion) return;
    content.innerHTML = html;
    if (focus) content.focus({ preventScroll: true });
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
  const errorBox = $("#auth-error");
  errorBox.textContent = "";
  if (
    authMode === "register" &&
    new TextEncoder().encode(data.password).byteLength > 72
  ) {
    errorBox.textContent =
      "Mật khẩu tối đa 72 byte UTF-8. Mẹ chọn mật khẩu ngắn hơn một chút nhé.";
    return;
  }
  authBusy = true;
  const button = $("#auth-submit");
  button.disabled = true;
  button.textContent = "Đang xử lý…";
  try {
    const result = await api("/api/auth/" + authMode, {
      method: "POST",
      body: data,
    });
    user = result.user;
    csrfToken = result.csrfToken || "";
    const redirect = safeRedirect();
    if (redirect) {
      location.assign(redirect);
      return;
    }
    accountShell();
    await renderView("profile");
    notify(
      authMode === "register"
        ? "Đã tạo tài khoản cho mẹ."
        : "Chào mừng mẹ quay lại.",
    );
  } catch (error) {
    if ($("#auth-error")) $("#auth-error").textContent = error.message;
  } finally {
    authBusy = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent =
        authMode === "register" ? "Tạo tài khoản →" : "Đăng nhập →";
    }
  }
}
function orderDetail(order) {
  const c = order.customer || {};
  return `<div class="detail-split"><div><h3>Người nhận</h3><p><b>${escape(c.name)}</b></p><p>${escape(c.phone)}</p><p>${escape(c.address)}</p><p>${escape(c.district)}, ${escape(c.province)}</p></div><div><h3>Thông tin đơn</h3><p>${escape(order.id)}</p><p>${date(order.createdAt)}</p><p>${badge(order.status)}</p><p>Thanh toán: ${order.payment === "bank_transfer" ? "Chuyển khoản ngân hàng / VietQR" : "COD"}</p><p>${order.paymentStatus === "paid" ? "Đã ghi nhận thu tiền" : "Chưa ghi nhận thu tiền"}</p></div></div>${(order.items || []).map((item) => `<div class="order-preview"><img src="${escape(item.image)}" alt=""><span>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></span><strong class="small">${money(item.lineTotal)}</strong></div>`).join("")}<div class="total-row"><span>Tiền hàng</span><b>${money(order.subtotal)}</b></div><div class="total-row"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="total-row"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="total-row grand"><span>Tổng cộng</span><b>${money(order.total)}</b></div>${order.payment === "bank_transfer" && order.paymentStatus !== "paid" && order.status !== "cancelled" ? `<p><a class="secondary" href="/don-hang/${encodeURIComponent(order.id)}">Xem VietQR và thông tin chuyển khoản →</a></p>` : ""}${order.note ? `<p class="dialog-note">Ghi chú: ${escape(order.note)}</p>` : ""}`;
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
        user = result.user;
        await renderView("profile", false);
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
        notify("Đã đổi mật khẩu. Mẹ đăng nhập lại bằng mật khẩu mới nhé.");
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
  const authTab = event.target.closest("[data-auth-mode]");
  if (authTab && !authBusy) {
    authMode = authTab.dataset.authMode;
    renderAuth();
    $("#auth-" + authMode + "-tab").focus();
    return;
  }
  const view = event.target.closest("[data-view]");
  if (view) {
    renderView(view.dataset.view);
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
    logout.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      localStorage.removeItem("jielien-cart-v2");
      localStorage.removeItem("jielien-cart-owner");
      user = null;
      csrfToken = "";
      renderAuth();
      notify("Đã đăng xuất.");
    } catch (error) {
      notify(error.message);
      logout.disabled = false;
    }
  }
});
root.addEventListener("change", (event) => {
  if (event.target.id === "show-password")
    $("#password").type = event.target.checked ? "text" : "password";
});
root.addEventListener("keydown", (event) => {
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
