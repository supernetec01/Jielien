import { readAdminFilters, adminFilterSearch, isLowStockAlert } from "/admin-filters.js";
import { adminNav, adminNavGroups, resolveAdminRoute, normalizeAdminSearch, adminBadge } from "/admin-nav.js";
import { logoutSession } from "/auth-session.js";
let bankOnly = false;
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
const sections = adminNav;
const root = $("#admin-main");
$(".header-back").insertAdjacentHTML("afterbegin", icon("external"));
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
  root.innerHTML = `<section class="panel access-panel"><span class="access-icon" aria-hidden="true">♢</span><h1>${login ? "Đăng nhập để quản lý cửa hàng" : "Tài khoản chưa có quyền quản trị"}</h1><p>${escape(message)}</p><a href="/tai-khoan${login ? "?redirect=" + encodeURIComponent(resolveAdminRoute(location.pathname) ? location.pathname + location.search : "/quan-tri") : ""}" class="primary">${login ? "Đăng nhập →" : "Về tài khoản"}</a><p class="small">Quyền truy cập được cấp bởi người vận hành. Đăng ký tài khoản khách hàng không tự cấp quyền quản trị.</p></section>`;
}
const openedGroups = new Set();
let pendingOrders;
let routeVersion = 0;
let ignoreDialogClose = false;
function updateNavigation() {
  const query = normalizeAdminSearch($("#admin-nav-search")?.value.trim() || "");
  let visible = 0;
  $$("[data-section]", $("#workspace-navigation")).forEach(link => {
    const item = adminNav.find(item => item.id === link.dataset.section);
    link.hidden = !!query && !normalizeAdminSearch(item.label).includes(query);
    if (!link.hidden) visible++;
    const active = item.id === activeView;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    const badge = link.querySelector(".nav-badge");
    if (badge) { const value = adminBadge(pendingOrders); badge.textContent = value; badge.hidden = !value; }
  });
  $$("[data-navigation-group]").forEach(group => {
    const id = group.dataset.navigationGroup;
    const links = $$("[data-section]", group);
    const matches = links.some(link => !link.hidden);
    const active = links.some(link => link.dataset.section === activeView);
    group.hidden = !matches;
    group.classList.toggle("is-active", active);
    const open = query ? matches : openedGroups.has(id);
    group.classList.toggle("is-open", open);
    group.querySelector(".navigation-folder").setAttribute("aria-expanded", String(open));
    group.querySelector(".navigation-collapse").inert = !open;
    const badge = group.querySelector(".nav-parent-badge");
    const value = links.some(link => link.querySelector(".nav-badge")) ? adminBadge(pendingOrders) : "";
    badge.textContent = value; badge.hidden = open || !value;
  });
  $("#navigation-empty").hidden = visible > 0;
  $("#admin-nav-shortcut").hidden = !!query;
}
function updateBreadcrumb() {
  const route = resolveAdminRoute(location.pathname);
  const item = route?.item || adminNav.find(item => item.id === activeView);
  if (!item) return;
  $("#admin-breadcrumb ol").innerHTML = `<li><a href="/quan-tri" data-admin-home>Quản trị</a></li>${route?.detailId ? `<li><a href="${item.href + adminFilterSearch(item.id, readAdminFilters(item.id, location.search))}" data-admin-href title="${escape(item.label)}">${escape(item.label)}</a></li><li aria-current="page">Chi tiết</li>` : `<li aria-current="page" title="${escape(item.label)}">${escape(item.label)}</li>`}`;
}
async function refreshNavigationBadge(stats) {
  if (!has("dashboard.read") || !has("orders.read")) return;
  try { pendingOrders = (stats || (await api("/api/admin/dashboard")).stats)?.pendingOrders; }
  catch { pendingOrders = undefined; }
  if ($("#workspace-navigation")) updateNavigation();
}
function shell() {
  const initial = resolveAdminRoute(location.pathname)?.item || sections.find(item => has(item.permission));
  activeView = initial.id;
  openedGroups.clear(); if (initial.group) openedGroups.add(initial.group);
  const navLink = item => `<a href="${item.href}" data-section="${item.id}" title="${escape(item.label)}"><span class="nav-label">${escape(item.label)}</span>${item.badgeKey ? '<span class="nav-badge" hidden></span>' : ''}</a>`;
  root.innerHTML = `<div class="admin-layout"><aside class="admin-sidebar"><a class="workspace-brand" href="/quan-tri" data-admin-home><img src="/assets/jielien-logo.jpg" alt="Jielien International"><div class="workspace-brand-label"><strong>JIELIEN</strong><span>Không gian quản trị</span></div></a><div class="navigation-search" role="search" aria-label="Tìm chức năng quản trị">${icon("search")}<input id="admin-nav-search" type="search" aria-label="Tìm chức năng quản trị" placeholder="Tìm chức năng..."><kbd id="admin-nav-shortcut">Ctrl K</kbd></div><nav id="workspace-navigation" class="side-nav" aria-label="Mục quản trị">${adminNavGroups.map(group => {
    const items = adminNav.filter(item => item.group === group.id && has(item.permission));
    return items.length ? `<section class="navigation-group" data-navigation-group="${group.id}"><button type="button" class="navigation-folder" aria-expanded="false" aria-controls="nav-children-${group.id}" title="${escape(group.label)}">${icon(group.icon)}<span class="nav-label">${escape(group.label)}</span><span class="nav-parent-badge" hidden></span>${icon("chevronDown", { className: "navigation-chevron" })}</button><div class="navigation-collapse" id="nav-children-${group.id}" inert><div class="navigation-clip"><div class="navigation-children">${items.map(navLink).join("")}</div></div></div></section>` : "";
  }).join("")}${adminNav.filter(item => !item.group && has(item.permission)).map(navLink).join("")}<p id="navigation-empty" hidden>Không tìm thấy chức năng</p></nav></aside><div class="workspace-main"><section id="admin-content" tabindex="-1" aria-live="polite"></section></div></div>`;
  $("#admin-menu-toggle").hidden = false;
  $("#admin-menu-toggle").innerHTML = icon("menu");
  $(".workspace-session").hidden = false;
  $(".admin-account").hidden = false;
  $(".user-avatar").textContent = (user.fullName || user.full_name || "A").slice(0, 1);
  if (/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || "")) $("#admin-nav-shortcut").textContent = "⌘K";
  updateNavigation();
  updateBreadcrumb();
}
root.addEventListener("input", event => {
  if (event.target.id === "admin-nav-search") updateNavigation();
});
function setMobileMenu(open) {
  $(".admin-layout")?.classList.toggle("navigation-open", open);
  $("#admin-menu-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("#admin-nav-search")?.focus();
}
function setAccountMenu(open, returnFocus = false) {
  $("#admin-account-menu").hidden = !open;
  $("#admin-account-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("#admin-account-menu [role=menuitem]").focus();
  else if (returnFocus) $("#admin-account-toggle").focus();
}
document.addEventListener("click", async event => {
  if (event.target.closest("#admin-menu-toggle")) {
    setMobileMenu($("#admin-menu-toggle").getAttribute("aria-expanded") !== "true"); return;
  }
  if (event.target.closest("#admin-account-toggle")) {
    setAccountMenu($("#admin-account-menu").hidden); return;
  }
  if (!$("#admin-account-menu").hidden && !event.target.closest(".admin-account")) setAccountMenu(false, true);
  const logout = event.target.closest("#admin-logout");
  if (logout) {
    await logoutSession({ button: logout, api, notify, onSignedOut() {
      user = null; csrfToken = ""; pendingOrders = undefined;
      setAccountMenu(false); $(".admin-account").hidden = true; $(".workspace-session").hidden = true;
      $("#admin-menu-toggle").hidden = true;
      $("#admin-dialog").close();
      gate("Bạn đã đăng xuất. Đăng nhập để tiếp tục quản lý cửa hàng.", true);
    } }); return;
  }
  const link = event.target.closest("a[data-section], a[data-admin-home], a[data-admin-href]");
  if (link && !event.defaultPrevented && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    if (link.hasAttribute("data-admin-home")) void navigateAdmin("/quan-tri");
    else void navigateAdmin(link.getAttribute("href"));
  }
});
root.addEventListener("click", event => {
  const folder = event.target.closest(".navigation-folder");
  if (!folder) return;
  const id = folder.closest("[data-navigation-group]").dataset.navigationGroup;
  if (openedGroups.has(id)) openedGroups.delete(id); else openedGroups.add(id);
  updateNavigation();
});
document.addEventListener("keydown", event => {
  const search = $("#admin-nav-search");
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && search) {
    event.preventDefault(); if (matchMedia("(max-width: 900px)").matches) setMobileMenu(true); search.focus(); return;
  }
  if (!$("#admin-account-menu").hidden) {
    const items = $$("#admin-account-menu [role=menuitem]");
    const index = items.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault(); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length].focus(); return;
    }
    if (event.key === "Escape") { event.preventDefault(); setAccountMenu(false, true); return; }
    if (event.key === "Tab") setAccountMenu(false);
  }
  if (event.target === search && event.key === "Escape") { event.preventDefault(); search.value = ""; updateNavigation(); search.blur(); }
  if (event.target === search && event.key === "Enter") {
    event.preventDefault(); const first = $("#workspace-navigation [data-section]:not([hidden])");
    if (first) void navigateAdmin(first.getAttribute("href"));
  }
});
function header(title, text, button = "") {
  return `<div class="content-header"><div><h1>${title}</h1><p>${text}</p></div>${button}</div>`;
}
function refreshButton() {
  return `<button class="secondary" id="refresh-view">${icon("refresh")} Làm mới</button>`;
}
function dashboardMarkup(stats) {
  const href = id => adminNav.find(item => item.id === id).href + (id === "orders" ? "?status=pending" : id === "inventory" ? "?stock=alert" : "");
  const kpis = [
    { id: "orders", label: "ĐƠN CHỜ XÁC NHẬN", value: Number(stats.pendingOrders || 0).toLocaleString("vi-VN"), note: `${Number(stats.orders || 0)} đơn được ghi nhận tổng cộng`, icon: "bag", tone: "amber", highlighted: Number(stats.pendingOrders || 0) > 0 },
    { id: "reports-editor", label: "TIỀN ĐÃ THU", value: money(stats.revenue), note: "Các khoản thanh toán đã xác nhận", icon: "wallet", tone: "green", money: true },
    { id: "catalog-editor", label: "SẢN PHẨM", value: Number(stats.products || 0), note: `${Number(stats.variants || 0)} SKU / quy cách`, icon: "box", tone: "blue" },
    { id: "inventory", label: "CẢNH BÁO TỒN THẤP", value: Number(stats.lowStock || 0), note: "Kiểm tra hàng có thể bán", icon: "alert", tone: "red" },
  ];
  return `<div class="dashboard-page">${header("Tổng quan", "Theo dõi đơn hàng, doanh thu và tồn kho.", refreshButton())}<div class="stats-grid">${kpis.map(kpi => `<a class="stat-card ${kpi.highlighted ? "has-pending" : ""}" href="${href(kpi.id)}" data-admin-href><span class="stat-label">${kpi.label}</span><span class="stat-icon stat-icon-${kpi.tone}">${icon(kpi.icon)}</span><strong class="${kpi.money ? "stat-money" : ""}">${kpi.value}</strong><em>${kpi.note}</em></a>`).join("")}</div><div id="dashboard-insights"></div></div>`;
}

function productsMarkup() {
  return `<section class="panel">${header("Sản phẩm & SKU", "Giá mặc định dùng cho kho chưa đặt giá riêng. Giá bán thực tế được quản lý tại mục Quản lý nhiều kho.", refreshButton())}<div class="table-controls"><label class="table-filter-label">Tìm sản phẩm<input id="product-search" type="search" placeholder="Tìm tên sản phẩm, SKU, thương hiệu…" aria-label="Tìm sản phẩm quản trị"></label><label class="table-filter-label">Trạng thái bán<select id="product-status" aria-label="Lọc trạng thái sản phẩm"><option value="">Tất cả trạng thái</option><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option><option value="draft">Bản nháp</option></select></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / quy cách</th><th scope="col">Giá bán</th><th scope="col">Có thể bán</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="product-table-body">${productTable(productRows)}</tbody></table></div></section>`;
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
    )}</select></label><label class="table-filter-label">Đối soát<select id="order-bank-filter"><option value="">Tất cả thanh toán</option><option value="pending" ${bankOnly ? "selected" : ""}>Chờ đối soát</option></select></label></div>${bankOnly ? '<p class="support-text">Đơn chuyển khoản còn chờ đối soát, sắp xếp cũ nhất trước.</p>' : ""}<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Mã đơn / thời gian</th><th scope="col">Người nhận</th><th scope="col">Tổng cộng</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead><tbody id="order-table-body">${orderTable(orderRows)}</tbody></table></div></section>`;
}
function orderTable(rows) {
  return (
    rows
      .map(
        (order) =>
          `<tr><td><b>${escape(order.id)}</b><div class="small muted">${date(order.createdAt)}</div></td><td>${escape(order.customer?.name)}<div class="small muted">${escape(order.customer?.phone)}</div></td><td class="price-cell ${order.payment === "bank_transfer" && order.paymentStatus === "pending" ? "bank-reconciliation-cell" : ""}">${money(order.total)}<div class="small muted" style="font-weight:400">${escape(paymentLabel(order.payment || "cod"))}</div>${order.payment === "bank_transfer" && order.paymentStatus === "pending" && order.status !== "cancelled" ? `<div class="bank-reconcile-info"><div>Cần thu: ${money(order.total)} <button type="button" class="secondary" data-bank-copy="${order.total}" aria-label="Sao chép số tiền">Sao chép</button></div><div>Nội dung: ${escape(order.transfer?.reference || "—")} <button type="button" class="secondary" data-bank-copy="${escape(order.transfer?.reference || order.id)}" aria-label="Sao chép nội dung">Sao chép</button></div><div>Chờ ${Math.max(0, Math.floor((Date.now()-new Date(order.createdAt).getTime())/60000))} phút${order.transferReportedAt ? " · Khách báo đã chuyển khoản" : ""}</div></div>` : ""}</td><td>${badge(order.status)}</td><td><button class="secondary" data-admin-order="${escape(order.id)}">Xem / xử lý</button></td></tr>`,
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
  return `<section class="panel">${header("Kho & tồn hàng", "Có thể bán = tồn thực tế − lượng giữ cho đơn chưa xuất.", refreshButton())}<div class="table-controls"><label class="table-filter-label">Tìm sản phẩm / SKU<input id="inventory-search" type="search" placeholder="Tìm tên sản phẩm hoặc mã SKU…" aria-label="Tìm sản phẩm trong kho"></label><label class="table-filter-label">Kho hàng<select id="inventory-warehouse" aria-label="Lọc kho"><option value="">Tất cả kho</option>${warehouses.map((warehouse) => `<option value="${escape(warehouse.id)}">${escape(warehouse.name)}</option>`).join("")}</select></label><label class="table-filter-label">Tình trạng tồn<select id="inventory-stock"><option value="">Tất cả</option><option value="alert">Cảnh báo tồn thấp</option><option value="out">Hết hàng</option><option value="low">Sắp hết</option><option value="enough">Đủ hàng</option></select></label><label class="table-filter-label">Sắp xếp<select id="inventory-sort"><option value="">Theo sản phẩm</option><option value="available">Có thể bán tăng dần</option></select></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Sản phẩm / SKU</th><th scope="col">Kho</th><th scope="col">Tồn thực tế</th><th scope="col">Đang giữ</th><th scope="col">Có thể bán</th><th scope="col">Thao tác</th></tr></thead><tbody id="inventory-table-body">${inventoryTable(inventoryRows)}</tbody></table></div><p class="support-text">Kho hư hỏng được tách khỏi kho bán thông thường. Việc chuyển kho có thể cần nghiệp vụ riêng; biểu mẫu hiện tại chỉ ghi điều chỉnh tăng hoặc giảm tại một kho.</p></section>`;
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
            (state === "alert" ? isLowStockAlert(row) : row.warehouseType !== "damaged" &&
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
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${rows.map((u) => `<tr><td>${escape(u.full_name)}<br>${escape(u.email)}<br>${escape(u.phone)}<br><small>Đăng ký: ${date(u.created_at)}</small></td><td>${escape(u.roles.map((r) => roleLabels[r] || r).join(", "))}</td><td>${u.status === "active" ? "Hoạt động" : "Vô hiệu hóa"}</td><td>${u.roles.includes("customer") ? `<button data-customer="${Number(u.id)}">Xem khách hàng</button>` : ""}<button data-staff="${Number(u.id)}">Phân quyền</button></td></tr>`).join("")}</tbody></table></div>`;
}

async function openCustomer(id, page = 1) {
  const version = ++viewVersion,
    content = $("#admin-content");
  content.innerHTML =
    '<section class="panel" role="status">Đang tải khách hàng…</section>';
  try {
    const data = await api(`/api/admin/customers/${id}?page=${page}`);
    if (version !== viewVersion) return;
    const c = data.customer;
    content.innerHTML = `<section class="panel customer-profile"><div class="content-header"><div><h1>Thông tin khách hàng</h1><p>Hồ sơ, địa chỉ đã lưu và đơn đặt bằng tài khoản. Đơn mua không đăng nhập được xem ở mục Đơn hàng.</p></div><button id="back-to-users" class="secondary">Quay lại danh sách</button></div><div class="detail-split"><div><h2>${escape(c.full_name)}</h2><p>Điện thoại: ${escape(c.phone)}</p><p>Email: ${escape(c.email || "Chưa cung cấp")}</p><p>Trạng thái: ${c.status === "active" ? "Hoạt động" : "Vô hiệu hóa"}</p><p>Ngày đăng ký: ${date(c.created_at)}</p>${c.is_demo ? "<p>Tài khoản từ bản demo cũ; cần xác minh trước khi hỗ trợ chuyển sang sử dụng thường.</p>" : ""}</div><div><h2>Tổng quan đơn hàng</h2><p>Số đơn: ${Number(data.summary.orders)}</p><p>Tổng giá trị đơn không hủy: ${money(data.summary.total)}</p></div></div><h2>Địa chỉ nhận hàng</h2><div class="customer-addresses">${data.addresses.map((a) => `<article class="panel"><h3>${escape(a.recipient_name)}${a.is_default ? " · Mặc định" : ""}</h3><p>${escape(a.phone)}</p><p>${escape(a.address_detail)}, ${escape(a.district)}, ${escape(a.province)}</p></article>`).join("") || "<p>Chưa có địa chỉ đã lưu.</p>"}</div><h2>Lịch sử đơn hàng</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Trạng thái</th><th>Tổng tiền</th><th>Đã thu</th></tr></thead><tbody>${data.orders.map((o) => `<tr><td>${escape(o.order_number)}</td><td>${date(o.created_at)}</td><td>${badge(o.status)}</td><td>${money(o.grand_total)}</td><td>${money(o.collected)}</td></tr>`).join("") || '<tr><td colspan="5">Chưa có đơn hàng bằng tài khoản này.</td></tr>'}</tbody></table></div><div class="actions">${page > 1 ? `<button data-customer="${id}" data-customer-page="${page - 1}">Trang trước</button>` : ""}<span>Trang ${page}</span>${page * 20 < Number(data.summary.orders) ? `<button data-customer="${id}" data-customer-page="${page + 1}">Trang sau</button>` : ""}</div>${c.status === "active" && c.recovery_allowed ? `<section class="dialog-section"><h2>Hỗ trợ khôi phục mật khẩu</h2><p>Chỉ dùng sau khi đã xác minh người sở hữu qua quy trình hỗ trợ; biết số điện thoại/email không đủ. Link dùng một lần trong 30 phút; khi đặt lại sẽ đăng xuất mọi phiên cũ.${c.is_demo ? " Hoàn tất link hỗ trợ cũng chuyển tài khoản demo cũ sang tài khoản khách hàng thường." : ""}</p><form id="customer-support-form" data-customer-id="${id}"><label class="role-option"><input name="ownershipConfirmed" type="checkbox" required> Tôi đã xác minh người yêu cầu là chủ tài khoản.</label><div class="field"><label for="support-current-password">Mật khẩu admin hiện tại</label><input id="support-current-password" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="form-error" role="alert"></div><button class="primary">Tạo link hỗ trợ một lần</button><div id="support-link-result" role="status"></div></form></section>` : ""}</section>`;
    prepareMobileTables();
    content.focus();
  } catch (e) {
    if (version === viewVersion)
      content.innerHTML = `<section class="panel"><p class="form-error" role="alert">${escape(e.message)}</p><button id="back-to-users">Quay lại danh sách</button></section>`;
  }
}

root.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.id !== "customer-support-form") return;
  event.preventDefault();
  const button = form.querySelector("button");
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true;
  form.querySelector(".form-error").textContent = "";
  try {
    const data = Object.fromEntries(new FormData(form));
    const result = await api(
      `/api/admin/customers/${form.dataset.customerId}/recovery`,
      {
        method: "POST",
        body: {
          currentPassword: data.currentPassword,
          ownershipConfirmed: data.ownershipConfirmed === "on",
        },
      },
    );
    form.elements.currentPassword.value = "";
    $("#support-link-result").innerHTML =
      `<p>Link chỉ dành cho khách hàng vừa xác minh. Không gửi vào nhóm công khai. Hết hạn: ${date(result.expiresAt)}</p><label>Link đặt lại mật khẩu<input readonly class="customer-recovery-link" value="${escape(new URL(result.path, location.origin).href)}"></label>`;
  } catch (e) {
    form.querySelector(".form-error").textContent = e.message;
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});
async function renderView(view, { focus = true, fromRoute = false } = {}) {
  const selected = sections.find((section) => section.id === view);
  if (!selected || !has(selected.permission)) return;
  activeView = view;
  if (!fromRoute && resolveAdminRoute(location.pathname)?.item.id !== view) history.pushState(null, "", selected.href);
  if (selected.group) openedGroups.add(selected.group);
  document.title = selected.label + " | Jielien Admin";
  updateNavigation(); updateBreadcrumb(); setMobileMenu(false);
  const filters = readAdminFilters(view, location.search);
  if (view === "orders") bankOnly = filters.bankPending;
  const version = ++viewVersion;
  const content = $("#admin-content");
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
      void refreshNavigationBadge(stats);
    }
    if (view === "products") {
      ({ products: productRows = [] } = await api("/api/admin/products"));
      html = productsMarkup();
    }
    if (view === "orders") {
      ({ orders: orderRows = [] } = await api("/api/admin/orders" + adminFilterSearch("orders", filters)));
      html = ordersMarkup();
      void refreshNavigationBadge();
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
    if (view === "orders") { $("#order-status").value = filters.status; filterOrders(); }
    if (view === "inventory") { $("#inventory-stock").value = filters.stock; filterInventory(); }
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
              insights.innerHTML = reportVisuals(report, escape, { dashboard: true });
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
  $("#admin-dialog").dataset.kind = type;
  $("#admin-dialog-title").textContent = title;
  $("#admin-dialog-content").innerHTML = html;
  $("#admin-dialog").showModal();
  $("#admin-dialog [data-close-dialog]").focus({ preventScroll: true });
  $("#admin-dialog-content").scrollTop = 0;
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
  const address = [c.address, c.ward || c.district, c.province]
    .filter(Boolean)
    .join(", ");
  const count = (order.items || []).reduce(
    (total, item) => total + Number(item.quantity),
    0,
  );
  return `<div class="order-workspace"><div class="order-overview"><section class="order-customer-card" aria-labelledby="order-customer-heading"><h3 id="order-customer-heading">${icon("user")} Thông tin khách hàng</h3><p class="order-customer-name">${escape(c.name || "Chưa có tên người nhận")}</p>${c.phone ? `<a class="order-customer-phone" href="tel:${escape(String(c.phone).replace(/[^+0-9]/g, ""))}">${icon("phone")} ${escape(c.phone)}</a>` : ""}<div class="order-address"><span>Địa chỉ giao hàng</span><p>${escape(address || "Chưa có địa chỉ")}</p></div></section><section class="order-status-card" aria-labelledby="order-information-heading"><h3 id="order-information-heading">${icon("receipt")} Thông tin đơn hàng</h3><dl class="order-information"><div><dt>Mã đơn</dt><dd>${escape(order.id)}</dd></div><div><dt>Ngày đặt</dt><dd>${date(order.createdAt)}</dd></div><div><dt>Trạng thái</dt><dd>${badge(order.status)}</dd></div><div><dt>Phương thức</dt><dd>${escape(paymentLabel(order.payment || "cod"))}</dd></div><div><dt>Thanh toán</dt><dd>${paymentBadge(order.paymentStatus)}</dd></div></dl></section></div><div class="order-content-grid"><div class="order-products-column"><section class="order-products-card"><div class="order-section-heading"><h3>Sản phẩm trong đơn</h3><span>${count} sản phẩm</span></div>${(order.items || []).map((item) => `<article class="order-preview order-product-line"><img src="${escape(item.image)}" alt="" width="72" height="72"><div class="order-product-info"><h4>${escape(item.name)}</h4><p>Số lượng <b>${Number(item.quantity)}</b> <span>× ${money(item.price)}</span></p></div><strong class="order-line-total">${money(item.lineTotal)}</strong></article>`).join("")}${!order.items?.length ? '<p class="support-text">Chưa có sản phẩm trong đơn.</p>' : ""}</section>${order.note ? `<section class="order-note-card"><h3>Ghi chú của khách</h3><p>${escape(order.note)}</p></section>` : ""}</div><aside class="order-actions-column"><section class="order-totals-card"><h3>Thông tin thanh toán</h3><div class="total-row"><span>Tiền hàng</span><b>${money(order.subtotal)}</b></div><div class="total-row"><span>Giảm giá</span><b>−${money(order.discount)}</b></div><div class="total-row"><span>Giao hàng</span><b>${order.shipping ? money(order.shipping) : "Miễn phí"}</b></div><div class="total-row grand"><span>Tổng cộng</span><b>${money(order.total)}</b></div></section><section class="dialog-section order-processing-card"><h3>Xử lý đơn hàng</h3>${next.length ? `<form id="order-status-form"><div class="field"><label for="new-status">Trạng thái tiếp theo</label><select id="new-status" name="status">${next.map((status) => `<option value="${status}">${statusLabel(status)}</option>`).join("")}</select></div><div class="field"><label for="status-reason">Ghi chú xử lý</label><textarea id="status-reason" name="reason" maxlength="500" placeholder="Thông tin cần ghi nhận trong lịch sử đơn (nếu có)"></textarea></div><div id="mutation-error" class="form-error" role="alert"></div><button class="primary">Cập nhật trạng thái</button><p class="support-text">Hủy đơn sẽ hoàn phần giữ hàng; xuất giao sẽ giảm tồn thực tế.</p></form>` : `<p class="support-text">${has("orders.manage") ? "Đơn đã kết thúc; không có trạng thái tiếp theo trong luồng hiện tại." : "Bạn đang xem đơn hàng. Tài khoản chưa có quyền thay đổi trạng thái."}</p>`}</section>${paymentMarkup(order)}</aside></div></div>`;
}
function paymentMarkup(order) {
  if (!has("payments.reconcile")) return "";
  if (order.payment === "bank_transfer") {
    const transfer = order.transfer;
    const details = transfer
      ? `<dl class="profile-grid"><div><dt>Ngân hàng</dt><dd>${escape(transfer.bankName)}</dd></div><div><dt>Tài khoản nhận</dt><dd>${escape(transfer.accountNumber)}</dd></div><div><dt>Chủ tài khoản</dt><dd>${escape(transfer.accountName)}</dd></div><div><dt>Nội dung chuyển khoản</dt><dd><b>${escape(transfer.reference)}</b> <button type="button" class="secondary" data-bank-copy="${escape(transfer.reference)}">Sao chép nội dung</button></dd></div><div><dt>Số tiền cần đối soát</dt><dd><b>${money(order.total)}</b> <button type="button" class="secondary" data-bank-copy="${order.total}">Sao chép số tiền</button></dd></div></dl>`
      : "";
    const active =
      Object.hasOwn(transitions, order.status) && order.status !== "cancelled" && !(order.paymentStatus === "pending" && order.paymentExpiresAt && new Date(order.paymentExpiresAt).getTime() <= Date.now());
    const confirm =
      active && order.paymentStatus === "pending"
        ? `<p class="support-text">Đối chiếu sao kê ngân hàng: nhận đủ ${money(order.total)} và đúng nội dung đơn hàng trước khi xác nhận. Khách gửi yêu cầu đặt hàng hoặc ảnh chuyển khoản không tự làm đơn thành đã thanh toán.</p><form id="bank-transfer-form"><label>Số tiền thực nhận (đồng)<input id="bank-received-amount" name="receivedAmount" type="number" min="0" step="1" required inputmode="numeric" placeholder="Nhập số tiền trên sao kê"></label><label>Mã giao dịch ngân hàng (khuyến khích)<input name="bankTransactionRef" maxlength="100" placeholder="Không nhập thông tin cá nhân"></label><p id="bank-amount-warning" class="form-error" role="alert" hidden>Số tiền thực nhận khác số phải thu. Kiểm tra thiếu/thừa tiền trước khi xác nhận.</p><label id="bank-mismatch-label" hidden><input type="checkbox" name="mismatchConfirmed"> Tôi đã kiểm tra, đồng ý đánh dấu đã thanh toán và xử lý phần chênh lệch riêng.</label><div id="bank-transfer-error" class="form-error" role="alert"></div><button class="primary">Xác nhận đã nhận chuyển khoản</button></form>`
        : `<p class="support-text">${order.paymentStatus === "paid" ? "Khoản chuyển này đã được xác nhận. Lịch sử ghi nhận được lưu trong nhật ký hệ thống." : "Đơn đã hủy/hết hạn hoặc không còn chờ đối soát. Nếu đã nhận tiền, cần xử lý hoàn tiền hoặc tạo lại đơn; không xác nhận cho đơn này."}</p>`;
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
  if (order) {
    if (!$("#admin-dialog").open) showDialog("Đơn hàng " + number, orderDetail(order), "order", order);
    else {
      dialogType = "order"; dialogItem = order;
      $("#admin-dialog-title").textContent = "Đơn hàng " + number;
      $("#admin-dialog-content").innerHTML = orderDetail(order);
    }
    const href = adminNav.find(item => item.id === "orders").href + "/" + encodeURIComponent(number) + adminFilterSearch("orders", readAdminFilters("orders", location.search));
    if (location.pathname + location.search !== href) history.pushState(null, "", href);
    updateBreadcrumb();
  }
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
        { method: "POST", body: { receivedAmount: Number(data.receivedAmount), bankTransactionRef: data.bankTransactionRef || "", mismatchConfirmed: data.mismatchConfirmed === "on" } },
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
  const customer = event.target.closest("[data-customer]");
  if (customer) {
    void openCustomer(
      Number(customer.dataset.customer),
      Number(customer.dataset.customerPage || 1),
    );
    return;
  }
  if (event.target.closest("#back-to-users")) {
    void renderView("users");
    return;
  }
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
function updateFilterUrl(patch) {
  const filters = { ...readAdminFilters(activeView, location.search), ...patch };
  const item = adminNav.find(item => item.id === activeView);
  const href = item.href + adminFilterSearch(activeView, filters);
  if (location.pathname + location.search !== href) history.pushState(null, "", href);
}
root.addEventListener("change", (event) => {
  if (event.target.id === "order-bank-filter") {
    updateFilterUrl({ bankPending: event.target.value === "pending" });
    void renderView("orders");
  }
  if (event.target.id === "product-status") filterProducts();
  if (event.target.id === "order-status") { updateFilterUrl({ status: event.target.value }); void renderView("orders"); }
  if (
    ["inventory-warehouse", "inventory-stock", "inventory-sort"].includes(
      event.target.id,
    )
  )
    {
      if (event.target.id === "inventory-stock") updateFilterUrl({ stock: event.target.value });
      filterInventory();
    }
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
    const linkedOrder = new URLSearchParams(location.search).get("order");
    if (linkedOrder && has("orders.read")) history.replaceState(null, "", adminNav.find(item => item.id === "orders").href + "/" + encodeURIComponent(linkedOrder));
    if (location.pathname === "/admin.html" || (location.pathname === "/quan-tri" && !has("dashboard.read"))) {
      history.replaceState(null, "", sections.find(item => has(item.permission)).href);
    }
    await navigateAdmin(location.pathname + location.search, { historyMode: "none", focus: false });
    if (activeView !== "dashboard" && activeView !== "orders") void refreshNavigationBadge();
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

document.addEventListener("input", event => {
  if (!event.target.matches('#bank-transfer-form [name="receivedAmount"]')) return;
  const form = event.target.form;
  const mismatch = event.target.value !== "" && Number(event.target.value) !== Number(dialogItem?.total);
  form.querySelector("#bank-amount-warning").hidden = !mismatch;
  form.querySelector("#bank-mismatch-label").hidden = !mismatch;
  form.elements.mismatchConfirmed.required = mismatch;
  form.elements.mismatchConfirmed.checked = false;
});
document.addEventListener("click", async event => {
  const copy = event.target.closest("[data-bank-copy]");
  if (!copy) return;
  try { await navigator.clipboard.writeText(copy.dataset.bankCopy); notify("Đã sao chép."); }
  catch { notify("Chưa sao chép được. Bạn chọn và sao chép thông tin đang hiển thị."); }
});

async function navigateAdmin(href, { historyMode = "push", focus = true } = {}) {
  if (!user) return;
  const version = ++routeVersion;
  const target = new URL(href, location.origin);
  if (target.origin !== location.origin) return;
  const nextUrl = target.pathname + target.search;
  const route = resolveAdminRoute(target.pathname);
  if (!route || !has(route.item.permission)) {
    if (historyMode !== "none" && location.pathname + location.search !== nextUrl) history.pushState(null, "", nextUrl);
    $("#admin-content").innerHTML = '<section class="panel"><h1>Không thể mở mục quản trị</h1><p>Đường dẫn không tồn tại hoặc tài khoản chưa có quyền truy cập.</p></section>';
    return;
  }
  if ($("#admin-dialog").open) { ignoreDialogClose = true; $("#admin-dialog").close(); }
  if (historyMode !== "none" && location.pathname + location.search !== nextUrl) history.pushState(null, "", nextUrl);
  await renderView(route.item.id, { focus, fromRoute: true });
  if (version !== routeVersion) return;
  if (route.detailId) {
    try {
      const { order } = await api("/api/admin/orders/" + encodeURIComponent(route.detailId));
      if (version !== routeVersion) return;
      if (!orderRows.some(row => row.id === order.id)) orderRows.push(order);
      openOrder(order.id);
    } catch (error) { if (version === routeVersion) { notify(error.message); updateBreadcrumb(); } }
  }
}
window.addEventListener("popstate", () => { void navigateAdmin(location.pathname + location.search, { historyMode: "none" }); });
$("#admin-dialog").addEventListener("close", () => {
  if (ignoreDialogClose) { ignoreDialogClose = false; return; }
  const route = resolveAdminRoute(location.pathname);
  if (user && route?.detailId && !$("#admin-dialog").open) {
    history.replaceState(null, "", route.item.href + adminFilterSearch(route.item.id, readAdminFilters(route.item.id, location.search))); updateBreadcrumb();
  }
});
