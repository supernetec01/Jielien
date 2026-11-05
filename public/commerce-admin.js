import { icon } from "/ui-icons.js";
// Editors share the existing authenticated API/CSRF adapter and permission gate.
export function createCommerceEditors({ root, api, has, escape: e, notify }) {
  const $ = (s) => root.querySelector(s);
  let product = null,
    article = null,
    roles = [],
    tax = {},
    assets = [],
    documents = [],
    importPreview = null,
    returnRows = [],
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
  const toolbar = (title, actions) =>
    `<h1>${title}</h1><div class="editor-toolbar">${actions}</div>`;
  const jsonArea = (label, name, value) =>
    area(label, name, JSON.stringify(value, null, 2));
  let previewMode = "desktop";
  const bannerSlots = {
    home_hero: "Trang chủ · Hero chính",
    home_side_top: "Trang chủ · Poster trên",
    home_side_bottom: "Trang chủ · Poster dưới",
    home_wide: "Trang chủ · Banner ngang",
    category_hero: "Danh mục · Banner đầu trang",
    article_featured: "Tin tức · Banner nổi bật",
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
      )}</div><div class="taxonomy-layout"><section class="panel"><div class="section-title"><h2>${names[kind]}</h2><span>${rows.length} mục</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Tên ${names[kind].toLowerCase()}</th><th>${kind === "attributes" ? "Giá trị" : "Trạng thái"}</th><th><span class="sr-only">Thao tác</span></th></tr></thead><tbody>${rows.map((x) => `<tr><td><b>${e(x.name)}</b><small class="row-description">${e(x.slug || x.code || "")}</small></td><td>${kind === "attributes" ? `<div class="value-chips">${(x.values || []).map((v) => `<span>${e(v.value)}</span>`).join("")}</div>` : stateBadge(x.status)}</td><td>${has("catalog.edit") ? `<button type="button" class="secondary" data-tax-edit="${kind}:${x.id}" aria-label="Sửa ${e(x.name)}">Sửa</button>` : ""}</td></tr>`).join("")}</tbody></table>${!rows.length ? emptyState("Chưa có " + names[kind].toLowerCase(), "Thêm mục đầu tiên bằng biểu mẫu bên cạnh.") : ""}</div></section>${has("catalog.edit") ? `<aside id="taxonomy-editor-panel" class="panel"><h2>Thêm ${names[kind].toLowerCase()}</h2><p class="muted">Thông tin sẽ được dùng trong trình biên tập sản phẩm.</p>${taxonomyForm(kind)}</aside>` : ""}</div>${result}`;
  }
  async function loadTax() {
    for (const kind of ["categories", "brands", "attributes"])
      tax[kind] = (await api("/api/admin/catalog/" + kind)).items;
  }
  async function render(view) {
    if (view === "catalog-editor") {
      const data = await api("/api/admin/catalog/products");
      return `<section class="panel">${toolbar("Sản phẩm cha & SKU", has("catalog.create") ? button("Thêm sản phẩm", "new-product") : "")}<form id="catalog-search" class="editor-toolbar"><input name="q" aria-label="Tìm sản phẩm/SKU/barcode" placeholder="Tên / SKU / barcode"><button>Tìm</button></form><div id="catalog-results">${productTable(data)}</div>${result}</section>`;
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
      return `${heading("Tin tức & SEO", "Biên tập nội dung hữu ích và quản lý quy trình xuất bản.", has("content.write") ? button("+ Viết bài mới", "new-article") : "")}<section class="panel"><form id="cms-filter" class="filter-toolbar">${field("Tìm bài viết", "q", new URLSearchParams(cmsQuery).get("q") || "", "search", 'placeholder="Nhập tiêu đề bài viết…"')}<label>Trạng thái<select name="status"><option value="">Tất cả trạng thái</option>${["draft", "in_review", "approved", "scheduled", "published", "archived"].map((v) => option(v, states[v], new URLSearchParams(cmsQuery).get("status") === v)).join("")}</select></label><button class="primary">Áp dụng</button></form><div class="section-title"><h2>Danh sách bài viết</h2><span>${items.length} bài trong kết quả</span></div>${items.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Bài viết</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${items.map((a) => `<tr><td><b>${e(a.title)}</b></td><td>${stateBadge(a.status)}</td><td><button class="secondary" data-article-id="${a.id}">Mở biên tập</button></td></tr>`).join("")}</tbody></table></div>` : emptyState("Chưa có bài viết phù hợp", "Tạo bài viết đầu tiên hoặc thay đổi bộ lọc để xem nội dung khác.")}<div class="information-note">${icon("file")}<p>Bản nháp chỉ hiển thị trong Admin. Nội dung đã xuất bản cần được duyệt lại khi chỉnh sửa.</p></div></section>${has("content.manage") ? `<section class="panel"><div class="section-title"><div><h2>Phân loại nội dung</h2><p>Chuyên mục và thẻ giúp người đọc khám phá các bài liên quan.</p></div></div><div class="two-column"><div><h3>Thêm chuyên mục</h3>${cmsTaxForm("categories")}</div><div><h3>Thêm thẻ bài viết</h3>${cmsTaxForm("tags")}</div></div></section>` : ""}${result}`;
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
      return `${heading("Báo cáo bán hàng", "Nắm bắt đơn hàng và số tiền thực thu trong khoảng thời gian bạn chọn.", button("Xuất báo cáo CSV", "report-export"))}<section class="panel report-filters"><form id="report-filter" class="filter-toolbar">${field("Từ ngày", "from", dateInput(from), "date", "required")}${field("Đến ngày", "to", dateInput(end), "date", "required")}<button class="primary">Xem báo cáo</button><div class="date-presets"><button type="button" data-editor-action="report-days:7">7 ngày</button><button type="button" data-editor-action="report-days:30">30 ngày</button><button type="button" data-editor-action="report-days:90">90 ngày</button></div></form></section><div class="report-period">${icon("clock")}<span>Kỳ báo cáo: <b>${e(new Date(from).toLocaleDateString("vi-VN"))} – ${e(new Date(end).toLocaleDateString("vi-VN"))}</b></span></div><div class="report-metrics">${metric("Tổng đơn hàng", Number(report.orders).toLocaleString("vi-VN"), "Số đơn được tạo trong kỳ", "file")}${metric("Giá trị đơn hàng", Number(report.gmv).toLocaleString("vi-VN") + " ₫", "Tổng giá trị các đơn chưa hủy", "chart")}${metric("Tiền đã thu", Number(report.collected).toLocaleString("vi-VN") + " ₫", "Các khoản thanh toán đã xác nhận", "check")}</div><div class="two-column"><section class="panel"><h2>${Number(report.orders) ? "Kết quả trong kỳ" : "Chưa có đơn hàng trong kỳ"}</h2><p class="muted">${Number(report.orders) ? "Báo cáo tổng hợp đã sẵn sàng. Xuất CSV để xem và lưu kết quả." : "Khi có đơn hàng mới, số liệu sẽ xuất hiện tại đây. Bạn cũng có thể chọn khoảng ngày khác."}</p><div class="information-note">${icon("chart")}<p>Số liệu lấy trực tiếp từ hệ thống đơn hàng và thanh toán.</p></div></section><section class="panel"><h2>Cách đọc báo cáo</h2><dl class="summary-list"><div><dt>Giá trị đơn hàng</dt><dd>Tính theo ngày tạo đơn, loại trừ đơn đã hủy.</dd></div><div><dt>Tiền đã thu</dt><dd>Tính theo thời điểm xác nhận thanh toán; dữ liệu cũ dùng ngày ghi nhận. Chưa trừ các khoản hoàn tiền thủ công.</dd></div></dl></section></div>${result}`;
    }
    if (view === "settings-editor") {
      const { items } = await api("/api/admin/settings/site");
      return `<section class="panel"><h1>Cấu hình công ty</h1>${items.map((s) => `<p>${e(s.key)}: ${e(s.value_json)}</p>`).join("")}${has("settings.write") ? `<form id="setting-form" class="editor-form"><label>Trường<select name="key">${["companyName", "contactPhone", "contactEmail", "address", "footerText", "tagline", "trust1", "trust2", "trust3", "trust4", "legalName", "registrationNumber"].map((k) => option(k, k)).join("")}</select></label>${field("Giá trị", "value")}<button>Lưu</button></form>` : ""}${result}</section>`;
    }
    if (view === "import-editor") {
      importPreview = null;
      return `<section class="panel"><h1>CSV sản phẩm</h1><p>Import tối đa 200 dòng, chỉ lưu nháp, không sửa tồn. Dùng template trong docs/commerce-spec/templates; weight_grams là khối lượng nguyên gram. Upload ảnh và tạo danh mục/brand/thuộc tính trước. Export hiện là báo cáo SKU, không phải template import đầy đủ.</p>${button("Export SKU CSV", "csv-export")}${has("catalog.create") && has("catalog.edit") ? `<form id="import-form" class="editor-form"><label>CSV UTF-8<input type="file" name="file" accept=".csv" required></label><button>Preview & kiểm tra</button></form><div id="import-result" class="form-result"></div>` : ""}${result}</section>`;
    }
    if (view === "banners-editor") {
      assets = has("media.read") ? (await api("/api/admin/media")).items : [];
      bannerRows = (await api("/api/admin/banners")).items;
      previewMode = "desktop";
      return `${heading("Banner & Poster Studio", "Quản lý chiến dịch theo vị trí, thiết bị và thời gian hiển thị.")}<section class="panel"><div class="banner-editor-layout">${
        has("settings.write")
          ? `<form id="banner-form" class="editor-form"><input type="hidden" name="bannerId"><input type="hidden" name="version"><label>Vị trí hiển thị<select name="slot">${Object.entries(
              bannerSlots,
            )
              .map(([key, label]) => option(key, label))
              .join(
                "",
              )}</select></label>${field("Tiêu đề", "title", "", "text", 'required maxlength="150"')}${field("Mô tả ngắn", "subtitle", "", "text", 'maxlength="500"')}${select(
              "Ảnh desktop · bắt buộc",
              "assetId",
              assets.map((a) => ({ id: a.id, name: a.alt_text })),
            )}${select(
              "Ảnh mobile · trống dùng desktop",
              "assetMobileId",
              assets.map((a) => ({ id: a.id, name: a.alt_text })),
            )}${field("Mô tả ảnh cho người đọc màn hình", "alt", "", "text", 'maxlength="500"')}${field("Nhãn nút hành động", "ctaLabel", "Khám phá", "text", 'required maxlength="60"')}${field("Link nội bộ", "targetPath", "/san-pham", "text", "required")}${field("Thứ tự (số nhỏ hiển thị trước)", "sortOrder", 0, "number", 'required min="-10000" max="10000"')}<label>Trạng thái<select name="status">${["draft", "published", "archived"].map((v) => option(v, states[v])).join("")}</select></label>${field("Bắt đầu (giờ máy bạn)", "startsAt", "", "datetime-local")}${field("Kết thúc (giờ máy bạn)", "endsAt", "", "datetime-local")}<div class="field-row">${field("Lấy nét ngang (%)", "focalX", 50, "number", 'required min="0" max="100"')}${field("Lấy nét dọc (%)", "focalY", 50, "number", 'required min="0" max="100"')}</div><p class="editor-note">Ảnh được upload tại Thư viện ảnh. Gợi ý: hero 1600×900, poster 700×550, banner ngang 1600×450, mobile 750×920; không bắt buộc kích thước này.</p><div class="form-actions"><button class="primary">Lưu banner</button>${button("Tạo mới", "banner-new")}</div></form>`
          : "<p>Bạn có quyền xem banner.</p>"
      }<aside><div class="workspace-tabs"><button type="button" data-editor-action="banner-preview:desktop" aria-pressed="true">Desktop</button><button type="button" data-editor-action="banner-preview:mobile" aria-pressed="false">Mobile</button></div><div id="banner-preview-frame" class="banner-preview-frame"><div class="banner-live-preview"><img id="banner-preview-image" alt="" hidden><div><small id="banner-preview-slot">Trang chủ · Hero chính</small><h2 id="banner-preview-title">Tiêu đề banner của bạn</h2><p id="banner-preview-subtitle"></p><span id="banner-preview-cta">Khám phá →</span></div></div></div><p class="editor-note">Bản xem trước vùng lấy nét và nội dung. Banner chỉ hiển thị khi đã xuất bản và còn trong lịch.</p></aside></div></section><section class="panel"><div class="section-title"><h2>Danh sách banner</h2><label>Vị trí<select id="banner-slot-filter"><option value="">Tất cả vị trí</option>${Object.entries(
        bannerSlots,
      )
        .map(([key, label]) => option(key, label))
        .join(
          "",
        )}</select></label></div><div class="banner-library">${bannerRows.map((b) => `<article data-banner-slot="${e(b.slot)}"><img src="${e(b.url)}" alt="${e(b.alt || b.alt_text)}"><div><b>${e(b.title)}</b><p>${e(bannerSlots[b.slot])} · Thứ tự ${b.sort_order}</p><p>${e(states[b.status])} · ${e(b.target_path)}</p></div>${has("settings.write") ? button("Chỉnh sửa", "banner-edit:" + b.id) : ""}</article>`).join("") || "<p>Chưa có banner. Tạo chiến dịch đầu tiên bằng biểu mẫu phía trên.</p>"}</div>${result}</section>`;
    }
    if (view === "coupons-editor") {
      const { items } = await api("/api/admin/coupons");
      return `<section class="panel"><h1>Mã giảm giá</h1><p>${items.map((c) => `#${c.id} ${e(c.code)}: ${e(c.status)} — đã dùng ${c.used_count}`).join("<br>")}</p><form id="coupon-form" class="editor-form">${field("ID để sửa; trống để tạo", "id", "", "number")}${field("Mã", "code", "", "text", "required")}<label>Loại<select name="discountType">${["fixed", "percentage", "shipping"].map((t) => option(t, t)).join("")}</select></label>${field("Mức giảm", "discountValue", 0, "number", 'min="0" required')}${field("Đơn tối thiểu", "minimumOrder", 0, "number", 'min="0" required')}${field("Giới hạn lượt dùng (trống: không giới hạn)", "usageLimit", "", "number", 'min="1"')}<label>Trạng thái<select name="status">${["active", "inactive"].map((v) => option(v, v)).join("")}</select></label><button class="primary">Lưu mã</button></form>${result}</section>`;
    }
    return null;
  }
  function productTable(data) {
    return `<p>Tổng: ${data.total} · Trang ${data.page}</p><table class="data-table"><thead><tr><th>Sản phẩm</th><th>Trạng thái</th><th></th></tr></thead><tbody>${data.items.map((p) => `<tr><td>#${p.id} ${e(p.name)}</td><td>${e(p.status)}</td><td><button data-product-id="${p.id}">Mở sản phẩm</button></td></tr>`).join("")}</tbody></table>${data.page > 1 ? button("Trang trước", "catalog-page:" + (data.page - 1)) : ""}${data.items.length === 20 ? button("Trang sau", "catalog-page:" + (data.page + 1)) : ""}`;
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
    }${kind === "attributes" ? area("Giá trị — mỗi dòng một lựa chọn", "values", (item.values || []).map((v) => v.value).join("\n")) : `<label>Trạng thái<select name="status">${["active", "inactive"].map((v) => option(v, states[v], (item.status || "active") === v)).join("")}</select></label>`}${
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
  function cmsTaxForm(kind) {
    return `<form data-cms-tax="${kind}" class="editor-form">${field(kind === "categories" ? "Tên chuyên mục" : "Tên tag", "name", "", "text", "required")}${field("Slug", "slug", "", "text", "required")}<button>Tạo</button></form>`;
  }
  async function productEditor(productId) {
    await loadTax();
    assets = has("media.read") ? (await api("/api/admin/media")).items : [];
    product = productId
      ? (await api("/api/admin/catalog/products/" + productId)).product
      : null;
    const p = product || {};
    $("#admin-content").innerHTML =
      `<section class="panel">${toolbar(product ? "Sửa sản phẩm #" + p.id : "Thêm sản phẩm", button("← Danh sách", "catalog-list") + (product ? button("Xem trước nháp", "preview-product") : ""))}<form id="product-form" data-version="${p.version || 0}" class="editor-form"><h2>Thông tin & SEO</h2>${field("Tên sản phẩm", "name", p.name || "", "text", "required")}${field("Slug", "slug", p.slug || "", "text", "required")}${select("Thương hiệu", "brandId", tax.brands, p.brand_id)}<label>Danh mục<select name="categoryId" required>${tax.categories.map((c) => option(c.id, c.name, (p.categoryIds || []).includes(c.id))).join("")}</select></label>${area("Tóm tắt", "shortDescription", p.short_description || "")}${area("Mô tả", "description", p.description || "")}${blockEditor(p.content_blocks || [])}${field("SEO title", "seoTitle", p.seo_title || "")}${field("SEO description", "seoDescription", p.seo_description || "")}<label>Trạng thái<select name="status">${["draft", "active", "inactive"].map((v) => option(v, { draft: "Nháp", active: "Xuất bản", inactive: "Ngừng bán" }[v], (p.status || "draft") === v)).join("")}</select></label>${has("catalog.edit") || (!p.id && has("catalog.create")) ? '<button class="primary">Lưu sản phẩm</button>' : ""}</form>${p.id ? `<h2>Phân loại SKU</h2><fieldset id="sku-matrix"><legend>Sinh tổ hợp thuộc tính</legend>${tax.attributes.map((group) => `<fieldset data-attribute-group="${group.id}"><legend>${e(group.name)}</legend>${group.values.map((v) => `<label><input type="checkbox" value="${v.id}" data-value-label="${e(v.value)}">${e(v.value)}</label>`).join("")}</fieldset>`).join("")}${button("Sinh SKU từ tổ hợp đã chọn", "generate-matrix")}<p>Giới hạn 100 tổ hợp; kiểm tra mã và giá trước khi lưu. Không xóa SKU cũ.</p></fieldset><p>Mỗi dòng SKU có giá và tồn riêng. Tồn chỉ thay đổi qua nghiệp vụ kho.</p><form id="sku-form" class="editor-form"><div id="sku-lines">${p.variants.map(skuLine).join("") || skuLine()}</div>${button("Thêm SKU", "add-sku")}<button class="primary">Lưu SKU</button></form><h2>Ảnh & Gallery</h2>${uploadForm()}<form id="product-media-form" class="editor-form"><p>Chọn ảnh theo thứ tự trong thư viện; ảnh đầu tiên làm cover. Ảnh cũ được giữ đến khi lưu gallery.</p>${galleryMarkup(p)}<button class="primary">Lưu gallery</button></form>` : ""}${result}</section>`;
    if (!has("catalog.edit")) {
      root
        .querySelectorAll(
          "#product-form input,#product-form textarea,#product-form select,#sku-form input,#sku-form select,#sku-form button,#sku-matrix input,#sku-matrix button,#upload-form input,#upload-form button,#product-media-form input,#product-media-form select,#product-media-form button",
        )
        .forEach((el) => (el.disabled = true));
    }
  }
  function galleryMarkup(p) {
    const attached = new Set(p.media.map((m) => m.url));
    return (
      p.media
        .map((m) => {
          const a = assets.find((a) => a.url === m.url);
          return galleryChoice(
            a ? "assets" : "existing",
            a?.id || m.id,
            m.url,
            m.alt_text || p.name,
            true,
            m.variant_id,
          );
        })
        .join("") +
      assets
        .filter((a) => !attached.has(a.url))
        .map((a) => galleryChoice("assets", a.id, a.url, a.alt_text, false))
        .join("")
    );
  }
  function galleryChoice(kind, id, url, alt, checked, variantId) {
    return `<div class="gallery-choice"><label><input type="checkbox" name="${kind}" value="${id}" ${checked ? "checked" : ""}>${e(alt)}<img width="70" height="70" src="${e(url)}" alt="${e(alt)}"></label><label>Ảnh dùng cho<select class="media-variant"><option value="">Toàn sản phẩm</option>${product.variants.map((v) => option(v.id, v.name, Number(variantId) === v.id)).join("")}</select></label>${button("Lên", "gallery-up")}${button("Xuống", "gallery-down")}</div>`;
  }
  function skuLine(v = {}) {
    return `<fieldset class="sku-line" data-sku-id="${v.id || ""}" data-version="${v.row_version || ""}"><legend>SKU ${v.id || "mới"}</legend><div class="field-row">${field("Tên SKU", "name", v.name || "", "text", "required")}${field("SKU duy nhất", "sku", v.sku || "", "text", "required")}${field("Slug SKU", "slug", v.slug || "")}${field("Barcode", "barcode", v.barcode || "")}${field("Giá bán VND", "price", v.price || 0, "number", 'min="0" required')}${field("Giá gốc VND", "originalPrice", v.original_price ?? v.price ?? 0, "number", 'min="0" required')}${field("Quy cách", "weight", v.weight || "")}${field("Độ tuổi", "age", v.age || "")}${field("Khối lượng (gram)", "weightGrams", v.weight_grams ?? "", "number", 'min="0"')}${field("Dài (mm)", "lengthMm", v.length_mm ?? "", "number", 'min="0"')}${field("Rộng (mm)", "widthMm", v.width_mm ?? "", "number", 'min="0"')}${field("Cao (mm)", "heightMm", v.height_mm ?? "", "number", 'min="0"')}${field("Ngưỡng cảnh báo tồn", "lowStockThreshold", v.low_stock_threshold ?? 5, "number", 'min="0"')}</div><label>Giá trị thuộc tính (IDs, cách nhau dấu phẩy)<input name="attributes" value="${e(v.combination_key?.replaceAll("-", ",") || "")}" placeholder="Xem IDs trong mục Danh mục & Thuộc tính"></label><label>Trạng thái<select name="status">${["active", "inactive", "draft"].map((x) => option(x, x, (v.status || "active") === x)).join("")}</select></label></fieldset>`;
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
  async function articleEditor(articleId) {
    articleDirty = 0;
    article = articleId
      ? (await api("/api/admin/cms/articles/" + articleId)).article
      : null;
    const a = article?.snapshot || {};
    const categories = (await api("/api/admin/cms/categories")).items;
    assets = has("media.read") ? (await api("/api/admin/media")).items : [];
    $("#admin-content").innerHTML =
      `<section class="panel">${toolbar(article ? "Bài #" + article.id + " · " + article.status : "Viết bài mới", button("← Danh sách", "cms-list"))}<form id="article-form" class="editor-form"><label><input id="article-autosave" type="checkbox" checked> Tự lưu nháp mỗi 15 giây (sau lần lưu đầu)</label><small id="autosave-state" role="status"></small>${field("Tiêu đề", "title", a.title || "", "text", "required")}${field("Slug", "slug", a.slug || "", "text", "required")}${area("Tóm tắt", "excerpt", a.excerpt || "")}${select("Chuyên mục", "categoryId", categories, a.categoryId)}<label>Ảnh bìa<select name="coverUrl"><option value="">Chọn ảnh đã upload</option>${assets.map((m) => option(m.url, "#" + m.id + " " + m.alt_text, a.coverUrl === m.url)).join("")}</select></label>${field("Mô tả ảnh bìa", "coverAlt", a.coverAlt || "")}${blockEditor(a.contentBlocks || [])}${field("SEO title", "seoTitle", a.seoTitle || "")}${area("SEO description", "seoDescription", a.seoDescription || "")}${field("Tag IDs (cách nhau dấu phẩy)", "tagIds", (a.tagIds || []).join(","))}${field("Product cha IDs liên quan (cách nhau dấu phẩy)", "relatedProductIds", (a.relatedProductIds || []).join(","))}${has("content.write") ? '<button class="primary">Lưu nháp</button>' : ""}</form>${article ? `<div class="editor-toolbar">${has("content.write") && article.status === "draft" ? button("Gửi duyệt", "article:submit") : ""}${has("content.approve") && article.status === "in_review" ? button("Phê duyệt", "article:approve") + button("Trả lại nháp", "article:reject") : ""}${has("content.publish") && article.status === "approved" ? button("Xuất bản ngay", "article:publish") : ""}${has("content.publish") ? button("Lưu trữ", "article:archive") : ""}${button("Xem trước", "article:preview")}${button("Lịch sử phiên bản", "article:revisions")}</div>${has("content.publish") && article.status === "approved" ? `<form id="schedule-form" class="editor-form"><label>Lịch xuất bản (giờ trên máy bạn)<input name="when" type="datetime-local" required></label><button>Đặt lịch</button></form>` : ""}<div id="article-preview" class="article-body"></div>` : ""}${result}</section>`;
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
      if (action === "preview-product") {
        const { html } = await api(
          "/api/admin/catalog/products/" + product.id + "/preview",
        );
        let preview = $("#product-preview");
        if (!preview) {
          $("#admin-content").insertAdjacentHTML(
            "beforeend",
            '<section id="product-preview" class="panel" tabindex="-1"></section>',
          );
          preview = $("#product-preview");
        }
        preview.innerHTML = html;
        preview.focus();
      }
      if (action?.startsWith("banner-preview:")) {
        previewMode = action.split(":")[1];
        root
          .querySelectorAll('[data-editor-action^="banner-preview:"]')
          .forEach((b) =>
            b.setAttribute(
              "aria-pressed",
              String(b.dataset.editorAction.endsWith(previewMode)),
            ),
          );
        previewBanner();
      }
      if (action === "banner-new" || action?.startsWith("banner-edit:")) {
        const form = $("#banner-form");
        form.reset();
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
      if (action === "catalog-list") await refresh("catalog-editor");
      if (action?.startsWith("catalog-page:"))
        $("#catalog-results").innerHTML = productTable(
          await api("/api/admin/catalog/products?page=" + action.split(":")[1]),
        );
      if (action === "generate-matrix") {
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
        root
          .querySelectorAll(
            '.sku-line:not([data-sku-id]),.sku-line[data-sku-id=""]',
          )
          .forEach((line) => {
            if (
              !line.querySelector('[name="name"]').value &&
              !line.querySelector('[name="sku"]').value
            )
              line.remove();
          });
        const existing = new Set(
          [...root.querySelectorAll('.sku-line [name="attributes"]')].map((i) =>
            i.value
              .split(",")
              .map(Number)
              .sort((a, b) => a - b)
              .join("-"),
          ),
        );
        for (const combo of matrix) {
          const ids = combo.map((v) => v.id).sort((a, b) => a - b),
            key = ids.join("-");
          if (existing.has(key)) continue;
          $("#sku-lines").insertAdjacentHTML(
            "beforeend",
            skuLine({
              name: combo.map((v) => v.label).join(" / "),
              sku: (product.slug.slice(0, 35) + "-" + key).toUpperCase(),
              combination_key: key,
            }),
          );
          existing.add(key);
        }
      }
      if (["gallery-up", "gallery-down"].includes(action)) {
        const row = event.target.closest(".gallery-choice"),
          sibling =
            action === "gallery-up"
              ? row.previousElementSibling
              : row.nextElementSibling;
        if (sibling?.classList.contains("gallery-choice"))
          row.parentNode.insertBefore(
            action === "gallery-up" ? row : sibling,
            action === "gallery-up" ? sibling : row,
          );
      }
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
      if (action === "add-sku")
        $("#sku-lines").insertAdjacentHTML("beforeend", skuLine());
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
    const supported = [
      "product-form",
      "redirect-form",
      "sku-form",
      "product-media-form",
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
    const submit = form.querySelector(
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
      if (form.getAttribute("id") === "product-form") {
        const { product: p } = await api(
          "/api/admin/catalog/products" + (product ? "/" + product.id : ""),
          {
            method: product ? "PATCH" : "POST",
            body: {
              ...data,
              version: product?.version,
              brandId: data.brandId ? Number(data.brandId) : null,
              categoryIds: [Number(data.categoryId)],
              descriptionBlocks: collectBlocks(form),
            },
          },
        );
        await productEditor(p.id);
      }
      if (form.getAttribute("id") === "sku-form") {
        const variants = [...form.querySelectorAll(".sku-line")].map((line) => {
          const values = Object.fromEntries(
            [...line.querySelectorAll("[name]")].map((input) => [
              input.name,
              input.value,
            ]),
          );
          return {
            ...values,
            id: line.dataset.skuId ? Number(line.dataset.skuId) : undefined,
            rowVersion: Number(line.dataset.version),
            weightGrams:
              values.weightGrams === "" ? null : Number(values.weightGrams),
            lengthMm: values.lengthMm === "" ? null : Number(values.lengthMm),
            widthMm: values.widthMm === "" ? null : Number(values.widthMm),
            heightMm: values.heightMm === "" ? null : Number(values.heightMm),
            lowStockThreshold: Number(values.lowStockThreshold),
            price: Number(values.price),
            originalPrice: Number(values.originalPrice),
            attributeValueIds: values.attributes
              ? values.attributes.split(",").map(Number)
              : [],
          };
        });
        await api("/api/admin/catalog/products/" + product.id + "/variants", {
          method: "POST",
          body: { version: product.version, variants },
        });
        await productEditor(product.id);
      }
      if (form.getAttribute("id") === "product-media-form") {
        await api("/api/admin/catalog/products/" + product.id + "/media", {
          method: "PUT",
          body: {
            version: product.version,
            media: [...form.querySelectorAll(".gallery-choice")]
              .filter((row) => row.querySelector("input").checked)
              .map((row) => {
                const input = row.querySelector("input"),
                  variant = row.querySelector(".media-variant").value;
                return {
                  ...(input.name === "existing"
                    ? { existingMediaId: Number(input.value) }
                    : { assetId: Number(input.value) }),
                  variantId: variant ? Number(variant) : null,
                };
              }),
          },
        });
        await productEditor(product.id);
      }
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
        if (product) await productEditor(product.id);
        else await refresh("media-editor");
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
        await api("/api/admin/cms/" + form.dataset.cmsTax, {
          method: "POST",
          body: data,
        });
        await refresh("cms-editor");
      }
      if (form.getAttribute("id") === "article-form") {
        const { article: a } = await api(
          "/api/admin/cms/articles" + (article ? "/" + article.id : ""),
          {
            method: article ? "PATCH" : "POST",
            body: {
              ...data,
              version: article?.version,
              categoryId: data.categoryId ? Number(data.categoryId) : null,
              contentBlocks: collectBlocks(form),
              tagIds: data.tagIds ? data.tagIds.split(",").map(Number) : [],
              relatedProductIds: data.relatedProductIds
                ? data.relatedProductIds.split(",").map(Number)
                : [],
            },
          },
        );
        await articleEditor(a.id);
      }
      if (form.getAttribute("id") === "schedule-form") {
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
  function previewBanner() {
    const form = $("#banner-form");
    if (!form) return;
    $("#banner-preview-title").textContent =
      form.elements.title.value || "Tiêu đề banner của bạn";
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

  root.addEventListener("change", (event) => {
    if (event.target.id === "banner-slot-filter")
      root
        .querySelectorAll("[data-banner-slot]")
        .forEach(
          (el) =>
            (el.hidden =
              !!event.target.value &&
              el.dataset.bannerSlot !== event.target.value),
        );
    if (event.target.closest("#banner-form")) previewBanner();
  });
  root.addEventListener("input", (event) => {
    if (event.target.closest("#banner-form")) previewBanner();
    if (event.target.closest("#article-form")) articleDirty++;
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
      target = article.id,
      data = Object.fromEntries(new FormData(form));
    savingArticle = true;
    try {
      const { article: saved } = await api(
        "/api/admin/cms/articles/" + target,
        {
          method: "PATCH",
          body: {
            ...data,
            version: article.version,
            categoryId: data.categoryId ? Number(data.categoryId) : null,
            contentBlocks: collectBlocks(form),
            tagIds: data.tagIds ? data.tagIds.split(",").map(Number) : [],
            relatedProductIds: data.relatedProductIds
              ? data.relatedProductIds.split(",").map(Number)
              : [],
          },
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
