import { createWarehouseEditor } from "/warehouse-admin.js";
import { createBankSettingsEditor } from "/bank-settings-admin.js";
import { reportVisuals } from "/report-visuals.js";
import { icon } from "/ui-icons.js";
// Editors share the existing authenticated API/CSRF adapter and permission gate.
export function createCommerceEditors({ root, api, has, escape: e, notify }) {
  const bankSettingsEditor = createBankSettingsEditor({ root, api, has, escape: e, notify });
  const warehouseEditor = createWarehouseEditor({
    root,
    api,
    has,
    escape: e,
    notify,
  });
  const $ = (s) => root.querySelector(s);
  let product = null,
    article = null,
    roles = [],
    tax = {},
    assets = [],
    documents = [],
    importPreview = null,
    returnRows = [],
    companyItems = [],
    couponItems = [],
    reportQuery = "",
    auditQuery = "";
  let cmsQuery = "",
    bannerRows = [],
    taxonomyKind = "categories";
  let articleDirty = 0,
    savingArticle = false;
  const field = (label, name, value = "", type = "text", extra = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
  const area = (label, name, value = "") =>
    `<label>${label}<textarea name="${name}">${e(value)}</textarea></label>`;
  const button = (label, action) =>
    `<button type="button" class="secondary" data-editor-action="${action}">${label}</button>`;
  const option = (value, label, selected) =>
    `<option value="${e(value)}" ${selected ? "selected" : ""}>${e(label)}</option>`;
  const select = (label, name, items, value) =>
    `<label>${label}<select name="${name}"><option value="">— Chọn —</option>${items.map((x) => option(x.id, x.name, Number(value) === Number(x.id))).join("")}</select></label>`;
  const result = '<p id="editor-error" class="form-error" role="alert"></p>';
  const jsonArea = (label, name, value) =>
    area(label, name, JSON.stringify(value, null, 2));
  let previewMode = "desktop";
  const bannerSlots = {
    home_hero: "Trang chủ · Ảnh lớn đầu trang",
    home_side_top: "Trang chủ · Ô ảnh phía trên",
    home_side_bottom: "Trang chủ · Ô ảnh phía dưới",
    home_wide: "Trang chủ · Banner ngang",
    category_hero: "Danh mục · Banner đầu trang",
    article_featured: "Tin tức · Banner nổi bật",
    article_left: "Bên trái bài viết",
    article_right: "Bên phải bài viết",
    article_inline: "Giữa bài viết",
    sidebar_mid: "Sidebar bài viết",
    list_top: "Đầu danh sách tin",
    list_left: "Bên trái danh sách tin",
    list_right: "Bên phải danh sách tin",
  };
  const names = {
    categories: "Danh mục",
    brands: "Thương hiệu",
    attributes: "Thuộc tính",
  };
  const states = {
    draft: "Bản nháp",
    in_review: "Chờ duyệt",
    approved: "Đã duyệt",
    scheduled: "Đặt lịch",
    published: "Đã xuất bản",
    archived: "Lưu trữ",
    active: "Đang sử dụng",
    inactive: "Tạm ngưng",
  };
  const stateBadge = (status) =>
    `<span class="status-pill status-${e(status)}">${e(states[status] || status)}</span>`;
  const heading = (title, text, actions = "") =>
    `<div class="page-heading"><div><span class="page-eyebrow">JIELIEN WORKSPACE</span><h1>${title}</h1><p>${text}</p></div><div class="page-actions">${actions}</div></div>`;
  const emptyState = (title, text) =>
    `<div class="workspace-empty">${icon("file")}<h3>${title}</h3><p>${text}</p></div>`;
  const metric = (title, value, note, type = "chart") =>
    `<article class="metric-card"><div class="metric-caption">${icon(type)}<span>${title}</span></div><strong>${e(value)}</strong><p>${note}</p></article>`;
  const dateInput = (value) => {
    const d = new Date(value);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  };
  function taxonomyMarkup() {
    const kind = taxonomyKind,
      rows = tax[kind];
    return `${heading("Danh mục & thuộc tính", "Sắp xếp sản phẩm rõ ràng để khách hàng dễ tìm kiếm.", has("catalog.edit") ? button("+ Thêm mới", "taxonomy-new") : "")}<div class="workspace-tabs" aria-label="Nhóm dữ liệu">${Object.entries(
      names,
    )
      .map(
        ([key, label]) =>
          `<button type="button" data-editor-action="taxonomy-tab:${key}" aria-pressed="${kind === key}">${label}<span>${tax[key].length}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="taxonomy-layout" data-taxonomy-kind="${kind}"><section class="panel"><div class="section-title"><h2>${names[kind]}</h2><span>${rows.length} mục</span></div><p id="taxonomy-action-message" class="form-error" role="alert" hidden></p><label class="taxonomy-search">Tìm ${names[kind].toLowerCase()}<input type="search" data-tax-search placeholder="Nhập tên hoặc mã để tìm…"></label><p class="taxonomy-search-empty muted" hidden>Không tìm thấy kết quả phù hợp.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Tên ${names[kind].toLowerCase()}</th><th>${kind === "attributes" ? "Giá trị" : "Trạng thái"}</th><th>Thao tác</th></tr></thead><tbody>${rows.map((x) => `<tr><td><b>${e(x.name)}</b><small class="row-description">${e(x.slug || x.code || "")}</small></td><td>${kind === "attributes" ? `<div class="value-chips">${(x.values || []).map((v) => `<span>${e(v.value)}</span>`).join("")}</div>` : stateBadge(x.status)}</td><td>${has("catalog.edit") ? `<div class="taxonomy-row-actions"><button type="button" class="secondary" data-tax-edit="${kind}:${x.id}" aria-label="Sửa ${e(x.name)}">Sửa</button><button type="button" class="secondary taxonomy-delete" data-editor-action="taxonomy-delete:${kind}:${x.id}" aria-label="Xóa ${e(x.name)}">Xóa</button></div>` : ""}</td></tr>`).join("")}</tbody></table>${!rows.length ? emptyState("Chưa có " + names[kind].toLowerCase(), "Thêm mục đầu tiên bằng biểu mẫu bên cạnh.") : ""}</div></section>${has("catalog.edit") ? `<aside id="taxonomy-editor-panel" class="panel"><h2>Thêm ${names[kind].toLowerCase()}</h2><p class="muted">Thông tin sẽ được dùng trong trình biên tập sản phẩm.</p>${taxonomyForm(kind)}</aside>` : ""}</div>${result}`;
  }
  async function loadTax() {
    for (const kind of ["categories", "brands", "attributes"])
      tax[kind] = (await api("/api/admin/catalog/" + kind)).items;
  }
  async function render(view) {
    if (view === "bank-settings-editor") return bankSettingsEditor.render();
    if (view === "warehouse-editor") return warehouseEditor.render();
    if (view === "catalog-editor") {
      const data = await api("/api/admin/catalog/products");
      return `<section class="panel">${heading("Sản phẩm & phân loại", "Tìm sản phẩm để chỉnh sửa thông tin, lựa chọn mua hàng và giá bán.", has("catalog.create") ? button("+ Thêm sản phẩm", "new-product") : "")}<form id="catalog-search" class="editor-toolbar"><label class="catalog-search-label">Tìm sản phẩm<input name="q" aria-label="Tìm sản phẩm/SKU/barcode" placeholder="Tên sản phẩm, mã SKU hoặc mã vạch"></label><button>Tìm kiếm</button></form><div id="catalog-results">${productTable(data)}</div>${result}</section>`;
    }
    if (view === "media-editor") {
      product = null;
      assets = (await api("/api/admin/media")).items;
      return `<section class="panel"><h1>Thư viện ảnh</h1>${uploadForm()}<div class="news-grid">${assets.map((a) => `<article><img width="150" height="150" src="${e(a.url)}" alt="${e(a.alt_text)}"><p>#${a.id}: ${e(a.alt_text)}</p><code>${e(a.url)}</code></article>`).join("")}</div>${result}</section>`;
    }
    if (view === "taxonomy-editor") {
      assets = has("media.read") ? (await api("/api/admin/media")).items : [];
      await loadTax();
      return taxonomyMarkup();
    }
    if (view === "cms-editor") {
      const { items } = await api("/api/admin/cms/articles" + cmsQuery);
      const filters = new URLSearchParams(cmsQuery);
      const canWrite = has("content.write");
      return `<div class="cms-workspace">
        ${heading("Tin tức & SEO", "Mở một bài để chỉnh sửa, kiểm tra SEO hoặc gửi duyệt.", canWrite ? button("+ Viết bài mới", "new-article") : "")}
        <section class="panel cms-list">
          <form id="cms-filter" class="content-list-controls">
            ${field("Tìm bài viết", "q", filters.get("q") || "", "search", 'placeholder="Nhập tiêu đề bài viết…"')}
            <label>Trạng thái<select name="status"><option value="">Tất cả trạng thái</option>${["draft", "in_review", "approved", "scheduled", "published", "archived"].map((v) => option(v, states[v], filters.get("status") === v)).join("")}</select></label>
            <button class="primary">Áp dụng</button>
          </form>
          <div class="section-title"><h2>Danh sách bài viết</h2><span>${items.length} bài</span></div>
          ${items.length ? `<ul class="cms-article-list">${items.map((a) => `<li><b>${e(a.title)}</b>${stateBadge(a.status)}
            <button type="button" class="secondary" data-article-id="${a.id}">${canWrite ? "Mở biên tập" : "Xem bài"}</button></li>`).join("")}</ul>` : emptyState("Chưa có bài viết phù hợp", filters.get("q") || filters.get("status") ? "Đổi từ khóa hoặc chọn lại trạng thái." : "Bấm Viết bài mới để bắt đầu.")}
        </section>
        ${has("content.manage") ? `<details class="panel content-options" id="cms-taxonomy"><summary>Quản lý chuyên mục và thẻ</summary>
          <div class="cms-two-fields"><div><h3>Thêm chuyên mục</h3>${cmsTaxForm("categories")}</div><div><h3>Thêm thẻ bài viết</h3>${cmsTaxForm("tags")}</div></div></details>` : ""}
        ${result}
      </div>`;
    }
    if (view === "documents-editor") {
      const data = await api("/api/admin/inventory/documents");
      documents = data.items;
      return `<section class="panel"><h1>Phiếu kho</h1><p>Nháp → Gửi duyệt → Phê duyệt → Ghi sổ. Ghi sổ lặp không làm thay đổi tồn lần hai.</p>${has("inventory.manage") ? `<form id="document-form" class="editor-form"><label>Loại phiếu<select name="type">${["receipt", "issue", "transfer", "stocktake"].map((v) => option(v, v)).join("")}</select></label>${select("Kho nguồn", "sourceWarehouseId", data.warehouses)}${select("Kho đích", "targetWarehouseId", data.warehouses)}${field("SKU ID", "variantId", "", "number", 'required min="1"')}${field("Số lượng (kiểm kê: tồn thực đếm)", "quantity", 1, "number", 'required min="0"')}${field("Lý do / chứng từ", "reason", "", "text", 'required minlength="3"')}<button class="primary">Tạo phiếu nháp</button></form>` : ""}<div class="table-wrap"><table class="data-table"><thead><tr><th>Phiếu</th><th>Nội dung</th><th>Trạng thái</th><th></th></tr></thead><tbody>${documents.map((d) => `<tr><td>#${d.id} ${e(d.type)}</td><td>${e(d.reason)}<br>${d.items.map((i) => `SKU ${i.variantId}: ${i.quantity}`).join(", ")}</td><td>${e(d.status)}</td><td>${d.status === "draft" && has("inventory.manage") ? button("Gửi duyệt", "doc:" + d.id + ":submit") : d.status === "submitted" && has("inventory.approve") ? button("Phê duyệt", "doc:" + d.id + ":approve") : d.status === "approved" && has("inventory.post") ? button("Ghi sổ", "doc:" + d.id + ":post") : ""}</td></tr>`).join("")}</tbody></table></div>${result}</section>`;
    }
    if (view === "returns-editor") {
      returnRows = (await api("/api/admin/returns")).items;
      const next = {
        requested: "authorize",
        authorized: "receive",
        received: "inspect",
        inspected: "approve",
        approved: "complete",
      };
      return `<section class="panel"><h1>Đổi trả hàng</h1><p>Chỉ áp dụng đơn đã giao. Kiểm định thực tế trước khi duyệt: niêm phong → kho thường, đã mở/hư → kho hư. Không tự hoàn tiền.</p><form id="return-form" class="editor-form">${field("Mã đơn JL", "orderNumber", "", "text", "required")}${field("SKU ID trong đơn", "variantId", "", "number", 'required min="1"')}${field("Số lượng", "quantity", 1, "number", 'required min="1"')}${field("Lý do", "reason", "", "text", 'required minlength="3"')}<label>Tình trạng<select name="condition">${["sealed", "opened", "damaged"].map((v) => option(v, { sealed: "Niêm phong", opened: "Đã mở", damaged: "Hư hỏng" }[v])).join("")}</select></label><button class="primary">Tạo yêu cầu</button></form><table class="data-table"><thead><tr><th>Yêu cầu</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${returnRows.map((r) => `<tr><td>#${r.id} ${e(r.order_number)}<br>${e(r.reason)}<br>${r.items.map((i) => `SKU ${i.variant_id}: ${i.quantity} (${e(i.condition)})`).join(", ")}</td><td>${e(r.status)}</td><td>${next[r.status] && (!["approve", "complete"].includes(next[r.status]) || has("inventory.approve")) ? button({ authorize: "Chấp nhận", receive: "Đã nhận hàng", inspect: "Đã kiểm định", approve: "Phê duyệt", complete: "Nhập kho hoàn" }[next[r.status]], "return:" + r.id + ":" + next[r.status]) : ""}</td></tr>`).join("")}</tbody></table>${result}</section>`;
    }
    if (view === "redirects-editor") {
      const { items } = await api("/api/admin/seo/redirects");
      return `<section class="panel"><h1>Chuyển hướng SEO</h1><p>Chỉ đường dẫn nội bộ. Không chuyển hướng đè trang đang hoạt động.</p><form id="redirect-form" class="editor-form">${field("Đường dẫn cũ", "oldPath", "", "text", "required")}${field("Đường dẫn đích đang public", "newPath", "", "text", "required")}<button class="primary">Lưu 301</button></form><p>${items.map((r) => e(r.old_path) + " → " + e(r.new_path)).join("<br>")}</p>${result}</section>`;
    }
    if (view === "operations-editor") {
      const data = await api("/api/admin/operations/status");
      const jobs = data.jobs.reduce((n, j) => n + Number(j.count), 0),
        fresh = data.backup && data.backup.ageHours <= 24;
      return `${heading("Trạng thái vận hành", "Theo dõi kết nối dữ liệu, sao lưu và lịch xuất bản.", button("Làm mới", "operations-refresh"))}<div class="health-grid"><article class="panel health-card"><div class="health-icon">${icon("check")}</div><span class="status-pill status-active">${data.database === "ok" ? "Đang kết nối" : "Cần kiểm tra"}</span><h2>Cơ sở dữ liệu</h2><p>PostgreSQL đang phản hồi yêu cầu kiểm tra.</p><small>Kiểm tra lúc ${e(new Date().toLocaleTimeString("vi-VN"))}</small></article><article class="panel health-card"><div class="health-icon">${icon("box")}</div><span class="status-pill ${fresh ? "status-active" : "status-draft"}">${data.backup ? (fresh ? "Có bản sao lưu gần đây" : "Cần kiểm tra lịch sao lưu") : "Chưa có bản ghi"}</span><h2>Sao lưu dữ liệu</h2><p>${data.backup ? e(new Date(data.backup.lastRecordedAt).toLocaleString("vi-VN")) : "Chưa ghi nhận bản sao lưu từ công cụ của ứng dụng."}</p><small>${data.backup ? Number(data.backup.mediaFiles) + " ảnh trong bản sao lưu" : "Tạo bản sao lưu trên máy chủ bằng công cụ đã cấu hình."}</small></article><article class="panel health-card"><div class="health-icon">${icon("clock")}</div><span class="status-pill status-scheduled">${jobs} tác vụ</span><h2>Lịch xuất bản</h2><p>${jobs ? "Tổng số tác vụ theo trạng thái hiện tại." : "Chưa có bài viết được đặt lịch."}</p><small>Lịch được thiết lập khi duyệt và xuất bản bài viết.</small></article></div><div class="two-column"><section class="panel"><h2>Chi tiết lịch xuất bản</h2>${data.jobs.length ? `<dl class="summary-list">${data.jobs.map((j) => `<div><dt>${e({ pending: "Đang chờ", processing: "Đang xử lý", completed: "Hoàn tất", done: "Hoàn tất", failed: "Thất bại", cancelled: "Đã hủy" }[j.state] || j.state)}</dt><dd>${Number(j.count)}</dd></div>`).join("")}</dl>` : emptyState("Không có tác vụ", "Đặt lịch trong phần Tin tức & SEO khi bài viết đã được duyệt.")}</section><section class="panel"><h2>Kiểm tra sao lưu</h2><div class="information-note">${icon("box")}<p>Có bản sao lưu chưa có nghĩa là đã khôi phục thử thành công. Nên kiểm tra khả năng khôi phục trên môi trường riêng.</p></div><p class="muted">Trang này cung cấp thông tin theo dõi. Liên hệ người quản lý máy chủ để kiểm tra lịch và nơi lưu bản sao.</p></section></div>`;
    }
    if (view === "audit-tools") {
      const data = await api("/api/admin/audit/search" + auditQuery);
      return `<section class="panel"><h1>Lọc & xuất nhật ký</h1><form id="audit-filter" class="editor-toolbar">${field("Action chính xác", "action")}${field("Actor ID", "actorId", "", "number")}<button>Lọc</button></form>${button("Export CSV tối đa 500 dòng", "audit-export")}<table class="data-table"><thead><tr><th>Thời gian</th><th>Actor</th><th>Thao tác</th><th>Đối tượng</th></tr></thead><tbody>${data.items.map((r) => `<tr><td>${e(new Date(r.created_at).toLocaleString("vi-VN"))}</td><td>${r.actor_id || "System"}</td><td>${e(r.action)}</td><td>${e(r.entity_type)} #${e(r.entity_id)}</td></tr>`).join("")}</tbody></table>${result}</section>`;
    }
    if (view === "reports-editor") {
      const { report } = await api("/api/admin/reports/summary" + reportQuery);
      const params = new URLSearchParams(reportQuery),
        from = params.get("from") || report.from,
        end = params.get("to")
          ? new Date(new Date(params.get("to")).getTime() - 86400000)
          : report.to;
      return `${heading("Báo cáo bán hàng", "Nắm bắt đơn hàng và số tiền thực thu trong khoảng thời gian bạn chọn.", button("Xuất báo cáo CSV", "report-export"))}<section class="panel report-filters"><form id="report-filter" class="filter-toolbar">${field("Từ ngày", "from", dateInput(from), "date", "required")}${field("Đến ngày", "to", dateInput(end), "date", "required")}<button class="primary">Xem báo cáo</button><div class="date-presets"><button type="button" data-editor-action="report-days:7">7 ngày</button><button type="button" data-editor-action="report-days:30">30 ngày</button><button type="button" data-editor-action="report-days:90">90 ngày</button></div></form></section><div class="report-period">${icon("clock")}<span>Kỳ báo cáo: <b>${e(new Date(from).toLocaleDateString("vi-VN"))} – ${e(new Date(end).toLocaleDateString("vi-VN"))}</b></span></div><div class="report-metrics">${metric("Tổng đơn hàng", Number(report.orders).toLocaleString("vi-VN"), "Số đơn được tạo trong kỳ", "file")}${metric("Giá trị đơn hàng", Number(report.gmv).toLocaleString("vi-VN") + " ₫", "Tổng giá trị các đơn chưa hủy", "chart")}${metric("Tiền đã thu", Number(report.collected).toLocaleString("vi-VN") + " ₫", "Các khoản thanh toán đã xác nhận", "check")}</div><div class="two-column"><section class="panel"><h2>${Number(report.orders) ? "Kết quả trong kỳ" : "Chưa có đơn hàng trong kỳ"}</h2><p class="muted">${Number(report.orders) ? "Báo cáo tổng hợp đã sẵn sàng. Xuất CSV để xem và lưu kết quả." : "Khi có đơn hàng mới, số liệu sẽ xuất hiện tại đây. Bạn cũng có thể chọn khoảng ngày khác."}</p><div class="information-note">${icon("chart")}<p>Số liệu lấy trực tiếp từ hệ thống đơn hàng và thanh toán.</p></div></section><section class="panel"><h2>Cách đọc báo cáo</h2><dl class="summary-list"><div><dt>Giá trị đơn hàng</dt><dd>Tính theo ngày tạo đơn, loại trừ đơn đã hủy.</dd></div><div><dt>Tiền đã thu</dt><dd>Tính theo thời điểm xác nhận thanh toán; dữ liệu cũ dùng ngày ghi nhận. Chưa trừ các khoản hoàn tiền thủ công.</dd></div></dl></section></div>${reportVisuals(report, e)}${result}`;
    }
    if (view === "settings-editor") {
      companyItems = (await api("/api/admin/settings/site")).items;
      const values = Object.fromEntries(
        companyItems.map((item) => [item.key, item.value_json]),
      );
      const fields = [
        ["tagline", "Thông điệp đầu trang", "text", "Thông điệp của cửa hàng"],
        ["trust1", "Cam kết 1", "text", "Chỉ nhập cam kết có thể thực hiện"],
        ["trust2", "Cam kết 2", "text", "Để trống nếu chưa có"],
        ["trust3", "Cam kết 3", "text", "Để trống nếu chưa có"],
        ["trust4", "Cam kết 4", "text", "Để trống nếu chưa có"],
        ["legalName", "Tên pháp lý", "text", "Tên đơn vị kinh doanh"],
        [
          "registrationNumber",
          "Mã đăng ký kinh doanh",
          "text",
          "Thông tin đã được xác nhận",
        ],

        ["companyName", "Tên cửa hàng", "text", "Tên cửa hàng của bạn"],
        ["hotline", "Hotline tư vấn", "tel", "Nhập số điện thoại thực tế"],
        ["zalo", "Liên kết Zalo", "url", "https://zalo.me/…"],
        ["messenger_url", "Liên kết Messenger", "url", "https://m.me/…"],
        [
          "email_support",
          "Email hỗ trợ",
          "email",
          "Địa chỉ email của cửa hàng",
        ],
        [
          "store_address",
          "Địa chỉ cửa hàng",
          "text",
          "Số nhà, đường, phường/xã, tỉnh/thành",
        ],
        [
          "working_hours",
          "Giờ làm việc",
          "text",
          "Nhập ngày và khung giờ hỗ trợ",
        ],
        [
          "footerText",
          "Giới thiệu ngắn",
          "text",
          "Một câu giới thiệu cửa hàng",
        ],
      ];
      return `${heading("Thông tin cửa hàng", "Cập nhật thông tin để khách liên hệ đúng nơi. Chỉ thông tin đã lưu mới xuất hiện trên website.")}<div class="company-layout"><section class="panel"><h2>Thông tin liên hệ công khai</h2><form id="company-form" class="editor-form">${fields.map(([key, label, type, placeholder]) => field(label, key, values[key] || "", type, `maxlength="500" placeholder="${e(placeholder)}" ${has("settings.write") ? "" : "disabled"}`)).join("")}<h2>Nội dung giới thiệu & chính sách</h2><p class="editor-note">Chỉ lưu nội dung đã được cửa hàng duyệt. Văn bản thuần, ngắt đoạn bằng một dòng trống; không cần nhập HTML.</p>${[
        ["policy_about", "Giới thiệu"],
        ["policy_shipping", "Giao hàng & thanh toán"],
        ["policy_returns", "Đổi trả"],
        ["policy_privacy", "Bảo mật"],
      ]
        .map(
          ([key, label]) =>
            `<label>${label}<textarea name="${key}" maxlength="10000" ${has("settings.write") ? "" : "disabled"}>${e(values[key] || "")}</textarea></label>`,
        )
        .join(
          "",
        )}<div class="form-actions">${has("settings.write") ? '<button class="primary">Lưu thông tin cửa hàng</button>' : ""}</div>${result}</form></section><aside class="panel company-guide">${icon("shield")}<h2>Bạn chủ động cập nhật</h2><p>Để trống kênh chưa sử dụng. Nút tư vấn chỉ xuất hiện khi có số điện thoại hoặc liên kết hợp lệ.</p><p>Ví dụ trong ô nhập chỉ để hướng dẫn, không được công khai như thông tin thật.</p><p>Không lưu mật khẩu, API key hoặc thông tin ngân hàng tại đây.</p></aside></div>`;
    }
    if (view === "import-editor") {
      importPreview = null;
      return `<section class="panel"><h1>CSV sản phẩm</h1><p>Import tối đa 200 dòng, chỉ lưu nháp, không sửa tồn. Dùng template trong docs/commerce-spec/templates; weight_grams là khối lượng nguyên gram. Upload ảnh và tạo danh mục/brand/thuộc tính trước. Export hiện là báo cáo SKU, không phải template import đầy đủ.</p>${button("Export SKU CSV", "csv-export")}${has("catalog.create") && has("catalog.edit") ? `<form id="import-form" class="editor-form"><label>CSV UTF-8<input type="file" name="file" accept=".csv" required></label><button>Preview & kiểm tra</button></form><div id="import-result" class="form-result"></div>` : ""}${result}</section>`;
    }
    if (view === "banners-editor") {
      const [library, banners] = await Promise.all([
        has("media.read") ? api("/api/admin/media") : { items: [] },
        api("/api/admin/banners"),
      ]);
      assets = library.items;
      bannerRows = banners.items;
      previewMode = "desktop";
      return bannerWorkspace();
    }
    if (view === "coupons-editor") {
      couponItems = (await api("/api/admin/coupons")).items;
      return `${heading("Mã giảm giá", "Tạo ưu đãi rõ ràng, kiểm soát điều kiện và lượt sử dụng.", button("Tạo mã mới", "coupon-new"))}<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Mã ưu đãi</th><th>Loại / mức giảm</th><th>Đơn tối thiểu</th><th>Đã dùng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${couponItems.map((c) => `<tr><td><b>${e(c.code)}</b></td><td>${e({ fixed: "Giảm số tiền", percentage: "Giảm phần trăm", shipping: "Phí giao hàng" }[c.discount_type])}<small class="row-description">${c.discount_type === "percentage" ? Number(c.discount_value) + "%" : Number(c.discount_value).toLocaleString("vi-VN") + " ₫"}</small></td><td class="numeric">${Number(c.minimum_order).toLocaleString("vi-VN")} ₫</td><td class="numeric">${Number(c.used_count)}${c.usage_limit ? " / " + Number(c.usage_limit) : ""}</td><td>${stateBadge(c.status)}</td><td><button type="button" class="secondary" data-editor-action="coupon-edit:${c.id}">Sửa ${e(c.code)}</button></td></tr>`).join("") || '<tr><td colspan="6">Chưa có mã ưu đãi. Tạo mã đầu tiên bên dưới.</td></tr>'}</tbody></table></div></section><section class="panel"><h2 id="coupon-editor-title">Tạo mã giảm giá</h2><form id="coupon-form" class="editor-form"><input type="hidden" name="id">${field("Mã ưu đãi", "code", "", "text", 'required maxlength="40"')}<label>Loại giảm giá<select name="discountType"><option value="fixed">Giảm số tiền (₫)</option><option value="percentage">Giảm phần trăm (%)</option><option value="shipping">Ưu đãi phí giao hàng</option></select></label>${field("Mức giảm (₫ hoặc %)", "discountValue", 0, "number", 'min="0" required')}${field("Giá trị đơn tối thiểu (₫)", "minimumOrder", 0, "number", 'min="0" required')}${field("Giới hạn lượt dùng (trống: không giới hạn)", "usageLimit", "", "number", 'min="1"')}<label>Trạng thái<select name="status"><option value="active">Đang áp dụng</option><option value="inactive">Tạm ngưng</option></select></label><div class="form-actions"><button class="primary">Lưu mã</button>${button("Hủy chỉnh sửa", "coupon-new")}</div></form>${result}</section>`;
    }
    return null;
  }
  function productTable(data) {
    return `<p>Tổng: ${data.total} · Trang ${data.page}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Sản phẩm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${data.items.map((p) => `<tr><td><b>${e(p.name)}</b></td><td>${stateBadge(p.status)}</td><td><button data-product-id="${p.id}">Mở sản phẩm</button></td></tr>`).join("")}</tbody></table></div>${data.page > 1 ? button("Trang trước", "catalog-page:" + (data.page - 1)) : ""}${data.items.length === 20 ? button("Trang sau", "catalog-page:" + (data.page + 1)) : ""}`;
  }
  function uploadForm() {
    return `<form id="upload-form" class="editor-form"><label>Ảnh JPEG/PNG/WebP tối đa 5 MB<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required></label>${field("Mô tả ảnh (alt)", "alt", "", "text", "required")}<button class="primary">Upload ảnh</button></form>`;
  }
  function taxonomyForm(kind, item = {}) {
    return `<form data-tax-kind="${kind}" data-tax-id="${item.id || ""}" class="editor-form taxonomy-form">${field("Tên " + names[kind].toLowerCase(), "name", item.name || "", "text", "required")}${field(kind === "attributes" ? "Mã thuộc tính" : "Đường dẫn (slug)", kind === "attributes" ? "code" : "slug", item.code || item.slug || "", "text", kind === "brands" ? "" : "required")}${
      kind === "categories"
        ? `<label>Danh mục cha<select name="parentId"><option value="">Không có (danh mục gốc)</option>${tax.categories
            .filter((c) => Number(c.id) !== Number(item.id))
            .map((c) =>
              option(c.id, c.name, Number(c.id) === Number(item.parent_id)),
            )
            .join("")}</select></label>`
        : ""
    }${kind === "attributes" ? attributeValuesEditor(item) : `<label>Trạng thái<select name="status">${["active", "inactive"].map((v) => option(v, states[v], (item.status || "active") === v)).join("")}</select></label>`}${
      kind === "categories"
        ? field(
            "Thứ tự hiển thị",
            "sortOrder",
            item.sort_order || 0,
            "number",
          ) +
          (has("media.read")
            ? select(
                "Ảnh danh mục",
                "imageAssetId",
                assets.map((a) => ({ id: a.id, name: a.alt_text })),
                item.image_asset_id,
              )
            : "")
        : ""
    }<div class="form-actions"><button class="primary">${item.id ? "Lưu thay đổi" : "Thêm " + names[kind].toLowerCase()}</button>${item.id ? button("Hủy chỉnh sửa", "taxonomy-cancel") : ""}</div></form>`;
  }
  function attributeValuesEditor(item) {
    return `<div class="attribute-values-editor"><h3>Lựa chọn thuộc tính</h3><p class="muted">Mỗi lựa chọn là một giá trị để phân loại sản phẩm. Các giá trị đã lưu được giữ nguyên để bảo toàn SKU đang sử dụng.</p><div class="value-chips">${(item.values || []).map((v) => `<span>${e(v.value)}</span>`).join("")}</div><textarea name="values" hidden>${e((item.values || []).map((v) => v.value).join("\n"))}</textarea><div data-new-values>${newValueRow()}</div>${button("+ Thêm lựa chọn", "attribute-value-add")}<small>Tối đa 100 giá trị; mỗi giá trị không quá 100 ký tự.</small></div>`;
  }
  function newValueRow() {
    return `<div class="attribute-value-row"><label>Lựa chọn mới<input data-new-value maxlength="100" placeholder="Ví dụ: 6–12 tháng"></label>${button("Bỏ", "attribute-value-remove")}</div>`;
  }
  function syncAttributeValues(form) {
    const saved =
      tax.attributes?.find((x) => String(x.id) === form.dataset.taxId)
        ?.values || [];
    form.elements.values.value = [
      ...new Set([
        ...saved.map((v) => v.value),
        ...[...form.querySelectorAll("[data-new-value]")]
          .map((i) => i.value.trim())
          .filter(Boolean),
      ]),
    ].join("\n");
  }
  function cmsTaxForm(kind) {
    return `<form data-cms-tax="${kind}" class="cms-fields">${field(kind === "categories" ? "Tên chuyên mục" : "Tên thẻ", "name", "", "text", 'required maxlength="150"')}
      <details class="content-options"><summary>Tùy chỉnh đường dẫn</summary>${field("Đường dẫn", "slug", "", "text", 'maxlength="150" placeholder="Tự tạo từ tên"')}</details>
      <button class="secondary">Tạo</button></form>`;
  }
  const shippingFields = [
    ["weightGrams", "weight_grams", "Khối lượng (g)"],
    ["lengthMm", "length_mm", "Dài (mm)"],
    ["widthMm", "width_mm", "Rộng (mm)"],
    ["heightMm", "height_mm", "Cao (mm)"],
  ];
  const slugFromName = (name) =>
    name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-").slice(0, 150).replace(/^-|-$/g, "");
  const productWritable = () =>
    has(product ? "catalog.edit" : "catalog.create");
  let productPhotos = [], stockBySku = new Map(), localSku = 0;
  let stockData = { items: [], balances: [], warehouses: [] };

  async function productEditor(productId) {
    const [record, library, inventory, , warehouses] = await Promise.all([
      productId ? api("/api/admin/catalog/products/" + productId) : null,
      has("media.read") ? api("/api/admin/media") : { items: [] },
      productId && has("inventory.read")
        ? api("/api/admin/catalog/products/" + productId + "/stock")
        : { items: [], balances: [], warehouses: [] },
      loadTax(),
      !productId && has("inventory.read")
        ? api("/api/admin/warehouses")
        : null,
    ]);
    assets = library.items;
    stockData = {
      items: inventory.items || [],
      balances: inventory.balances || [],
      warehouses: inventory.warehouses?.length
        ? inventory.warehouses
        : warehouses?.warehouses || [],
    };
    stockBySku = new Map(stockData.items.map((row) => [row.id, row.available]));
    setProductRecord(record?.product || null);
    renderProductEditor();
  }

  function setProductRecord(record) {
    product = record;
    productPhotos = (record?.media || []).map((m) => ({
      existingMediaId: m.id, url: m.url, alt: m.alt_text,
      skuKey: m.variant_id ? "saved-" + m.variant_id : null,
    }));
  }

  function renderProductEditor() {
    const p = product || {};
    const editParts = has("catalog.edit");
    const writable = productWritable();
    const canDraft = writable && (!p.id || p.status === "draft");
    const canDeactivate = p.id && writable && has("catalog.archive") && p.status !== "inactive";
    const canDelete = p.id && has("catalog.archive") && has("inventory.manage");
    const canPublish = writable && editParts && has("catalog.publish");
    const canUpdate = writable && (p.status !== "inactive" || has("catalog.archive"));
    const actions = [
      canDraft ? '<button class="secondary" type="submit" name="intent" value="draft">Lưu nháp</button>' : "",
      p.id && p.status !== "draft" && canUpdate ? '<button class="primary" type="submit" name="intent" value="update">Lưu thay đổi</button>' : "",
      canPublish && p.status !== "active" ? '<button class="primary" type="submit" name="intent" value="active">Xuất bản</button>' : "",
    ].join("");
    const showStock = has("inventory.read") && (editParts || p.id);
    const sections = [
      ["product-basics", "image", "Ảnh và thông tin cơ bản"],
      ["product-details", "file", "Mô tả sản phẩm"],
      ...(editParts || p.id ? [["product-variants", "tag", "Giá và biến thể"]] : []),
      ...(editParts || p.id ? [["product-shipping", "truck", "Vận chuyển"]] : []),
      ...(showStock ? [["product-stock", "box", "Tồn kho"]] : []),
    ];
    const sectionLinks = sections
      .map(([id, symbol, label]) => `<a href="#${id}">${icon(symbol)}${label}</a>`).join("");
    const library = assets.length ? `<div class="product-library">${select("Chọn ảnh đã tải", "libraryAsset", assets.map((a) => ({ id: a.id, name: a.alt_text })))}
      ${button("Thêm vào bộ ảnh", "product-library-add")}</div>` : "";
    $("#admin-content").innerHTML = `<div class="catalog-workbench">
      <header class="product-editor-header">
        ${button("← Danh sách", "catalog-list")}
        <div><h1>${p.id ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm"}</h1>
        <p>${p.id ? e(p.name) + " · " + e({ draft: "Bản nháp", active: "Đang bán", inactive: "Đã ngừng bán" }[p.status]) : "Tải ảnh, nhập nội dung và thiết lập các lựa chọn bán hàng."}</p></div>
      </header>
      <form id="product-form" data-version="${p.version || 0}" novalidate class="product-editor-form">
        <div class="product-editor-layout">
          <div class="product-editor-sections">
            <section class="panel catalog-section" id="product-basics">
              <h2>Ảnh và thông tin cơ bản</h2>
              ${editParts || p.id ? `<div class="product-photo-field"><h3>Ảnh sản phẩm</h3>
                <p class="muted">Ảnh bìa xuất hiện trên danh sách sản phẩm. JPEG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh.</p>
                <div id="product-gallery" class="product-gallery"></div>
                ${editParts && has("media.upload") ? '<input type="file" id="product-gallery-upload" data-product-upload multiple accept="image/jpeg,image/png,image/webp" hidden aria-label="Tải ảnh sản phẩm">' : ""}
                ${editParts ? library : ""}
              </div>` : ""}
              <div class="editor-form">
                <label class="product-title-field"><span>Tên sản phẩm <b aria-hidden="true">*</b></span>
                  <input name="name" value="${e(p.name || "")}" minlength="2" maxlength="200" required placeholder="Ví dụ: Dây ràng hàng SafeStraps">
                  <small data-product-title-count></small>
                </label>
                <div class="field-row">
                  ${select("Danh mục", "categoryId", tax.categories, p.categoryIds?.[0])}
                  ${select("Thương hiệu", "brandId", tax.brands, p.brand_id)}
                </div>
                <details class="catalog-details"><summary>Đường dẫn và hiển thị trên Google</summary><div class="editor-form">
                  ${field("Đường dẫn sản phẩm", "slug", p.slug || "", "text", 'maxlength="150"')}
                  ${field("Tiêu đề trên Google", "seoTitle", p.seo_title || "", "text", 'maxlength="200"')}
                  ${field("Mô tả trên Google", "seoDescription", p.seo_description || "", "text", 'maxlength="500"')}
                </div></details>
              </div>
            </section>
            <section class="panel catalog-section" id="product-details">
              <h2>Mô tả sản phẩm</h2>
              <div class="editor-form">
                ${area("Mô tả chi tiết", "description", p.description || "")}
                <details class="catalog-details"><summary>Mô tả ngắn và nội dung bổ sung</summary><div class="editor-form">
                  ${area("Mô tả ngắn", "shortDescription", p.short_description || "")}
                  ${blockEditor(p.content_blocks || [])}
                </div></details>
              </div>
            </section>
            ${editParts || p.id ? productSales(p, editParts) : ""}
            ${showStock ? productStockSection(p) : ""}
            ${canDeactivate || canDelete ? `<details class="panel catalog-details product-management">
              <summary>Trạng thái và thao tác khác</summary>
              <div class="product-management-actions">
                ${canDeactivate ? button("Ngừng bán", "product-deactivate") : ""}
                ${canDelete ? button("Xóa sản phẩm", "delete-product") : ""}
              </div>
            </details>` : ""}
          </div>
          <aside class="product-editor-aside">
            <nav class="panel product-section-nav" aria-label="Các mục sản phẩm">${sectionLinks}</nav>
            <section class="panel product-live-preview" aria-label="Xem trước sản phẩm">
              <h2>Xem trước</h2>
              <div class="product-preview-photo"><img data-product-preview-image alt="" hidden><span data-product-preview-empty>${icon("image", { size: 32 })}Chưa có ảnh bìa</span></div>
              <p data-product-preview-name></p><strong data-product-preview-price></strong>
            </section>
          </aside>
        </div>
        <div class="product-save-bar">
          ${result}<p data-product-progress role="status"></p>
          <div class="product-save-buttons">
            ${actions}
          </div>
        </div>
      </form>
      ${p.id && has("inventory.read") && has("inventory.manage") ? stockDialogMarkup() : ""}
    </div>`;
    const form = $("#product-form");
    form.querySelectorAll(".sku-line[data-sku-id]").forEach((line) => {
      if (line.dataset.skuId) line.dataset.initialValues = JSON.stringify(skuValues(line));
    });
    if (!writable || (p.status === "active" && !has("catalog.publish"))) {
      const scope = writable ? "#product-basics .editor-form, #product-details" : ".product-editor-sections";
      form.querySelectorAll(scope).forEach((section) => {
        section.querySelectorAll("input, select, textarea, button").forEach((el) => el.disabled = true);
      });
    }
    renderProductGallery();
    refreshProductPreview();
  }

  function productSales(p, editable) {
    const rows = p.variants?.length ? p.variants : [{}];
    return `<section class="panel catalog-section" id="product-variants">
      <h2>Giá và biến thể</h2>
      <p class="muted">Sản phẩm chỉ có một lựa chọn dùng một mã SKU. Thêm dòng hoặc tạo tổ hợp khi bán nhiều màu, kích cỡ hay độ dài.</p>
      ${editable ? `<details class="catalog-details"><summary>Tạo biến thể theo thuộc tính</summary>
        <div id="sku-matrix">
          ${tax.attributes.length ? tax.attributes.map((group) => `<fieldset data-attribute-group="${group.id}"><legend>${e(group.name)}</legend><div class="attribute-options">${group.values.map((v) => `<label><input type="checkbox" value="${v.id}" data-value-label="${e(v.value)}"><span>${e(v.value)}</span></label>`).join("") || "<span>Chưa có giá trị</span>"}</div></fieldset>`).join("") : "<p>Thêm nhóm và giá trị trong mục Danh mục & Thuộc tính để tạo tổ hợp.</p>"}
          ${tax.attributes.length ? button("Tạo biến thể đã chọn", "generate-matrix") : ""}
        </div></details>` : ""}
      ${editable ? `<div class="product-bulk">${field("Giá bán chung (₫)", "bulkPrice", "", "number", 'min="1"')}${button("Áp dụng cho tất cả SKU", "product-price-all")}</div>` : ""}
      <div id="sku-lines">${rows.map(skuLine).join("")}</div>
      ${editable ? button("+ Thêm biến thể", "add-sku") : ""}
      ${has("inventory.read") ? `<p class="muted product-inventory-note">${p.id ? "Tồn khả dụng là số lượng có thể bán tại các kho đang hoạt động. Bấm Sửa tồn trên dòng SKU hoặc xuống mục Tồn kho để điều chỉnh; mỗi lần lưu đều ghi nhật ký." : "Nhập tồn lúc tạo cho từng SKU bên trên; số lượng vào kho chọn ở mục Tồn kho bên dưới."}</p>` : ""}
    </section>
    <section class="panel catalog-section" id="product-shipping">
      <h2>Vận chuyển</h2>
      <p class="muted">Nhập khối lượng và kích thước kiện hàng. Nếu từng biến thể có kích thước khác nhau, mở “Thông tin SKU” trên dòng tương ứng.</p>
      ${editable ? `<div class="product-shipping-fields">${shippingFields.map(([name, , label]) => field(label, "bulk-" + name, "", "number", 'min="0" max="100000000" step="1"')).join("")}</div>
        ${button("Áp dụng cho tất cả SKU", "product-shipping-all")}` : ""}
    </section>`;
  }

  function skuLine(v = {}) {
    const selected = (v.combination_key || "").split("-").filter(Boolean);
    const key = v.id ? "saved-" + v.id : "new-" + (++localSku);
    return `<fieldset class="sku-line" data-sku-key="${key}" data-sku-id="${v.id || ""}" data-version="${v.row_version || ""}">
      <legend>${e(v.sku || "Lựa chọn bán hàng")}</legend>
      <div class="product-sku-fields">
        ${field("Tên biến thể", "name", v.name || "", "text", 'maxlength="200" placeholder="Mặc định"')}
        ${field("SKU người bán", "sku", v.sku || "", "text", 'maxlength="80" placeholder="VD: SS-1M"')}
        ${field("Giá bán (₫)", "price", v.price ?? "", "number", 'min="0" step="1"')}
        ${skuStockControl(v)}
      </div>
      <div class="product-sku-media">${skuPhotoMarkup(key)}</div>
      <details class="catalog-details"><summary>Thông tin SKU</summary><div class="editor-form">
        <div class="field-row">
          ${field("Giá trước giảm (₫)", "originalPrice", v.original_price ?? "", "number", 'min="0" step="1"')}
          <label>Trạng thái bán<select name="status">${["active", "inactive", "draft"].map((x) => option(x, states[x], (v.status || "active") === x)).join("")}</select></label>
          ${field("Đường dẫn SKU", "slug", v.slug || "")}
          ${field("Mã vạch", "barcode", v.barcode || "")}
          ${field("Quy cách hiển thị", "weight", v.weight || "")}
          ${field("Độ tuổi hiển thị", "age", v.age || "")}
          ${field("Ngưỡng cảnh báo tồn", "lowStockThreshold", v.low_stock_threshold ?? 5, "number", 'min="0"')}
        </div>
        <div class="product-shipping-fields">${shippingFields.map(([name, column, label]) => field(label, name, v[column] ?? "", "number", 'min="0" max="100000000" step="1"')).join("")}</div>
        <div class="sku-attribute-selectors">${tax.attributes.map((g) => `<label>${e(g.name)}<select data-sku-attribute><option value="">Không chọn</option>${g.values.map((x) => option(x.id, x.value, selected.includes(String(x.id)))).join("")}</select></label>`).join("")}</div>
      </div></details>
      <input type="hidden" name="attributes" value="${e(selected.join(","))}">
      ${has("catalog.edit") && !v.id ? button("Bỏ dòng", "product-sku-remove") : ""}
    </fieldset>`;
  }

  function skuStockControl(v) {
    if (!has("inventory.read")) return "";
    if (v.id)
      return `<div class="product-stock"><span>Tồn khả dụng</span><strong data-stock-available>${Number(stockBySku.get(v.id) ?? 0).toLocaleString("vi-VN")}</strong>${has("inventory.manage") ? button("Sửa tồn", "product-stock-edit:" + v.id) : ""}</div>`;
    if (!product?.id && has("inventory.manage"))
      return `<label class="product-stock product-stock-input"><span>Tồn lúc tạo</span><input data-opening-stock type="number" min="0" max="1000000" step="1" value="0" aria-label="Tồn lúc tạo"></label>`;
    return `<div class="product-stock"><span>Tồn khả dụng</span><strong>—</strong>${product?.id ? '<small class="muted">Lưu SKU trước khi nhập tồn.</small>' : ""}</div>`;
  }

  function productStockSection(p) {
    const manage = has("inventory.manage");
    if (!p.id) {
      const active = stockData.warehouses.filter((w) => w.status === "active");
      const preferred = active.find((w) => w.type === "normal") || active[0];
      return `<section class="panel catalog-section" id="product-stock">
        <h2>Tồn kho lúc tạo</h2>
        <p class="muted">Số lượng nhập ở từng dòng SKU phía trên sẽ vào kho này và được ghi nhật ký nhập kho ban đầu. Có thể bỏ qua và nhập tồn sau.</p>
        ${manage
          ? active.length
            ? `<div class="editor-form"><label>Kho nhận hàng<select name="openingWarehouse">${active.map((w) => option(w.id, w.name + (w.type === "damaged" ? " · kho hư hỏng" : ""), w.id === preferred?.id)).join("")}</select></label></div>`
            : emptyState("Chưa có kho hoạt động", "Tạo kho trong mục Kho & tồn hàng trước khi nhập tồn lúc tạo sản phẩm.")
          : '<p class="muted">Bạn không có quyền nhập tồn kho. Sản phẩm vẫn tạo được; người quản lý kho sẽ nhập tồn sau.</p>'}
      </section>`;
    }
    const variants = p.variants || [];
    const rows = variants.map((v) => {
      const balances = stockData.balances.filter((b) => b.variant_id === v.id);
      if (!balances.length)
        return `<tr><td><b>${e(v.name)}</b><small class="row-description">${e(v.sku)}</small></td><td colspan="4" class="muted">Chưa có tồn tại kho nào.</td><td>${manage ? button("Nhập tồn", "product-stock-edit:" + v.id) : "—"}</td></tr>`;
      return balances.map((b, i) => `<tr>
        <td>${i === 0 ? `<b>${e(v.name)}</b><small class="row-description">${e(v.sku)}</small>` : ""}</td>
        <td>${e(b.warehouse_name)}${b.warehouse_type === "damaged" ? '<small class="row-description">Kho hư hỏng · không bán</small>' : ""}${b.warehouse_status !== "active" ? '<small class="row-description">Ngừng hoạt động</small>' : ""}</td>
        <td>${b.on_hand}</td>
        <td>${b.reserved}</td>
        <td>${b.warehouse_type === "damaged" || b.warehouse_status !== "active" ? "—" : b.on_hand - b.reserved}</td>
        <td>${manage && b.warehouse_status === "active" ? button("Sửa tồn", "product-stock-edit:" + v.id + ":" + b.warehouse_id) : "Chỉ xem"}</td>
      </tr>`).join("");
    }).join("");
    return `<section class="panel catalog-section" id="product-stock">
      <h2>Tồn kho theo từng kho</h2>
      <p class="muted">Mỗi SKU có tồn riêng tại từng kho. Không thể giảm tồn thấp hơn lượng đang giữ cho đơn. Muốn nhập/xuất có duyệt, dùng Phiếu kho.</p>
      <div class="table-wrap"><table class="data-table product-stock-table">
        <thead><tr><th>SKU</th><th>Kho</th><th>Tồn</th><th>Giữ</th><th>Bán được</th><th>Thao tác</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Chưa có SKU nào.</td></tr>'}</tbody>
      </table></div>
    </section>`;
  }

  function stockDialogMarkup() {
    return `<dialog id="quick-stock-dialog" class="stock-dialog" aria-labelledby="quick-stock-title">
      <form id="quick-stock-form" class="editor-form" novalidate>
        <div class="dialog-header"><div><span class="page-eyebrow">ĐIỀU CHỈNH TỒN KHO</span><h2 id="quick-stock-title">Sửa tồn kho</h2></div><button type="button" class="secondary" data-editor-action="product-stock-cancel" aria-label="Đóng">×</button></div>
        <div class="stock-dialog-body">
          <p class="stock-dialog-sku" data-stock-sku></p>
          <label>Kho<select name="warehouseId" required></select></label>
          <p class="stock-dialog-current" data-stock-current role="status"></p>
          <label>Cách cập nhật tồn<select name="mode"><option value="set">Kiểm kê: đặt tồn thực tế mới</option><option value="receive">Nhập thêm: cộng vào tồn hiện tại</option></select></label>
          <label>Số lượng<input name="quantity" type="number" required min="0" max="1000000" step="1" value="0"></label>
          <label>Lý do / chứng từ<input name="reason" required minlength="3" maxlength="500" placeholder="VD: Kiểm kê đầu ca, nhập hàng nhà cung cấp…"></label>
          <p class="form-error" role="alert" data-stock-error></p>
          <div class="form-actions"><button class="primary" type="submit">Lưu tồn kho</button><button class="secondary" type="button" data-editor-action="product-stock-cancel">Hủy</button></div>
        </div>
      </form>
    </dialog>`;
  }

  const variantBalances = (variantId) =>
    stockData.balances.filter((b) => b.variant_id === variantId);

  function syncStockDialog() {
    const dialog = $("#quick-stock-dialog");
    const form = dialog.querySelector("form");
    const balance = variantBalances(Number(dialog.dataset.variantId))
      .find((b) => b.warehouse_id === Number(form.elements.warehouseId.value));
    const current = dialog.querySelector("[data-stock-current]");
    form.elements.mode.querySelector('[value="receive"]').disabled = !balance;
    form.elements.mode.value = "set";
    form.elements.quantity.min = "0";
    if (balance) {
      current.innerHTML = `Tồn hiện tại: <b>${balance.on_hand}</b> · Đang giữ cho đơn: <b>${balance.reserved}</b> · Bán được: <b>${balance.on_hand - balance.reserved}</b>`;
      form.elements.quantity.value = balance.on_hand;
    } else {
      current.textContent = "SKU chưa có tại kho này. Số lượng nhập sẽ là tồn đầu tiên.";
      form.elements.quantity.value = 0;
    }
  }

  function openStockDialog(variantId, warehouseId) {
    const dialog = $("#quick-stock-dialog");
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!dialog || !variant) throw Error("Lưu sản phẩm trước khi sửa tồn kho.");
    const form = dialog.querySelector("form");
    const active = stockData.warehouses.filter((w) => w.status === "active");
    if (!active.length) throw Error("Chưa có kho hoạt động. Tạo kho trong mục Kho & tồn hàng.");
    const balances = variantBalances(variantId);
    const chosen = warehouseId || balances[0]?.warehouse_id ||
      (active.find((w) => w.type === "normal") || active[0]).id;
    dialog.dataset.variantId = variantId;
    dialog.querySelector("[data-stock-sku]").textContent = variant.name + " · " + variant.sku;
    form.elements.warehouseId.innerHTML = active
      .map((w) => option(w.id, w.name + (w.type === "damaged" ? " · kho hư hỏng" : ""), w.id === chosen)).join("");
    form.elements.reason.value = "";
    dialog.querySelector("[data-stock-error]").textContent = "";
    syncStockDialog();
    dialog.showModal();
    form.elements.quantity.focus();
  }

  async function saveQuickStock(form) {
    const dialog = $("#quick-stock-dialog");
    const error = dialog.querySelector("[data-stock-error]");
    error.textContent = "";
    const variantId = Number(dialog.dataset.variantId);
    const warehouseId = Number(form.elements.warehouseId.value);
    const balance = variantBalances(variantId).find((b) => b.warehouse_id === warehouseId);
    const quantity = Number(form.elements.quantity.value);
    const mode = form.elements.mode.value;
    const reason = form.elements.reason.value.trim();
    if (!warehouseId) return void (error.textContent = "Chọn kho.");
    if (reason.length < 3) return void (error.textContent = "Nhập lý do / chứng từ ít nhất 3 ký tự.");
    if (form.elements.quantity.value === "" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1000000)
      return void (error.textContent = "Số lượng phải là số nguyên từ 0 đến 1.000.000.");
    if (mode === "receive" && (!balance || quantity < 1))
      return void (error.textContent = "Nhập thêm cần số lượng từ 1 và SKU đã có tại kho.");
    const submit = form.querySelector("button.primary");
    submit.disabled = true;
    try {
      await api(`/api/admin/warehouses/${warehouseId}/skus/${variantId}`, {
        method: balance ? "PUT" : "POST",
        body: { quantity, mode, reason, ...(balance ? { version: balance.row_version } : {}) },
      });
      dialog.close();
      await reloadProductStock();
      notify("Đã lưu tồn kho.");
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  }

  async function reloadProductStock() {
    if (!product?.id || !has("inventory.read")) return;
    const data = await api("/api/admin/catalog/products/" + product.id + "/stock");
    stockData = {
      items: data.items || [],
      balances: data.balances || [],
      warehouses: data.warehouses || [],
    };
    stockBySku = new Map(stockData.items.map((row) => [row.id, row.available]));
    const section = $("#product-stock");
    if (section) section.outerHTML = productStockSection(product);
    $("#product-form")?.querySelectorAll(".sku-line[data-sku-id]").forEach((line) => {
      const strong = line.querySelector("[data-stock-available]");
      if (strong)
        strong.textContent = Number(stockBySku.get(Number(line.dataset.skuId)) ?? 0).toLocaleString("vi-VN");
    });
  }

  function skuPhotoMarkup(key) {
    const writable = has("catalog.edit") && productWritable();
    return productPhotos.map((photo, index) => photo.skuKey === key
      ? `<div class="product-sku-photo"><img src="${e(photo.url)}" alt="${e(photo.alt || "Ảnh biến thể")}">${writable ? button("Gỡ ảnh", "product-remove-photo:" + index) : ""}</div>` : "").join("")
      + (writable && has("media.upload") ? `<input type="file" data-product-upload data-sku-key="${key}" accept="image/jpeg,image/png,image/webp" hidden aria-label="Tải ảnh biến thể">
        ${button(icon("image") + " Tải ảnh biến thể", "product-pick-sku")}` : "");
  }

  function renderProductGallery() {
    const gallery = $("#product-gallery");
    if (!gallery) return;
    const edit = has("catalog.edit") && productWritable();
    const items = productPhotos.map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => !photo.skuKey);
    gallery.innerHTML = items.map(({ photo, index }, position) => `
      <figure class="product-photo-card ${position === 0 ? "product-cover" : ""}">
        <img src="${e(photo.url)}" alt="${e(photo.alt || "Ảnh sản phẩm")}">
        <figcaption>${position === 0 ? "<span>Ảnh bìa</span>" : edit ? button("Làm ảnh bìa", "product-cover:" + index) : ""}
          ${edit ? button("Gỡ ảnh", "product-remove-photo:" + index) : ""}</figcaption>
      </figure>`).join("") +
      (edit && has("media.upload") ? `<button class="product-upload-tile ${items.length ? "" : "product-cover"}" type="button" data-editor-action="product-pick-gallery">${icon("plus", { size: 26 })}${items.length ? "Thêm ảnh" : "Tải ảnh bìa và ảnh phụ"}</button>`
        : items.length ? "" : '<p class="muted">Chưa có ảnh sản phẩm.</p>');
  }

  function refreshProductPreview() {
    const form = $("#product-form");
    if (!form) return;
    const title = form.querySelector('#product-basics [name="name"]').value;
    const photo = productPhotos.find((m) => !m.skuKey) || productPhotos[0];
    const image = $("[data-product-preview-image]");
    image.hidden = !photo;
    $("[data-product-preview-empty]").hidden = Boolean(photo);
    if (photo) {
      image.src = photo.url;
      image.alt = photo.alt || title;
    } else image.removeAttribute("src");
    $("[data-product-preview-name]").textContent = title || "Tên sản phẩm";
    $("[data-product-title-count]").textContent = title.length + "/200";
    const prices = [...form.querySelectorAll('.sku-line [name="price"]')]
      .map((i) => Number(i.value)).filter((n) => n > 0);
    $("[data-product-preview-price]").textContent = prices.length
      ? [Math.min(...prices), Math.max(...prices)].filter((n, i, all) => i === 0 || n !== all[0])
          .map((n) => n.toLocaleString("vi-VN") + " ₫").join(" – ")
      : "Chưa nhập giá";
  }
  function syncProductPhotos() {
    renderProductGallery();
    $("#product-form").querySelectorAll(".sku-line").forEach((line) => {
      line.querySelector(".product-sku-media").innerHTML = skuPhotoMarkup(line.dataset.skuKey);
    });
    refreshProductPreview();
  }

  function setProductBusy(form, busy, message = "") {
    form.dataset.busy = busy ? "true" : "false";
    form.querySelectorAll('button[type="submit"], [data-editor-action="delete-product"]')
      .forEach((control) => control.disabled = busy);
    form.querySelector("[data-product-progress]").textContent = message;
  }

  async function uploadProductPhotos(input) {
    const form = input.form;
    const files = [...input.files];
    const skuKey = input.dataset.skuKey || null;
    if (!files.length || form.dataset.busy === "true") {
      input.value = "";
      return;
    }
    const error = form.querySelector("#editor-error");
    error.textContent = "";
    setProductBusy(form, true, "Đang tải ảnh…");
    let added = 0;
    try {
      if (productPhotos.length + files.length > 30)
        throw Error("Tối đa 30 ảnh, gồm cả ảnh của từng biến thể.");
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)
          throw Error("Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.");
      }
      for (const file of files) {
        const alt = form.querySelector('#product-basics [name="name"]').value.trim() ||
          file.name.replace(/\.[^.]+$/, "") || "Ảnh sản phẩm";
        const { asset } = await api("/api/admin/media/uploads", {
          method: "POST",
          rawBody: file,
          extraHeaders: {
            "Content-Type": file.type,
            "X-Image-Alt": encodeURIComponent(alt.slice(0, 200)),
          },
        });
        if (!form.isConnected) return;
        productPhotos.push({ assetId: asset.id, url: asset.url, alt: asset.alt_text, skuKey });
        assets.unshift(asset);
        added++;
      }
    } catch (err) {
      if (form.isConnected) error.textContent = err.message;
    } finally {
      if (form.isConnected) {
        input.value = "";
        syncProductPhotos();
        setProductBusy(form, false, added ? `Đã thêm ${added} ảnh vào biểu mẫu.` : "");
        const focus = skuKey
          ? form.querySelector('[data-sku-key="' + skuKey + '"] [data-editor-action="product-pick-sku"]')
          : form.querySelector('[data-editor-action="product-pick-gallery"]');
        focus?.focus({ preventScroll: true });
      }
    }
  }

  async function productEditorAction(action, target) {
    const form = $("#product-form");
    if (form.dataset.busy === "true") return;
    $("#editor-error").textContent = "";
    if (action === "product-deactivate") return saveProductEditor(form, "inactive");
    if (action.startsWith("product-stock-edit:")) {
      const [, variantId, warehouseId] = action.split(":");
      return openStockDialog(Number(variantId), warehouseId ? Number(warehouseId) : null);
    }
    if (action === "product-stock-cancel") return $("#quick-stock-dialog")?.close();
    if (action === "product-pick-gallery") $("#product-gallery-upload")?.click();
    if (action === "product-pick-sku") target.closest(".sku-line").querySelector("[data-product-upload]")?.click();
    if (action === "product-library-add") {
      const asset = assets.find((a) => String(a.id) === form.elements.libraryAsset.value);
      if (!asset) throw Error("Chọn ảnh từ thư viện.");
      if (productPhotos.some((m) => !m.skuKey && m.url === asset.url))
        throw Error("Ảnh này đã có trong bộ ảnh.");
      if (productPhotos.length >= 30) throw Error("Tối đa 30 ảnh.");
      productPhotos.push({ assetId: asset.id, url: asset.url, alt: asset.alt_text, skuKey: null });
      syncProductPhotos();
    }
    if (action.startsWith("product-remove-photo:") || action.startsWith("product-cover:")) {
      const line = target.closest(".sku-line");
      const [photo] = productPhotos.splice(Number(action.split(":")[1]), 1);
      if (action.startsWith("product-cover:")) productPhotos.unshift(photo);
      syncProductPhotos();
      const focus = line?.querySelector('[data-editor-action="product-pick-sku"]') ||
        $("#product-gallery")?.querySelector("button");
      focus?.focus({ preventScroll: true });
    }
    if (action === "product-sku-remove") {
      const line = target.closest(".sku-line");
      productPhotos = productPhotos.filter((photo) => photo.skuKey !== line.dataset.skuKey);
      line.remove();
      syncProductPhotos();
      form.querySelector('[data-editor-action="add-sku"]').focus();
    }
    if (action === "product-price-all" || action === "product-shipping-all") {
      if (!$("#sku-lines").children.length) throw Error("Thêm ít nhất một dòng SKU.");
      const price = action === "product-price-all";
      const fields = price
        ? [["price", form.elements.bulkPrice]]
        : shippingFields.map(([name]) => [name, form.elements["bulk-" + name]]);
      const supplied = fields.filter(([, input]) => input.value !== "" || input.validity.badInput);
      if (!supplied.length) throw Error(price ? "Nhập giá bán chung." : "Nhập khối lượng hoặc kích thước kiện hàng.");
      supplied.forEach(([, input]) => {
        if (!input.checkValidity() || !Number.isSafeInteger(Number(input.value)))
          throw Error("Nhập số nguyên hợp lệ.");
      });
      for (const [name, input] of supplied) {
        form.querySelectorAll('.sku-line [name="' + name + '"]').forEach((field) => {
          field.value = input.value;
          if (price) {
            const original = field.closest(".sku-line").querySelector('[name="originalPrice"]');
            if (original.value && +original.value < +input.value) original.value = input.value;
          }
        });
      }
      form.querySelector("[data-product-progress]").textContent = price
        ? "Đã áp dụng giá cho các dòng SKU." : "Đã áp dụng kích thước cho các dòng SKU.";
      refreshProductPreview();
    }
  }

  function skuValues(line) {
    return Object.fromEntries([...line.querySelectorAll("[name]")]
      .map((input) => [input.name, input.value.trim()]));
  }

  function skuHasContent(line, values, mediaOwners) {
    return line.dataset.skuId || mediaOwners.has(line.dataset.skuKey) ||
      Number(line.querySelector("[data-opening-stock]")?.value || 0) > 0 ||
      ["name", "sku", "price", "originalPrice", "attributes", "barcode", "age", "weight", "slug",
        ...shippingFields.map(([name]) => name)]
        .some((name) => values[name]) ||
      values.status !== "active" || !["", "5"].includes(values.lowStockThreshold);
  }

  function collectProductVariants(form) {
    const mediaOwners = new Set(productPhotos.filter((m) => m.skuKey).map((m) => m.skuKey));
    const variants = [];
    const skuByKey = new Map();
    const codes = new Set();
    let hasActiveSku = false;
    for (const line of form.querySelectorAll(".sku-line")) {
      const values = skuValues(line);
      const key = line.dataset.skuKey;
      if (!skuHasContent(line, values, mediaOwners)) continue;
      const sku = values.sku.toUpperCase();
      if (codes.has(sku)) throw Error("Mã SKU " + sku + " bị trùng.");
      codes.add(sku);
      skuByKey.set(key, sku);
      if (Number(values.price) > 0 && values.status === "active") hasActiveSku = true;
      if (line.dataset.initialValues === JSON.stringify(values)) continue;
      if (!/^[A-Z0-9_-]{1,80}$/.test(sku) || !/[A-Z0-9]/.test(sku))
        throw Error("Nhập SKU cho mỗi dòng có dữ liệu. Dùng chữ không dấu, số, gạch ngang hoặc gạch dưới.");
      if (values.price === "" || !Number.isSafeInteger(Number(values.price)))
        throw Error("Nhập giá bán nguyên cho SKU " + sku + ".");
      const price = Number(values.price);
      const originalPrice = values.originalPrice === "" ? price : Number(values.originalPrice);
      if (originalPrice < price) throw Error("Giá trước giảm của " + sku + " phải từ giá bán trở lên.");
      variants.push({
        ...values, sku, name: values.name || "Mặc định", price, originalPrice,
        slug: values.slug || slugFromName(sku),
        id: line.dataset.skuId ? Number(line.dataset.skuId) : undefined,
        rowVersion: Number(line.dataset.version),
        lowStockThreshold: Number(values.lowStockThreshold || 5),
        attributeValueIds: values.attributes ? values.attributes.split(",").map(Number) : [],
        ...Object.fromEntries(shippingFields.map(([name]) => [name, values[name] === "" ? null : Number(values[name])])),
      });
    }
    return { variants, skuByKey, hasActiveSku };
  }

  async function saveProductEditor(form, intent) {
    if (form.dataset.busy === "true" || !productWritable()) return;
    const error = form.querySelector("#editor-error");
    error.textContent = "";
    try {
      const invalid = [...form.elements].find((input) => !input.name?.startsWith("bulk") && !input.validity?.valid && input.willValidate);
      if (invalid) {
        if (invalid.closest("details")) invalid.closest("details").open = true;
        invalid.reportValidity();
        return;
      }
      const current = product;
      const basics = (name) => form.querySelector('#product-basics [name="' + name + '"]').value.trim();
      const description = form.querySelector('#product-details [name="description"]').value;
      const status = intent === "update" ? current?.status || "draft" : intent;
      const partsOnly = status === "active" && !has("catalog.publish");
      const name = basics("name");
      const slug = basics("slug") || slugFromName(name);
      if (name.length < 2) throw Error("Tên sản phẩm cần ít nhất 2 ký tự.");
      if (!slug) throw Error("Nhập đường dẫn sản phẩm ở mục hiển thị trên Google.");
      const categoryId = Number(basics("categoryId"));
      const categoryIds = categoryId ? [...new Set([categoryId, ...(current?.categoryIds || []).slice(1)])] : (current?.categoryIds || []).slice(1);
      const payload = {
        name, slug, status, categoryIds,
        version: current?.version,
        brandId: Number(basics("brandId")) || null,
        description,
        shortDescription: form.querySelector('#product-details [name="shortDescription"]').value,
        descriptionBlocks: collectBlocks(form),
        seoTitle: basics("seoTitle"),
        seoDescription: basics("seoDescription"),
      };
      if (partsOnly) delete payload.status;
      if (has("catalog.edit")) {
        const { variants, skuByKey, hasActiveSku } = collectProductVariants(form);
        if (variants.length) payload.variants = variants;
        const previousMedia = current?.media || [];
        const photosChanged = previousMedia.length !== productPhotos.length ||
          productPhotos.some((photo, i) => photo.existingMediaId !== previousMedia[i].id);
        if (photosChanged) {
          const coverFirst = [...productPhotos.filter((m) => !m.skuKey), ...productPhotos.filter((m) => m.skuKey)];
          payload.media = coverFirst.map(({ existingMediaId, assetId, skuKey }) => ({
            existingMediaId, assetId, variantSku: skuByKey.get(skuKey),
          }));
        }
        if (!current && has("inventory.manage") && form.elements.openingWarehouse?.value) {
          const items = [];
          for (const line of form.querySelectorAll(".sku-line")) {
            const sku = skuByKey.get(line.dataset.skuKey);
            if (sku)
              items.push({ sku, quantity: Number(line.querySelector("[data-opening-stock]")?.value || 0) });
          }
          if (items.length)
            payload.stock = { warehouseId: Number(form.elements.openingWarehouse.value), items };
        }
        if (status === "active" && !partsOnly) {
          if (!categoryIds.length) throw Error("Chọn danh mục trước khi xuất bản.");
          if (!productPhotos.length) throw Error("Thêm ảnh sản phẩm trước khi xuất bản.");
          if (!hasActiveSku)
            throw Error("Xuất bản cần ít nhất một SKU đang bán có giá lớn hơn 0.");
        }
      }
      setProductBusy(form, true, "Đang lưu sản phẩm…");
      form.querySelector(".product-editor-layout").inert = true;
      const { product: saved } = await api(
        "/api/admin/catalog/products" + (current ? "/" + current.id : "") + "/editor",
        { method: current ? "PATCH" : "POST", body: payload },
      );
      if (!form.isConnected) return;
      setProductRecord(saved);
      await reloadProductStock();
      renderProductEditor();
      const savedMessage = status === "draft" ? "Đã lưu bản nháp." :
        intent === "active" ? "Đã xuất bản sản phẩm." : "Đã lưu thay đổi.";
      $("[data-product-progress]").textContent = savedMessage;
      notify(savedMessage);
    } catch (err) {
      if (form.isConnected) error.textContent = err.message;
    } finally {
      if (form.isConnected) {
        form.querySelector(".product-editor-layout").inert = false;
        setProductBusy(form, false);
      }
    }
  }
  function blockEditor(values) {
    return `<fieldset><legend>Nội dung bài / mô tả</legend><p class="editor-note">Thêm đoạn, tiêu đề, danh sách hoặc ảnh đã upload. Mọi nội dung được server xác minh và escape.</p><div id="content-blocks">${values.map(blockLine).join("")}</div>${button("Thêm đoạn nội dung", "add-block")}</fieldset>`;
  }
  function blockLine(b = { type: "paragraph", text: "" }) {
    return `<fieldset class="content-block"><legend>Block</legend><label>Loại<select name="blockType">${["paragraph", "heading", "quote", "list", "image"].map((t) => option(t, { paragraph: "Đoạn văn", heading: "Tiêu đề H2", quote: "Trích dẫn", list: "Danh sách (mỗi dòng một mục)", image: "Ảnh từ thư viện" }[t], b.type === t)).join("")}</select></label><label>Nội dung / URL ảnh<textarea name="blockText">${e(b.type === "list" ? b.items.join("\n") : b.type === "image" ? b.url : b.text || "")}</textarea></label><label>Alt cho ảnh<input name="blockAlt" value="${e(b.alt || "")}"></label>${button("Lên", "block-up")}${button("Xuống", "block-down")}${button("Xóa block", "block-remove")}</fieldset>`;
  }
  function collectBlocks(form) {
    return [...form.querySelectorAll(".content-block")]
      .map((line) => {
        const type = line.querySelector('[name="blockType"]').value,
          value = line.querySelector('[name="blockText"]').value;
        return type === "image"
          ? {
              type,
              url: value,
              alt: line.querySelector('[name="blockAlt"]').value,
            }
          : type === "list"
            ? { type, items: value.split("\n").filter(Boolean) }
            : type === "heading"
              ? { type, level: 2, text: value }
              : { type, text: value };
      })
      .filter((b) => b.type === "image" || b.type === "list" || b.text.trim());
  }
  const articleBlockLabels = {
    paragraph: "Đoạn văn", heading: "Tiêu đề mục", quote: "Trích dẫn",
    list: "Danh sách", image: "Hình ảnh", product: "Thẻ sản phẩm",
    faq: "FAQ", banner: "Banner giữa bài",
  };
  let articleOptions = { products: [], banners: [] };

  function productValue(id) {
    return articleOptions.products.find((p) => p.id === Number(id))?.name ||
      "Sản phẩm hiện không hiển thị";
  }

  function referencePicker(id = "") {
    return `<div class="cms-product-picker">
      <label>Tìm theo tên hoặc SKU<input type="search" data-cms-query maxlength="120"></label>
      ${button("Tìm sản phẩm", "cms-find-product")}
      <label>Kết quả<select name="productReference" data-cms-product-select>
        <option value="">Chọn sản phẩm</option>${id ? option(id, productValue(id), true) : ""}</select></label>
      <small data-cms-search-status role="status"></small>
    </div>`;
  }

  function articleBlock(block = { type: "paragraph" }) {
    const { type } = block;
    let controls;
    if (type === "product") controls = referencePicker(block.productId);
    else if (type === "banner") {
      const banners = articleOptions.banners.map((b) =>
        ({ id: b.id, name: b.name + (b.status === "published" ? "" : " · " + states[b.status]) }));
      if (block.bannerId && !banners.some((b) => b.id === block.bannerId))
        banners.push({ id: block.bannerId, name: "Banner đã lưu (ngoài danh sách)" });
      controls = select("Chọn banner", "bannerReference", banners, block.bannerId);
    } else if (type === "faq")
      controls = field("Câu hỏi", "blockQuestion", block.question || "", "text", 'maxlength="300"') +
        area("Câu trả lời", "blockText", block.answer || "");
    else if (type === "image") {
      const choices = assets.map((a) => option(a.url, a.alt_text, a.url === block.url)).join("");
      const old = block.url && !assets.some((a) => a.url === block.url);
      controls = `<label>Ảnh từ thư viện<select name="blockText"><option value="">Chọn ảnh</option>
        ${old ? option(block.url, block.alt || "Ảnh đã lưu", true) : ""}${choices}</select></label>` +
        field("Mô tả ảnh", "blockAlt", block.alt || "", "text", 'maxlength="250"');
    } else {
      controls = area(type === "list" ? "Mỗi dòng là một mục" : "Nội dung", "blockText",
        type === "list" ? (block.items || []).join("\n") : block.text || "");
      if (type === "heading")
        controls += `<label>Cấp tiêu đề<select name="headingLevel">${[2, 3].map((level) => option(level, "H" + level, (block.level || 2) === level)).join("")}</select></label>`;
    }
    return `<fieldset class="content-block cms-block" data-article-block="${type}">
      <legend>${articleBlockLabels[type]}</legend><div class="cms-block-fields">${controls}</div>
      <div class="cms-block-actions">${button("Lên", "block-up")}${button("Xuống", "block-down")}${button("Xóa", "block-remove")}</div>
    </fieldset>`;
  }

  function readArticleBlocks(form) {
    return [...form.querySelectorAll("[data-article-block]")].flatMap((row) => {
      const type = row.dataset.articleBlock;
      const value = (name) => row.querySelector('[name="' + name + '"]')?.value.trim() || "";
      const body = value("blockText");
      if (type === "faq") {
        const question = value("blockQuestion");
        return question || body ? [{ type, question, answer: body }] : [];
      }
      if (type === "product") return value("productReference")
        ? [{ type, productId: Number(value("productReference")) }] : [];
      if (type === "banner") return value("bannerReference")
        ? [{ type, bannerId: Number(value("bannerReference")) }] : [];
      if (type === "image") return body ? [{ type, url: body, alt: value("blockAlt") }] : [];
      if (type === "list") {
        const items = body.split("\n").map((line) => line.trim()).filter(Boolean);
        return items.length ? [{ type, items }] : [];
      }
      if (type === "heading") return body ? [{ type, level: Number(value("headingLevel")), text: body }] : [];
      return body ? [{ type, text: body }] : [];
    });
  }

  function articlePayload(form) {
    const fields = form.elements;
    const keys = ["title", "slug", "excerpt", "quickSummary", "authorBio", "coverUrl", "coverAlt", "seoTitle", "seoDescription", "focusKeyword"];
    return {
      ...Object.fromEntries(keys.map((key) => [key, fields[key].value])),
      slug: fields.slug.value.trim() || slugFromName(fields.title.value),
      version: article?.version,
      categoryId: Number(fields.categoryId.value) || null,
      contentBlocks: readArticleBlocks(form),
      hideSideBanners: fields.hideSideBanners.checked,
      tagIds: [...fields.tagIds.selectedOptions].map((o) => Number(o.value)),
      relatedProductIds: [...form.querySelectorAll("[data-related-product]")].map((el) => Number(el.dataset.relatedProduct)),
    };
  }

  function updateArticleSeo(form) {
    const data = articlePayload(form);
    const check = [
      ["Tiêu đề bài viết", data.title.trim().length >= 3],
      ["Đường dẫn thân thiện", /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)],
      ["Tóm tắt và chuyên mục", Boolean(data.excerpt.trim() && data.categoryId)],
      ["Ảnh bìa có mô tả", Boolean(data.coverUrl && data.coverAlt.trim())],
      ["Có nội dung bài viết", data.contentBlocks.some((b) => !["banner", "product"].includes(b.type))],
      ["Có tiêu đề mục cho mục lục", data.contentBlocks.some((b) => b.type === "heading")],
      ["Tiêu đề SEO khoảng 30–60 ký tự", data.seoTitle.trim().length >= 30 && data.seoTitle.trim().length <= 60],
      ["Mô tả SEO khoảng 70–160 ký tự", data.seoDescription.trim().length >= 70 && data.seoDescription.trim().length <= 160],
    ];
    const score = Math.round(100 * check.filter(([, done]) => done).length / check.length);
    $("[data-cms-score]").textContent = score + "/100";
    $("[data-cms-meter]").value = score;
    $("[data-cms-checklist]").innerHTML = check.map(([label, done]) => `<li><span class="${done ? "cms-pass" : "cms-revise"}">${done ? "Đạt" : "Cần sửa"}</span><span>${label}</span></li>`).join("");
    $("[data-cms-google-path]").textContent = location.host + "/tin-tuc/" + (data.slug || "duong-dan-bai-viet");
    $("[data-cms-google-title]").textContent = (data.seoTitle.trim() || data.title.trim() || "Tiêu đề bài viết") + " | Jielien International";
    $("[data-cms-google-description]").textContent = data.seoDescription.trim() || data.excerpt.trim() || "Mô tả của bài viết sẽ hiển thị tại đây.";
    $("[data-cms-banner-count]").textContent = data.contentBlocks.filter((block) => block.type === "banner").length + " banner giữa bài đã chọn.";
  }

  function markArticleChanged(form) {
    articleDirty++;
    updateArticleSeo(form);
  }

  function relatedProductChip(id) {
    return `<li data-related-product="${id}">${e(productValue(id))} ${button("Gỡ", "cms-related-remove")}</li>`;
  }

  async function articleEditorAction(action, target) {
    const form = $("#article-form");
    if (action === "cms-find-product") {
      const picker = target.closest(".cms-product-picker");
      const query = picker.querySelector("[data-cms-query]").value.trim();
      const status = picker.querySelector("[data-cms-search-status]");
      if (!query) {
        status.textContent = "Nhập tên hoặc SKU để tìm.";
        return;
      }
      target.disabled = true;
      status.textContent = "Đang tìm…";
      try {
        const { items } = await api("/api/catalog/search?limit=20&q=" + encodeURIComponent(query));
        const list = new Map(items.map((p) => [p.productId, p.productName || p.name]));
        const result = picker.querySelector("[data-cms-product-select]");
        const selected = Number(result.value);
        if (selected && !list.has(selected))
          list.set(selected, result.selectedOptions[0].textContent);
        result.innerHTML = '<option value="">Chọn sản phẩm</option>' +
          [...list].map(([id, name]) => option(id, name, selected === id)).join("");
        for (const [id, name] of list)
          if (!articleOptions.products.some((p) => p.id === id)) articleOptions.products.push({ id, name });
        status.textContent = items.length ? "Chọn sản phẩm trong kết quả." : "Không tìm thấy sản phẩm đang bán.";
      } catch (err) {
        status.textContent = err.message;
      } finally {
        target.disabled = false;
      }
      return;
    }
    if (action === "cms-related-add") {
      const id = Number(form.querySelector(".cms-related-picker [data-cms-product-select]").value);
      if (!id) throw Error("Chọn sản phẩm muốn thêm.");
      const list = $("#cms-related-products");
      if (list.querySelector('[data-related-product="' + id + '"]')) return;
      if (list.children.length >= 20) throw Error("Tối đa 20 sản phẩm liên quan.");
      list.insertAdjacentHTML("beforeend", relatedProductChip(id));
    } else if (action === "cms-related-remove") {
      target.closest("[data-related-product]").remove();
    } else if (action.startsWith("cms-insert:") || action === "add-block") {
      const type = action === "add-block" ? "paragraph" : action.split(":")[1];
      if (!Object.hasOwn(articleBlockLabels, type)) return;
      const list = $("#content-blocks");
      if (list.children.length >= 100) throw Error("Tối đa 100 khối nội dung.");
      list.insertAdjacentHTML("beforeend", articleBlock({ type }));
      list.lastElementChild.querySelector("input, textarea, select")?.focus();
    }
    markArticleChanged(form);
  }

  async function articleEditor(articleId) {
    articleDirty = 0;
    article = articleId ? (await api("/api/admin/cms/articles/" + articleId)).article : null;
    const a = article?.snapshot || {};
    const ids = [...new Set([...(a.relatedProductIds || []), ...(a.contentBlocks || []).filter((b) => b.type === "product").map((b) => b.productId)])];
    const [categories, tags, library, options] = await Promise.all([
      api("/api/admin/cms/categories"),
      api("/api/admin/cms/tags"),
      has("media.read") ? api("/api/admin/media") : { items: [] },
      api("/api/admin/cms/editor-options?products=" + ids.join(",")),
    ]);
    assets = library.items;
    articleOptions = options;
    const status = article?.status || "draft";
    const writable = has("content.write");
    const approved = status === "approved" && has("content.publish");
    const transitions =
      (writable && status === "draft" ? button("Gửi duyệt", "article:submit") : "") +
      (has("content.approve") && status === "in_review" ? button("Phê duyệt", "article:approve") + button("Trả lại nháp", "article:reject") : "") +
      (approved ? button("Xuất bản ngay", "article:publish") : "") +
      (has("content.publish") && status !== "archived" ? button("Lưu trữ", "article:archive") : "");
    const extra = Object.entries(articleBlockLabels).filter(([key]) => key !== "paragraph");
    const coverChoices = assets.map((m) => option(m.url, m.alt_text, a.coverUrl === m.url)).join("");
    $("#admin-content").innerHTML = `<div class="cms-workspace">
      ${heading(article ? "Chỉnh sửa bài viết" : "Viết bài mới", article ? e(a.title) : "Soạn nội dung, kiểm tra SEO và quản lý xuất bản.", button("← Danh sách", "cms-list"))}
      <nav class="cms-editor-jumps" aria-label="Đi tới phần soạn bài">
        <a href="#cms-publish-panel">Xuất bản</a><a href="#cms-seo-panel">Kiểm tra SEO</a>
      </nav>
      <form id="article-form" class="cms-editor-layout">
        <div class="cms-editor-main">
          <section class="panel cms-editor-section"><h2>Nội dung bài viết</h2>
            <fieldset ${writable ? "" : "disabled"} class="cms-fields">
              ${field("Tiêu đề bài viết", "title", a.title || "", "text", 'required maxlength="200"')}
              ${area("Tóm tắt bài viết", "excerpt", a.excerpt || "")}
              ${select("Chuyên mục", "categoryId", categories.items, a.categoryId)}
              <div class="cms-two-fields"><label>Ảnh bìa<select name="coverUrl"><option value="">Chọn ảnh từ thư viện</option>
                ${a.coverUrl && !assets.some((asset) => asset.url === a.coverUrl) ? option(a.coverUrl, "Ảnh bìa đã lưu", true) : ""}${coverChoices}</select></label>
                ${field("Mô tả ảnh bìa", "coverAlt", a.coverAlt || "", "text", 'maxlength="250"')}</div>
              <div class="cms-insertion" role="group" aria-label="Chèn nội dung">
                ${button("+ Đoạn văn", "add-block")}
                ${extra.filter(([key]) => ["heading", "image", "product", "faq", "banner"].includes(key)).map(([key, label]) => button("+ " + label, "cms-insert:" + key)).join("")}
              </div>
              <details class="content-options cms-insertion-more"><summary>Kiểu nội dung khác</summary>
                <div class="cms-insertion">${extra.filter(([key]) => ["quote", "list"].includes(key)).map(([key, label]) => button("+ " + label, "cms-insert:" + key)).join("")}</div>
              </details>
              <div id="content-blocks">${(a.contentBlocks?.length ? a.contentBlocks : [{ type: "paragraph" }]).map(articleBlock).join("")}</div>
            </fieldset>
          </section>
          <details class="panel cms-editor-section content-options" id="cms-article-extras"><summary>Thông tin bổ sung</summary>
            <fieldset ${writable ? "" : "disabled"} class="cms-fields">
              ${area("Tóm tắt nhanh (mỗi dòng một ý)", "quickSummary", a.quickSummary || "")}
              <label>Thẻ bài viết<select name="tagIds" multiple size="3">${tags.items.map((t) => option(t.id, t.name, (a.tagIds || []).includes(t.id))).join("") || '<option disabled>Chưa có thẻ</option>'}</select></label>
              ${area("Giới thiệu tác giả", "authorBio", a.authorBio || "")}
              <ul id="cms-related-products">${(a.relatedProductIds || []).map(relatedProductChip).join("")}</ul>
              <div class="cms-related-picker">${referencePicker()}${button("Thêm sản phẩm liên quan", "cms-related-add")}</div>
            </fieldset>
          </details>
          <div class="cms-publication">
            <section class="panel cms-editor-section" id="cms-publish-panel"><h2>Xuất bản</h2>${stateBadge(status)}
              ${article?.scheduled_at ? `<p>Lịch đăng ${e(new Date(article.scheduled_at).toLocaleString("vi-VN"))}</p>` : ""}
              <div class="cms-publish-actions">
                ${writable ? '<button type="submit" class="primary">Lưu nháp</button>' : ""}${article ? transitions : ""}
                ${article ? button("Xem trước bản đã lưu", "article:preview") + button("Lịch sử phiên bản", "article:revisions") : ""}
              </div>
              ${writable ? '<label class="cms-check"><input id="article-autosave" type="checkbox" checked> Tự lưu sau lần lưu đầu</label><small id="autosave-state" role="status"></small>' : ""}
              ${approved ? '<label>Lịch xuất bản (giờ máy bạn)<input form="schedule-form" type="datetime-local" name="when" required></label><button form="schedule-form" type="submit" class="secondary">Đặt lịch</button>' : ""}
              ${result}
            </section>
            <section class="panel cms-editor-section"><h2>Quảng cáo trong bài</h2><fieldset ${writable ? "" : "disabled"} class="cms-fields">
              <p class="muted">Quản lý ảnh và lịch hiển thị trong Banner & Poster Studio.</p>
              <label class="cms-check"><input type="checkbox" name="hideSideBanners" ${a.hideSideBanners ? "checked" : ""}> Ẩn banner hai bên cho bài này</label>
              <p data-cms-banner-count></p>${button("+ Chèn banner giữa bài", "cms-insert:banner")}
            </fieldset></section>
          </div>
        </div>
        <aside class="cms-seo" id="cms-seo-panel">
          <section class="panel cms-editor-section"><h2>Kiểm tra SEO</h2>
            <div class="cms-score"><strong data-cms-score></strong><progress data-cms-meter max="100" aria-label="Điểm kiểm tra SEO"></progress></div>
            <ul data-cms-checklist class="cms-checklist"></ul>
          </section>
          <section class="panel cms-editor-section"><h2>Xem trước trên Google</h2>
            <div class="cms-google"><small data-cms-google-path></small><strong data-cms-google-title></strong><p data-cms-google-description></p></div>
            <fieldset ${writable ? "" : "disabled"} class="cms-fields">
              ${field("Đường dẫn bài viết", "slug", a.slug || "", "text", 'maxlength="150" placeholder="Tự tạo từ tiêu đề khi bỏ trống"')}
              ${field("Từ khóa chính", "focusKeyword", a.focusKeyword || "", "text", 'maxlength="150"')}
              ${field("Tiêu đề SEO", "seoTitle", a.seoTitle || "", "text", 'maxlength="200"')}
              ${area("Mô tả SEO", "seoDescription", a.seoDescription || "")}
            </fieldset>
          </section>
        </aside>
      </form>
      ${approved ? '<form id="schedule-form"></form>' : ""}
      <div id="article-preview" class="article-body"></div>
    </div>`;
    updateArticleSeo($("#article-form"));
  }
  async function refresh(view) {
    $("#admin-content").innerHTML = await render(view);
  }
  root.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-editor-action]")?.dataset
        .editorAction,
      p = event.target.closest("[data-product-id]"),
      a = event.target.closest("[data-article-id]"),
      taxEdit = event.target.closest("[data-tax-edit]");
    if (!action && !p && !a && !taxEdit) return;
    try {
      if (
        action === "attribute-value-add" ||
        action === "attribute-value-remove"
      ) {
        const form = event.target.closest("form");
        if (action === "attribute-value-add")
          form
            .querySelector("[data-new-values]")
            .insertAdjacentHTML("beforeend", newValueRow());
        else event.target.closest(".attribute-value-row").remove();
        syncAttributeValues(form);
        if (action === "attribute-value-add")
          form
            .querySelector("[data-new-values]")
            .lastElementChild.querySelector("input")
            .focus();
        return;
      }
      if (action === "delete-product") {
        if ($("#product-form")?.dataset.busy === "true") return;
        if (!product || !has("catalog.archive") || !has("inventory.manage"))
          return;
        if (
          !confirm(
            `Xóa sản phẩm “${product.name}” và toàn bộ tồn của các SKU tại mọi kho? Đơn cũ và nhật ký vẫn được lưu. Không thể khôi phục qua giao diện.`,
          )
        )
          return;
        const reason = prompt("Lý do xóa sản phẩm (ít nhất 3 ký tự):");
        if (reason === null) return;
        await api("/api/admin/catalog/products/" + product.id, {
          method: "DELETE",
          body: { version: product.version, reason },
        });
        product = null;
        await refresh("catalog-editor");
        notify("Đã xóa sản phẩm và tồn tại các kho.");
        return;
      }
      if (action?.startsWith("taxonomy-delete:")) {
        if (!has("catalog.edit")) return;
        const [, kind, target] = action.split(":");
        const item = tax[kind]?.find((x) => String(x.id) === target);
        if (!item) return;
        if (
          !confirm(
            `Xóa ${names[kind].toLowerCase()} “${item.name}”? Chỉ có thể xóa mục chưa được sử dụng. Thao tác này không thể hoàn tác.`,
          )
        )
          return;
        try {
          await api(`/api/admin/catalog/${kind}/${target}`, {
            method: "DELETE",
          });
        } catch (err) {
          const message = $("#taxonomy-action-message");
          message.hidden = false;
          message.textContent = err.message;
          message.scrollIntoView({ block: "nearest" });
          return;
        }
        await refresh("taxonomy-editor");
        notify("Đã xóa " + item.name);
        return;
      }
      if (action?.startsWith("taxonomy-tab:")) {
        const kind = action.split(":")[1];
        if (!Object.hasOwn(names, kind)) return;
        taxonomyKind = kind;
        $("#admin-content").innerHTML = taxonomyMarkup();
      }
      if (action === "taxonomy-new") {
        $("#taxonomy-editor-panel").innerHTML =
          `<h2>Thêm ${names[taxonomyKind].toLowerCase()}</h2>${taxonomyForm(taxonomyKind)}`;
        $("#taxonomy-editor-panel input").focus();
      }
      if (action === "taxonomy-cancel")
        $("#admin-content").innerHTML = taxonomyMarkup();
      if (action === "operations-refresh") await refresh("operations-editor");
      if (action?.startsWith("report-days:")) {
        const end = new Date(),
          start = new Date();
        start.setDate(start.getDate() - Number(action.split(":")[1]) + 1);
        const form = $("#report-filter");
        form.elements.from.value = dateInput(start);
        form.elements.to.value = dateInput(end);
        form.requestSubmit();
      }
      if (p) return await productEditor(p.dataset.productId);
      if (a) return await articleEditor(a.dataset.articleId);
      if (taxEdit) {
        const [kind, target] = taxEdit.dataset.taxEdit.split(":");
        const item = tax[kind].find((x) => Number(x.id) === Number(target));
        $("#taxonomy-editor-panel").innerHTML =
          `<h2>Sửa ${names[kind].toLowerCase()}</h2>${taxonomyForm(kind, item)}`;
        $("#taxonomy-editor-panel input").focus();
        return;
      }
      if (action === "coupon-new" || action.startsWith("coupon-edit:")) {
        const form = $("#coupon-form"),
          item = couponItems.find((c) => c.id === Number(action.split(":")[1]));
        form.reset();
        const values = item
          ? {
              id: item.id,
              code: item.code,
              discountType: item.discount_type,
              discountValue: item.discount_value,
              minimumOrder: item.minimum_order,
              usageLimit: item.usage_limit ?? "",
              status: item.status,
            }
          : { id: "" };
        Object.entries(values).forEach(
          ([key, value]) => (form.elements.namedItem(key).value = value),
        );
        $("#coupon-editor-title").textContent = item
          ? "Sửa mã " + item.code
          : "Tạo mã giảm giá";
        form.elements.namedItem("code").focus();
        return;
      }
      if (["report-export", "audit-export"].includes(action)) {
        const { csv } = await api(
          action === "report-export"
            ? "/api/admin/reports/export" + reportQuery
            : "/api/admin/audit/export" + auditQuery,
        );
        const url = URL.createObjectURL(
            new Blob([csv], { type: "text/csv;charset=utf-8" }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = action + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      }
      if (action === "csv-export") {
        const { csv } = await api("/api/admin/catalog/export");
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "jielien-sku.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
      if (action === "csv-commit") {
        if (
          !importPreview ||
          !confirm("Ghi dữ liệu CSV đã preview? Sản phẩm được lưu nháp.")
        )
          return;
        await api("/api/admin/catalog/import", {
          method: "POST",
          body: {
            csv: importPreview.csv,
            token: importPreview.token,
            commit: true,
          },
        });
        importPreview = null;
        $("#import-result").textContent =
          "Import hoàn tất. Xem sản phẩm trong catalog.";
      }

      if (action?.startsWith("banner-preview:")) {
        previewMode = action.split(":")[1];
        previewBanner();
      }
      if (action === "banner-cancel") {
        if ($("#banner-form [data-banner-upload]")?.disabled) return;
        $("#banner-editor").hidden = true;
        $("#banner-list").hidden = false;
        $('#banner-list [data-editor-action="banner-new"]')?.focus();
        return;
      }
      if (action === "banner-new" || action?.startsWith("banner-edit:")) {
        const form = $("#banner-form");
        if (!form) return;
        form.reset();
        previewMode = "desktop";
        $("#banner-schedule").open = false;
        $("#banner-advanced").open = false;
        $("#banner-editor-title").textContent = action === "banner-new" ? "Tạo banner" : "Chỉnh sửa banner";
        $("#editor-error").textContent = "";
        $("#banner-list").hidden = true;
        $("#banner-editor").hidden = false;
        form.elements.bannerId.value = "";
        form.elements.version.value = "";
        if (action !== "banner-new") {
          const b = bannerRows.find(
            (b) => String(b.id) === action.split(":")[1],
          );
          if (!b) throw Error("Không tìm thấy banner.");
          const localDate = (v) =>
            v
              ? new Date(
                  new Date(v).getTime() -
                    new Date(v).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "";
          for (const [key, value] of Object.entries({
            bannerId: b.id,
            version: b.version,
            title: b.title,
            assetId: b.asset_id,
            assetMobileId: b.asset_mobile_id || "",
            slot: b.slot,
            alt: b.alt,
            subtitle: b.subtitle,
            ctaLabel: b.cta_label,
            sortOrder: b.sort_order,
            focalX: b.focal_x,
            focalY: b.focal_y,
            targetPath: b.target_path,
            status: b.status,
            startsAt: localDate(b.starts_at),
            endsAt: localDate(b.ends_at),
          }))
            form.elements[key].value = value;
        }
        previewBanner();
        form.elements.title.focus();
      }
      if (action === "new-product") await productEditor();
      if (action === "catalog-list" && $("#product-form")?.dataset.busy !== "true")
        await refresh("catalog-editor");
      if (action?.startsWith("catalog-page:"))
        $("#catalog-results").innerHTML = productTable(
          await api("/api/admin/catalog/products?page=" + action.split(":")[1]),
        );
      if (action?.startsWith("product-") && $("#product-form"))
        return productEditorAction(action, event.target.closest("button"));
      if (action === "generate-matrix") {
        if ($("#product-form").dataset.busy === "true") return;
        const groups = [...root.querySelectorAll("[data-attribute-group]")]
          .map((g) =>
            [...g.querySelectorAll("input:checked")].map((i) => ({
              id: Number(i.value),
              label: i.dataset.valueLabel,
            })),
          )
          .filter((g) => g.length);
        if (!groups.length) throw Error("Chọn ít nhất một giá trị thuộc tính.");
        let matrix = [[]];
        for (const values of groups) {
          matrix = matrix.flatMap((previous) =>
            values.map((v) => [...previous, v]),
          );
          if (matrix.length > 100) throw Error("Tối đa 100 tổ hợp.");
        }
        const rows = [...$("#sku-lines").children];
        const mediaOwners = new Set(productPhotos.map((m) => m.skuKey));
        const filled = rows.filter((line) => skuHasContent(line, skuValues(line), mediaOwners));
        const existing = new Set(filled.map((line) =>
          skuValues(line).attributes.split(",").filter(Boolean).map(Number).sort((a, b) => a - b).join("-"),
        ));
        const newRows = matrix.map((combo) => ({
          name: combo.map((v) => v.label).join(" / "),
          key: combo.map((v) => v.id).sort((a, b) => a - b).join("-"),
        })).filter(({ key }) => !existing.has(key));
        if (filled.length + newRows.length > 100) throw Error("Tối đa 100 SKU.");
        if (!newRows.length) {
          notify("Các biến thể này đã có trong danh sách.");
          return;
        }
        rows.filter((line) => !filled.includes(line)).forEach((line) => line.remove());
        const prefix = (product?.slug || slugFromName($('#product-basics [name="name"]').value) || "sku").slice(0, 35);
        for (const { name, key } of newRows) {
          $("#sku-lines").insertAdjacentHTML("beforeend", skuLine({
            name, sku: (prefix + "-" + key).toUpperCase(), combination_key: key,
          }));
        }
        notify(`Đã thêm ${newRows.length} biến thể.`);
      }
      if (action === "add-sku") {
        if ($("#product-form").dataset.busy === "true") return;
        if ($("#sku-lines").children.length >= 100) throw Error("Tối đa 100 SKU.");
        $("#sku-lines").insertAdjacentHTML("beforeend", skuLine());
        $("#sku-lines").lastElementChild.querySelector('input').focus();
      }
      const cmsForm = event.target.closest("#article-form");
      if (cmsForm && (action?.startsWith("cms-") || action === "add-block"))
        return await articleEditorAction(action, event.target.closest("button"));
      if (action === "add-block")
        $("#content-blocks").insertAdjacentHTML("beforeend", blockLine());
      if (action === "block-remove")
        event.target.closest(".content-block").remove();
      if (action === "block-up") {
        const b = event.target.closest(".content-block");
        if (b.previousElementSibling)
          b.parentNode.insertBefore(b, b.previousElementSibling);
      }
      if (action === "block-down") {
        const b = event.target.closest(".content-block");
        if (b.nextElementSibling)
          b.parentNode.insertBefore(b.nextElementSibling, b);
      }
      if (cmsForm && ["block-up", "block-down", "block-remove"].includes(action))
        markArticleChanged(cmsForm);
      if (action === "new-article") await articleEditor();
      if (action === "cms-list") await refresh("cms-editor");
      if (action?.startsWith("article:restore:")) {
        if (
          savingArticle ||
          !confirm(
            "Khôi phục phiên bản này thành nháp mới? Bản public giữ nguyên đến khi duyệt lại.",
          )
        )
          return;
        await api("/api/admin/cms/articles/" + article.id + "/restore", {
          method: "POST",
          body: {
            version: article.version,
            revisionId: Number(action.split(":")[2]),
          },
        });
        await articleEditor(article.id);
        return;
      }
      if (action?.startsWith("article:")) {
        if (savingArticle) {
          notify("Đang lưu nháp, vui lòng chờ.");
          return;
        }
        const verb = action.split(":")[1];
        if (articleDirty && !["preview", "revisions"].includes(verb)) {
          notify("Lưu nháp trước khi chuyển trạng thái bài viết.");
          return;
        }
        if (
          ["publish", "archive", "approve"].includes(verb) &&
          !confirm("Xác nhận " + verb + " bài viết?")
        )
          return;
        if (verb === "revisions") {
          const data = await api(
            "/api/admin/cms/articles/" + article.id + "/revisions",
          );
          $("#article-preview").innerHTML = data.items
            .map(
              (r) =>
                `<h3>Phiên bản ${r.version}</h3>${has("content.write") ? button("Khôi phục thành nháp", "article:restore:" + r.id) : ""}<p>${e(r.snapshot.title)}</p><pre>${e(JSON.stringify(r.snapshot.contentBlocks, null, 2))}</pre>`,
            )
            .join("");
        } else if (verb === "preview") {
          const data = await api(
            "/api/admin/cms/articles/" + article.id + "/preview",
            { method: "POST", body: {} },
          );
          $("#article-preview").innerHTML =
            `<h2>${e(data.article.title)}</h2>${data.html}`;
        } else {
          await api("/api/admin/cms/articles/" + article.id + "/" + verb, {
            method: "POST",
            body: { version: article.version },
          });
          await articleEditor(article.id);
        }
        if (["preview", "revisions"].includes(verb))
          $("#article-preview").scrollIntoView({ block: "start" });
      }
      if (action?.startsWith("return:")) {
        if (!confirm("Xác nhận kiểm tra thực tế và thực hiện bước hoàn hàng?"))
          return;
        const [, target, verb] = action.split(":"),
          r = returnRows.find((r) => Number(r.id) === Number(target));
        await api("/api/admin/returns/" + target + "/" + verb, {
          method: "POST",
          body: { version: r.version },
        });
        await refresh("returns-editor");
      }
      if (action?.startsWith("doc:")) {
        if (!confirm("Xác nhận thao tác phiếu kho?")) return;
        const [, docId, verb] = action.split(":");
        const d = documents.find((d) => Number(d.id) === Number(docId));
        await api("/api/admin/inventory/documents/" + docId + "/" + verb, {
          method: "POST",
          body: { version: d.version },
        });
        await refresh("documents-editor");
      }
    } catch (err) {
      showError(err);
    }
  });
  function showError(err) {
    if ($("#editor-error")) $("#editor-error").textContent = err.message;
    else notify(err.message);
  }
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.getAttribute("id") === "quick-stock-form") {
      event.preventDefault();
      await saveQuickStock(form);
      return;
    }
    if (form.getAttribute("id") === "product-form") {
      event.preventDefault();
      await saveProductEditor(form, event.submitter?.value || (product ? "update" : "draft"));
      return;
    }
    const supported = [
      "redirect-form",
      "upload-form",
      "article-form",
      "schedule-form",
      "document-form",
      "report-filter",
      "audit-filter",
      "cms-filter",
      "return-form",
      "catalog-search",
      "setting-form",
      "company-form",
      "coupon-form",
      "banner-form",
      "import-form",
    ];
    if (
      !supported.includes(form.getAttribute("id")) &&
      !form.dataset.taxKind &&
      !form.dataset.cmsTax
    )
      return;
    event.preventDefault();
    const submit = event.submitter || form.querySelector(
      'button[type="submit"],button:not([type])',
    );
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    if (form.getAttribute("id") === "article-form" && savingArticle) {
      if (submit) submit.disabled = false;
      notify("Đang tự lưu, vui lòng chờ.");
      return;
    }
    if (form.getAttribute("id") === "article-form") savingArticle = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.getAttribute("id") === "redirect-form") {
        if (!confirm("Lưu chuyển hướng 301 vĩnh viễn?")) return;
        await api("/api/admin/seo/redirects", { method: "POST", body: data });
        await refresh("redirects-editor");
      }
      if (form.getAttribute("id") === "report-filter") {
        if (data.from > data.to)
          throw Error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        const q = new URLSearchParams();
        if (data.from)
          q.set("from", new Date(data.from + "T00:00:00").toISOString());
        if (data.to) {
          const d = new Date(data.to + "T00:00:00");
          d.setDate(d.getDate() + 1);
          q.set("to", d.toISOString());
        }
        reportQuery = "?" + q;
        await refresh("reports-editor");
      }
      if (form.getAttribute("id") === "cms-filter") {
        cmsQuery = "?" + new URLSearchParams(data);
        await refresh("cms-editor");
      }
      if (form.getAttribute("id") === "audit-filter") {
        auditQuery = "?" + new URLSearchParams(data);
        await refresh("audit-tools");
      }
      if (form.getAttribute("id") === "import-form") {
        const csv = await form.querySelector('[name="file"]').files[0].text();
        const preview = await api("/api/admin/catalog/import", {
          method: "POST",
          body: { csv },
        });
        importPreview = { csv, token: preview.token };
        $("#import-result").innerHTML =
          `<p>${preview.rows} dòng / ${preview.items.length} sản phẩm</p><pre>${e(JSON.stringify(preview.errors, null, 2))}</pre>${preview.errors.length ? "" : button("Xác nhận import", "csv-commit")}`;
      }
      if (form.getAttribute("id") === "banner-form") {
        await api(
          "/api/admin/banners" +
            (data.bannerId ? "/" + encodeURIComponent(data.bannerId) : ""),
          {
            method: data.bannerId ? "PATCH" : "POST",
            body: {
              ...data,
              assetId: Number(data.assetId),
              assetMobileId: data.assetMobileId
                ? Number(data.assetMobileId)
                : null,
              sortOrder: Number(data.sortOrder),
              focalX: Number(data.focalX),
              focalY: Number(data.focalY),
              version: Number(data.version),
              startsAt: data.startsAt
                ? new Date(data.startsAt).toISOString()
                : null,
              endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
            },
          },
        );
        await refresh("banners-editor");
      }
      if (form.getAttribute("id") === "catalog-search")
        $("#catalog-results").innerHTML = productTable(
          await api(
            "/api/admin/catalog/products?q=" + encodeURIComponent(data.q),
          ),
        );
      if (form.getAttribute("id") === "upload-form") {
        const file = form.querySelector('[name="image"]').files[0];
        await api("/api/admin/media/uploads", {
          method: "POST",
          rawBody: file,
          extraHeaders: {
            "Content-Type": file.type,
            "X-Image-Alt": encodeURIComponent(data.alt),
          },
        });
        await refresh("media-editor");
      }
      if (form.dataset.taxKind) {
        const kind = form.dataset.taxKind;
        await api(
          "/api/admin/catalog/" +
            kind +
            (form.dataset.taxId ? "/" + form.dataset.taxId : ""),
          {
            method: form.dataset.taxId ? "PATCH" : "POST",
            body: {
              ...data,
              parentId: data.parentId ? Number(data.parentId) : null,
              values: data.values?.split("\n").filter(Boolean) || [],
            },
          },
        );
        await refresh("taxonomy-editor");
      }
      if (form.dataset.cmsTax) {
        const kind = form.dataset.cmsTax;
        await api("/api/admin/cms/" + kind, {
          method: "POST",
          body: { ...data, slug: data.slug.trim() || slugFromName(data.name) },
        });
        await refresh("cms-editor");
        $("#cms-taxonomy").open = true;
        $(`[data-cms-tax="${kind}"] [name="name"]`).focus();
      }
      if (form.getAttribute("id") === "article-form") {
        const { article: a } = await api(
          "/api/admin/cms/articles" + (article ? "/" + article.id : ""),
          {
            method: article ? "PATCH" : "POST",
            body: articlePayload(form),
          },
        );
        await articleEditor(a.id);
      }
      if (form.getAttribute("id") === "schedule-form") {
        if (savingArticle || articleDirty) {
          notify("Lưu nháp trước khi đặt lịch xuất bản.");
          return;
        }
        await api("/api/admin/cms/articles/" + article.id + "/publish", {
          method: "POST",
          body: {
            version: article.version,
            scheduledAt: new Date(data.when).toISOString(),
          },
        });
        await articleEditor(article.id);
      }
      if (form.getAttribute("id") === "return-form") {
        await api("/api/admin/returns", {
          method: "POST",
          body: {
            orderNumber: data.orderNumber,
            reason: data.reason,
            items: [
              {
                variantId: Number(data.variantId),
                quantity: Number(data.quantity),
                condition: data.condition,
              },
            ],
          },
        });
        await refresh("returns-editor");
      }
      if (form.getAttribute("id") === "document-form") {
        await api("/api/admin/inventory/documents", {
          method: "POST",
          body: {
            ...data,
            sourceWarehouseId: data.sourceWarehouseId
              ? Number(data.sourceWarehouseId)
              : null,
            targetWarehouseId: data.targetWarehouseId
              ? Number(data.targetWarehouseId)
              : null,
            items: [
              {
                variantId: Number(data.variantId),
                quantity: Number(data.quantity),
              },
            ],
          },
        });
        await refresh("documents-editor");
      }
      if (form.getAttribute("id") === "company-form") {
        for (const [key, value] of Object.entries(data)) {
          const old = companyItems.find((item) => item.key === key);
          if ((old?.value_json || "") === value) continue;
          const { item: setting } = await api("/api/admin/settings/site", {
            method: "PATCH",
            body: { key, value, version: old?.version },
          });
          // Update the local version after each successful field; a later error can be retried safely.
          const fresh =
            setting ||
            (await api("/api/admin/settings/site")).items.find(
              (item) => item.key === key,
            );
          if (fresh) {
            const index = companyItems.findIndex((item) => item.key === key);
            if (index < 0) companyItems.push(fresh);
            else companyItems[index] = fresh;
          }
        }
        await refresh("settings-editor");
      }
      if (form.getAttribute("id") === "setting-form") {
        const items = (await api("/api/admin/settings/site")).items;
        await api("/api/admin/settings/site", {
          method: "PATCH",
          body: {
            ...data,
            version: items.find((i) => i.key === data.key)?.version,
          },
        });
        await refresh("settings-editor");
      }
      if (form.getAttribute("id") === "coupon-form") {
        await api("/api/admin/coupons" + (data.id ? "/" + data.id : ""), {
          method: data.id ? "PATCH" : "POST",
          body: {
            ...data,
            discountValue: Number(data.discountValue),
            minimumOrder: Number(data.minimumOrder),
            usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
          },
        });
        await refresh("coupons-editor");
      }
      notify(
        [
          "report-filter",
          "cms-filter",
          "audit-filter",
          "catalog-search",
        ].includes(form.getAttribute("id"))
          ? "Đã cập nhật kết quả."
          : "Đã lưu.",
      );
    } catch (err) {
      showError(err);
    } finally {
      if (form.getAttribute("id") === "article-form") savingArticle = false;
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  const canEditBanners = () => has("banners.write") || has("settings.write");
  const bannerGroups = {
    "Trang chủ": ["home_hero", "home_side_top", "home_side_bottom", "home_wide"],
    "Danh mục sản phẩm": ["category_hero"],
    "Tin tức": ["article_featured", "list_top", "list_left", "list_right"],
    "Bên trong bài viết": ["article_inline", "article_left", "article_right", "sidebar_mid"],
  };
  const bannerSizes = {
    home_hero: "1600 × 900", home_side_top: "700 × 550",
    home_side_bottom: "700 × 550", home_wide: "1600 × 450",
    article_left: "160 × 600", article_right: "160 × 600",
    list_left: "160 × 600", list_right: "160 × 600",
    article_inline: "700 × 90", sidebar_mid: "300 × 250", list_top: "728 × 90",
  };
  const bannerPositionOptions = () => Object.entries(bannerGroups).map(
    ([label, slots]) => `<optgroup label="${e(label)}">${slots.map((slot) => option(slot, bannerSlots[slot])).join("")}</optgroup>`,
  ).join("");

  function bannerStatus(banner) {
    if (banner.status !== "published") return stateBadge(banner.status);
    const now = Date.now();
    const label = banner.starts_at && +new Date(banner.starts_at) > now ? "Sắp hiển thị"
      : banner.ends_at && +new Date(banner.ends_at) <= now ? "Đã hết lịch" : "Đang hiển thị";
    return `<span class="status-pill status-published">${label}</span>`;
  }

  function bannerWorkspace() {
    const editable = canEditBanners();
    return `<div class="banner-workspace">
      <div id="banner-list">
        ${heading("Banner & Poster Studio", "Chọn banner để chỉnh sửa hoặc tạo banner mới.", editable ? button("+ Tạo banner", "banner-new") : "")}
        <section class="panel">
          <div class="content-list-controls"><label>Vị trí<select id="banner-slot-filter"><option value="">Tất cả vị trí</option>${bannerPositionOptions()}</select></label>
          <span data-banner-count role="status">${bannerRows.length} banner</span></div>
          <div class="banner-library">${bannerRows.map((b) => `<article data-banner-slot="${e(b.slot)}">
            <img src="${e(b.url)}" alt="${e(b.alt || b.alt_text)}" width="84" height="56">
            <div class="banner-row-name"><b>${e(b.title)}</b><p>${e(bannerSlots[b.slot] || b.slot)}</p></div>
            ${bannerStatus(b)}
            ${editable ? button("Chỉnh sửa", "banner-edit:" + b.id) : ""}
          </article>`).join("")}</div>
          <p class="content-list-empty" data-banner-empty ${bannerRows.length ? "hidden" : ""}>${bannerRows.length ? "Không có banner ở vị trí này." : "Chưa có banner. Bấm Tạo banner để thêm ảnh lên website."}</p>
        </section>
      </div>
      ${editable ? `<section id="banner-editor" hidden>
        <div class="content-editor-heading">${button("← Danh sách", "banner-cancel")}<h1 id="banner-editor-title">Tạo banner</h1></div>
        <div class="banner-editor-layout">
          <form id="banner-form" class="panel banner-fields">
            <input type="hidden" name="bannerId"><input type="hidden" name="version">
            <h2>Thông tin banner</h2>
            ${field("Tên banner", "title", "", "text", 'required maxlength="150" placeholder="Ví dụ: Ưu đãi tháng 12"')}
            <label>Hiển thị ở đâu?<select name="slot">${bannerPositionOptions()}</select></label>
            <p class="muted banner-field-hint" data-banner-size></p>
            <label>Ảnh banner<select name="assetId" required><option value="">Chọn ảnh đã tải</option>${assets.map((a) => option(a.id, a.alt_text)).join("")}</select></label>
            ${has("media.upload") ? `<label class="banner-upload">Hoặc tải ảnh từ máy<input type="file" data-banner-upload accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG hoặc WebP, tối đa 5 MB.</small></label>` : ""}
            <div class="banner-field-pair">${field("Trang mở khi bấm vào ảnh", "targetPath", "/san-pham", "text", 'required placeholder="/san-pham"')}
            <label>Trạng thái<select name="status">${["draft", "published", "archived"].map((v) => option(v, states[v])).join("")}</select></label></div>
            <p class="muted banner-field-hint" data-banner-status-hint></p>
            <details class="content-options" id="banner-schedule"><summary>Đặt lịch hiển thị</summary>
              <div class="banner-field-pair">${field("Bắt đầu (giờ máy bạn)", "startsAt", "", "datetime-local")}${field("Kết thúc (giờ máy bạn)", "endsAt", "", "datetime-local")}</div>
              <p class="muted">Để trống để banner có hiệu lực khi xuất bản và hiển thị đến khi bạn dừng.</p>
            </details>
            <details class="content-options" id="banner-advanced"><summary>Ảnh điện thoại và tùy chỉnh</summary>
              ${select("Ảnh riêng cho điện thoại", "assetMobileId", assets.map((a) => ({ id: a.id, name: a.alt_text })))}
              ${field("Mô tả ngắn trên banner", "subtitle", "", "text", 'maxlength="500"')}
              ${field("Mô tả thay thế cho ảnh", "alt", "", "text", 'maxlength="500"')}
              ${field("Chữ trên nút", "ctaLabel", "Khám phá", "text", 'required maxlength="60"')}
              ${field("Thứ tự hiển thị (số nhỏ lên trước)", "sortOrder", 0, "number", 'required min="-10000" max="10000"')}
              <div class="banner-field-pair">${field("Lấy nét ngang (%)", "focalX", 50, "number", 'required min="0" max="100"')}${field("Lấy nét dọc (%)", "focalY", 50, "number", 'required min="0" max="100"')}</div>
            </details>
            ${result}
            <div class="form-actions"><button type="submit" class="primary">Lưu banner</button>${button("Hủy", "banner-cancel")}</div>
          </form>
          <aside class="panel banner-preview-panel"><h2>Xem trước</h2>
            <div class="workspace-tabs"><button type="button" data-editor-action="banner-preview:desktop" aria-pressed="true">Máy tính</button><button type="button" data-editor-action="banner-preview:mobile" aria-pressed="false">Điện thoại</button></div>
            <div id="banner-preview-frame" class="banner-preview-frame"><div class="banner-live-preview"><img id="banner-preview-image" alt="" hidden><div><small id="banner-preview-slot"></small><h2 id="banner-preview-title"></h2><p id="banner-preview-subtitle"></p><span id="banner-preview-cta"></span></div></div></div>
          </aside>
        </div>
      </section>` : ""}
      ${editable ? "" : result}
    </div>`;
  }

  async function uploadBannerImage(input) {
    const file = input.files[0];
    if (!file) return;
    const form = input.form;
    const save = form.querySelector("button.primary");
    const back = $("#banner-editor [data-editor-action='banner-cancel']");
    input.disabled = save.disabled = back.disabled = true;
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)
        throw Error("Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.");
      const alt = form.elements.title.value.trim() || file.name.replace(/\.[^.]+$/, "") || "Ảnh banner";
      const { asset } = await api("/api/admin/media/uploads", {
        method: "POST", rawBody: file,
        extraHeaders: { "Content-Type": file.type, "X-Image-Alt": encodeURIComponent(alt.slice(0, 200)) },
      });
      if (!form.isConnected) return;
      assets.unshift(asset);
      for (const name of ["assetId", "assetMobileId"])
        form.elements[name].insertAdjacentHTML("beforeend", option(asset.id, asset.alt_text));
      form.elements.assetId.value = String(asset.id);
      previewBanner();
      notify("Đã tải và chọn ảnh banner.");
    } catch (error) {
      if (form.isConnected) notify(error.message);
    } finally {
      input.value = "";
      input.disabled = save.disabled = back.disabled = false;
    }
  }

  function previewBanner() {
    const form = $("#banner-form");
    if (!form) return;
    const slot = form.elements.slot.value;
    const size = bannerSizes[slot];
    $("[data-banner-size]").textContent = size ? "Kích thước gợi ý " + size + " px." : "";
    $("[data-banner-status-hint]").textContent = {
      draft: "Lưu để hoàn thiện sau. Banner chưa hiện trên website.",
      published: "Hiển thị theo lịch đã chọn. Để trống lịch để hiển thị ngay.",
      archived: "Banner đã lưu trữ và ẩn khỏi website.",
    }[form.elements.status.value];
    root.querySelectorAll('[data-editor-action^="banner-preview:"]').forEach((control) =>
      control.setAttribute("aria-pressed", String(control.dataset.editorAction === "banner-preview:" + previewMode)));
    $("#banner-preview-title").textContent =
      form.elements.title.value || "Tiêu đề banner của bạn";
    $("#banner-preview-frame").classList.toggle("banner-article-rail",
      ["article_left", "article_right"].includes(form.elements.slot.value));
    $("#banner-preview-frame").classList.toggle(
      "mobile",
      previewMode === "mobile",
    );
    $("#banner-preview-slot").textContent =
      bannerSlots[form.elements.slot.value];
    $("#banner-preview-subtitle").textContent = form.elements.subtitle.value;
    $("#banner-preview-cta").textContent =
      (form.elements.ctaLabel.value || "Khám phá") + " →";
    const image = $("#banner-preview-image"),
      selected =
        previewMode === "mobile" && form.elements.assetMobileId.value
          ? form.elements.assetMobileId.value
          : form.elements.assetId.value;
    const asset = assets.find((a) => String(a.id) === selected);
    image.hidden = !asset;
    if (asset) {
      image.src = asset.url;
      image.alt = form.elements.alt.value || asset.alt_text;
      image.style.objectPosition = `${Number(form.elements.focalX.value)}% ${Number(form.elements.focalY.value)}%`;
    } else image.removeAttribute("src");
  }

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !event.target.matches("[data-cms-query]")) return;
    event.preventDefault();
    event.target.closest(".cms-product-picker").querySelector('[data-editor-action="cms-find-product"]').click();
  });
  root.addEventListener("invalid", (event) => {
    if (event.target.form?.getAttribute("id") !== "banner-form") return;
    const details = event.target.closest("details");
    if (details) details.open = true;
  }, true);
  root.addEventListener("change", (event) => {
    if (event.target.closest("#quick-stock-form")) {
      const f = event.target.form;
      if (event.target.name === "warehouseId") syncStockDialog();
      if (event.target.name === "mode") {
        const balance = variantBalances(Number($("#quick-stock-dialog").dataset.variantId))
          .find((b) => b.warehouse_id === Number(f.elements.warehouseId.value));
        f.elements.quantity.value = event.target.value === "receive" ? "" : (balance?.on_hand ?? 0);
        f.elements.quantity.min = event.target.value === "receive" ? "1" : "0";
      }
      return;
    }
    if (event.target.matches("[data-product-upload]")) {
      void uploadProductPhotos(event.target);
      return;
    }
    if (event.target.matches("[data-sku-attribute]")) {
      const line = event.target.closest(".sku-line");
      line.querySelector('[name="attributes"]').value = [
        ...line.querySelectorAll("[data-sku-attribute]"),
      ]
        .map((i) => i.value)
        .filter(Boolean)
        .join(",");
    }
    if (event.target.id === "banner-slot-filter") {
      let visible = 0;
      root.querySelectorAll(".banner-library [data-banner-slot]").forEach((row) => {
        row.hidden = Boolean(event.target.value && row.dataset.bannerSlot !== event.target.value);
        if (!row.hidden) visible++;
      });
      $("[data-banner-count]").textContent = visible + " banner";
      $("[data-banner-empty]").hidden = visible > 0;
    }
    if (event.target.matches("[data-banner-upload]")) {
      void uploadBannerImage(event.target);
      return;
    }
    if (event.target.closest("#banner-form")) previewBanner();
  });
  root.addEventListener("input", (event) => {
    if (event.target.closest("#product-form")) refreshProductPreview();
    if (event.target.matches("[data-new-value]"))
      syncAttributeValues(event.target.closest("form"));
    if (event.target.matches("[data-tax-search]")) {
      const query = event.target.value.trim().toLocaleLowerCase("vi");
      const rows = [...root.querySelectorAll(".taxonomy-layout tbody tr")];
      rows.forEach(
        (row) =>
          (row.hidden = !row.textContent
            .toLocaleLowerCase("vi")
            .includes(query)),
      );
      $(".taxonomy-search-empty").hidden = rows.some((row) => !row.hidden);
    }
    if (event.target.closest("#banner-form")) previewBanner();
    const articleForm = event.target.closest("#article-form");
    if (articleForm && event.target.form === articleForm &&
        !event.target.matches("[data-cms-query], #article-autosave") &&
        (!event.target.matches("[data-cms-product-select]") || event.target.closest("[data-article-block]")))
      markArticleChanged(articleForm);
  });
  setInterval(async () => {
    const form = $("#article-form");
    if (
      !form ||
      !article?.id ||
      article.status !== "draft" ||
      !has("content.write") ||
      !articleDirty ||
      savingArticle ||
      !$("#article-autosave")?.checked ||
      !form.checkValidity()
    )
      return;
    const generation = articleDirty,
      target = article.id;
    savingArticle = true;
    try {
      const { article: saved } = await api(
        "/api/admin/cms/articles/" + target,
        {
          method: "PATCH",
          body: articlePayload(form),
        },
      );
      if (form.isConnected && article?.id === target) {
        article = saved;
        if (articleDirty === generation) articleDirty = 0;
        $("#autosave-state").textContent =
          "Đã tự lưu lúc " + new Date().toLocaleTimeString("vi-VN");
      }
    } catch (err) {
      if (form.isConnected) {
        $("#article-autosave").checked = false;
        $("#autosave-state").textContent = "Tạm dừng tự lưu: " + err.message;
      }
    } finally {
      savingArticle = false;
    }
  }, 15000);
  return { render };
}
