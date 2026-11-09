import { reportVisuals } from "/report-visuals.js";
import { icon } from "/ui-icons.js";
import { canAccessAdmin } from "/admin-access.js";
import { createCommerceEditors } from "/commerce-admin.js";
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
const roleLabel = (role) =>
  role === "banner_manager" ? "Quản lý banner và ảnh chiến dịch" : role;
const money = (value) => Number(value || 0).toLocaleString("vi-VN") + "đ";
const date = (value) =>
  value && !Number.isNaN(new Date(value).valueOf())
    ? new Date(value).toLocaleString("vi-VN")
    : "—";
const roleLabels = {
  banner_manager: "Quản lý banner và ảnh chiến dịch",
  admin: "Quản trị viên",
  boss: "Chủ cửa hàng (chỉ xem)",
  sales: "Bán hàng",
  warehouse: "Kho",
  finance: "Kế toán",
  catalog_manager: "Quản lý sản phẩm",
  writer: "Biên tập viên",
  seo: "SEO",
  content: "Nội dung",
  viewer: "Chỉ xem",
  customer: "Khách hàng",
};
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
  { id: "dashboard", label: "Tổng quan", permission: "dashboard.read" },
  {
    id: "redirects-editor",
    label: "Chuyển hướng SEO",
    permission: "seo.manage",
  },
  {
    id: "catalog-editor",
    label: "Sản phẩm cha & SKU",
    permission: "catalog.read",
  },
  {
    id: "taxonomy-editor",
    label: "Danh mục & Thuộc tính",
    permission: "catalog.read",
  },
  { id: "media-editor", label: "Thư viện ảnh", permission: "media.read" },
  { id: "cms-editor", label: "Tin tức & SEO", permission: "content.read" },
  { id: "returns-editor", label: "Đổi trả hàng", permission: "returns.manage" },
  { id: "documents-editor", label: "Phiếu kho", permission: "inventory.read" },
  { id: "audit-tools", label: "Lọc & xuất nhật ký", permission: "audit.read" },
  {
    id: "operations-editor",
    label: "Trạng thái vận hành",
    permission: "settings.read",
  },
  { id: "reports-editor", label: "Báo cáo", permission: "reports.read" },
  {
    id: "settings-editor",
    label: "Cấu hình công ty",
    permission: "settings.read",
  },
  {
    id: "banners-editor",
    label: "Banner & Poster Studio",
    permission: "banners.read",
  },
  { id: "import-editor", label: "CSV sản phẩm", permission: "catalog.read" },
  {
    id: "coupons-editor",
    label: "Mã giảm giá",
    permission: "promotions.manage",
  },
  { id: "users", label: "Tài khoản & Phân quyền", permission: "users.manage" },
  { id: "products", label: "Giá & trạng thái SKU", permission: "catalog.read" },
  { id: "orders", label: "Đơn hàng", permission: "orders.read" },
  {
    id: "inventory",
    label: "Kho & tồn hàng",
    permission: "inventory.read",
  },
  { id: "audit", label: "Nhật ký thao tác", permission: "audit.read" },
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
let staffRows = [],
  staffRoles = [];
let dialogType = "";
let dialogItem = null;
let mutationBusy = false;
async function api(
  path,
  { method = "GET", body, rawBody, extraHeaders = {} } = {},
) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(rawBody
      ? { body: rawBody }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
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
  if (permission === "banners.read")
    return (user?.permissions || []).some(
      (p) => p === "banners.read" || p === "settings.read",
    );
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
const navigationGroups = [
  { title: "Tổng quan", icon: "chart", ids: ["dashboard", "reports-editor"] },
  {
    title: "Bán hàng & Kho",
    icon: "box",
    ids: [
      "orders",
      "catalog-editor",
      "taxonomy-editor",
      "products",
      "inventory",
      "documents-editor",
      "returns-editor",
      "import-editor",
      "coupons-editor",
    ],
  },
  {
    title: "Nội dung & Website",
    icon: "file",
    ids: ["cms-editor", "media-editor", "banners-editor", "redirects-editor"],
  },
  {
    title: "Quản lý hệ thống",
    icon: "settings",
    ids: [
      "users",
      "settings-editor",
      "operations-editor",
      "audit-tools",
      "audit",
    ],
  },
];
const sectionIcons = {
  dashboard: "grid",
  orders: "receipt",
  products: "tag",
  inventory: "warehouse",
  "catalog-editor": "box",
  "taxonomy-editor": "grid",
  "media-editor": "image",
  "cms-editor": "news",
  "banners-editor": "image",
  "coupons-editor": "percent",
  "inventory-docs": "warehouse",
  "returns-editor": "return",
  "reports-editor": "chart",
  "audit-tools": "log",
  audit: "log",
  users: "users",
  "settings-editor": "settings",
  "operations-editor": "shield",
  "redirects-editor": "external",
};
function shell() {
  root.innerHTML = `<div class="admin-layout"><aside class="admin-sidebar"><div class="workspace-brand"><img src="/assets/jielien-logo.jpg" alt="Jielien International"><span>Không gian quản trị</span></div><label class="navigation-search">${icon("search")}<input id="admin-nav-search" type="search" aria-label="Tìm chức năng quản trị" placeholder="Tìm chức năng…"></label><nav id="workspace-navigation" class="side-nav" aria-label="Mục quản trị">${navigationGroups
    .map((group) => {
      const available = group.ids
        .map((id) => sections.find((s) => s.id === id))
        .filter((s) => s && has(s.permission));
      return available.length
        ? `<section class="navigation-group"><h2>${group.title}</h2>${available.map((s) => `<button data-section="${s.id}" class="${activeView === s.id ? "active" : ""}">${icon(sectionIcons[s.id] || group.icon)}<span>${s.label}</span></button>`).join("")}</section>`
        : "";
    })
    .join(
      "",
    )}<p id="navigation-empty" hidden>Không tìm thấy chức năng.</p></nav><div class="admin-user"><span class="user-avatar">${escape((user.fullName || user.full_name || "A").slice(0, 1))}</span><div><b>${escape(user.fullName || user.full_name)}</b><small>Đã đăng nhập</small></div><a href="/tai-khoan" aria-label="Mở tài khoản">${icon("arrow")}</a></div></aside><div class="workspace-main"><div class="workspace-location"><button type="button" id="admin-menu-toggle" aria-expanded="false" aria-controls="workspace-navigation">${icon("menu")} Mục quản trị</button><span>Quản trị <span aria-hidden="true">/</span> <b id="workspace-current">Tổng quan</b></span><span class="workspace-session">Phiên đăng nhập được bảo vệ</span></div><section id="admin-content" tabindex="-1" aria-live="polite"></section></div></div>`;
}
root.addEventListener("input", (event) => {
  if (event.target.id !== "admin-nav-search") return;
  const normalize = (v) =>
    v
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");
  const query = normalize(event.target.value.trim());
  let visible = 0;
  root.querySelectorAll(".navigation-group").forEach((group) => {
    let matches = 0;
    group.querySelectorAll("[data-section]").forEach((button) => {
      button.hidden = !normalize(button.textContent).includes(query);
      if (!button.hidden) matches++;
    });
    group.hidden = matches === 0;
    visible += matches;
  });
  $("#navigation-empty").hidden = visible > 0;
});
root.addEventListener("click", (event) => {
  const toggle = event.target.closest("#admin-menu-toggle");
  if (toggle) {
    const open = $(".admin-layout").classList.toggle("navigation-open");
    toggle.setAttribute("aria-expanded", String(open));
    if (open) $("#admin-nav-search").focus();
  }
});
function header(title, text, button = "") {
  return `<div class="content-header"><div><h1>${title}</h1><p>${text}</p></div>${button}</div>`;
}
function refreshButton() {
  return `<button class="secondary" id="refresh-view">${icon("refresh")} Làm mới</button>`;
}
function dashboardMarkup(stats) {
  const quick = ["orders", "inventory", "catalog-editor", "reports-editor"]
    .map((id) => sections.find((s) => s.id === id))
    .filter((s) => s && has(s.permission));
  return `${header("Tổng quan", "Một góc nhìn rõ ràng để bắt đầu ngày làm việc.", refreshButton())}<div class="dashboard-intro"><div><span class="page-eyebrow">JIELIEN WORKSPACE</span><h2>Chăm chút từng đơn hàng.<br>Quản lý cửa hàng chủ động hơn.</h2><p>Kiểm tra đơn, hàng hóa và kết quả kinh doanh từ dữ liệu đang có.</p></div>${icon("warehouse", { size: 64 })}</div><div class="stats-grid"><article class="stat-card"><span>ĐƠN CHỜ XÁC NHẬN</span><strong>${Number(stats.pendingOrders || 0).toLocaleString("vi-VN")}</strong><em>${Number(stats.orders || 0)} đơn được ghi nhận tổng cộng</em></article><article class="stat-card"><span>TIỀN ĐÃ THU</span><strong class="stat-money">${money(stats.revenue)}</strong><em>Các khoản thanh toán đã xác nhận</em></article><article class="stat-card"><span>SẢN PHẨM</span><strong>${Number(stats.products || 0)}</strong><em>${Number(stats.variants || 0)} SKU / quy cách</em></article><article class="stat-card"><span>CẢNH BÁO TỒN THẤP</span><strong>${Number(stats.lowStock || 0)}</strong><em>Kiểm tra hàng có thể bán</em></article></div><section class="panel"><div class="section-title"><div><h2>Công việc thường ngày</h2><p>Đi thẳng đến màn hình bạn cần.</p></div></div><div class="dashboard-shortcuts workspace-actions">${quick.map((s) => `<button class="workspace-action" data-workspace-section="${s.id}">${icon(sectionIcons[s.id])}<span>${s.label}</span>${icon("arrow")}</button>`).join("")}</div></section><div id="dashboard-insights"></div>`;
}

function productsMarkup() {
  return `<section class="panel">${header("Sản phẩm & SKU", "Quản lý giá và trạng thái bán theo từng quy cách.", refreshButton())}<div class="table-controls"><label class="table-filter-label">Tìm sản phẩm<input id="product-search" type="search" placeholder="Tìm tên sản phẩm, SKU, thương hiệu…" aria-label="Tìm sản phẩm quản trị"></label><label class="table-filter-label">Trạng thái bán<select id="product-status" aria-label="Lọc trạng thái sản phẩm"><option value="">Tất cả trạng thái</option><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option><option value="draft">Bản nháp</option></select></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / quy cách</th><th scope="col">Giá bán</th><th scope="col">Có thể bán</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="product-table-body">${productTable(productRows)}</tbody></table></div></section>`;
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
  return `<section class="panel">${header("Đơn hàng", "Kiểm tra thông tin, cập nhật trạng thái và theo dõi quá trình xử lý.", refreshButton())}<div class="table-controls"><label class="table-filter-label">Tìm đơn hàng<input id="order-search" type="search" placeholder="Tìm mã đơn, người nhận hoặc điện thoại…" aria-label="Tìm đơn quản trị"></label><label class="table-filter-label">Trạng thái đơn<select id="order-status" aria-label="Lọc trạng thái đơn"><option value="">Tất cả trạng thái</option>${Object.entries(
    statusNames,
  )
    .filter(([key]) => Object.hasOwn(transitions, key))
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      "",
    )}</select></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Mã đơn / thời gian</th><th scope="col">Người nhận</th><th scope="col">Tổng cộng</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="order-table-body">${orderTable(orderRows)}</tbody></table></div></section>`;
}
function orderTable(rows) {
  return (
    rows
      .map(
        (order) =>
          `<tr><td><b>${escape(order.id)}</b><div class="small muted">${date(order.createdAt)}</div></td><td>${escape(order.customer?.name)}<div class="small muted">${escape(order.customer?.phone)}</div></td><td class="price-cell">${money(order.total)}<div class="small muted" style="font-weight:400">${escape(paymentLabel(order.payment || "cod"))}</div></td><td>${badge(order.status)}</td><td><button class="secondary" data-admin-order="${escape(order.id)}">Xem / xử lý</button></td></tr>`,
      )
      .join("") || noRows(5)
  );
}
function prepareMobileTables() {
  for (const id of ["order-table-body", "inventory-table-body"]) {
    const body = document.getElementById(id);
    if (!body) continue;
    const table = body.closest("table");
    table.classList.add("mobile-cards");
    const headings = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim(),
    );
    for (const row of body.rows)
      for (const [index, cell] of [...row.cells].entries()) {
        if (cell.colSpan === 1) cell.dataset.label = headings[index] || "";
      }
  }
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
  prepareMobileTables();
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
  return `<section class="panel">${header("Kho & tồn hàng", "Có thể bán = tồn thực tế − lượng giữ cho đơn chưa xuất.", refreshButton())}<div class="table-controls"><label class="table-filter-label">Tìm sản phẩm / SKU<input id="inventory-search" type="search" placeholder="Tìm tên sản phẩm hoặc mã SKU…" aria-label="Tìm sản phẩm trong kho"></label><label class="table-filter-label">Kho hàng<select id="inventory-warehouse" aria-label="Lọc kho"><option value="">Tất cả kho</option>${warehouses.map((warehouse) => `<option value="${escape(warehouse.id)}">${escape(warehouse.name)}</option>`).join("")}</select></label><label class="table-filter-label">Tình trạng tồn<select id="inventory-stock"><option value="">Tất cả</option><option value="out">Hết hàng</option><option value="low">Sắp hết</option><option value="enough">Đủ hàng</option></select></label><label class="table-filter-label">Sắp xếp<select id="inventory-sort"><option value="">Theo sản phẩm</option><option value="available">Có thể bán tăng dần</option></select></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / SKU</th><th scope="col">Kho</th><th scope="col">Tồn thực tế</th><th scope="col">Đang giữ</th><th scope="col">Có thể bán</th><th scope="col">Thao tác</th></tr></thead><tbody id="inventory-table-body">${inventoryTable(inventoryRows)}</tbody></table></div><p class="support-text">Kho hư hỏng được tách khỏi kho bán thông thường. Việc chuyển kho có thể cần nghiệp vụ riêng; biểu mẫu hiện tại chỉ ghi điều chỉnh tăng hoặc giảm tại một kho.</p></section>`;
}
function inventoryTable(rows) {
  return (
    rows
      .map(
        (row) =>
          `<tr><td><div class="table-product"><div><b>${escape(row.name)}</b><small>${escape(row.sku)}</small></div></div></td><td>${escape(row.warehouseName)}<div class="small muted">${row.warehouseType === "damaged" ? "Kho hư hỏng" : "Kho thông thường"}</div></td><td class="inventory-numbers">${Number(row.onHand)}</td><td class="numeric">${Number(row.reserved)}</td><td class="inventory-numbers ${Number(row.available) <= (row.lowStockThreshold ?? 5) ? "stock-low" : ""}">${row.warehouseType === "damaged" ? "Không bán" : `${Number(row.available)}<small class="stock-caption">${Number(row.available) <= 0 ? "Hết hàng" : Number(row.available) <= (row.lowStockThreshold ?? 5) ? "Sắp hết" : "Đủ hàng"}</small>`}</td><td><button class="secondary" data-adjust-variant="${Number(row.variantId)}" data-warehouse="${Number(row.warehouseId)}">Điều chỉnh</button></td></tr>`,
      )
      .join("") || noRows(6)
  );
}
function filterInventory() {
  const query = ($("#inventory-search")?.value || "")
    .trim()
    .toLocaleLowerCase("vi");
  const warehouse = $("#inventory-warehouse")?.value || "";
  const state = $("#inventory-stock")?.value || "";
  $("#inventory-table-body").innerHTML = inventoryTable(
    [...inventoryRows]
      .sort((a, b) =>
        $("#inventory-sort")?.value === "available"
          ? a.available - b.available
          : 0,
      )
      .filter(
        (row) =>
          (!warehouse || String(row.warehouseId) === warehouse) &&
          (!state ||
            (row.warehouseType !== "damaged" &&
              (state === "out"
                ? row.available <= 0
                : state === "low"
                  ? row.available > 0 &&
                    row.available <= (row.lowStockThreshold ?? 5)
                  : row.available > (row.lowStockThreshold ?? 5)))) &&
          (!query ||
            [row.name, row.sku]
              .join(" ")
              .toLocaleLowerCase("vi")
              .includes(query)),
      ),
  );
  prepareMobileTables();
}
function auditMarkup() {
  return `<section class="panel">${header("Nhật ký thao tác", "Lịch sử thay đổi do máy chủ ghi nhận.", refreshButton())}<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Thời gian</th><th scope="col">Thao tác / đối tượng</th><th scope="col">Người thực hiện</th><th scope="col">Thông tin</th></tr></thead><tbody>${auditRows.map((log) => `<tr><td style="white-space:nowrap">${date(log.createdAt)}</td><td><span class="log-action">${escape(log.action)}</span><span class="log-entity">${escape(log.entityType)} #${escape(log.entityId)}</span></td><td>${log.actorId == null ? "Hệ thống" : "Tài khoản #" + escape(log.actorId)}</td><td><button class="text-button" data-audit="${escape(log.id)}">Xem chi tiết</button></td></tr>`).join("") || noRows(4, "Chưa có thao tác được ghi nhận.")}</tbody></table></div></section>`;
}
function staffTable(rows) {
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows.map((u) => `<tr><td>${escape(u.full_name)}<br>${escape(u.email)}<br>${escape(u.phone)}</td><td>${escape(u.roles.map((r) => roleLabels[r] || r).join(", "))}</td><td>${escape(u.status)}</td><td><button data-staff="${Number(u.id)}">Phân quyền</button></td></tr>`).join("")}</tbody></table></div>`;
}
async function renderView(view, { focus = true } = {}) {
  const selected = sections.find((section) => section.id === view);
  if (!selected || !has(selected.permission)) return;
  activeView = view;
  document.title = selected.label + " | Jielien Admin";
  $("#workspace-current").textContent = selected.label;
  $(".admin-layout").classList.remove("navigation-open");
  $("#admin-menu-toggle").setAttribute("aria-expanded", "false");
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
    let html = await editors.render(view);
    if (view === "users") {
      const data = await api("/api/admin/users");
      staffRows = data.users;
      staffRoles = data.roles;
      html = `<section class="panel"><h1>Tài khoản & Phân quyền</h1><button id="new-staff">Tạo nhân viên</button><input id="staff-search" type="search" placeholder="Tìm tên / email / điện thoại"><div id="staff-list">${staffTable(staffRows)}</div></section>`;
    }
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
    prepareMobileTables();
    if (!has("catalog.manage"))
      $$("[data-edit-variant]", content).forEach((e) => e.remove());
    if (!has("inventory.manage"))
      $$("[data-adjust-variant]", content).forEach((e) => e.remove());
    if (focus) content.focus({ preventScroll: true });
    if (view === "dashboard") {
      const insights = $("#dashboard-insights");
      if (has("reports.read")) {
        api("/api/admin/reports/summary")
          .then(({ report }) => {
            if (version === viewVersion && insights.isConnected)
              insights.innerHTML = reportVisuals(report, escape);
          })
          .catch(() => {
            if (insights.isConnected)
              insights.innerHTML =
                '<p class="form-error">Chưa tải được báo cáo. Mở mục Báo cáo để thử lại.</p>';
          });
      }
    }
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
  const next = has("orders.manage") ? transitions[order.status] || [] : [];
  return `<div class="detail-split"><div><h3>Người nhận</h3><p><b>${escape(c.name)}</b></p><p>${escape(c.phone)}</p><p>${escape(c.address)}</p><p>${escape(c.district)}, ${escape(c.province)}</p></div><div><h3>Thông tin đơn</h3><p>${escape(order.id)}</p><p>${date(order.createdAt)}</p><p>${badge(order.status)}</p><p>Thanh toán: ${escape(paymentLabel(order.payment || "cod"))}</p><p>${paymentBadge(order.paymentStatus)}</p></div></div>${(order.items || []).map((item) => `<div class="order-preview"><img src="${escape(item.image)}" alt=""><span>${escape(item.name)}<b>${item.quantity} × ${money(item.price)}</b></span><strong class="small">${money(item.lineTotal)}</strong></div>`).join("")}<div class="total-row"><span>Tiền hàng</span><b>${money(order.subtotal)}</b></div><div class="total-row"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="total-row"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="total-row grand"><span>Tổng cộng</span><b>${money(order.total)}</b></div>${order.note ? `<p class="dialog-note">Ghi chú: ${escape(order.note)}</p>` : ""}<section class="dialog-section"><h3>Xử lý đơn hàng</h3>${next.length ? `<form id="order-status-form"><div class="field"><label for="new-status">Trạng thái tiếp theo</label><select id="new-status" name="status">${next.map((status) => `<option value="${status}">${statusLabel(status)}</option>`).join("")}</select></div><div class="field"><label for="status-reason">Ghi chú xử lý</label><textarea id="status-reason" name="reason" maxlength="500" placeholder="Thông tin cần ghi nhận trong lịch sử đơn (nếu có)"></textarea></div><div id="mutation-error" class="form-error" role="alert"></div><button class="primary">Cập nhật trạng thái</button><p class="support-text">Máy chủ kiểm tra trạng thái và tồn kho trước khi ghi nhận. Hủy đơn sẽ hoàn phần giữ hàng; xuất giao sẽ giảm tồn thực tế.</p></form>` : '<p class="support-text">Đơn đã kết thúc; không có trạng thái tiếp theo trong luồng hiện tại.</p>'}</section>${paymentMarkup(order)}`;
}
function paymentMarkup(order) {
  if (!has("payments.reconcile")) return "";
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
  if (
    form.id === "staff-form" &&
    !confirm("Xác nhận thay đổi quyền / trạng thái tài khoản?")
  )
    return;
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
    if (dialogType === "create-staff")
      await api("/api/admin/users", {
        method: "POST",
        body: { ...data, roles: [data.role] },
      });
    if (dialogType === "staff")
      await api("/api/admin/users/" + dialogItem.id, {
        method: "PATCH",
        body: {
          roles: new FormData(form).getAll("roles"),
          status: data.status,
        },
      });
    if (dialogType === "variant")
      await api("/api/admin/variants/" + encodeURIComponent(dialogItem.id), {
        method: "PATCH",
        body: {
          rowVersion: dialogItem.rowVersion,
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
    if (error.status === 409 && dialogType === "variant") {
      $("#admin-dialog").close();
      await renderView("products", { focus: false });
      notify(error.message + " Danh sách đã được tải lại.");
      return;
    }
    if (errorBox?.isConnected) errorBox.textContent = error.message;
    else notify(error.message);
  } finally {
    mutationBusy = false;
    if (button.isConnected) button.disabled = false;
  }
}
root.addEventListener("click", (event) => {
  if (event.target.closest("#new-staff")) {
    showDialog(
      "Tạo tài khoản nhân viên",
      `<form id="create-staff-form" class="editor-form"><label>Họ tên<input name="fullName" required minlength="2"></label><label>Tên đăng nhập<input name="username" required minlength="3" autocomplete="off"></label><label>Điện thoại Việt Nam<input name="phone" required></label><label>Email (tùy chọn)<input name="email" type="email"></label><label>Mật khẩu riêng (ít nhất 10 ký tự)<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><label>Vai trò<select name="role">${staffRoles
        .filter((r) => !["customer", "admin"].includes(r))
        .map(
          (r) =>
            `<option value="${escape(r)}">${escape(roleLabels[r] || r)}</option>`,
        )
        .join(
          "",
        )}</select></label><div class="form-error" role="alert"></div><button class="primary">Tạo nhân viên</button></form>`,
      "create-staff",
      null,
    );
    return;
  }
  const staff = event.target.closest("[data-staff]");
  if (staff) {
    const item = staffRows.find(
      (u) => Number(u.id) === Number(staff.dataset.staff),
    );
    showDialog(
      "Tài khoản & Phân quyền",
      `<form id="staff-form">${staffRoles.map((r) => `<label class="role-option"><input type="checkbox" name="roles" value="${escape(r)}" ${item.roles.includes(r) ? "checked" : ""}><span>${escape(roleLabels[r] || r)}<small>Quyền theo nhóm công việc được phân công</small></span></label>`).join("")}<select name="status"><option value="active" ${item.status === "active" ? "selected" : ""}>Hoạt động</option><option value="inactive" ${item.status === "inactive" ? "selected" : ""}>Vô hiệu hóa</option></select><div class="form-error" role="alert"></div><button>Lưu quyền</button></form>`,
      "staff",
      item,
    );
    return;
  }
  const section = event.target.closest(
    "[data-section], [data-workspace-section]",
  );
  if (section) {
    renderView(section.dataset.section || section.dataset.workspaceSection);
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
  if (event.target.id === "staff-search")
    $("#staff-list").innerHTML = staffTable(
      staffRows.filter((u) =>
        [u.full_name, u.email, u.phone]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(event.target.value.toLocaleLowerCase("vi")),
      ),
    );
  if (event.target.id === "product-search") filterProducts();
  if (event.target.id === "order-search") filterOrders();
  if (event.target.id === "inventory-search") filterInventory();
});
root.addEventListener("change", (event) => {
  if (event.target.id === "product-status") filterProducts();
  if (event.target.id === "order-status") filterOrders();
  if (
    ["inventory-warehouse", "inventory-stock", "inventory-sort"].includes(
      event.target.id,
    )
  )
    filterInventory();
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
    if (!canAccessAdmin(user)) {
      gate(
        "Tài khoản này có thể mua sắm và xem đơn hàng cá nhân. Vui lòng dùng tài khoản đã được cấp quyền để vào không gian vận hành.",
      );
      return;
    }
    shell();
    await renderView(
      has("dashboard.read")
        ? "dashboard"
        : sections.find((s) => has(s.permission)).id,
      { focus: false },
    );
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
const editors = createCommerceEditors({ root, api, has, escape, notify });
init();
