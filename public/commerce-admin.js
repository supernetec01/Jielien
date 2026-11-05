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
      await loadTax();
      return `<section class="panel"><h1>Danh mục, thương hiệu & thuộc tính</h1>${["categories", "brands", "attributes"].map((kind) => `<h2>${{ categories: "Danh mục", brands: "Thương hiệu", attributes: "Thuộc tính" }[kind]}</h2><p>${tax[kind].map((x) => `#${x.id} ${e(x.name)} ${x.values ? x.values.map((v) => `[${v.id}: ${e(v.value)}]`).join(" ") : ""} ${has("catalog.edit") ? `<button type="button" data-tax-edit="${kind}:${x.id}">Sửa</button>` : ""}`).join(" · ")}</p>${has("catalog.edit") ? taxonomyForm(kind) : ""}`).join("")}${result}</section>`;
    }
    if (view === "cms-editor") {
      const { items } = await api("/api/admin/cms/articles");
      return `<section class="panel">${toolbar("Tin tức & SEO", has("content.write") ? button("Viết bài mới", "new-article") : "")}<p>Bản nháp không công khai. Chỉnh sửa bài đã xuất bản cần duyệt lại trước khi thay phiên bản public.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Bài viết</th><th>Trạng thái</th><th></th></tr></thead><tbody>${items.map((a) => `<tr><td>${e(a.title)}</td><td>${e(a.status)}</td><td><button data-article-id="${a.id}">Mở biên tập</button></td></tr>`).join("")}</tbody></table></div>${has("content.manage") ? `<h2>Chuyên mục / Tag bài viết</h2>${cmsTaxForm("categories")}${cmsTaxForm("tags")}` : ""}${result}</section>`;
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
    if (view === "operations-editor") {
      const data = await api("/api/admin/operations/status");
      return `<section class="panel"><h1>Trạng thái vận hành</h1><p>Database: ${e(data.database)}</p><p>Backup gần nhất: ${data.backup ? e(new Date(data.backup.lastRecordedAt).toLocaleString("vi-VN")) + " · " + data.backup.mediaFiles + " ảnh" : "Chưa có bản ghi backup từ helper mới"}</p><p>${e(data.backupNote)}</p><p>Jobs: ${data.jobs.map((j) => e(j.state) + ": " + j.count).join(", ") || "Chưa có job"}</p></section>`;
    }
    if (view === "audit-tools") {
      const data = await api("/api/admin/audit/search" + auditQuery);
      return `<section class="panel"><h1>Lọc & xuất nhật ký</h1><form id="audit-filter" class="editor-toolbar">${field("Action chính xác", "action")}${field("Actor ID", "actorId", "", "number")}<button>Lọc</button></form>${button("Export CSV tối đa 500 dòng", "audit-export")}<table class="data-table"><thead><tr><th>Thời gian</th><th>Actor</th><th>Thao tác</th><th>Đối tượng</th></tr></thead><tbody>${data.items.map((r) => `<tr><td>${e(new Date(r.created_at).toLocaleString("vi-VN"))}</td><td>${r.actor_id || "System"}</td><td>${e(r.action)}</td><td>${e(r.entity_type)} #${e(r.entity_id)}</td></tr>`).join("")}</tbody></table>${result}</section>`;
    }
    if (view === "reports-editor") {
      const { report } = await api("/api/admin/reports/summary" + reportQuery);
      return `<section class="panel"><h1>Báo cáo</h1><form id="report-filter" class="editor-toolbar">${field("Từ ngày", "from", "", "date")}${field("Đến ngày (bao gồm)", "to", "", "date")}<button>Lọc</button></form>${button("Export tổng hợp CSV", "report-export")}<p>${e(new Date(report.from).toLocaleDateString("vi-VN"))} → ${e(new Date(report.to).toLocaleDateString("vi-VN"))}</p><p>Đơn: ${report.orders}</p><p>GMV: ${Number(report.gmv).toLocaleString("vi-VN")}đ</p><p>Thu đã xác nhận: ${Number(report.collected).toLocaleString("vi-VN")}đ</p><p>${e(report.definitions.gmv)}</p><p>${e(report.definitions.collected)}</p>${result}</section>`;
    }
    if (view === "settings-editor") {
      const { items } = await api("/api/admin/settings/site");
      return `<section class="panel"><h1>Cấu hình công ty</h1>${items.map((s) => `<p>${e(s.key)}: ${e(s.value_json)}</p>`).join("")}${has("settings.write") ? `<form id="setting-form" class="editor-form"><label>Trường<select name="key">${["companyName", "contactPhone", "contactEmail", "address", "footerText"].map((k) => option(k, k)).join("")}</select></label>${field("Giá trị", "value")}<button>Lưu</button></form>` : ""}${result}</section>`;
    }
    if (view === "import-editor") {
      importPreview = null;
      return `<section class="panel"><h1>CSV sản phẩm</h1><p>Import tối đa 200 dòng, chỉ lưu nháp, không sửa tồn. Dùng template trong docs/commerce-spec/templates; weight_grams là khối lượng nguyên gram. Upload ảnh và tạo danh mục/brand/thuộc tính trước. Export hiện là báo cáo SKU, không phải template import đầy đủ.</p>${button("Export SKU CSV", "csv-export")}${has("catalog.create") && has("catalog.edit") ? `<form id="import-form" class="editor-form"><label>CSV UTF-8<input type="file" name="file" accept=".csv" required></label><button>Preview & kiểm tra</button></form><div id="import-result" class="form-result"></div>` : ""}${result}</section>`;
    }
    if (view === "banners-editor") {
      assets = has("media.read") ? (await api("/api/admin/media")).items : [];
      const { items } = await api("/api/admin/banners");
      return `<section class="panel"><h1>Banner trang chủ</h1><p>${items.map((b) => `#${b.id} ${e(b.title)} — ${e(b.status)}`).join("<br>")}</p>${
        has("settings.write")
          ? `<form id="banner-form" class="editor-form">${field("Tiêu đề", "title", "", "text", "required")}${select(
              "Ảnh",
              "assetId",
              assets.map((a) => ({ id: a.id, name: a.alt_text })),
            )}${field("Link nội bộ", "targetPath", "/san-pham")}<label>Trạng thái<select name="status">${["draft", "published", "archived"].map((x) => option(x, x)).join("")}</select></label>${field("Bắt đầu (giờ máy bạn)", "startsAt", "", "datetime-local")}${field("Kết thúc", "endsAt", "", "datetime-local")}<button class="primary">Tạo banner</button></form>`
          : ""
      }${result}</section>`;
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
    return `<form data-tax-kind="${kind}" data-tax-id="${item.id || ""}" class="editor-form">${field("Tên", "name", item.name || "", "text", "required")}${field(kind === "attributes" ? "Mã thuộc tính" : "Slug (thương hiệu có thể bỏ trống)", kind === "attributes" ? "code" : "slug", item.code || item.slug || "")}${kind === "categories" ? field("ID danh mục cha (trống: gốc)", "parentId", item.parent_id || "", "number") : ""}${kind === "attributes" ? area("Giá trị, mỗi dòng một giá trị", "values", (item.values || []).map((v) => v.value).join("\n")) : `<label>Trạng thái<select name="status">${["active", "inactive"].map((v) => option(v, v, item.status === v)).join("")}</select></label>`}<button>Lưu ${e(kind)}</button></form>`;
  }
  function cmsTaxForm(kind) {
    return `<form data-cms-tax="${kind}" class="editor-toolbar">${field(kind === "categories" ? "Tên chuyên mục" : "Tên tag", "name", "", "text", "required")}${field("Slug", "slug", "", "text", "required")}<button>Tạo</button></form>`;
  }
  async function productEditor(productId) {
    await loadTax();
    assets = has("media.read") ? (await api("/api/admin/media")).items : [];
    product = productId
      ? (await api("/api/admin/catalog/products/" + productId)).product
      : null;
    const p = product || {};
    $("#admin-content").innerHTML =
      `<section class="panel">${toolbar(product ? "Sửa sản phẩm #" + p.id : "Thêm sản phẩm", button("← Danh sách", "catalog-list"))}<form id="product-form" data-version="${p.version || 0}" class="editor-form"><h2>Thông tin & SEO</h2>${field("Tên sản phẩm", "name", p.name || "", "text", "required")}${field("Slug", "slug", p.slug || "", "text", "required")}${select("Thương hiệu", "brandId", tax.brands, p.brand_id)}<label>Danh mục<select name="categoryId" required>${tax.categories.map((c) => option(c.id, c.name, (p.categoryIds || []).includes(c.id))).join("")}</select></label>${area("Tóm tắt", "shortDescription", p.short_description || "")}${area("Mô tả", "description", p.description || "")}${blockEditor(p.content_blocks || [])}${field("SEO title", "seoTitle", p.seo_title || "")}${field("SEO description", "seoDescription", p.seo_description || "")}<label>Trạng thái<select name="status">${["draft", "active", "inactive"].map((v) => option(v, { draft: "Nháp", active: "Xuất bản", inactive: "Ngừng bán" }[v], (p.status || "draft") === v)).join("")}</select></label>${has("catalog.edit") || (!p.id && has("catalog.create")) ? '<button class="primary">Lưu sản phẩm</button>' : ""}</form>${p.id ? `<h2>Phân loại SKU</h2><fieldset id="sku-matrix"><legend>Sinh tổ hợp thuộc tính</legend>${tax.attributes.map((group) => `<fieldset data-attribute-group="${group.id}"><legend>${e(group.name)}</legend>${group.values.map((v) => `<label><input type="checkbox" value="${v.id}" data-value-label="${e(v.value)}">${e(v.value)}</label>`).join("")}</fieldset>`).join("")}${button("Sinh SKU từ tổ hợp đã chọn", "generate-matrix")}<p>Giới hạn 100 tổ hợp; kiểm tra mã và giá trước khi lưu. Không xóa SKU cũ.</p></fieldset><p>Mỗi dòng SKU có giá và tồn riêng. Tồn chỉ thay đổi qua nghiệp vụ kho.</p><form id="sku-form" class="editor-form"><div id="sku-lines">${p.variants.map(skuLine).join("") || skuLine()}</div>${button("Thêm SKU", "add-sku")}<button class="primary">Lưu SKU</button></form><h2>Ảnh & Gallery</h2>${uploadForm()}<form id="product-media-form" class="editor-form"><p>Chọn ảnh theo thứ tự trong thư viện; ảnh đầu tiên làm cover. Ảnh cũ được giữ đến khi lưu gallery.</p>${galleryMarkup(p)}<button class="primary">Lưu gallery</button></form>` : ""}${result}</section>`;
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
    return `<fieldset class="sku-line" data-sku-id="${v.id || ""}" data-version="${v.row_version || ""}"><legend>SKU ${v.id || "mới"}</legend><div class="field-row">${field("Tên SKU", "name", v.name || "", "text", "required")}${field("SKU duy nhất", "sku", v.sku || "", "text", "required")}${field("Slug SKU", "slug", v.slug || "")}${field("Barcode", "barcode", v.barcode || "")}${field("Giá bán VND", "price", v.price || 0, "number", 'min="0" required')}${field("Giá gốc VND", "originalPrice", v.original_price ?? v.price ?? 0, "number", 'min="0" required')}${field("Quy cách", "weight", v.weight || "")}${field("Độ tuổi", "age", v.age || "")}</div><label>Giá trị thuộc tính (IDs, cách nhau dấu phẩy)<input name="attributes" value="${e(v.combination_key?.replaceAll("-", ",") || "")}" placeholder="Xem IDs trong mục Danh mục & Thuộc tính"></label><label>Trạng thái<select name="status">${["active", "inactive", "draft"].map((x) => option(x, x, (v.status || "active") === x)).join("")}</select></label></fieldset>`;
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
    article = articleId
      ? (await api("/api/admin/cms/articles/" + articleId)).article
      : null;
    const a = article?.snapshot || {};
    const categories = (await api("/api/admin/cms/categories")).items;
    assets = has("media.read") ? (await api("/api/admin/media")).items : [];
    $("#admin-content").innerHTML =
      `<section class="panel">${toolbar(article ? "Bài #" + article.id + " · " + article.status : "Viết bài mới", button("← Danh sách", "cms-list"))}<form id="article-form" class="editor-form">${field("Tiêu đề", "title", a.title || "", "text", "required")}${field("Slug", "slug", a.slug || "", "text", "required")}${area("Tóm tắt", "excerpt", a.excerpt || "")}${select("Chuyên mục", "categoryId", categories, a.categoryId)}<label>Ảnh bìa<select name="coverUrl"><option value="">Chọn ảnh đã upload</option>${assets.map((m) => option(m.url, "#" + m.id + " " + m.alt_text, a.coverUrl === m.url)).join("")}</select></label>${field("Mô tả ảnh bìa", "coverAlt", a.coverAlt || "")}${blockEditor(a.contentBlocks || [])}${field("SEO title", "seoTitle", a.seoTitle || "")}${area("SEO description", "seoDescription", a.seoDescription || "")}${field("Tag IDs (cách nhau dấu phẩy)", "tagIds", (a.tagIds || []).join(","))}${field("Product cha IDs liên quan (cách nhau dấu phẩy)", "relatedProductIds", (a.relatedProductIds || []).join(","))}${has("content.write") ? '<button class="primary">Lưu nháp</button>' : ""}</form>${article ? `<div class="editor-toolbar">${has("content.write") && article.status === "draft" ? button("Gửi duyệt", "article:submit") : ""}${has("content.approve") && article.status === "in_review" ? button("Phê duyệt", "article:approve") : ""}${has("content.publish") && article.status === "approved" ? button("Xuất bản ngay", "article:publish") : ""}${has("content.publish") ? button("Lưu trữ", "article:archive") : ""}${button("Xem trước", "article:preview")}${button("Lịch sử phiên bản", "article:revisions")}</div>${has("content.publish") && article.status === "approved" ? `<form id="schedule-form" class="editor-form"><label>Lịch xuất bản (giờ trên máy bạn)<input name="when" type="datetime-local" required></label><button>Đặt lịch</button></form>` : ""}<div id="article-preview" class="article-body"></div>` : ""}${result}</section>`;
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
      if (p) return await productEditor(p.dataset.productId);
      if (a) return await articleEditor(a.dataset.articleId);
      if (taxEdit) {
        const [kind, target] = taxEdit.dataset.taxEdit.split(":");
        const item = tax[kind].find((x) => Number(x.id) === Number(target));
        taxEdit
          .closest("p")
          .insertAdjacentHTML("afterend", taxonomyForm(kind, item));
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
      if (action?.startsWith("article:")) {
        const verb = action.split(":")[1];
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
                `<h3>Phiên bản ${r.version}</h3><p>${e(r.snapshot.title)}</p><pre>${e(JSON.stringify(r.snapshot.contentBlocks, null, 2))}</pre>`,
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
      "sku-form",
      "product-media-form",
      "upload-form",
      "article-form",
      "schedule-form",
      "document-form",
      "report-filter",
      "audit-filter",
      "return-form",
      "catalog-search",
      "setting-form",
      "coupon-form",
      "banner-form",
      "import-form",
    ];
    if (
      !supported.includes(form.id) &&
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
    const data = Object.fromEntries(new FormData(form));
    try {
      if (form.id === "report-filter") {
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
      if (form.id === "audit-filter") {
        auditQuery = "?" + new URLSearchParams(data);
        await refresh("audit-tools");
      }
      if (form.id === "import-form") {
        const csv = await form.querySelector('[name="file"]').files[0].text();
        const preview = await api("/api/admin/catalog/import", {
          method: "POST",
          body: { csv },
        });
        importPreview = { csv, token: preview.token };
        $("#import-result").innerHTML =
          `<p>${preview.rows} dòng / ${preview.items.length} sản phẩm</p><pre>${e(JSON.stringify(preview.errors, null, 2))}</pre>${preview.errors.length ? "" : button("Xác nhận import", "csv-commit")}`;
      }
      if (form.id === "banner-form") {
        await api("/api/admin/banners", {
          method: "POST",
          body: {
            ...data,
            assetId: Number(data.assetId),
            startsAt: data.startsAt
              ? new Date(data.startsAt).toISOString()
              : null,
            endsAt: data.endsAt ? new Date(data.endsAt).toISOString() : null,
          },
        });
        await refresh("banners-editor");
      }
      if (form.id === "catalog-search")
        $("#catalog-results").innerHTML = productTable(
          await api(
            "/api/admin/catalog/products?q=" + encodeURIComponent(data.q),
          ),
        );
      if (form.id === "product-form") {
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
      if (form.id === "sku-form") {
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
      if (form.id === "product-media-form") {
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
      if (form.id === "upload-form") {
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
      if (form.id === "article-form") {
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
      if (form.id === "schedule-form") {
        await api("/api/admin/cms/articles/" + article.id + "/publish", {
          method: "POST",
          body: {
            version: article.version,
            scheduledAt: new Date(data.when).toISOString(),
          },
        });
        await articleEditor(article.id);
      }
      if (form.id === "return-form") {
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
      if (form.id === "document-form") {
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
      if (form.id === "setting-form") {
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
      if (form.id === "coupon-form") {
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
      notify("Đã lưu.");
    } catch (err) {
      showError(err);
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  });
  return { render };
}
