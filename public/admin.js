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
  active: "Đang bán",
  inactive: "Ngừng bán",
  draft: "Bản nháp",
};
const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};
const sections = [
  { id: "dashboard", label: "◫ Tổng quan", permission: null },
  { id: "products", label: "▦ Sản phẩm & SKU", permission: "catalog.manage" },
  { id: "orders", label: "▤ Đơn hàng", permission: "orders.manage" },
  {
    id: "inventory",
    label: "⌂ Kho & tồn hàng",
    permission: "inventory.manage",
  },
  { id: "audit", label: "☷ Nhật ký thao tác", permission: "audit.read" },
];
const root = $("#admin-main");
let user = null;
let csrfToken = "";
let activeView = "dashboard";
let viewVersion = 0;
let notificationTimer;
let productRows = [];
let orderRows = [];
let inventoryRows = [];
let auditRows = [];
let dialogType = "";
let dialogItem = null;
let mutationBusy = false;
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
function has(permission) {
  return !permission || (user?.permissions || []).includes(permission);
}
function statusLabel(status) {
  return statusNames[status] || status || "Chưa xác định";
}
function badge(status) {
  return `<span class="badge ${Object.hasOwn(statusNames, status) ? status : ""}">${escape(statusLabel(status))}</span>`;
}
function noRows(cols, text = "Chưa có dữ liệu phù hợp.") {
  return `<tr><td colspan="${cols}" class="table-empty">${escape(text)}</td></tr>`;
}
function gate(message, login = false) {
  root.innerHTML = `<section class="panel access-panel"><span class="access-icon" aria-hidden="true">♢</span><h1>${login ? "Đăng nhập để quản lý cửa hàng" : "Tài khoản chưa có quyền quản trị"}</h1><p>${escape(message)}</p><a href="/tai-khoan${login ? "?redirect=%2Fquan-tri" : ""}" class="primary">${login ? "Đăng nhập →" : "Về tài khoản"}</a><p class="small">Quyền truy cập được cấp bởi người vận hành. Đăng ký tài khoản khách hàng không tự cấp quyền quản trị.</p></section>`;
}
function shell() {
  root.innerHTML = `<div class="admin-layout"><aside class="admin-sidebar"><nav class="panel side-nav" aria-label="Mục quản trị"><span class="section-caption">VẬN HÀNH CỬA HÀNG</span>${sections
    .filter((section) => has(section.permission))
    .map(
      (section) =>
        `<button data-section="${section.id}" class="${activeView === section.id ? "active" : ""}">${section.label}</button>`,
    )
    .join(
      "",
    )}<div class="admin-user"><b>${escape(user.fullName || user.full_name)}</b>${escape(user.email || user.phone || "Tài khoản quản trị")}</div></nav></aside><section id="admin-content" tabindex="-1" aria-live="polite"></section></div>`;
}
function header(title, text, button = "") {
  return `<div class="content-header"><div><h1>${title}</h1><p>${text}</p></div>${button}</div>`;
}
function refreshButton() {
  return '<button class="secondary" id="refresh-view">↻ Làm mới</button>';
}
function dashboardMarkup(stats) {
  return `${header("Tổng quan cửa hàng", "Theo dõi đơn hàng và tình trạng hàng hóa.", refreshButton())}<div class="stats-grid"><article class="stat-card"><span>ĐƠN HÀNG</span><strong>${Number(stats.orders || 0).toLocaleString("vi-VN")}</strong><em>Đơn đã được ghi nhận</em></article><article class="stat-card"><span>DOANH SỐ</span><strong style="font-size:23px">${money(stats.revenue)}</strong><em>Theo dữ liệu đơn hàng máy chủ</em></article><article class="stat-card"><span>SẢN PHẨM CHA</span><strong>${Number(stats.products || 0).toLocaleString("vi-VN")}</strong><em>${Number(stats.variants || 0).toLocaleString("vi-VN")} SKU / quy cách bán</em></article><article class="stat-card"><span>CẢNH BÁO TỒN THẤP</span><strong>${Number(stats.lowStock || 0).toLocaleString("vi-VN")}</strong><em>Các mã hàng cần kiểm tra</em></article></div><section class="panel"><h2>Vận hành theo từng bước</h2><div class="profile-grid"><div class="profile-item"><small>01 · Quản lý hàng hóa</small><b>Giá và trạng thái được quản lý theo SKU</b><p class="support-text">Mỗi quy cách có giá và tồn riêng. Đơn hàng giữ nguyên thông tin và giá tại thời điểm khách mua.</p></div><div class="profile-item"><small>02 · Theo dõi đơn hàng</small><b>Xác nhận, chuẩn bị và giao đơn</b><p class="support-text">Thay đổi trạng thái theo luồng cho phép. Việc giữ hàng, xuất hàng và hoàn giữ tồn được xử lý ở máy chủ.</p></div><div class="profile-item"><small>03 · Quản lý tồn kho</small><b>Phân biệt hàng có sẵn và hàng đang giữ</b><p class="support-text">Mỗi điều chỉnh cần lý do. Mức có thể bán dựa trên lượng tồn trừ lượng đã giữ cho đơn.</p></div><div class="profile-item"><small>04 · Truy vết thay đổi</small><b>Quyền hạn và nhật ký rõ ràng</b><p class="support-text">Máy chủ kiểm tra quyền cho từng thao tác; lịch sử giúp xác định ai đã thay đổi dữ liệu.</p></div></div><p class="permission-note">Đây là hệ thống phát triển với dữ liệu minh họa. Chưa kết nối cổng thanh toán hoặc nhà vận chuyển thực tế.</p></section>`;
}
function productsMarkup() {
  return `<section class="panel">${header("Sản phẩm & SKU", "Quản lý giá và trạng thái bán theo từng quy cách.", refreshButton())}<div class="table-controls"><input id="product-search" type="search" placeholder="Tìm tên sản phẩm, SKU, thương hiệu…" aria-label="Tìm sản phẩm quản trị"><select id="product-status" aria-label="Lọc trạng thái sản phẩm"><option value="">Tất cả trạng thái</option><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option><option value="draft">Bản nháp</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / quy cách</th><th scope="col">Giá bán</th><th scope="col">Có thể bán</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="product-table-body">${productTable(productRows)}</tbody></table></div></section>`;
}
function productTable(rows) {
  return (
    rows
      .map(
        (p) =>
          `<tr><td><div class="table-product"><img src="${escape(p.image)}" alt=""><div><b>${escape(p.name)}</b><small>${escape(p.sku || "SKU #" + p.id)} · ${escape(p.weight || p.brand || "")}</small></div></div></td><td class="price-cell">${money(p.price)}<div class="small muted" style="font-weight:400;text-decoration:line-through">${money(p.oldPrice ?? p.originalPrice)}</div></td><td>${Number(p.stock || 0)}</td><td>${badge(p.status || "active")}</td><td><div class="table-actions"><button class="secondary" data-edit-variant="${Number(p.id)}">Chỉnh sửa</button><a href="/san-pham/${encodeURIComponent(p.slug)}" class="text-button" target="_blank" rel="noopener">Xem ↗</a></div></td></tr>`,
      )
      .join("") || noRows(5)
  );
}
function filterProducts() {
  const query = ($("#product-search")?.value || "")
    .trim()
    .toLocaleLowerCase("vi");
  const status = $("#product-status")?.value || "";
  $("#product-table-body").innerHTML = productTable(
    productRows.filter(
      (p) =>
        (!status || (p.status || "active") === status) &&
        (!query ||
          [p.name, p.sku, p.brand]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(query)),
    ),
  );
}
function ordersMarkup() {
  return `<section class="panel">${header("Đơn hàng", "Kiểm tra thông tin, cập nhật trạng thái và theo dõi quá trình xử lý.", refreshButton())}<div class="table-controls"><input id="order-search" type="search" placeholder="Tìm mã đơn, người nhận hoặc điện thoại…" aria-label="Tìm đơn quản trị"><select id="order-status" aria-label="Lọc trạng thái đơn"><option value="">Tất cả trạng thái</option>${Object.entries(
    statusNames,
  )
    .filter(([key]) => Object.hasOwn(transitions, key))
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      "",
    )}</select></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Mã đơn / thời gian</th><th scope="col">Người nhận</th><th scope="col">Tổng cộng</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="order-table-body">${orderTable(orderRows)}</tbody></table></div></section>`;
}
function orderTable(rows) {
  return (
    rows
      .map(
        (order) =>
          `<tr><td><b>${escape(order.id)}</b><div class="small muted">${date(order.createdAt)}</div></td><td>${escape(order.customer?.name)}<div class="small muted">${escape(order.customer?.phone)}</div></td><td class="price-cell">${money(order.total)}<div class="small muted" style="font-weight:400">${escape(paymentLabel(order.payment || "cod"))}</div></td><td>${badge(order.status)}</td><td><button class="secondary" data-admin-order="${escape(order.id)}" style="padding:6px 9px;font-size:10px">Xem / xử lý</button></td></tr>`,
      )
      .join("") || noRows(5)
  );
}
function filterOrders() {
  const query = ($("#order-search")?.value || "")
    .trim()
    .toLocaleLowerCase("vi");
  const status = $("#order-status")?.value || "";
  $("#order-table-body").innerHTML = orderTable(
    orderRows.filter(
      (order) =>
        (!status || order.status === status) &&
        (!query ||
          [order.id, order.customer?.name, order.customer?.phone]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(query)),
    ),
  );
}
function inventoryMarkup() {
  const warehouses = [
    ...new Map(
      inventoryRows.map((row) => [
        String(row.warehouseId),
        { id: row.warehouseId, name: row.warehouseName },
      ]),
    ).values(),
  ];
  return `<section class="panel">${header("Kho & tồn hàng", "Có thể bán = tồn thực tế − lượng giữ cho đơn chưa xuất.", refreshButton())}<div class="table-controls"><input id="inventory-search" type="search" placeholder="Tìm tên sản phẩm hoặc mã SKU…" aria-label="Tìm sản phẩm trong kho"><select id="inventory-warehouse" aria-label="Lọc kho"><option value="">Tất cả kho</option>${warehouses.map((warehouse) => `<option value="${escape(warehouse.id)}">${escape(warehouse.name)}</option>`).join("")}</select></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / SKU</th><th scope="col">Kho</th><th scope="col">Tồn thực tế</th><th scope="col">Đang giữ</th><th scope="col">Có thể bán</th><th scope="col">Thao tác</th></tr></thead><tbody id="inventory-table-body">${inventoryTable(inventoryRows)}</tbody></table></div><p class="support-text">Kho hư hỏng được tách khỏi kho bán thông thường. Việc chuyển kho có thể cần nghiệp vụ riêng; biểu mẫu hiện tại chỉ ghi điều chỉnh tăng hoặc giảm tại một kho.</p></section>`;
}
function inventoryTable(rows) {
  return (
    rows
      .map(
        (row) =>
          `<tr><td><div class="table-product"><div><b>${escape(row.name)}</b><small>${escape(row.sku)}</small></div></div></td><td>${escape(row.warehouseName)}<div class="small muted">${row.warehouseType === "damaged" ? "Kho hư hỏng" : "Kho thông thường"}</div></td><td class="inventory-numbers">${Number(row.onHand)}</td><td>${Number(row.reserved)}</td><td class="inventory-numbers ${Number(row.available) <= 5 ? "stock-low" : ""}">${row.warehouseType === "damaged" ? "Không bán" : Number(row.available)}</td><td><button class="secondary" data-adjust-variant="${Number(row.variantId)}" data-warehouse="${Number(row.warehouseId)}" style="font-size:10px;padding:6px 9px">Điều chỉnh</button></td></tr>`,
      )
      .join("") || noRows(6)
  );
}
function filterInventory() {
  const query = ($("#inventory-search")?.value || "")
    .trim()
    .toLocaleLowerCase("vi");
  const warehouse = $("#inventory-warehouse")?.value || "";
  $("#inventory-table-body").innerHTML = inventoryTable(
    inventoryRows.filter(
      (row) =>
        (!warehouse || String(row.warehouseId) === warehouse) &&
        (!query ||
          [row.name, row.sku]
            .join(" ")
            .toLocaleLowerCase("vi")
            .includes(query)),
    ),
  );
}
function auditMarkup() {
  return `<section class="panel">${header("Nhật ký thao tác", "Lịch sử thay đổi do máy chủ ghi nhận.", refreshButton())}<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">Thao tác / đối tượng</th><th scope="col">Người thực hiện</th><th scope="col">Thông tin</th></tr></thead><tbody>${auditRows.map((log) => `<tr><td style="white-space:nowrap">${date(log.createdAt)}</td><td><span class="log-action">${escape(log.action)}</span><span class="log-entity">${escape(log.entityType)} #${escape(log.entityId)}</span></td><td>${log.actorId == null ? "Hệ thống" : "Tài khoản #" + escape(log.actorId)}</td><td><button class="text-button" data-audit="${escape(log.id)}">Xem chi tiết</button></td></tr>`).join("") || noRows(4, "Chưa có thao tác được ghi nhận.")}</tbody></table></div></section>`;
}
async function renderView(view, { focus = true } = {}) {
  const selected = sections.find((section) => section.id === view);
  if (!selected || !has(selected.permission)) return;
  activeView = view;
  const version = ++viewVersion;
  const content = $("#admin-content");
  $$("[data-section]").forEach((button) => {
    button.classList.toggle("active", button.dataset.section === view);
    if (button.dataset.section === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  content.setAttribute("aria-busy", "true");
  content.innerHTML =
    '<div class="panel loading">Đang tải dữ liệu cửa hàng…</div>';
  try {
    let html;
    if (view === "dashboard") {
      const { stats = {} } = await api("/api/admin/dashboard");
      html = dashboardMarkup(stats);
    }
    if (view === "products") {
      ({ products: productRows = [] } = await api("/api/admin/products"));
      html = productsMarkup();
    }
    if (view === "orders") {
      ({ orders: orderRows = [] } = await api("/api/admin/orders"));
      html = ordersMarkup();
    }
    if (view === "inventory") {
      ({ inventory: inventoryRows = [] } = await api("/api/admin/inventory"));
      html = inventoryMarkup();
    }
    if (view === "audit") {
      ({ logs: auditRows = [] } = await api("/api/admin/audit"));
      html = auditMarkup();
    }
    if (version !== viewVersion) return;
    content.innerHTML = html;
    if (focus) content.focus({ preventScroll: true });
  } catch (error) {
    if (version === viewVersion)
      content.innerHTML = `<section class="panel"><div class="form-error" role="alert">${escape(error.message)}</div>${error.status === 403 ? '<p class="support-text">Tài khoản chưa được cấp quyền cho mục này. Quyền truy cập phải được thay đổi ở máy chủ.</p>' : ""}<button class="secondary" id="refresh-view">Thử tải lại</button></section>`;
  } finally {
    if (version === viewVersion) content.removeAttribute("aria-busy");
  }
}
function showDialog(title, html, type, item) {
  dialogType = type;
  dialogItem = item;
  $("#admin-dialog-title").textContent = title;
  $("#admin-dialog-content").innerHTML = html;
  $("#admin-dialog").showModal();
}
function editVariant(id) {
  const p = productRows.find((row) => Number(row.id) === id);
  if (!p) return;
  showDialog(
    "Chỉnh sửa SKU " + (p.sku || p.id),
    `<p class="support-text">${escape(p.name)}</p><form id="variant-form"><div class="fields"><div class="field"><label for="variant-price">Giá bán (đ)</label><input id="variant-price" name="price" type="number" inputmode="numeric" required step="1" min="1" max="1000000000" value="${Number(p.price)}"></div><div class="field"><label for="variant-original-price">Giá gốc (đ)</label><input id="variant-original-price" name="originalPrice" type="number" inputmode="numeric" required step="1" min="1" max="1000000000" value="${Number(p.oldPrice ?? p.originalPrice ?? p.price)}"></div><div class="field full"><label for="variant-status">Trạng thái bán</label><select id="variant-status" name="status">${["active", "inactive", "draft"].map((status) => `<option value="${status}" ${(p.status || "active") === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}</select></div></div><div id="mutation-error" class="form-error" role="alert"></div><button class="primary">Lưu thay đổi</button><p class="support-text">Chỉnh giá không thay đổi giá của các đơn đã đặt. Tồn được điều chỉnh riêng trong mục Kho & tồn hàng.</p></form>`,
    "variant",
    p,
  );
}
function adjustInventory(variantId, warehouseId) {
  const row = inventoryRows.find(
    (item) =>
      Number(item.variantId) === variantId &&
      Number(item.warehouseId) === warehouseId,
  );
  if (!row) return;
  showDialog(
    "Điều chỉnh tồn kho",
    `<p><b>${escape(row.name)}</b></p><p class="support-text">${escape(row.sku)} · ${escape(row.warehouseName)} · Tồn ${Number(row.onHand)} · Đang giữ ${Number(row.reserved)}</p><form id="inventory-form"><div class="field"><label for="quantityChange">Số lượng thay đổi</label><input id="quantityChange" name="quantityChange" type="number" required step="1" min="-1000000" max="1000000" inputmode="numeric" placeholder="VD: 10 để tăng, -2 để giảm"><small>Số dương là nhập thêm, số âm là giảm tồn. Không được làm tồn thấp hơn lượng đang giữ.</small></div><div class="field"><label for="adjustReason">Lý do / chứng từ tham chiếu</label><textarea id="adjustReason" name="reason" required minlength="3" maxlength="500" placeholder="Lý do điều chỉnh và mã chứng từ nếu có"></textarea></div><div id="mutation-error" class="form-error" role="alert"></div><button class="primary">Ghi nhận điều chỉnh</button></form>`,
    "inventory",
    row,
  );
}
function paymentLabel(method) {
  return (
    {
      cod: "Thanh toán khi nhận hàng (COD)",
      bank_transfer: "Chuyển khoản ngân hàng / VietQR",
    }[method] || "Phương thức chưa xác định"
  );
}
function paymentBadge(status) {
  const label =
    {
      pending: "Chờ xác nhận thanh toán",
      paid: "Đã ghi nhận thu tiền",
      cancelled: "Thanh toán đã hủy",
      failed: "Thanh toán thất bại",
      refunded: "Đã hoàn tiền",
    }[status] || "Chưa ghi nhận thu tiền";
  return `<span class="badge ${status === "paid" ? "active" : status === "cancelled" ? "cancelled" : "pending"}">${escape(label)}</span>`;
}
function orderDetail(order) {
  const c = order.customer || {};
  const next = transitions[order.status] || [];
  return `<div class="detail-split"><div><h3>Người nhận</h3><p><b>${escape(c.name)}</b></p><p>${escape(c.phone)}</p><p>${escape(c.address)}</p><p>${escape(c.district)}, ${escape(c.province)}</p></div><div><h3>Thông tin đơn</h3><p>${escape(order.id)}</p><p>${date(order.createdAt)}</p><p>${badge(order.status)}</p><p>Thanh toán: ${escape(paymentLabel(order.payment || "cod"))}</p><p>${paymentBadge(order.paymentStatus)}</p></div></div>${(order.items || []).map((item) => `<div class="order-preview"><img src="${escape(item.image)}" alt=""><span>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></span><strong class="small">${money(item.lineTotal)}</strong></div>`).join("")}<div class="total-row"><span>Tiền hàng</span><b>${money(order.subtotal)}</b></div><div class="total-row"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="total-row"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="total-row grand"><span>Tổng cộng</span><b>${money(order.total)}</b></div>${order.note ? `<p class="dialog-note">Ghi chú: ${escape(order.note)}</p>` : ""}<section class="dialog-section"><h3>Xử lý đơn hàng</h3>${next.length ? `<form id="order-status-form"><div class="field"><label for="new-status">Trạng thái tiếp theo</label><select id="new-status" name="status">${next.map((status) => `<option value="${status}">${statusLabel(status)}</option>`).join("")}</select></div><div class="field"><label for="status-reason">Ghi chú xử lý</label><textarea id="status-reason" name="reason" maxlength="500" placeholder="Thông tin cần ghi nhận trong lịch sử đơn (nếu có)"></textarea></div><div id="mutation-error" class="form-error" role="alert"></div><button class="primary">Cập nhật trạng thái</button><p class="support-text">Máy chủ kiểm tra trạng thái và tồn kho trước khi ghi nhận. Hủy đơn sẽ hoàn phần giữ hàng; xuất giao sẽ giảm tồn thực tế.</p></form>` : '<p class="support-text">Đơn đã kết thúc; không có trạng thái tiếp theo trong luồng hiện tại.</p>'}</section>${paymentMarkup(order)}`;
}
function paymentMarkup(order) {
  if (order.payment === "bank_transfer") {
    const transfer = order.transfer;
    const details = transfer
      ? `<dl class="profile-grid"><div><dt>Ngân hàng</dt><dd>${escape(transfer.bankName)}</dd></div><div><dt>Tài khoản nhận</dt><dd>${escape(transfer.accountNumber)}</dd></div><div><dt>Chủ tài khoản</dt><dd>${escape(transfer.accountName)}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd><b>${escape(transfer.reference)}</b></dd></div><div><dt>Số tiền cần đối soát</dt><dd><b>${money(order.total)}</b></dd></div></dl>`
      : "";
    const active =
      Object.hasOwn(transitions, order.status) && order.status !== "cancelled";
    const confirm =
      active && order.paymentStatus === "pending"
        ? `<p class="support-text">Đối chiếu sao kê ngân hàng: nhận đủ ${money(order.total)} và đúng nội dung đơn hàng trước khi xác nhận. Khách gửi yêu cầu đặt hàng hoặc ảnh chuyển khoản không tự làm đơn thành đã thanh toán.</p><form id="bank-transfer-form"><div id="bank-transfer-error" class="form-error" role="alert"></div><button class="primary">Xác nhận đã nhận chuyển khoản</button></form>`
        : `<p class="support-text">${order.paymentStatus === "paid" ? "Khoản chuyển này đã được xác nhận. Lịch sử ghi nhận được lưu trong nhật ký hệ thống." : "Đơn không có khoản chuyển đang chờ xác nhận."}</p>`;
    return `<section class="dialog-section"><h3>Đối soát chuyển khoản ngân hàng</h3>${details}${confirm}</section>`;
  }
  if (
    order.payment !== "cod" ||
    order.status !== "delivered" ||
    order.paymentStatus !== "pending"
  )
    return "";
  return `<section class="dialog-section"><h3>Thu tiền COD</h3><p class="support-text">Đơn đã giao không tự đồng nghĩa với đã thu tiền. Chỉ ghi nhận khi đã đối soát và xác nhận nhận đủ ${money(order.total)}.</p><form id="payment-form"><div id="payment-error" class="form-error" role="alert"></div><button class="primary">Ghi nhận đã thu COD</button></form></section>`;
}
function openOrder(number) {
  const order = orderRows.find((row) => row.id === number);
  if (order)
    showDialog("Đơn hàng " + number, orderDetail(order), "order", order);
}
async function mutation(form) {
  if (mutationBusy || !form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const button = $("button", form);
  const errorBox = $(".form-error", form);
  if (errorBox) errorBox.textContent = "";
  if (
    form.id === "variant-form" &&
    Number(data.originalPrice) < Number(data.price)
  ) {
    errorBox.textContent = "Giá gốc cần lớn hơn hoặc bằng giá bán.";
    return;
  }
  if (form.id === "inventory-form" && Number(data.quantityChange) === 0) {
    errorBox.textContent = "Số lượng thay đổi phải khác 0.";
    return;
  }
  mutationBusy = true;
  button.disabled = true;
  try {
    if (dialogType === "variant")
      await api("/api/admin/variants/" + encodeURIComponent(dialogItem.id), {
        method: "PATCH",
        body: {
          price: Number(data.price),
          originalPrice: Number(data.originalPrice),
          status: data.status,
        },
      });
    if (dialogType === "inventory")
      await api("/api/admin/inventory/adjust", {
        method: "POST",
        body: {
          variantId: Number(dialogItem.variantId),
          warehouseId: Number(dialogItem.warehouseId),
          quantityChange: Number(data.quantityChange),
          reason: data.reason.trim(),
        },
      });
    if (dialogType === "order" && form.id === "order-status-form")
      await api(
        "/api/admin/orders/" + encodeURIComponent(dialogItem.id) + "/status",
        {
          method: "PATCH",
          body: { status: data.status, reason: data.reason.trim() },
        },
      );
    if (dialogType === "order" && form.id === "payment-form")
      await api(
        "/api/admin/orders/" + encodeURIComponent(dialogItem.id) + "/payment",
        { method: "POST", body: {} },
      );
    if (dialogType === "order" && form.id === "bank-transfer-form")
      await api(
        "/api/admin/orders/" +
          encodeURIComponent(dialogItem.id) +
          "/bank-transfer",
        { method: "POST", body: {} },
      );
    $("#admin-dialog").close();
    notify("Đã lưu thay đổi.");
    await renderView(activeView, { focus: false });
  } catch (error) {
    if (errorBox?.isConnected) errorBox.textContent = error.message;
    else notify(error.message);
  } finally {
    mutationBusy = false;
    if (button.isConnected) button.disabled = false;
  }
}
root.addEventListener("click", (event) => {
  const section = event.target.closest("[data-section]");
  if (section) {
    renderView(section.dataset.section);
    return;
  }
  if (event.target.closest("#refresh-view")) {
    renderView(activeView);
    return;
  }
  const variant = event.target.closest("[data-edit-variant]");
  if (variant) {
    editVariant(Number(variant.dataset.editVariant));
    return;
  }
  const inventory = event.target.closest("[data-adjust-variant]");
  if (inventory) {
    adjustInventory(
      Number(inventory.dataset.adjustVariant),
      Number(inventory.dataset.warehouse),
    );
    return;
  }
  const order = event.target.closest("[data-admin-order]");
  if (order) {
    openOrder(order.dataset.adminOrder);
    return;
  }
  const audit = event.target.closest("[data-audit]");
  if (audit) {
    const log = auditRows.find(
      (item) => String(item.id) === audit.dataset.audit,
    );
    if (log)
      showDialog(
        "Chi tiết nhật ký",
        `<p><b>${escape(log.action)}</b></p><p class="support-text">${date(log.createdAt)} · ${escape(log.entityType)} #${escape(log.entityId)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;background:#f7f8fa;border-radius:7px;padding:15px">${escape(JSON.stringify(log.metadata ?? {}, null, 2))}</pre>`,
        "audit",
        log,
      );
  }
});
root.addEventListener("input", (event) => {
  if (event.target.id === "product-search") filterProducts();
  if (event.target.id === "order-search") filterOrders();
  if (event.target.id === "inventory-search") filterInventory();
});
root.addEventListener("change", (event) => {
  if (event.target.id === "product-status") filterProducts();
  if (event.target.id === "order-status") filterOrders();
  if (event.target.id === "inventory-warehouse") filterInventory();
});
$("#admin-dialog").addEventListener("submit", (event) => {
  event.preventDefault();
  mutation(event.target);
});
$("#admin-dialog").addEventListener("click", (event) => {
  if (event.target.closest("[data-close-dialog]")) {
    if (mutationBusy) {
      notify("Đang lưu, vui lòng chờ kết quả.");
      return;
    }
    $("#admin-dialog").close();
  }
});
$("#admin-dialog").addEventListener("cancel", (event) => {
  if (mutationBusy) event.preventDefault();
});
async function init() {
  try {
    const result = await api("/api/auth/me");
    user = result.user;
    csrfToken = result.csrfToken || "";
    if (
      !sections.some((section) => section.permission && has(section.permission))
    ) {
      gate(
        "Tài khoản này có thể mua sắm và xem đơn hàng cá nhân. Vui lòng dùng tài khoản đã được cấp quyền để vào không gian vận hành.",
      );
      return;
    }
    shell();
    await renderView("dashboard", { focus: false });
  } catch (error) {
    if (error.status === 401) {
      gate(
        "Đăng nhập bằng tài khoản được cấp quyền quản trị. Các thao tác sản phẩm, đơn hàng và tồn kho được xác thực ở máy chủ.",
        true,
      );
    } else
      root.innerHTML = `<section class="panel access-panel"><h1>Chưa mở được trang quản trị</h1><p>${escape(error.message)}</p><button class="primary" id="retry-init">Thử lại</button></section>`;
  }
}
root.addEventListener("click", (event) => {
  if (event.target.closest("#retry-init")) init();
});
init();
